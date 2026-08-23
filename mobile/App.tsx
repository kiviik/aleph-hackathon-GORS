import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import OsmMap from "./src/components/OsmMap";
import { useSpots, type Spot, type Status } from "./src/spots/useSpots";
import ScanScreen from "./src/screens/ScanScreen";

type TestCheck = { spotId: string; correct: boolean; checkedAt: number };
type Tab = "map" | "street" | "saved" | "scan" | "testing";

const statusText: Record<Status, string> = { free: "Free", occupied: "Occupied", review: "Review" };
const statusColor: Record<Status, string> = { free: "#247b52", occupied: "#b6543b", review: "#ae7c27" };

const storageKey = "ba-estaciona-mobile-memory";
const themeStorageKey = "ba-estaciona-mobile-theme";
// Calgary downtown. Zoom 12 covers the same ground the old 0.085 degree delta did.
const mapCenter = { latitude: 51.0447, longitude: -114.0719 };
const mapZoom = 12;

type Memory = { favoriteIds: string[]; asked: string[] };

function ThemeToggle({ darkMode, onPress }: { darkMode: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={darkMode ? "Enable light mode" : "Enable dark mode"} onPress={onPress} style={[styles.themeButton, darkMode && styles.themeButtonDark]}><Text style={[styles.themeIcon, darkMode && styles.textDark]}>{darkMode ? "☀" : "☾"}</Text></Pressable>;
}

function StreetView({ spot, spots, onSelect, darkMode, onToggleTheme }: { spot: Spot; spots: Spot[]; onSelect: (spot: Spot) => void; darkMode: boolean; onToggleTheme: () => void }) {
  // Keep the live panorama interactive. The thumbnail is only a fallback for
  // devices where Google blocks the Maps page inside an Expo WebView.
  const [streetViewError, setStreetViewError] = useState(false);
  const [thumbnailHost, setThumbnailHost] = useState(0);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [interactiveLoading, setInteractiveLoading] = useState(true);
  const thumbnailHosts = ["https://geo0.ggpht.com/cbk", "https://geo1.ggpht.com/cbk"];
  const thumbnailSource = `${thumbnailHosts[thumbnailHost]}?cb_client=maps_sv.tactile&authuser=0&hl=en&gl=ca&output=thumbnail&thumb=2&w=900&h=600&ll=${spot.latitude},${spot.longitude}&yaw=${spot.heading}&pitch=0&thumbfov=90`;
  const mapsSource = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.latitude},${spot.longitude}&heading=${spot.heading}&pitch=0&fov=90&hl=en`;
  const legacyEmbedSource = `https://maps.google.com/maps?q=&layer=c&cbll=${spot.latitude},${spot.longitude}&cbp=11,${spot.heading},0,0,0&output=svembed&hl=en`;
  const embedKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const interactiveSource = embedKey
    ? `https://www.google.com/maps/embed/v1/streetview?location=${spot.latitude},${spot.longitude}&heading=${spot.heading}&pitch=0&fov=90&key=${embedKey}`
    : legacyEmbedSource;

  useEffect(() => {
    setStreetViewError(false);
    setThumbnailHost(0);
    setThumbnailError(false);
    setWebViewKey((key) => key + 1);
    setInteractiveLoading(true);
  }, [spot.id]);

  useEffect(() => {
    if (streetViewError || !interactiveLoading) return undefined;
    const timeout = setTimeout(() => setStreetViewError(true), 15000);
    return () => clearTimeout(timeout);
  }, [interactiveLoading, streetViewError, spot.id, webViewKey]);

  const reloadStreetView = () => {
    setStreetViewError(false);
    setThumbnailHost(0);
    setThumbnailError(false);
    setInteractiveLoading(true);
    setWebViewKey((key) => key + 1);
  };
  const handleThumbnailError = () => {
    if (thumbnailHost === 0) {
      setThumbnailHost(1);
      return;
    }
    setThumbnailError(true);
  };
  return (
    <View style={[styles.streetScreen, darkMode && styles.screenDark]}>
      <View style={styles.streetTopBar}>
        <View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>EXPLORE THE BLOCK</Text><Text style={[styles.streetPageTitle, darkMode && styles.textDark]}>Street View</Text></View>
        <View style={styles.headerTheme}><ThemeToggle darkMode={darkMode} onPress={onToggleTheme} /></View><View style={styles.headerActions}><View style={[styles.livePill, darkMode && styles.darkPill]}><View style={styles.liveDot} /><Text style={[styles.liveText, darkMode && styles.textMutedDark]}>GOOGLE STREET VIEW</Text></View></View>
      </View>
      <View style={[styles.streetHeroCard, darkMode && styles.darkCard]}>
        <View style={[styles.streetViewerHeader, darkMode && styles.darkCard]}>
          <View><Text style={[styles.streetViewerLabel, darkMode && styles.textMutedDark]}>SELECTED LOCATION</Text><Text style={[styles.streetViewerTitle, darkMode && styles.textDark]}>{spot.street} {spot.number}</Text></View>
          <View style={[styles.streetStatus, { backgroundColor: `${statusColor[spot.status]}18` }]}><View style={[styles.chipDot, { backgroundColor: statusColor[spot.status] }]} /><Text style={[styles.streetStatusText, { color: statusColor[spot.status] }]}>{statusText[spot.status]}</Text></View>
        </View>
        <View style={styles.streetFrame}>
          {streetViewError ? <View style={styles.streetFallback}>{thumbnailError ? <OsmMap style={styles.streetFallbackMap} markers={[{ id: spot.id, latitude: spot.latitude, longitude: spot.longitude, color: statusColor[spot.status] }]} center={{ latitude: spot.latitude, longitude: spot.longitude }} zoom={16} interactive={false} dark={darkMode} /> : <Image source={{ uri: thumbnailSource }} style={styles.streetImage} resizeMode="cover" onError={handleThumbnailError} />}<View style={[styles.streetFallbackPanel, darkMode && styles.darkCard]}><Text style={[styles.webErrorIcon, darkMode && styles.textDark]}>◎</Text><Text style={[styles.webErrorTitle, darkMode && styles.textDark]}>Interactive Street View unavailable</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Google blocked the live panorama in this preview. This is a static backup only.</Text><View style={styles.streetFallbackActions}><Pressable onPress={reloadStreetView} style={styles.webRetry}><Text style={styles.webRetryText}>Try again</Text></Pressable><Pressable onPress={() => void Linking.openURL(mapsSource)} style={styles.webOpen}><Text style={[styles.webOpenText, darkMode && styles.textDark]}>Open Google Maps</Text></Pressable></View></View></View> : <WebView key={webViewKey} source={{ uri: interactiveSource }} style={styles.webView} originWhitelist={["*"]} javaScriptEnabled domStorageEnabled cacheEnabled thirdPartyCookiesEnabled setSupportMultipleWindows={false} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} mixedContentMode="always" startInLoadingState renderLoading={() => <View style={styles.webLoading}><ActivityIndicator size="large" color="#247b52" /><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Loading live Street View…</Text></View>} onLoadStart={() => setInteractiveLoading(true)} onLoadEnd={() => setInteractiveLoading(false)} onError={() => setStreetViewError(true)} onHttpError={() => setStreetViewError(true)} />}
          <View style={styles.streetCompass}><Text style={styles.streetCompassArrow}>↑</Text><Text style={styles.streetCompassText}>N</Text></View>
          <View style={styles.streetSource}><Text style={styles.streetSourceText}>Google Street View</Text></View>
        </View>
      </View>
      <View style={[styles.streetInfoCard, darkMode && styles.darkCard]}>
        <View style={[styles.streetInfoIcon, darkMode && styles.darkPill]}><Text style={[styles.streetInfoIconText, darkMode && styles.textMutedDark]}>⌖</Text></View>
        <View style={styles.streetInfoCopy}><Text style={[styles.streetInfoTitle, darkMode && styles.textDark]}>{spot.neighborhood}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Last local reading · {spot.checked} ago · agreement {spot.confidence}</Text></View>
        <Pressable onPress={() => onSelect(spot)} style={[styles.streetRefresh, darkMode && styles.darkPill]}><Text style={[styles.streetRefreshText, darkMode && styles.textMutedDark]}>↻</Text></Pressable>
      </View>
      <Text style={[styles.streetSectionLabel, darkMode && styles.textMutedDark]}>CHANGE LOCATION</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotPicker}>
        {spots.filter((candidate) => candidate.status === "free").map((candidate) => <Pressable key={candidate.id} onPress={() => onSelect(candidate)} style={[styles.streetAvailableButton, darkMode && styles.darkCard, candidate.id === spot.id && styles.streetAvailableSelected]}><View style={styles.streetAvailableDot} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.streetAvailableStreet, darkMode && styles.textDark, candidate.id === spot.id && styles.streetAvailableTextSelected]}>{candidate.street} {candidate.number}</Text><Text style={[styles.streetAvailableArrow, darkMode && styles.textMutedDark, candidate.id === spot.id && styles.streetAvailableTextSelected]}>›</Text></Pressable>)}
      </ScrollView>
    </View>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tabButton}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}

function TestingScreen({
  spots,
  darkMode,
  onToggleTheme,
  checks,
  onReview,
  onReset,
  lastUpdated,
  onRefresh,
  onOpenStreet,
}: {
  spots: Spot[];
  darkMode: boolean;
  onToggleTheme: () => void;
  checks: TestCheck[];
  onReview: (spotId: string, correct: boolean) => void;
  onReset: () => void;
  lastUpdated: Date;
  onRefresh: () => void;
  onOpenStreet: (spot: Spot) => void;
}) {
  const latestReviews = checks.reduce<Record<string, boolean>>((latest, check) => ({ ...latest, [check.spotId]: check.correct }), {});
  const reviewed = Object.keys(latestReviews).length;
  const totalChecks = checks.length;
  const correct = checks.filter((check) => check.correct).length;
  const incorrect = totalChecks - correct;
  const accuracy = totalChecks === 0 ? 0 : Math.round((correct / totalChecks) * 1000) / 10;

  return (
    <View style={[styles.testingScreen, darkMode && styles.screenDark]}>
      <View style={styles.header}>
        <View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>QUALITY CHECK</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Testing</Text></View>
        <View style={styles.headerTheme}><ThemeToggle darkMode={darkMode} onPress={onToggleTheme} /></View><View style={styles.headerActions}><View style={[styles.testingApiPill, darkMode && styles.darkPill]}><View style={styles.liveDot} /><Text style={[styles.testingApiText, darkMode && styles.textMutedDark]}>LOCAL FEED</Text></View></View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.testingContent}>
          <View style={[styles.testingFeedCard, darkMode && styles.darkCard]}>
          <View style={styles.testingFeedTop}><View><Text style={[styles.testingEyebrow, darkMode && styles.textMutedDark]}>CURRENT CALGARY FEED</Text><Text style={[styles.testingFeedTitle, darkMode && styles.textDark]}>Street + parking spots</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh testing feed" onPress={onRefresh} style={styles.testingRefresh}><Text style={styles.testingRefreshText}>↻</Text></Pressable></View>
          <Text style={[styles.muted, darkMode && styles.textMutedDark]}>Review the prediction against the real street, one spot at a time.</Text>
          <View style={[styles.testingFeedMeta, darkMode && styles.testingFeedMetaDark]}><Text style={[styles.testingMetaText, darkMode && styles.textMutedDark]}>{spots.length} spots · Calgary</Text><Text style={[styles.testingMetaText, darkMode && styles.textMutedDark]}>Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text></View>
        </View>

          <View style={[styles.testingAccuracyCard, darkMode && styles.testingAccuracyDark]}>
          <View style={styles.testingAccuracyTop}><View><Text style={[styles.testingEyebrow, darkMode && styles.textMutedDark]}>LIVE ACCURACY</Text><Text style={[styles.testingAccuracyNumber, darkMode && styles.textDark]}>{totalChecks === 0 ? "—" : `${accuracy}%`}</Text></View><Text style={[styles.testingProgress, darkMode && styles.textMutedDark]}>{reviewed}/{spots.length} spots · {totalChecks} checks</Text></View>
          <View style={styles.testingMetrics}><View style={styles.testingMetric}><Text style={[styles.testingMetricNumber, { color: "#247b52" }]}>{correct}</Text><Text style={[styles.testingMetricLabel, darkMode && styles.textMutedDark]}>correct</Text></View><View style={styles.testingMetricDivider} /><View style={styles.testingMetric}><Text style={[styles.testingMetricNumber, { color: "#b6543b" }]}>{incorrect}</Text><Text style={[styles.testingMetricLabel, darkMode && styles.textMutedDark]}>incorrect</Text></View><View style={styles.testingMetricDivider} /><View style={styles.testingMetric}><Text style={[styles.testingMetricNumber, { color: "#718075" }]}>{spots.length - reviewed}</Text><Text style={[styles.testingMetricLabel, darkMode && styles.textMutedDark]}>pending</Text></View></View>
        </View>

        <View style={styles.testingSectionHeader}><Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>CHECK EACH PREDICTION</Text><Pressable onPress={onReset} disabled={totalChecks === 0}><Text style={[styles.testingReset, totalChecks === 0 && styles.testingResetDisabled]}>Reset</Text></Pressable></View>
        {spots.map((spot) => {
          const verdict = latestReviews[spot.id];
          return <View key={spot.id} style={[styles.testingSpotCard, darkMode && styles.darkCard]}>
            <View style={[styles.testingSpotDot, { backgroundColor: statusColor[spot.status] }]} />
            <View style={styles.testingSpotCopy}><View style={styles.testingSpotTitleRow}><Text style={[styles.testingSpotStreet, darkMode && styles.textDark]}>{spot.street} {spot.number}</Text><Text style={[styles.testingPrediction, { color: statusColor[spot.status] }]}>{statusText[spot.status]}</Text></View><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{spot.neighborhood} · model confidence {spot.confidence} · checked {spot.checked} ago</Text><Pressable onPress={() => onOpenStreet(spot)}><Text style={styles.testingStreetLink}>Open Street View ›</Text></Pressable></View>
            <View style={styles.testingButtons}><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${spot.street} ${spot.number} correct`} onPress={() => onReview(spot.id, true)} style={[styles.testingVerdictButton, darkMode && styles.testingVerdictButtonDark, verdict === true && styles.testingCorrectActive]}><Text style={[styles.testingVerdictText, verdict === true && styles.testingVerdictTextActive]}>✓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${spot.street} ${spot.number} incorrect`} onPress={() => onReview(spot.id, false)} style={[styles.testingVerdictButton, darkMode && styles.testingVerdictButtonDark, verdict === false && styles.testingIncorrectActive]}><Text style={[styles.testingVerdictText, verdict === false && styles.testingIncorrectTextActive]}>×</Text></Pressable></View>
          </View>;
        })}
        <Text style={[styles.testingFootnote, darkMode && styles.textMutedDark]}>Every check is counted instantly on this device. Use the live street image and the physical spot as the source of truth.</Text>
      </ScrollView>
    </View>
  );
}

export default function App() {
  const systemColorScheme = useColorScheme();
  const [tab, setTab] = useState<Tab>("map");
  const [selectedId, setSelectedId] = useState("A-12");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [memory, setMemory] = useState<Memory>({ favoriteIds: [], asked: [] });
  const [darkMode, setDarkMode] = useState(systemColorScheme === "dark");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const { spots, scanning, lastScanAt, progress, error: scanError, scan, scannedCount, fixtureMeta } = useSpots(userLocation);
  const calgarySuggestions = useMemo(
    () => Array.from(new Set(spots.flatMap((s) => [s.street, s.neighborhood]).filter(Boolean))),
    [spots]
  );
  const [testChecks, setTestChecks] = useState<TestCheck[]>([]);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((value) => { if (value) setMemory(JSON.parse(value) as Memory); }).catch(() => undefined);
    AsyncStorage.getItem(themeStorageKey).then((value) => { if (value === "dark") setDarkMode(true); }).catch(() => undefined);
  }, []);

  const searchedSpots = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return spots;
    return spots.filter((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase().includes(normalized));
  }, [query, spots]);
  const visibleSpots = useMemo(() => statusFilter === "all" ? searchedSpots : searchedSpots.filter((spot) => spot.status === statusFilter), [searchedSpots, statusFilter]);
  const selected = visibleSpots.find((spot) => spot.id === selectedId) ?? visibleSpots[0] ?? spots[0];
  const mapMarkers = useMemo(() => visibleSpots.map((spot) => ({
    id: spot.id,
    latitude: spot.latitude,
    longitude: spot.longitude,
    color: statusColor[spot.status],
    title: `${spot.street} ${spot.number}`,
    status: `${statusText[spot.status]} · ${spot.confidence}`,
    hint: "Tap to open Street View",
  })), [visibleSpots]);
  const counts = useMemo(() => ({
    all: searchedSpots.length,
    free: searchedSpots.filter((spot) => spot.status === "free").length,
    occupied: searchedSpots.filter((spot) => spot.status === "occupied").length,
    review: searchedSpots.filter((spot) => spot.status === "review").length,
  }), [searchedSpots]);
  const streetSuggestions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return calgarySuggestions.filter((suggestion) => suggestion.toLocaleLowerCase().includes(normalized)).slice(0, 5);
  }, [query, calgarySuggestions]);
  const filterCards: Array<{ key: Status | "all"; label: string; value: number; color: string }> = [
    { key: "all", label: "detected", value: counts.all, color: "#65776a" },
    { key: "free", label: "free nearby", value: counts.free, color: statusColor.free },
    { key: "occupied", label: "occupied", value: counts.occupied, color: statusColor.occupied },
    { key: "review", label: "review", value: counts.review, color: statusColor.review },
  ];

  const saveMemory = (next: Memory) => {
    setMemory(next);
    void AsyncStorage.setItem(storageKey, JSON.stringify(next));
  };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    void AsyncStorage.setItem(themeStorageKey, next ? "dark" : "light");
  };

  const rememberQuery = () => {
    const normalized = query.trim();
    if (!normalized) return;
    saveMemory({ ...memory, asked: [normalized, ...memory.asked.filter((place) => place.toLocaleLowerCase() !== normalized.toLocaleLowerCase())].slice(0, 6) });
  };

  const toggleFavorite = () => {
    const favoriteIds = memory.favoriteIds.includes(selected.id) ? memory.favoriteIds.filter((id) => id !== selected.id) : [...memory.favoriteIds, selected.id].slice(-12);
    saveMemory({ ...memory, favoriteIds });
  };

  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location disabled", "Enable location access in Settings to see nearby spots.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      Alert.alert("Could not locate you", "Keep using the Calgary map or try again.");
    } finally {
      setLocating(false);
    }
  };

  const openStreetTab = () => setTab("street");
  const markTest = (spotId: string, correct: boolean) => setTestChecks((current) => [...current, { spotId, correct, checkedAt: Date.now() }]);
  const refreshTestingFeed = () => setFeedUpdatedAt(new Date());

  return (
    <SafeAreaView style={[styles.safe, darkMode && styles.safeDark]}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {tab === "map" && <View style={[styles.mapScreen, darkMode && styles.screenDark]}>
          <View style={styles.header}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>LIVE MAP</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Calgary Parking</Text></View><View style={styles.headerTheme}><ThemeToggle darkMode={darkMode} onPress={toggleTheme} /></View><View style={styles.headerActions}>{(scanning || scannedCount > 0) && <View style={[styles.localPill, darkMode && styles.darkPill]}><View style={styles.liveDot} /><Text style={[styles.liveText, darkMode && styles.textMutedDark]}>{scanning ? "SCANNING" : "LOCAL INFERENCE"}</Text></View>}</View></View>
          <View style={[styles.searchBox, darkMode && styles.darkInput]}><Text style={[styles.searchIcon, darkMode && styles.textMutedDark]}>⌕</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={rememberQuery} placeholder="Destination, street or neighborhood" placeholderTextColor={darkMode ? "#9aaa9e" : "#88958b"} style={[styles.searchInput, darkMode && styles.textDark]} returnKeyType="search" /><Pressable onPress={locate} style={styles.locateButton} disabled={locating}><Text style={styles.locateText}>{locating ? "…" : "⌖"}</Text></Pressable></View>
          {streetSuggestions.length > 0 && <View style={[styles.suggestionPanel, darkMode && styles.darkCard]}>{streetSuggestions.map((suggestion) => <Pressable key={suggestion} style={styles.suggestionRow} onPress={() => { setQuery(suggestion); setStatusFilter("all"); }}><Text style={[styles.suggestionIcon, darkMode && styles.textMutedDark]}>⌕</Text><Text style={[styles.suggestionText, darkMode && styles.textDark]}>{suggestion}</Text><Text style={[styles.suggestionCity, darkMode && styles.textMutedDark]}>Calgary</Text></Pressable>)}</View>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroller}>{filterCards.map((filter) => <Pressable key={filter.key} accessibilityRole="button" accessibilityLabel={filter.key === "all" ? "Show all detected spots" : `Filter ${filter.label}`} onPress={() => setStatusFilter(filter.key)} style={[styles.statFilterCard, darkMode && styles.darkCard, statusFilter === filter.key && styles.statFilterCardActive]}><View style={[styles.statFilterDot, { backgroundColor: filter.color }]} /><Text style={styles.statNumber}>{filter.value}</Text><Text style={[styles.statLabel, darkMode && styles.textMutedDark]}>{filter.label}</Text></Pressable>)}<Text style={[styles.updated, darkMode && styles.textMutedDark]}>{selected.scanned ? `checked ${selected.checked} ago` : "LIVE MAP"}</Text></ScrollView>
          <OsmMap
            style={styles.map}
            markers={mapMarkers}
            center={mapCenter}
            zoom={mapZoom}
            userLocation={userLocation}
            dark={darkMode}
            onSelect={(id) => setSelectedId(id)}
            onOpen={(id) => { setSelectedId(id); setTab("street"); }}
          />
          <View style={[styles.mapLegend, darkMode && styles.darkCard]}><View><View style={[styles.legendDot, { backgroundColor: statusColor.free }]} /><Text style={[styles.legendText, darkMode && styles.textMutedDark]}>Free</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.occupied }]} /><Text style={[styles.legendText, darkMode && styles.textMutedDark]}>Occupied</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.review }]} /><Text style={[styles.legendText, darkMode && styles.textMutedDark]}>Review</Text></View></View>
          <View style={[styles.selectedCard, darkMode && styles.darkCard]}><View style={[styles.selectedDot, { backgroundColor: statusColor[selected.status] }]} /><View style={styles.selectedCopy}><Text style={[styles.selectedStreet, darkMode && styles.textDark]}>{selected.street} {selected.number}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{selected.scanned ? `${selected.neighborhood} · read ${selected.checked} ago · ${selected.confidence}` : selected.neighborhood}</Text>{selected.scanned && <Text style={[styles.muted, darkMode && styles.textMutedDark]} numberOfLines={2}>{selected.status === "free" ? `≈${selected.carsFit} car${selected.carsFit === 1 ? "" : "s"} fit · ${selected.freeMetres} m free` : selected.reason}</Text>}{selected.scanned && selected.rule ? <Text style={[styles.muted, darkMode && styles.textMutedDark]} numberOfLines={2}>{selected.rule}</Text> : null}</View><Pressable onPress={toggleFavorite} style={styles.starButton}><Text style={styles.star}>{memory.favoriteIds.includes(selected.id) ? "★" : "☆"}</Text></Pressable><Pressable onPress={openStreetTab} style={styles.streetButton}><Text style={styles.streetButtonText}>Street View</Text></Pressable></View>
        </View>}
        {tab === "scan" && <ScanScreen darkMode={darkMode} scanning={scanning} progress={progress} error={scanError} scannedCount={scannedCount} totalSpots={spots.length} lastScanAt={lastScanAt} fixtureMeta={fixtureMeta} onScan={() => void scan()} />}
        {tab === "street" && <StreetView spot={selected} spots={spots} darkMode={darkMode} onToggleTheme={toggleTheme} onSelect={(spot) => setSelectedId(spot.id)} />}
        {tab === "saved" && <View style={[styles.savedScreen, darkMode && styles.screenDark]}><View style={styles.header}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>YOUR MEMORY</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Saved places</Text></View><View style={styles.headerTheme}><ThemeToggle darkMode={darkMode} onPress={toggleTheme} /></View><View style={styles.headerActions}><Text style={styles.savedCount}>{memory.favoriteIds.length}</Text></View></View><Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>FAVORITES</Text>{memory.favoriteIds.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>☆</Text><Text style={[styles.emptyTitle, darkMode && styles.textDark]}>You have no saved places yet</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Tap ☆ on any map point to save it here.</Text></View> : <FlatList data={spots.filter((spot) => memory.favoriteIds.includes(spot.id))} keyExtractor={(spot) => spot.id} contentContainerStyle={styles.savedList} renderItem={({ item }) => <Pressable style={[styles.savedRow, darkMode && styles.darkCard]} onPress={() => { setSelectedId(item.id); setTab("map"); }}><View style={[styles.savedDot, { backgroundColor: statusColor[item.status] }]} /><View style={styles.savedCopy}><Text style={[styles.savedStreet, darkMode && styles.textDark]}>{item.street} {item.number}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{item.neighborhood} · {statusText[item.status]}</Text></View><Text style={[styles.rowArrow, darkMode && styles.textMutedDark]}>›</Text></Pressable>} />}
          <Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>MOST SEARCHED ON THIS PHONE</Text>{memory.asked.length === 0 ? <Text style={[styles.muted, darkMode && styles.textMutedDark]}>Your frequent searches will appear here.</Text> : <View style={styles.askedWrap}>{memory.asked.map((place) => <Pressable key={place} style={[styles.askedChip, darkMode && styles.darkPill]} onPress={() => { setQuery(place); setTab("map"); }}><Text style={[styles.askedText, darkMode && styles.textDark]}>⌕ {place}</Text></Pressable>)}</View>}
          <Pressable style={styles.clearButton} onPress={() => saveMemory({ favoriteIds: [], asked: [] })}><Text style={styles.clearText}>Clear local memory</Text></Pressable>
        </View>}
        {tab === "testing" && <TestingScreen spots={spots} darkMode={darkMode} onToggleTheme={toggleTheme} checks={testChecks} onReview={markTest} onReset={() => setTestChecks([])} lastUpdated={feedUpdatedAt} onRefresh={refreshTestingFeed} onOpenStreet={(spot) => { setSelectedId(spot.id); setTab("street"); }} />}
        <View style={[styles.tabBar, darkMode && styles.darkTabBar]}><TabButton icon="⌖" label="Map" active={tab === "map"} onPress={() => setTab("map")} /><TabButton icon="◎" label="Scan" active={tab === "scan"} onPress={() => setTab("scan")} /><TabButton icon="◉" label="Street View" active={tab === "street"} onPress={openStreetTab} /><TabButton icon="✓" label="Testing" active={tab === "testing"} onPress={() => setTab("testing")} /><TabButton icon="★" label="Saved" active={tab === "saved"} onPress={() => setTab("saved")} /></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f3ec" }, app: { flex: 1 }, mapScreen: { flex: 1, paddingHorizontal: 18 }, testingScreen: { flex: 1, paddingHorizontal: 18 }, testingContent: { paddingBottom: 16 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, paddingBottom: 16 }, kicker: { color: "#718075", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }, screenTitle: { color: "#1f2d25", fontSize: 26, fontWeight: "800", letterSpacing: -0.8, marginTop: 6 }, localPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: "#e6f1e5" }, livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: "#edf4eb" }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2f9861" }, liveText: { color: "#37704c", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 12, paddingHorizontal: 10, height: 44, shadowColor: "#354c3b", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, suggestionPanel: { marginTop: 5, borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 12, backgroundColor: "#fffdf8", overflow: "hidden" }, suggestionRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: "#edf0e9" }, suggestionIcon: { color: "#718075", fontSize: 16 }, suggestionText: { flex: 1, color: "#30473a", fontSize: 12, fontWeight: "700" }, suggestionCity: { color: "#8a968c", fontSize: 10 }, searchIcon: { fontSize: 22, color: "#617467", marginRight: 8 }, searchInput: { flex: 1, color: "#26352c", fontSize: 15 }, locateButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4eb" }, locateText: { color: "#247b52", fontSize: 21 }, statsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 }, statsScroller: { alignItems: "center", gap: 6, paddingVertical: 4 }, statFilterCard: { minWidth: 86, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, statFilterCardActive: { borderColor: "#247b52", backgroundColor: "#edf4eb" }, statFilterDot: { width: 7, height: 7, borderRadius: 4 }, statNumber: { color: "#247b52", fontSize: 18, fontWeight: "800" }, statLabel: { color: "#718075", fontSize: 10, marginTop: 1 }, statDivider: { width: 1, height: 27, backgroundColor: "#d9ded5", marginHorizontal: 19 }, updated: { marginLeft: "auto", color: "#869188", fontSize: 10 }, map: { flex: 1, minHeight: 350, width: width - 36, borderRadius: 18, overflow: "hidden" }, callout: { width: 190, padding: 3 }, calloutStreet: { color: "#203128", fontWeight: "800", fontSize: 13 }, calloutStatus: { fontWeight: "700", fontSize: 12, marginTop: 4 }, calloutHint: { color: "#7d897f", fontSize: 10, marginTop: 7 }, mapLegend: { position: "absolute", bottom: 144, left: 28, flexDirection: "row", gap: 11, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, legendDot: { width: 7, height: 7, borderRadius: 4, alignSelf: "center", marginBottom: 3 }, legendText: { color: "#68766c", fontSize: 9 }, selectedCard: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 12, padding: 13, borderRadius: 16, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da", shadowColor: "#354c3b", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, selectedDot: { width: 11, height: 11, borderRadius: 6 }, selectedCopy: { flex: 1 }, selectedStreet: { color: "#26352c", fontWeight: "800", fontSize: 13 }, muted: { color: "#7a887e", fontSize: 11, marginTop: 3 }, starButton: { width: 31, height: 31, justifyContent: "center", alignItems: "center" }, star: { color: "#247b52", fontSize: 23 }, streetButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#1f4333" }, streetButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" }, streetScreen: { flex: 1, paddingHorizontal: 18 }, streetTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, paddingBottom: 14 }, streetPageTitle: { color: "#1f2d25", fontSize: 25, fontWeight: "800", letterSpacing: -0.9, marginTop: 3 }, streetHeroCard: { flex: 1, width: "100%", alignSelf: "center", minHeight: 320, overflow: "hidden", borderRadius: 22, backgroundColor: "#dfe7de", borderWidth: 1, borderColor: "#d9e1d6", shadowColor: "#354c3b", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 }, streetViewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, paddingVertical: 11, backgroundColor: "#fffdf8" }, streetViewerLabel: { color: "#859287", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 }, streetViewerTitle: { color: "#26352c", fontSize: 16, fontWeight: "800", marginTop: 3 }, streetStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 18 }, streetStatusText: { fontSize: 10, fontWeight: "800" }, streetFrame: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#dfe7de" }, webView: { flex: 1, width: "100%" }, webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#edf2ea" }, webError: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, backgroundColor: "#edf2ea" }, webErrorIcon: { color: "#247b52", fontSize: 28, fontWeight: "700" }, webErrorTitle: { color: "#30473a", fontSize: 14, fontWeight: "800", textAlign: "center" }, webRetry: { marginTop: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: "#1f4333" }, webRetryText: { color: "#fff", fontSize: 11, fontWeight: "800" }, streetCompass: { position: "absolute", top: 13, right: 13, width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,.92)" }, streetCompassArrow: { color: "#247b52", fontSize: 16, lineHeight: 17, fontWeight: "800" }, streetCompassText: { color: "#5f7065", fontSize: 8, fontWeight: "800" }, streetSource: { position: "absolute", left: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(31,67,51,.88)" }, streetSourceText: { color: "#fff", fontSize: 9, fontWeight: "700" }, streetInfoCard: { flexDirection: "row", alignItems: "center", marginTop: 8, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: "#e0e2da", backgroundColor: "#fffdf8" }, streetInfoIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginRight: 8, borderRadius: 9, backgroundColor: "#e6f1e5" }, streetInfoIconText: { color: "#247b52", fontSize: 15 }, streetInfoCopy: { flex: 1 }, streetInfoTitle: { color: "#30473a", fontSize: 11, fontWeight: "800" }, streetRefresh: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#f1f5ef" }, streetRefreshText: { color: "#247b52", fontSize: 15, fontWeight: "700" }, streetSectionLabel: { color: "#7d8a7f", fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 3 }, streetAvailableButton: { width: 108, height: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, streetAvailableSelected: { backgroundColor: "#1f4333", borderColor: "#1f4333" }, streetAvailableDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#247b52" }, streetAvailableCopy: { flex: 1 }, streetAvailableStreet: { flex: 1, color: "#30473a", fontSize: 11, fontWeight: "800" }, streetAvailableMeta: { color: "#7b897d", fontSize: 7, marginTop: 1 }, streetAvailableArrow: { color: "#8b998e", fontSize: 15, lineHeight: 15 }, streetAvailableTextSelected: { color: "#fff" }, streetChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, streetChipSelected: { backgroundColor: "#1f4333", borderColor: "#1f4333" }, chipDot: { width: 7, height: 7, borderRadius: 4 }, streetChipText: { color: "#536257", fontSize: 9, fontWeight: "600" }, streetChipTextSelected: { color: "#fff" }, spotPicker: { gap: 7, paddingTop: 7, paddingBottom: 7 }, savedScreen: { flex: 1, paddingHorizontal: 18 }, savedCount: { color: "#247b52", fontSize: 32, fontWeight: "800" }, sectionLabel: { color: "#79857b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 10 }, savedList: { gap: 8 }, savedRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, savedDot: { width: 10, height: 10, borderRadius: 5, marginRight: 11 }, savedCopy: { flex: 1 }, savedStreet: { color: "#26352c", fontSize: 14, fontWeight: "800" }, rowArrow: { color: "#97a198", fontSize: 24 }, empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 24 }, emptyIcon: { color: "#9db49a", fontSize: 48 }, emptyTitle: { color: "#34483a", fontSize: 16, fontWeight: "800", marginTop: 12 }, askedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, askedChip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, backgroundColor: "#edf4eb" }, askedText: { color: "#49664f", fontSize: 11, fontWeight: "700" }, clearButton: { alignSelf: "flex-start", marginTop: 30, paddingVertical: 10 }, clearText: { color: "#9c4935", fontSize: 11, fontWeight: "700" }, tabBar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 5 : 10, borderTopWidth: 1, borderTopColor: "#e1e2da", backgroundColor: "#fffdf8" }, tabButton: { alignItems: "center", justifyContent: "center", minWidth: 90, gap: 2 }, tabIcon: { color: "#91a096", fontSize: 21 }, tabLabel: { color: "#879289", fontSize: 10, fontWeight: "700" }, tabActive: { color: "#247b52" }, safeDark: { backgroundColor: "#101713" }, screenDark: { backgroundColor: "#101713" }, textDark: { color: "#f4f7f1" }, textMutedDark: { color: "#a7b4aa" }, darkCard: { backgroundColor: "#1a251f", borderColor: "#34473b" }, darkInput: { backgroundColor: "#1a251f", borderColor: "#425447" }, darkPill: { backgroundColor: "#2c4032", borderColor: "#3d5845" }, themeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#d8e0d5", backgroundColor: "#fffdf8" }, themeButtonDark: { borderColor: "#405548", backgroundColor: "#26372c" }, themeIcon: { color: "#46614d", fontSize: 18, fontWeight: "700" }, headerActions: { flexDirection: "row", alignItems: "center", gap: 12 }, darkTabBar: { backgroundColor: "#17211b", borderTopColor: "#304239" },
  testingFeedCard: { padding: 15, borderRadius: 18, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, testingFeedTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, testingEyebrow: { color: "#7d8a7f", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 }, testingFeedTitle: { color: "#26352c", fontSize: 17, fontWeight: "800", marginTop: 4 }, testingRefresh: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#edf4eb" }, testingRefreshText: { color: "#247b52", fontSize: 21, fontWeight: "700" }, testingFeedMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: "#edf0e9" }, testingFeedMetaDark: { borderTopColor: "#34473b" }, testingMetaText: { color: "#718075", fontSize: 10, fontWeight: "700" }, testingApiPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 16, backgroundColor: "#e6f1e5" }, testingApiText: { color: "#37704c", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 }, testingAccuracyCard: { marginTop: 10, padding: 15, borderRadius: 18, backgroundColor: "#1f4333" }, testingAccuracyDark: { backgroundColor: "#173326", borderColor: "#2c503e" }, testingAccuracyTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, testingAccuracyNumber: { color: "#fff", fontSize: 39, lineHeight: 43, fontWeight: "800", marginTop: 4 }, testingProgress: { color: "#c7ddc9", fontSize: 11, fontWeight: "700", marginTop: 5 }, testingMetrics: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.16)" }, testingMetric: { flex: 1 }, testingMetricNumber: { fontSize: 21, fontWeight: "800" }, testingMetricLabel: { color: "#d4dfd4", fontSize: 10, marginTop: 2 }, testingMetricDivider: { width: 1, height: 25, backgroundColor: "rgba(255,255,255,.18)" }, testingSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, testingReset: { color: "#247b52", fontSize: 11, fontWeight: "800" }, testingResetDisabled: { color: "#a4aea5" }, testingSpotCard: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 8, padding: 12, borderRadius: 15, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, testingSpotDot: { width: 10, height: 10, borderRadius: 5 }, testingSpotCopy: { flex: 1 }, testingSpotTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }, testingSpotStreet: { flex: 1, color: "#26352c", fontSize: 12, fontWeight: "800" }, testingPrediction: { fontSize: 10, fontWeight: "800" }, testingStreetLink: { color: "#247b52", fontSize: 10, fontWeight: "800", marginTop: 4 }, testingButtons: { flexDirection: "row", gap: 5 }, testingVerdictButton: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#f1f4ef", borderWidth: 1, borderColor: "#dfe4dc" }, testingVerdictButtonDark: { backgroundColor: "#24342a", borderColor: "#425a49" }, testingCorrectActive: { backgroundColor: "#dff1e3", borderColor: "#247b52" }, testingIncorrectActive: { backgroundColor: "#f8e1db", borderColor: "#b6543b" }, testingVerdictText: { color: "#7d8a7f", fontSize: 20, lineHeight: 21, fontWeight: "700" }, testingVerdictTextActive: { color: "#247b52" }, testingIncorrectTextActive: { color: "#b6543b" }, testingFootnote: { color: "#7a887e", fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 10 },
  streetFallback: { flex: 1, width: "100%", backgroundColor: "#dfe7de" }, streetFallbackMap: { flex: 1, width: "100%" }, streetFallbackPanel: { position: "absolute", left: 12, right: 12, bottom: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#e0e2da", backgroundColor: "#fffdf8" }, streetFallbackActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }, webOpen: { paddingHorizontal: 10, paddingVertical: 7 }, webOpenText: { color: "#247b52", fontSize: 10, fontWeight: "800" },
  streetImage: { flex: 1, width: "100%", backgroundColor: "#dfe7de" },
  headerTheme: { position: "absolute", left: 0, right: 0, top: 14, alignItems: "center", zIndex: 0 },
});
