import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Camera from "expo-camera";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { createBlockedAnalysisTrace, type CameraPermission, type MobileTrace } from "./src/contracts";

type Status = "free" | "occupied" | "review";
type Tab = "map" | "street" | "saved";
type Spot = {
  id: string;
  street: string;
  number: string;
  neighborhood: string;
  status: Status;
  x: number;
  y: number;
  confidence: string;
  checked: string;
};
type Memory = { favoriteIds: string[]; asked: string[] };
type UserLocation = { latitude: number; longitude: number };

const SPOTS: Spot[] = [
  { id: "A-12", street: "Stephen Avenue SW", number: "100", neighborhood: "Downtown Calgary", status: "free", x: 24, y: 32, confidence: "94%", checked: "18 s" },
  { id: "A-13", street: "Stephen Avenue SW", number: "140", neighborhood: "Downtown Calgary", status: "occupied", x: 42, y: 31, confidence: "99%", checked: "18 s" },
  { id: "B-07", street: "17 Avenue SW", number: "1200", neighborhood: "Beltline", status: "free", x: 67, y: 55, confidence: "91%", checked: "42 s" },
  { id: "C-21", street: "Kensington Road NW", number: "1100", neighborhood: "Kensington", status: "review", x: 29, y: 71, confidence: "68%", checked: "1 min" },
  { id: "D-04", street: "10 Street NW", number: "210", neighborhood: "Kensington", status: "free", x: 76, y: 27, confidence: "96%", checked: "26 s" },
  { id: "E-18", street: "1 Street SE", number: "700", neighborhood: "East Village", status: "free", x: 53, y: 82, confidence: "93%", checked: "36 s" },
  { id: "F-03", street: "17 Avenue SE", number: "900", neighborhood: "Inglewood", status: "free", x: 78, y: 69, confidence: "89%", checked: "51 s" },
];

const statusText: Record<Status, string> = { free: "Free", occupied: "Occupied", review: "Review" };
const statusColor: Record<Status, string> = { free: "#247b52", occupied: "#b6543b", review: "#ae7c27" };
const calgarySuggestions = ["Stephen Avenue SW", "17 Avenue SW", "Kensington Road NW", "10 Street NW", "1 Street SE", "17 Avenue SE", "Downtown Calgary", "Beltline", "Kensington", "East Village", "Inglewood"];
const memoryKey = "ba-estaciona-mobile-memory";
const themeKey = "ba-estaciona-mobile-theme";
const traceKey = "ba-estaciona-mobile-last-trace";

function ThemeToggle({ darkMode, onPress }: { darkMode: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={darkMode ? "Enable light mode" : "Enable dark mode"} onPress={onPress} style={[styles.themeButton, darkMode && styles.themeButtonDark]}><Text style={[styles.themeIcon, darkMode && styles.textDark]}>{darkMode ? "☀" : "☾"}</Text></Pressable>;
}

function TabButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tabButton}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}

function LocalMap({ spots, selectedId, darkMode, userLocation, onSelect }: { spots: Spot[]; selectedId: string; darkMode: boolean; userLocation: UserLocation | null; onSelect: (id: string) => void }) {
  return <View style={[styles.mapCanvas, darkMode && styles.mapCanvasDark]}>
    <View style={[styles.mapRoad, styles.roadOne]} /><View style={[styles.mapRoad, styles.roadTwo]} /><View style={[styles.mapRoad, styles.roadThree]} />
    <View style={styles.mapBlockOne} /><View style={styles.mapBlockTwo} /><View style={styles.mapBlockThree} />
    {spots.map((spot) => <Pressable key={spot.id} onPress={() => onSelect(spot.id)} style={[styles.mapMarker, { left: `${spot.x}%`, top: `${spot.y}%`, backgroundColor: statusColor[spot.status] }, spot.id === selectedId && styles.mapMarkerSelected]}><Text style={styles.mapMarkerText}>{spot.id}</Text></Pressable>)}
    {userLocation && <View style={styles.mapUserMarker}><View style={styles.mapUserDot} /></View>}
    <View style={styles.snapshotBadge}><View style={styles.snapshotDot} /><Text style={styles.snapshotText}>SNAPSHOT LOCAL</Text></View><Text style={styles.mapWatermark}>CALGARY / DEMO DATA</Text>
  </View>;
}

function LocalEvidence({ spot, darkMode, onAnalyze, checking, onSelect, onToggleTheme }: { spot: Spot; darkMode: boolean; onAnalyze: () => void; checking: boolean; onSelect: (spot: Spot) => void; onToggleTheme: () => void }) {
  return <View style={[styles.streetScreen, darkMode && styles.screenDark]}>
    <View style={styles.streetTopBar}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>EXPLORE THE BLOCK</Text><Text style={[styles.streetPageTitle, darkMode && styles.textDark]}>Street View</Text></View><View style={styles.headerActions}><ThemeToggle darkMode={darkMode} onPress={onToggleTheme} /><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View></View></View>
    <View style={[styles.streetHeroCard, darkMode && styles.darkCard]}><View style={[styles.streetViewerHeader, darkMode && styles.darkCard]}><View><Text style={[styles.streetViewerLabel, darkMode && styles.textMutedDark]}>SELECTED LOCATION</Text><Text style={[styles.streetViewerTitle, darkMode && styles.textDark]}>{spot.street} {spot.number}</Text></View><View style={[styles.streetStatus, { backgroundColor: `${statusColor[spot.status]}18` }]}><View style={[styles.chipDot, { backgroundColor: statusColor[spot.status] }]} /><Text style={[styles.streetStatusText, { color: statusColor[spot.status] }]}>SNAPSHOT</Text></View></View>
      <View style={styles.localFrame}><View style={styles.frameHorizon} /><View style={styles.frameRoad} /><View style={styles.frameCurb} /><View style={styles.frameEmpty}><Text style={styles.frameIcon}>◉</Text><Text style={styles.frameTitle}>Local camera frame</Text><Text style={styles.frameCopy}>Not captured yet</Text><Pressable onPress={onAnalyze} disabled={checking} style={styles.captureButton}>{checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureButtonText}>Request camera</Text>}</Pressable></View><View style={styles.streetSource}><Text style={styles.streetSourceText}>LOCAL EVIDENCE</Text></View></View>
    </View>
    <View style={[styles.streetInfoCard, darkMode && styles.darkCard]}><View style={styles.streetInfoIcon}><Text>⌖</Text></View><View style={styles.streetInfoCopy}><Text style={[styles.streetInfoTitle, darkMode && styles.textDark]}>{spot.neighborhood}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Last local reading · {spot.checked} ago · agreement {spot.confidence}</Text></View><Pressable onPress={onAnalyze} disabled={checking} style={styles.streetRefresh}><Text style={styles.streetRefreshText}>{checking ? "…" : "↻"}</Text></Pressable></View>
    <Text style={[styles.streetSectionLabel, darkMode && styles.textMutedDark]}>CHANGE LOCATION</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotPicker}>{SPOTS.filter((candidate) => candidate.status === "free").map((candidate) => <Pressable key={candidate.id} onPress={() => onSelect(candidate)} style={[styles.streetAvailableButton, darkMode && styles.darkCard, candidate.id === spot.id && styles.streetAvailableSelected]}><View style={styles.streetAvailableDot} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.streetAvailableStreet, darkMode && styles.textDark, candidate.id === spot.id && styles.streetAvailableTextSelected]}>{candidate.street} {candidate.number}</Text><Text style={[styles.streetAvailableArrow, darkMode && styles.textMutedDark, candidate.id === spot.id && styles.streetAvailableTextSelected]}>›</Text></Pressable>)}</ScrollView>
  </View>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("map");
  const [selectedId, setSelectedId] = useState("A-12");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [memory, setMemory] = useState<Memory>({ favoriteIds: [], asked: [] });
  const [darkMode, setDarkMode] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<CameraPermission>("unknown");
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [lastTrace, setLastTrace] = useState<MobileTrace | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(memoryKey).then((value) => { if (value) setMemory(JSON.parse(value) as Memory); }).catch(() => undefined);
    void AsyncStorage.getItem(themeKey).then((value) => { if (value === "dark") setDarkMode(true); }).catch(() => undefined);
    void AsyncStorage.getItem(traceKey).then((value) => { if (value) setLastTrace(JSON.parse(value) as MobileTrace); }).catch(() => undefined);
    void checkCameraPermission();
  }, []);

  const searchedSpots = useMemo(() => { const normalized = query.trim().toLocaleLowerCase(); return normalized ? SPOTS.filter((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase().includes(normalized)) : SPOTS; }, [query]);
  const visibleSpots = useMemo(() => statusFilter === "all" ? searchedSpots : searchedSpots.filter((spot) => spot.status === statusFilter), [searchedSpots, statusFilter]);
  const selected = visibleSpots.find((spot) => spot.id === selectedId) ?? visibleSpots[0] ?? SPOTS[0];
  const streetSuggestions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return calgarySuggestions.filter((suggestion) => suggestion.toLocaleLowerCase().includes(normalized)).slice(0, 5);
  }, [query]);
  const counts = { all: searchedSpots.length, free: searchedSpots.filter((spot) => spot.status === "free").length, occupied: searchedSpots.filter((spot) => spot.status === "occupied").length, review: searchedSpots.filter((spot) => spot.status === "review").length };
  const filters: Array<{ key: Status | "all"; label: string; value: number; color: string }> = [{ key: "all", label: "detected", value: counts.all, color: "#65776a" }, { key: "free", label: "free nearby", value: counts.free, color: statusColor.free }, { key: "occupied", label: "occupied", value: counts.occupied, color: statusColor.occupied }, { key: "review", label: "review", value: counts.review, color: statusColor.review }];

  const saveMemory = (next: Memory) => { setMemory(next); void AsyncStorage.setItem(memoryKey, JSON.stringify(next)); };
  const toggleTheme = () => { const next = !darkMode; setDarkMode(next); void AsyncStorage.setItem(themeKey, next ? "dark" : "light"); };
  const rememberQuery = () => { const normalized = query.trim(); if (normalized) saveMemory({ ...memory, asked: [normalized, ...memory.asked.filter((place) => place.toLocaleLowerCase() !== normalized.toLocaleLowerCase())].slice(0, 6) }); };
  const toggleFavorite = () => { const favoriteIds = memory.favoriteIds.includes(selected.id) ? memory.favoriteIds.filter((id) => id !== selected.id) : [...memory.favoriteIds, selected.id].slice(-12); saveMemory({ ...memory, favoriteIds }); };
  const checkCameraPermission = async () => { try { const result = await Camera.getCameraPermissionsAsync(); setCameraPermission(result.granted ? "granted" : result.canAskAgain ? "unknown" : "blocked"); } catch { setCameraPermission("unknown"); } };
  const requestCameraPermission = async () => {
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      const permission: CameraPermission = result.granted ? "granted" : result.canAskAgain ? "denied" : "blocked";
      setCameraPermission(permission);
      return permission === "granted";
    } catch {
      setCameraPermission("denied");
      return false;
    }
  };
  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { Alert.alert("Location disabled", "Enable location access in Settings to see nearby spots."); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch { Alert.alert("Could not locate you", "Keep using the Calgary snapshot or try again."); } finally { setLocating(false); }
  };
  const analyzeLocally = async () => {
    setCheckingCamera(true);
    try {
      const granted = cameraPermission === "granted" || await requestCameraPermission();
      if (!granted) { Alert.alert("Analysis unavailable", "Without camera permission the system must abstain."); return; }
      const trace = createBlockedAnalysisTrace(Platform.OS, String(Platform.Version)); setLastTrace(trace); await AsyncStorage.setItem(traceKey, JSON.stringify(trace));
    } finally { setCheckingCamera(false); }
  };
  const openStatusInStreetView = (status: Status) => {
    const nextSpot = searchedSpots.find((spot) => spot.status === status);
    if (!nextSpot) return;
    setSelectedId(nextSpot.id);
    setStatusFilter(status);
    setTab("street");
  };

  return <SafeAreaView style={[styles.safe, darkMode && styles.safeDark]}><StatusBar style={darkMode ? "light" : "dark"} /><KeyboardAvoidingView style={styles.app} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    {tab === "map" && <View style={[styles.mapScreen, darkMode && styles.screenDark]}><View style={styles.header}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>BA ESTACIONA</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Calgary Estaciona</Text></View><View style={styles.headerActions}><ThemeToggle darkMode={darkMode} onPress={toggleTheme} /><View style={styles.localPill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View></View></View>
      <View style={[styles.searchBox, darkMode && styles.darkInput]}><Text style={[styles.searchIcon, darkMode && styles.textMutedDark]}>⌕</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={rememberQuery} placeholder="Destination, street or neighborhood" placeholderTextColor={darkMode ? "#9aaa9e" : "#88958b"} style={[styles.searchInput, darkMode && styles.textDark]} returnKeyType="search" /><Pressable onPress={locate} style={styles.locateButton} disabled={locating}><Text style={styles.locateText}>{locating ? "…" : "⌖"}</Text></Pressable></View>
      {streetSuggestions.length > 0 && <View style={[styles.suggestionPanel, darkMode && styles.darkCard]}>{streetSuggestions.map((suggestion) => <Pressable key={suggestion} onPress={() => { setQuery(suggestion); setStatusFilter("all"); }} style={styles.suggestionRow}><Text style={styles.suggestionIcon}>⌕</Text><Text style={[styles.suggestionText, darkMode && styles.textDark]}>{suggestion}</Text><Text style={[styles.suggestionCity, darkMode && styles.textMutedDark]}>Calgary</Text></Pressable>)}</View>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroller}>{filters.map((filter) => <Pressable key={filter.key} accessibilityRole="button" accessibilityLabel={filter.key === "all" ? "Show all detected spots" : `Open ${filter.label} in Street View`} onPress={() => filter.key === "all" ? setStatusFilter("all") : openStatusInStreetView(filter.key)} style={[styles.statFilterCard, darkMode && styles.darkCard, statusFilter === filter.key && styles.statFilterCardActive]}><View style={[styles.statFilterDot, { backgroundColor: filter.color }]} /><Text style={styles.statNumber}>{filter.value}</Text><Text style={[styles.statLabel, darkMode && styles.textMutedDark]}>{filter.label}</Text></Pressable>)}<Text style={[styles.updated, darkMode && styles.textMutedDark]}>snapshot</Text></ScrollView>
      <LocalMap spots={visibleSpots} selectedId={selected.id} darkMode={darkMode} userLocation={userLocation} onSelect={setSelectedId} />
      <View style={[styles.mapLegend, darkMode && styles.darkCard]}><Text style={styles.legendText}>Free snapshot</Text><Text style={styles.legendText}>Occupied</Text><Text style={styles.legendText}>Review</Text></View>
      <View style={[styles.selectedCard, darkMode && styles.darkCard]}><View style={[styles.selectedDot, { backgroundColor: statusColor[selected.status] }]} /><View style={styles.selectedCopy}><Text style={[styles.selectedStreet, darkMode && styles.textDark]}>{selected.street} {selected.number}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{selected.neighborhood} · read {selected.checked} ago</Text></View><Pressable onPress={toggleFavorite} style={styles.starButton}><Text style={styles.star}>{memory.favoriteIds.includes(selected.id) ? "★" : "☆"}</Text></Pressable><Pressable onPress={() => setTab("street")} style={styles.streetButton}><Text style={styles.streetButtonText}>Street View</Text></Pressable></View>
    </View>}
    {tab === "street" && <LocalEvidence spot={selected} darkMode={darkMode} onAnalyze={analyzeLocally} checking={checkingCamera} onToggleTheme={toggleTheme} onSelect={(spot) => setSelectedId(spot.id)} />}
    {tab === "saved" && <View style={[styles.savedScreen, darkMode && styles.screenDark]}><View style={styles.header}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>YOUR MEMORY</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Saved places</Text></View><View style={styles.headerActions}><ThemeToggle darkMode={darkMode} onPress={toggleTheme} /><Text style={styles.savedCount}>{memory.favoriteIds.length}</Text></View></View><Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>FAVORITES</Text>{memory.favoriteIds.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>☆</Text><Text style={[styles.emptyTitle, darkMode && styles.textDark]}>You have no saved places yet</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Tap ☆ on any map point to save it here.</Text></View> : <View style={styles.savedList}>{SPOTS.filter((spot) => memory.favoriteIds.includes(spot.id)).map((item) => <Pressable key={item.id} style={[styles.savedRow, darkMode && styles.darkCard]} onPress={() => { setSelectedId(item.id); setTab("map"); }}><View style={[styles.savedDot, { backgroundColor: statusColor[item.status] }]} /><View style={styles.savedCopy}><Text style={[styles.savedStreet, darkMode && styles.textDark]}>{item.street} {item.number}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{item.neighborhood} · {statusText[item.status]}</Text></View><Text style={styles.rowArrow}>›</Text></Pressable>)}</View>}
      <Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>MOST SEARCHED ON THIS PHONE</Text>{memory.asked.length === 0 ? <Text style={[styles.muted, darkMode && styles.textMutedDark]}>Your frequent searches will appear here.</Text> : <View style={styles.askedWrap}>{memory.asked.map((place) => <Pressable key={place} style={[styles.askedChip, darkMode && styles.darkPill]} onPress={() => { setQuery(place); setTab("map"); }}><Text style={[styles.askedText, darkMode && styles.textDark]}>⌕ {place}</Text></Pressable>)}</View>}<Pressable style={styles.clearButton} onPress={() => saveMemory({ favoriteIds: [], asked: [] })}><Text style={styles.clearText}>Clear local memory</Text></Pressable>
    </View>}
    <View style={[styles.tabBar, darkMode && styles.darkTabBar]}><TabButton icon="⌖" label="Map" active={tab === "map"} onPress={() => setTab("map")} /><TabButton icon="◉" label="Street View" active={tab === "street"} onPress={() => setTab("street")} /><TabButton icon="★" label="Saved" active={tab === "saved"} onPress={() => setTab("saved")} /></View>
  </KeyboardAvoidingView></SafeAreaView>;
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  mapUserMarker: { position: "absolute", left: "50%", top: "50%", width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(41,121,255,.2)" },
  mapUserDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2979ff", borderWidth: 2, borderColor: "#fff" },
  streetRefresh: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#f1f5ef" },
  streetRefreshText: { color: "#247b52", fontSize: 15, fontWeight: "700" },
  suggestionPanel: { marginTop: 5, borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 12, backgroundColor: "#fffdf8", overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: "#edf0e9" },
  suggestionIcon: { color: "#718075", fontSize: 16 },
  suggestionText: { flex: 1, color: "#30473a", fontSize: 12, fontWeight: "700" },
  suggestionCity: { color: "#8a968c", fontSize: 10 },
  safe: { flex: 1, backgroundColor: "#f6f3ec" }, safeDark: { backgroundColor: "#101713" }, app: { flex: 1 }, mapScreen: { flex: 1, paddingHorizontal: 18 }, screenDark: { backgroundColor: "#101713" }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, paddingBottom: 16 }, headerActions: { flexDirection: "row", alignItems: "center", gap: 12 }, kicker: { color: "#718075", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }, screenTitle: { color: "#1f2d25", fontSize: 26, fontWeight: "800", letterSpacing: -0.8, marginTop: 6 }, textDark: { color: "#f4f7f1" }, textMutedDark: { color: "#a7b4aa" }, localPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: "#e6f1e5" }, livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: "#edf4eb" }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2f9861" }, liveText: { color: "#37704c", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, themeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#d8e0d5", backgroundColor: "#fffdf8" }, themeButtonDark: { borderColor: "#405548", backgroundColor: "#26372c" }, themeIcon: { color: "#46614d", fontSize: 18, fontWeight: "700" }, searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 12, paddingHorizontal: 10, height: 44 }, darkInput: { backgroundColor: "#1a251f", borderColor: "#425447" }, searchIcon: { fontSize: 22, color: "#617467", marginRight: 8 }, searchInput: { flex: 1, color: "#26352c", fontSize: 15 }, locateButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4eb" }, locateText: { color: "#247b52", fontSize: 21 }, statsScroller: { alignItems: "center", gap: 6, paddingVertical: 8 }, statFilterCard: { minWidth: 86, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, statFilterCardActive: { borderColor: "#247b52", backgroundColor: "#edf4eb" }, darkCard: { backgroundColor: "#1a251f", borderColor: "#34473b" }, statFilterDot: { width: 7, height: 7, borderRadius: 4 }, statNumber: { color: "#247b52", fontSize: 18, fontWeight: "800" }, statLabel: { color: "#718075", fontSize: 10 }, updated: { marginLeft: "auto", color: "#869188", fontSize: 10 }, mapCanvas: { flex: 1, minHeight: 300, width: width - 36, borderRadius: 18, overflow: "hidden", backgroundColor: "#d9e4d5", position: "relative" }, mapCanvasDark: { backgroundColor: "#25372b" }, mapRoad: { position: "absolute", backgroundColor: "#f5f3eb", borderWidth: 1, borderColor: "#d2d9ce" }, roadOne: { width: "140%", height: 40, top: "34%", left: "-20%", transform: [{ rotate: "-12deg" }] }, roadTwo: { width: "130%", height: 34, top: "66%", left: "-15%", transform: [{ rotate: "18deg" }] }, roadThree: { width: 34, height: "140%", left: "58%", top: "-20%", transform: [{ rotate: "15deg" }] }, mapBlockOne: { position: "absolute", width: 100, height: 70, top: 34, left: 20, backgroundColor: "#c5d7c1", borderRadius: 8 }, mapBlockTwo: { position: "absolute", width: 120, height: 80, bottom: 30, right: 18, backgroundColor: "#c0d3bd", borderRadius: 8 }, mapBlockThree: { position: "absolute", width: 80, height: 100, top: 85, right: 28, backgroundColor: "#cfddc9", borderRadius: 8 }, mapMarker: { position: "absolute", minWidth: 34, height: 27, paddingHorizontal: 5, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fffdf8", elevation: 3 }, mapMarkerSelected: { transform: [{ scale: 1.22 }], borderColor: "#1f4333" }, mapMarkerText: { color: "#fff", fontSize: 9, fontWeight: "800" }, snapshotBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, snapshotDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#247b52" }, snapshotText: { color: "#49664f", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 }, mapWatermark: { position: "absolute", right: 12, bottom: 12, color: "#829587", fontSize: 9, fontWeight: "700" }, mapLegend: { position: "absolute", bottom: 143, left: 28, flexDirection: "row", gap: 11, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, legendText: { color: "#68766c", fontSize: 9 }, selectedCard: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 12, padding: 13, borderRadius: 16, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, selectedDot: { width: 11, height: 11, borderRadius: 6 }, selectedCopy: { flex: 1 }, selectedStreet: { color: "#26352c", fontWeight: "800", fontSize: 13 }, muted: { color: "#7a887e", fontSize: 11, marginTop: 3 }, warningText: { color: "#a66d31", fontSize: 10, fontWeight: "700", marginTop: 3 }, starButton: { width: 31, height: 31, justifyContent: "center", alignItems: "center" }, star: { color: "#247b52", fontSize: 23 }, streetButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#1f4333" }, streetButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" }, streetScreen: { flex: 1, paddingHorizontal: 18 }, streetTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, paddingBottom: 14 }, streetPageTitle: { color: "#1f2d25", fontSize: 25, fontWeight: "800", marginTop: 3 }, streetHeroCard: { flex: 1, minHeight: 320, overflow: "hidden", borderRadius: 22, backgroundColor: "#dfe7de", borderWidth: 1, borderColor: "#d9e1d6" }, streetViewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, paddingVertical: 11, backgroundColor: "#fffdf8" }, streetViewerLabel: { color: "#859287", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 }, streetViewerTitle: { color: "#26352c", fontSize: 16, fontWeight: "800", marginTop: 3 }, streetStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 18 }, streetStatusText: { fontSize: 10, fontWeight: "800" }, chipDot: { width: 7, height: 7, borderRadius: 4 }, localFrame: { flex: 1, backgroundColor: "#9db6a0", overflow: "hidden", position: "relative" }, frameHorizon: { position: "absolute", top: 0, left: 0, right: 0, height: "42%", backgroundColor: "#b9ccb5" }, frameRoad: { position: "absolute", bottom: 0, left: "-25%", width: "150%", height: "68%", backgroundColor: "#899e8b", transform: [{ rotate: "-7deg" }] }, frameCurb: { position: "absolute", bottom: "28%", left: "-10%", width: "130%", height: 10, backgroundColor: "#d8ded0", transform: [{ rotate: "-7deg" }] }, frameEmpty: { position: "absolute", alignItems: "center", justifyContent: "center", top: "27%", left: 24, right: 24, padding: 20, borderRadius: 18, backgroundColor: "rgba(255,253,248,.92)" }, frameIcon: { color: "#247b52", fontSize: 30 }, frameTitle: { color: "#26352c", fontSize: 16, fontWeight: "800", marginTop: 5 }, frameCopy: { color: "#7a887e", fontSize: 11, marginTop: 4 }, captureButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 11, backgroundColor: "#1f4333" }, captureButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" }, streetSource: { position: "absolute", left: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(31,67,51,.88)" }, streetSourceText: { color: "#fff", fontSize: 9, fontWeight: "700" }, streetInfoCard: { flexDirection: "row", alignItems: "center", marginTop: 8, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: "#e0e2da", backgroundColor: "#fffdf8" }, streetInfoIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginRight: 8, borderRadius: 9, backgroundColor: "#e6f1e5" }, streetInfoCopy: { flex: 1 }, streetInfoTitle: { color: "#30473a", fontSize: 11, fontWeight: "800" }, streetSectionLabel: { color: "#7d8a7f", fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 3 }, streetAvailableButton: { width: 108, height: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, streetAvailableSelected: { backgroundColor: "#1f4333", borderColor: "#1f4333" }, streetAvailableDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#247b52" }, streetAvailableStreet: { flex: 1, color: "#30473a", fontSize: 11, fontWeight: "800" }, streetAvailableArrow: { color: "#8b998e", fontSize: 15 }, streetAvailableTextSelected: { color: "#fff" }, spotPicker: { gap: 7, paddingTop: 7, paddingBottom: 7 }, savedScreen: { flex: 1, paddingHorizontal: 18 }, savedCount: { color: "#247b52", fontSize: 32, fontWeight: "800" }, sectionLabel: { color: "#79857b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 10 }, savedList: { gap: 8 }, savedRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, savedDot: { width: 10, height: 10, borderRadius: 5, marginRight: 11 }, savedCopy: { flex: 1 }, savedStreet: { color: "#26352c", fontSize: 14, fontWeight: "800" }, rowArrow: { color: "#97a198", fontSize: 24 }, empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 24 }, emptyIcon: { color: "#9db49a", fontSize: 48 }, emptyTitle: { color: "#34483a", fontSize: 16, fontWeight: "800", marginTop: 12 }, askedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, askedChip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, backgroundColor: "#edf4eb" }, askedText: { color: "#49664f", fontSize: 11, fontWeight: "700" }, clearButton: { alignSelf: "flex-start", marginTop: 30, paddingVertical: 10 }, clearText: { color: "#9c4935", fontSize: 11, fontWeight: "700" }, tabBar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: "#e1e2da", backgroundColor: "#fffdf8" }, tabButton: { alignItems: "center", justifyContent: "center", minWidth: 90, gap: 2 }, tabIcon: { color: "#91a096", fontSize: 21 }, tabLabel: { color: "#879289", fontSize: 10, fontWeight: "700" }, tabActive: { color: "#247b52" }, darkPill: { backgroundColor: "#2c4032", borderColor: "#3d5845" }, darkTabBar: { backgroundColor: "#17211b", borderTopColor: "#304239" },
});
