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
const initialRegion: Region = { latitude: 51.0447, longitude: -114.0719, latitudeDelta: 0.085, longitudeDelta: 0.085 };

type Memory = { favoriteIds: string[]; asked: string[] };

function StreetView({ spot, onSelect }: { spot: Spot; onSelect: (spot: Spot) => void }) {
  const source = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.latitude},${spot.longitude}&heading=${spot.heading}&pitch=0&fov=90`;
  return (
    <View style={styles.streetScreen}>
      <View style={styles.streetHeading}>
        <View><Text style={styles.kicker}>VISTA DE CALLE</Text><Text style={styles.screenTitle}>{spot.street} {spot.number}</Text><Text style={styles.muted}>{spot.neighborhood} · evidencia visual</Text></View>
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View>
      </View>
      <View style={styles.streetFrame}>
        <WebView source={{ uri: source }} style={styles.webView} startInLoadingState renderLoading={() => <View style={styles.webLoading}><ActivityIndicator color="#247b52" /><Text style={styles.muted}>Cargando Street View…</Text></View>} onError={() => Alert.alert("Street View no disponible", "Podés seguir usando el mapa con la evidencia local.")} />
        <View style={styles.streetOverlay}><Text style={styles.streetOverlayTitle}>Street View</Text><Text style={styles.streetOverlayCopy}>Explorá la cuadra sin salir de la app</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotPicker}>
        {SPOTS.map((candidate) => <Pressable key={candidate.id} onPress={() => onSelect(candidate)} style={styles.streetChip}><View style={[styles.chipDot, { backgroundColor: statusColor[candidate.status] }]} /><Text style={styles.streetChipText}>{candidate.street} {candidate.number}</Text></Pressable>)}
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
  const [memory, setMemory] = useState<Memory>({ favoriteIds: [], asked: [] });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((value) => { if (value) setMemory(JSON.parse(value) as Memory); }).catch(() => undefined);
  }, []);

  const selected = SPOTS.find((spot) => spot.id === selectedId) ?? SPOTS[0];
  const visibleSpots = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return SPOTS;
    return SPOTS.filter((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase().includes(normalized));
  }, [query]);
  const freeCount = SPOTS.filter((spot) => spot.status === "free").length;

  const saveMemory = (next: Memory) => {
    setMemory(next);
    void AsyncStorage.setItem(storageKey, JSON.stringify(next));
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {tab === "map" && <View style={styles.mapScreen}>
          <View style={styles.header}><View><Text style={styles.kicker}>BA ESTACIONA</Text><Text style={styles.screenTitle}>Encontrá dónde dejarlo</Text></View><View style={styles.localPill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View></View>
          <View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={rememberQuery} placeholder="Destino, calle o barrio" placeholderTextColor="#88958b" style={styles.searchInput} returnKeyType="search" /><Pressable onPress={locate} style={styles.locateButton} disabled={locating}><Text style={styles.locateText}>{locating ? "…" : "⌖"}</Text></Pressable></View>
          <View style={styles.statsRow}><View><Text style={styles.statNumber}>{freeCount}</Text><Text style={styles.statLabel}>libres cerca</Text></View><View style={styles.statDivider} /><View><Text style={styles.statNumber}>{visibleSpots.length}</Text><Text style={styles.statLabel}>puntos detectados</Text></View><Text style={styles.updated}>hace 18 s</Text></View>
          <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation={Boolean(userLocation)} showsMyLocationButton={false} mapType="standard">
            {visibleSpots.map((spot) => <Marker key={spot.id} coordinate={{ latitude: spot.latitude, longitude: spot.longitude }} pinColor={statusColor[spot.status]} onPress={() => setSelectedId(spot.id)}><Callout onPress={() => setSelectedId(spot.id)}><View style={styles.callout}><Text style={styles.calloutStreet}>{spot.street} {spot.number}</Text><Text style={[styles.calloutStatus, { color: statusColor[spot.status] }]}>{statusText[spot.status]} · {spot.confidence}</Text><Text style={styles.calloutHint}>Tocá Street View en la pestaña inferior</Text></View></Callout></Marker>)}
            {userLocation && <Marker coordinate={userLocation} pinColor="#2979ff" title="Tu ubicación" />}
          </MapView>
          <View style={styles.mapLegend}><View><View style={[styles.legendDot, { backgroundColor: statusColor.free }]} /><Text style={styles.legendText}>Libre</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.occupied }]} /><Text style={styles.legendText}>Ocupado</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.review }]} /><Text style={styles.legendText}>Revisar</Text></View></View>
          <View style={styles.selectedCard}><View style={[styles.selectedDot, { backgroundColor: statusColor[selected.status] }]} /><View style={styles.selectedCopy}><Text style={styles.selectedStreet}>{selected.street} {selected.number}</Text><Text style={styles.muted}>{selected.neighborhood} · leído hace {selected.checked}</Text></View><Pressable onPress={toggleFavorite} style={styles.starButton}><Text style={styles.star}>{memory.favoriteIds.includes(selected.id) ? "★" : "☆"}</Text></Pressable><Pressable onPress={openStreetTab} style={styles.streetButton}><Text style={styles.streetButtonText}>Street View</Text></Pressable></View>
        </View>}
        {tab === "street" && <StreetView spot={selected} onSelect={(spot) => setSelectedId(spot.id)} />}
        {tab === "saved" && <View style={styles.savedScreen}><View style={styles.header}><View><Text style={styles.kicker}>TU MEMORIA</Text><Text style={styles.screenTitle}>Lugares guardados</Text></View><Text style={styles.savedCount}>{memory.favoriteIds.length}</Text></View><Text style={styles.sectionLabel}>FAVORITOS</Text>{memory.favoriteIds.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>☆</Text><Text style={styles.emptyTitle}>Todavía no guardaste lugares</Text><Text style={styles.muted}>Tocá ☆ en cualquier punto del mapa para verlo acá.</Text></View> : <FlatList data={SPOTS.filter((spot) => memory.favoriteIds.includes(spot.id))} keyExtractor={(spot) => spot.id} contentContainerStyle={styles.savedList} renderItem={({ item }) => <Pressable style={styles.savedRow} onPress={() => { setSelectedId(item.id); setTab("map"); }}><View style={[styles.savedDot, { backgroundColor: statusColor[item.status] }]} /><View style={styles.savedCopy}><Text style={styles.savedStreet}>{item.street} {item.number}</Text><Text style={styles.muted}>{item.neighborhood} · {statusText[item.status]}</Text></View><Text style={styles.rowArrow}>›</Text></Pressable>} />}
          <Text style={styles.sectionLabel}>MÁS BUSCADOS EN ESTE TELÉFONO</Text>{memory.asked.length === 0 ? <Text style={styles.muted}>Tus búsquedas frecuentes aparecerán acá.</Text> : <View style={styles.askedWrap}>{memory.asked.map((place) => <Pressable key={place} style={styles.askedChip} onPress={() => { setQuery(place); setTab("map"); }}><Text style={styles.askedText}>⌕ {place}</Text></Pressable>)}</View>}
          <Pressable style={styles.clearButton} onPress={() => saveMemory({ favoriteIds: [], asked: [] })}><Text style={styles.clearText}>Borrar memoria local</Text></Pressable>
        </View>}
        <View style={styles.tabBar}><TabButton icon="⌖" label="Mapa" active={tab === "map"} onPress={() => setTab("map")} /><TabButton icon="◉" label="Street View" active={tab === "street"} onPress={openStreetTab} /><TabButton icon="★" label="Guardados" active={tab === "saved"} onPress={() => setTab("saved")} /></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f3ec" }, app: { flex: 1 }, mapScreen: { flex: 1, paddingHorizontal: 18 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 14 }, kicker: { color: "#718075", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }, screenTitle: { color: "#1f2d25", fontSize: 26, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 }, localPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#e6f1e5" }, livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: "#edf4eb" }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2f9861" }, liveText: { color: "#37704c", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 14, paddingHorizontal: 12, height: 49, shadowColor: "#354c3b", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, searchIcon: { fontSize: 22, color: "#617467", marginRight: 8 }, searchInput: { flex: 1, color: "#26352c", fontSize: 15 }, locateButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4eb" }, locateText: { color: "#247b52", fontSize: 21 }, statsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 }, statNumber: { color: "#247b52", fontSize: 22, fontWeight: "800" }, statLabel: { color: "#718075", fontSize: 11, marginTop: 1 }, statDivider: { width: 1, height: 27, backgroundColor: "#d9ded5", marginHorizontal: 19 }, updated: { marginLeft: "auto", color: "#869188", fontSize: 10 }, map: { flex: 1, minHeight: 310, width: width - 36, borderRadius: 20, overflow: "hidden" }, callout: { width: 190, padding: 3 }, calloutStreet: { color: "#203128", fontWeight: "800", fontSize: 13 }, calloutStatus: { fontWeight: "700", fontSize: 12, marginTop: 4 }, calloutHint: { color: "#7d897f", fontSize: 10, marginTop: 7 }, mapLegend: { position: "absolute", bottom: 144, left: 28, flexDirection: "row", gap: 11, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, legendDot: { width: 7, height: 7, borderRadius: 4, alignSelf: "center", marginBottom: 3 }, legendText: { color: "#68766c", fontSize: 9 }, selectedCard: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 12, padding: 13, borderRadius: 16, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da", shadowColor: "#354c3b", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, selectedDot: { width: 11, height: 11, borderRadius: 6 }, selectedCopy: { flex: 1 }, selectedStreet: { color: "#26352c", fontWeight: "800", fontSize: 13 }, muted: { color: "#7a887e", fontSize: 11, marginTop: 3 }, starButton: { width: 31, height: 31, justifyContent: "center", alignItems: "center" }, star: { color: "#247b52", fontSize: 23 }, streetButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#1f4333" }, streetButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" }, streetScreen: { flex: 1, paddingHorizontal: 18 }, streetHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 14 }, streetFrame: { flex: 1, overflow: "hidden", borderRadius: 20, backgroundColor: "#dfe7de" }, webView: { flex: 1 }, webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#edf2ea" }, streetOverlay: { position: "absolute", left: 14, bottom: 14, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, backgroundColor: "rgba(31,67,51,.9)" }, streetOverlayTitle: { color: "#fff", fontWeight: "800", fontSize: 12 }, streetOverlayCopy: { color: "#d9ead7", fontSize: 10, marginTop: 3 }, spotPicker: { gap: 8, paddingVertical: 12 }, streetChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, chipDot: { width: 7, height: 7, borderRadius: 4 }, streetChipText: { color: "#536257", fontSize: 10 }, savedScreen: { flex: 1, paddingHorizontal: 18 }, savedCount: { color: "#247b52", fontSize: 32, fontWeight: "800" }, sectionLabel: { color: "#79857b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 10 }, savedList: { gap: 8 }, savedRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, savedDot: { width: 10, height: 10, borderRadius: 5, marginRight: 11 }, savedCopy: { flex: 1 }, savedStreet: { color: "#26352c", fontSize: 14, fontWeight: "800" }, rowArrow: { color: "#97a198", fontSize: 24 }, empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 24 }, emptyIcon: { color: "#9db49a", fontSize: 48 }, emptyTitle: { color: "#34483a", fontSize: 16, fontWeight: "800", marginTop: 12 }, askedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, askedChip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, backgroundColor: "#edf4eb" }, askedText: { color: "#49664f", fontSize: 11, fontWeight: "700" }, clearButton: { alignSelf: "flex-start", marginTop: 30, paddingVertical: 10 }, clearText: { color: "#9c4935", fontSize: 11, fontWeight: "700" }, tabBar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 5 : 10, borderTopWidth: 1, borderTopColor: "#e1e2da", backgroundColor: "#fffdf8" }, tabButton: { alignItems: "center", justifyContent: "center", minWidth: 90, gap: 2 }, tabIcon: { color: "#91a096", fontSize: 21 }, tabLabel: { color: "#879289", fontSize: 10, fontWeight: "700" }, tabActive: { color: "#247b52" },
});
