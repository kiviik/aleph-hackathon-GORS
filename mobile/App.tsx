import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
import MapView, { Callout, Marker, type Region } from "react-native-maps";
import { WebView } from "react-native-webview";

type Status = "free" | "occupied" | "review";
type Tab = "map" | "street" | "saved";
type Spot = {
  id: string;
  street: string;
  number: string;
  neighborhood: string;
  status: Status;
  latitude: number;
  longitude: number;
  confidence: string;
  checked: string;
  heading: number;
};

const SPOTS: Spot[] = [
  { id: "A-12", street: "Stephen Avenue SW", number: "100", neighborhood: "Downtown Calgary", status: "free", latitude: 51.0447, longitude: -114.0689, confidence: "94%", checked: "18 s", heading: 90 },
  { id: "A-13", street: "Stephen Avenue SW", number: "140", neighborhood: "Downtown Calgary", status: "occupied", latitude: 51.0449, longitude: -114.0685, confidence: "99%", checked: "18 s", heading: 90 },
  { id: "B-07", street: "17 Avenue SW", number: "1200", neighborhood: "Beltline", status: "free", latitude: 51.0374, longitude: -114.0906, confidence: "91%", checked: "42 s", heading: 0 },
  { id: "C-21", street: "Kensington Road NW", number: "1100", neighborhood: "Kensington", status: "review", latitude: 51.0522, longitude: -114.0871, confidence: "68%", checked: "1 min", heading: 180 },
  { id: "D-04", street: "10 Street NW", number: "210", neighborhood: "Kensington", status: "free", latitude: 51.0520, longitude: -114.0861, confidence: "96%", checked: "26 s", heading: 90 },
  { id: "E-18", street: "1 Street SE", number: "700", neighborhood: "East Village", status: "free", latitude: 51.0472, longitude: -114.0615, confidence: "93%", checked: "36 s", heading: 180 },
  { id: "F-03", street: "17 Avenue SE", number: "900", neighborhood: "Inglewood", status: "free", latitude: 51.0374, longitude: -114.0583, confidence: "89%", checked: "51 s", heading: 0 },
];

const statusText: Record<Status, string> = { free: "Libre", occupied: "Ocupado", review: "Revisar" };
const statusColor: Record<Status, string> = { free: "#247b52", occupied: "#b6543b", review: "#ae7c27" };
const storageKey = "ba-estaciona-mobile-memory";
const themeStorageKey = "ba-estaciona-mobile-theme";
const initialRegion: Region = { latitude: 51.0447, longitude: -114.0719, latitudeDelta: 0.085, longitudeDelta: 0.085 };

type Memory = { favoriteIds: string[]; asked: string[] };

function ThemeToggle({ darkMode, onPress }: { darkMode: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={darkMode ? "Activar modo claro" : "Activar modo oscuro"} onPress={onPress} style={[styles.themeButton, darkMode && styles.themeButtonDark]}><Text style={[styles.themeIcon, darkMode && styles.textDark]}>{darkMode ? "☀" : "☾"}</Text></Pressable>;
}

function StreetView({ spot, onSelect, darkMode, onToggleTheme }: { spot: Spot; onSelect: (spot: Spot) => void; darkMode: boolean; onToggleTheme: () => void }) {
  const source = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.latitude},${spot.longitude}&heading=${spot.heading}&pitch=0&fov=90`;
  return (
    <View style={[styles.streetScreen, darkMode && styles.screenDark]}>
      <View style={styles.streetTopBar}>
        <View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>EXPLORAR LA CUADRA</Text><Text style={[styles.streetPageTitle, darkMode && styles.textDark]}>Street View</Text></View>
        <View style={styles.headerActions}><ThemeToggle darkMode={darkMode} onPress={onToggleTheme} /><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>CONECTADO</Text></View></View>
      </View>
      <View style={[styles.streetHeroCard, darkMode && styles.darkCard]}>
        <View style={[styles.streetViewerHeader, darkMode && styles.darkCard]}>
          <View><Text style={[styles.streetViewerLabel, darkMode && styles.textMutedDark]}>UBICACIÓN SELECCIONADA</Text><Text style={[styles.streetViewerTitle, darkMode && styles.textDark]}>{spot.street} {spot.number}</Text></View>
          <View style={[styles.streetStatus, { backgroundColor: `${statusColor[spot.status]}18` }]}><View style={[styles.chipDot, { backgroundColor: statusColor[spot.status] }]} /><Text style={[styles.streetStatusText, { color: statusColor[spot.status] }]}>{statusText[spot.status]}</Text></View>
        </View>
        <View style={styles.streetFrame}>
          <WebView source={{ uri: source }} style={styles.webView} startInLoadingState renderLoading={() => <View style={styles.webLoading}><ActivityIndicator color="#247b52" /><Text style={styles.muted}>Cargando vista de calle…</Text></View>} onError={() => Alert.alert("Street View no disponible", "Podés seguir usando el mapa con la evidencia local.")} />
          <View style={styles.streetCompass}><Text style={styles.streetCompassArrow}>↑</Text><Text style={styles.streetCompassText}>N</Text></View>
          <View style={styles.streetSource}><Text style={styles.streetSourceText}>Google Street View</Text></View>
        </View>
      </View>
      <View style={[styles.streetInfoCard, darkMode && styles.darkCard]}>
        <View style={styles.streetInfoIcon}><Text>⌖</Text></View>
        <View style={styles.streetInfoCopy}><Text style={[styles.streetInfoTitle, darkMode && styles.textDark]}>{spot.neighborhood}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Última lectura local · hace {spot.checked} · acuerdo {spot.confidence}</Text></View>
        <Pressable onPress={() => onSelect(spot)} style={styles.streetRefresh}><Text style={styles.streetRefreshText}>↻</Text></Pressable>
      </View>
      <Text style={[styles.streetSectionLabel, darkMode && styles.textMutedDark]}>CAMBIAR UBICACIÓN</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotPicker}>
        {SPOTS.filter((candidate) => candidate.status === "free").map((candidate) => <Pressable key={candidate.id} onPress={() => onSelect(candidate)} style={[styles.streetAvailableButton, darkMode && styles.darkCard, candidate.id === spot.id && styles.streetAvailableSelected]}><View style={styles.streetAvailableDot} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.streetAvailableStreet, darkMode && styles.textDark, candidate.id === spot.id && styles.streetAvailableTextSelected]}>{candidate.street} {candidate.number}</Text><Text style={[styles.streetAvailableArrow, darkMode && styles.textMutedDark, candidate.id === spot.id && styles.streetAvailableTextSelected]}>›</Text></Pressable>)}
      </ScrollView>
    </View>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tabButton}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("map");
  const [selectedId, setSelectedId] = useState("A-12");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [memory, setMemory] = useState<Memory>({ favoriteIds: [], asked: [] });
  const [darkMode, setDarkMode] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((value) => { if (value) setMemory(JSON.parse(value) as Memory); }).catch(() => undefined);
    AsyncStorage.getItem(themeStorageKey).then((value) => { if (value === "dark") setDarkMode(true); }).catch(() => undefined);
  }, []);

  const searchedSpots = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return SPOTS;
    return SPOTS.filter((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase().includes(normalized));
  }, [query]);
  const visibleSpots = useMemo(() => statusFilter === "all" ? searchedSpots : searchedSpots.filter((spot) => spot.status === statusFilter), [searchedSpots, statusFilter]);
  const selected = visibleSpots.find((spot) => spot.id === selectedId) ?? visibleSpots[0] ?? SPOTS[0];
  const counts = useMemo(() => ({
    all: searchedSpots.length,
    free: searchedSpots.filter((spot) => spot.status === "free").length,
    occupied: searchedSpots.filter((spot) => spot.status === "occupied").length,
    review: searchedSpots.filter((spot) => spot.status === "review").length,
  }), [searchedSpots]);
  const filterCards: Array<{ key: Status | "all"; label: string; value: number; color: string }> = [
    { key: "all", label: "detectados", value: counts.all, color: "#65776a" },
    { key: "free", label: "libres cerca", value: counts.free, color: statusColor.free },
    { key: "occupied", label: "ocupados", value: counts.occupied, color: statusColor.occupied },
    { key: "review", label: "revisar", value: counts.review, color: statusColor.review },
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
        Alert.alert("Ubicación desactivada", "Podés activar el permiso desde Ajustes para ver lugares cerca de vos.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      Alert.alert("No pudimos ubicarte", "Seguí usando el mapa de Calgary o probá nuevamente.");
    } finally {
      setLocating(false);
    }
  };

  const openStreetTab = () => setTab("street");

  return (
    <SafeAreaView style={[styles.safe, darkMode && styles.safeDark]}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {tab === "map" && <View style={[styles.mapScreen, darkMode && styles.screenDark]}>
          <View style={styles.header}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>BA ESTACIONA</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Encontrá dónde dejarlo</Text></View><View style={styles.headerActions}><ThemeToggle darkMode={darkMode} onPress={toggleTheme} /><View style={styles.localPill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View></View></View>
          <View style={[styles.searchBox, darkMode && styles.darkInput]}><Text style={[styles.searchIcon, darkMode && styles.textMutedDark]}>⌕</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={rememberQuery} placeholder="Destino, calle o barrio" placeholderTextColor={darkMode ? "#9aaa9e" : "#88958b"} style={[styles.searchInput, darkMode && styles.textDark]} returnKeyType="search" /><Pressable onPress={locate} style={styles.locateButton} disabled={locating}><Text style={styles.locateText}>{locating ? "…" : "⌖"}</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroller}>{filterCards.map((filter) => <Pressable key={filter.key} onPress={() => setStatusFilter(filter.key)} style={[styles.statFilterCard, darkMode && styles.darkCard, statusFilter === filter.key && styles.statFilterCardActive]}><View style={[styles.statFilterDot, { backgroundColor: filter.color }]} /><Text style={styles.statNumber}>{filter.value}</Text><Text style={[styles.statLabel, darkMode && styles.textMutedDark]}>{filter.label}</Text></Pressable>)}<Text style={[styles.updated, darkMode && styles.textMutedDark]}>hace 18 s</Text></ScrollView>
          <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation={Boolean(userLocation)} showsMyLocationButton={false} mapType="standard">
            {visibleSpots.map((spot) => <Marker key={spot.id} coordinate={{ latitude: spot.latitude, longitude: spot.longitude }} pinColor={statusColor[spot.status]} onPress={() => setSelectedId(spot.id)}><Callout onPress={() => setSelectedId(spot.id)}><View style={styles.callout}><Text style={styles.calloutStreet}>{spot.street} {spot.number}</Text><Text style={[styles.calloutStatus, { color: statusColor[spot.status] }]}>{statusText[spot.status]} · {spot.confidence}</Text><Text style={styles.calloutHint}>Tocá Street View en la pestaña inferior</Text></View></Callout></Marker>)}
            {userLocation && <Marker coordinate={userLocation} pinColor="#2979ff" title="Tu ubicación" />}
          </MapView>
          <View style={[styles.mapLegend, darkMode && styles.darkCard]}><View><View style={[styles.legendDot, { backgroundColor: statusColor.free }]} /><Text style={[styles.legendText, darkMode && styles.textMutedDark]}>Libre</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.occupied }]} /><Text style={[styles.legendText, darkMode && styles.textMutedDark]}>Ocupado</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.review }]} /><Text style={[styles.legendText, darkMode && styles.textMutedDark]}>Revisar</Text></View></View>
          <View style={[styles.selectedCard, darkMode && styles.darkCard]}><View style={[styles.selectedDot, { backgroundColor: statusColor[selected.status] }]} /><View style={styles.selectedCopy}><Text style={[styles.selectedStreet, darkMode && styles.textDark]}>{selected.street} {selected.number}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{selected.neighborhood} · leído hace {selected.checked}</Text></View><Pressable onPress={toggleFavorite} style={styles.starButton}><Text style={styles.star}>{memory.favoriteIds.includes(selected.id) ? "★" : "☆"}</Text></Pressable><Pressable onPress={openStreetTab} style={styles.streetButton}><Text style={styles.streetButtonText}>Street View</Text></Pressable></View>
        </View>}
        {tab === "street" && <StreetView spot={selected} darkMode={darkMode} onToggleTheme={toggleTheme} onSelect={(spot) => setSelectedId(spot.id)} />}
        {tab === "saved" && <View style={[styles.savedScreen, darkMode && styles.screenDark]}><View style={styles.header}><View><Text style={[styles.kicker, darkMode && styles.textMutedDark]}>TU MEMORIA</Text><Text style={[styles.screenTitle, darkMode && styles.textDark]}>Lugares guardados</Text></View><View style={styles.headerActions}><ThemeToggle darkMode={darkMode} onPress={toggleTheme} /><Text style={styles.savedCount}>{memory.favoriteIds.length}</Text></View></View><Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>FAVORITOS</Text>{memory.favoriteIds.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>☆</Text><Text style={[styles.emptyTitle, darkMode && styles.textDark]}>Todavía no guardaste lugares</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>Tocá ☆ en cualquier punto del mapa para verlo acá.</Text></View> : <FlatList data={SPOTS.filter((spot) => memory.favoriteIds.includes(spot.id))} keyExtractor={(spot) => spot.id} contentContainerStyle={styles.savedList} renderItem={({ item }) => <Pressable style={[styles.savedRow, darkMode && styles.darkCard]} onPress={() => { setSelectedId(item.id); setTab("map"); }}><View style={[styles.savedDot, { backgroundColor: statusColor[item.status] }]} /><View style={styles.savedCopy}><Text style={[styles.savedStreet, darkMode && styles.textDark]}>{item.street} {item.number}</Text><Text style={[styles.muted, darkMode && styles.textMutedDark]}>{item.neighborhood} · {statusText[item.status]}</Text></View><Text style={[styles.rowArrow, darkMode && styles.textMutedDark]}>›</Text></Pressable>} />}
          <Text style={[styles.sectionLabel, darkMode && styles.textMutedDark]}>MÁS BUSCADOS EN ESTE TELÉFONO</Text>{memory.asked.length === 0 ? <Text style={[styles.muted, darkMode && styles.textMutedDark]}>Tus búsquedas frecuentes aparecerán acá.</Text> : <View style={styles.askedWrap}>{memory.asked.map((place) => <Pressable key={place} style={[styles.askedChip, darkMode && styles.darkPill]} onPress={() => { setQuery(place); setTab("map"); }}><Text style={[styles.askedText, darkMode && styles.textDark]}>⌕ {place}</Text></Pressable>)}</View>}
          <Pressable style={styles.clearButton} onPress={() => saveMemory({ favoriteIds: [], asked: [] })}><Text style={styles.clearText}>Borrar memoria local</Text></Pressable>
        </View>}
        <View style={[styles.tabBar, darkMode && styles.darkTabBar]}><TabButton icon="⌖" label="Mapa" active={tab === "map"} onPress={() => setTab("map")} /><TabButton icon="◉" label="Street View" active={tab === "street"} onPress={openStreetTab} /><TabButton icon="★" label="Guardados" active={tab === "saved"} onPress={() => setTab("saved")} /></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f3ec" }, app: { flex: 1 }, mapScreen: { flex: 1, paddingHorizontal: 18 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 7, paddingBottom: 8 }, kicker: { color: "#718075", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }, screenTitle: { color: "#1f2d25", fontSize: 26, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 }, localPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#e6f1e5" }, livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: "#edf4eb" }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2f9861" }, liveText: { color: "#37704c", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 12, paddingHorizontal: 10, height: 44, shadowColor: "#354c3b", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, searchIcon: { fontSize: 22, color: "#617467", marginRight: 8 }, searchInput: { flex: 1, color: "#26352c", fontSize: 15 }, locateButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4eb" }, locateText: { color: "#247b52", fontSize: 21 }, statsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 }, statsScroller: { alignItems: "center", gap: 6, paddingVertical: 4 }, statFilterCard: { minWidth: 86, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, statFilterCardActive: { borderColor: "#247b52", backgroundColor: "#edf4eb" }, statFilterDot: { width: 7, height: 7, borderRadius: 4 }, statNumber: { color: "#247b52", fontSize: 18, fontWeight: "800" }, statLabel: { color: "#718075", fontSize: 10, marginTop: 1 }, statDivider: { width: 1, height: 27, backgroundColor: "#d9ded5", marginHorizontal: 19 }, updated: { marginLeft: "auto", color: "#869188", fontSize: 10 }, map: { flex: 1, minHeight: 350, width: width - 36, borderRadius: 18, overflow: "hidden" }, callout: { width: 190, padding: 3 }, calloutStreet: { color: "#203128", fontWeight: "800", fontSize: 13 }, calloutStatus: { fontWeight: "700", fontSize: 12, marginTop: 4 }, calloutHint: { color: "#7d897f", fontSize: 10, marginTop: 7 }, mapLegend: { position: "absolute", bottom: 144, left: 28, flexDirection: "row", gap: 11, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, legendDot: { width: 7, height: 7, borderRadius: 4, alignSelf: "center", marginBottom: 3 }, legendText: { color: "#68766c", fontSize: 9 }, selectedCard: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 12, padding: 13, borderRadius: 16, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da", shadowColor: "#354c3b", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, selectedDot: { width: 11, height: 11, borderRadius: 6 }, selectedCopy: { flex: 1 }, selectedStreet: { color: "#26352c", fontWeight: "800", fontSize: 13 }, muted: { color: "#7a887e", fontSize: 11, marginTop: 3 }, starButton: { width: 31, height: 31, justifyContent: "center", alignItems: "center" }, star: { color: "#247b52", fontSize: 23 }, streetButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#1f4333" }, streetButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" }, streetScreen: { flex: 1, paddingHorizontal: 18 }, streetTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, paddingBottom: 8 }, streetPageTitle: { color: "#1f2d25", fontSize: 25, fontWeight: "800", letterSpacing: -0.9, marginTop: 3 }, streetHeroCard: { flex: 1, minHeight: 320, overflow: "hidden", borderRadius: 22, backgroundColor: "#dfe7de", borderWidth: 1, borderColor: "#d9e1d6", shadowColor: "#354c3b", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 }, streetViewerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, paddingVertical: 11, backgroundColor: "#fffdf8" }, streetViewerLabel: { color: "#859287", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 }, streetViewerTitle: { color: "#26352c", fontSize: 16, fontWeight: "800", marginTop: 3 }, streetStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 18 }, streetStatusText: { fontSize: 10, fontWeight: "800" }, streetFrame: { flex: 1, overflow: "hidden", backgroundColor: "#dfe7de" }, webView: { flex: 1 }, webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#edf2ea" }, streetCompass: { position: "absolute", top: 13, right: 13, width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,.92)" }, streetCompassArrow: { color: "#247b52", fontSize: 16, lineHeight: 17, fontWeight: "800" }, streetCompassText: { color: "#5f7065", fontSize: 8, fontWeight: "800" }, streetSource: { position: "absolute", left: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(31,67,51,.88)" }, streetSourceText: { color: "#fff", fontSize: 9, fontWeight: "700" }, streetInfoCard: { flexDirection: "row", alignItems: "center", marginTop: 8, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: "#e0e2da", backgroundColor: "#fffdf8" }, streetInfoIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginRight: 8, borderRadius: 9, backgroundColor: "#e6f1e5" }, streetInfoIconText: { color: "#247b52", fontSize: 15 }, streetInfoCopy: { flex: 1 }, streetInfoTitle: { color: "#30473a", fontSize: 11, fontWeight: "800" }, streetRefresh: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#f1f5ef" }, streetRefreshText: { color: "#247b52", fontSize: 15, fontWeight: "700" }, streetSectionLabel: { color: "#7d8a7f", fontSize: 8, fontWeight: "800", letterSpacing: 1, marginTop: 6, marginBottom: 0 }, streetAvailableButton: { width: 96, height: 30, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, streetAvailableSelected: { backgroundColor: "#1f4333", borderColor: "#1f4333" }, streetAvailableDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#247b52" }, streetAvailableCopy: { flex: 1 }, streetAvailableStreet: { flex: 1, color: "#30473a", fontSize: 11, fontWeight: "800" }, streetAvailableMeta: { color: "#7b897d", fontSize: 7, marginTop: 1 }, streetAvailableArrow: { color: "#8b998e", fontSize: 15, lineHeight: 15 }, streetAvailableTextSelected: { color: "#fff" }, streetChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, streetChipSelected: { backgroundColor: "#1f4333", borderColor: "#1f4333" }, chipDot: { width: 7, height: 7, borderRadius: 4 }, streetChipText: { color: "#536257", fontSize: 9, fontWeight: "600" }, streetChipTextSelected: { color: "#fff" }, spotPicker: { gap: 5, paddingTop: 3, paddingBottom: 5 }, savedScreen: { flex: 1, paddingHorizontal: 18 }, savedCount: { color: "#247b52", fontSize: 32, fontWeight: "800" }, sectionLabel: { color: "#79857b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 10 }, savedList: { gap: 8 }, savedRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, savedDot: { width: 10, height: 10, borderRadius: 5, marginRight: 11 }, savedCopy: { flex: 1 }, savedStreet: { color: "#26352c", fontSize: 14, fontWeight: "800" }, rowArrow: { color: "#97a198", fontSize: 24 }, empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 24 }, emptyIcon: { color: "#9db49a", fontSize: 48 }, emptyTitle: { color: "#34483a", fontSize: 16, fontWeight: "800", marginTop: 12 }, askedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, askedChip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, backgroundColor: "#edf4eb" }, askedText: { color: "#49664f", fontSize: 11, fontWeight: "700" }, clearButton: { alignSelf: "flex-start", marginTop: 30, paddingVertical: 10 }, clearText: { color: "#9c4935", fontSize: 11, fontWeight: "700" }, tabBar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 5 : 10, borderTopWidth: 1, borderTopColor: "#e1e2da", backgroundColor: "#fffdf8" }, tabButton: { alignItems: "center", justifyContent: "center", minWidth: 90, gap: 2 }, tabIcon: { color: "#91a096", fontSize: 21 }, tabLabel: { color: "#879289", fontSize: 10, fontWeight: "700" }, tabActive: { color: "#247b52" }, safeDark: { backgroundColor: "#101713" }, screenDark: { backgroundColor: "#101713" }, textDark: { color: "#f4f7f1" }, textMutedDark: { color: "#a7b4aa" }, darkCard: { backgroundColor: "#1a251f", borderColor: "#34473b" }, darkInput: { backgroundColor: "#1a251f", borderColor: "#425447" }, darkPill: { backgroundColor: "#2c4032", borderColor: "#3d5845" }, themeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#d8e0d5", backgroundColor: "#fffdf8" }, themeButtonDark: { borderColor: "#405548", backgroundColor: "#26372c" }, themeIcon: { color: "#46614d", fontSize: 18, fontWeight: "700" }, headerActions: { flexDirection: "row", alignItems: "center", gap: 8 }, darkTabBar: { backgroundColor: "#17211b", borderTopColor: "#304239" },
});
