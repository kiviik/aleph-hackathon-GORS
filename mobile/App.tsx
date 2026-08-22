import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  PermissionsAndroid,
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

type SnapshotStatus = "free" | "occupied" | "review";
type Tab = "map" | "street" | "saved";
type Spot = {
  id: string;
  street: string;
  number: string;
  neighborhood: string;
  status: SnapshotStatus;
  x: number;
  y: number;
};
type Memory = { favoriteIds: string[]; asked: string[] };

const SPOTS: Spot[] = [
  { id: "A-12", street: "Stephen Avenue SW", number: "100", neighborhood: "Downtown Calgary", status: "free", x: 24, y: 32 },
  { id: "A-13", street: "Stephen Avenue SW", number: "140", neighborhood: "Downtown Calgary", status: "occupied", x: 42, y: 31 },
  { id: "B-07", street: "17 Avenue SW", number: "1200", neighborhood: "Beltline", status: "free", x: 67, y: 55 },
  { id: "C-21", street: "Kensington Road NW", number: "1100", neighborhood: "Kensington", status: "review", x: 29, y: 71 },
  { id: "D-04", street: "10 Street NW", number: "210", neighborhood: "Kensington", status: "free", x: 76, y: 27 },
  { id: "E-18", street: "1 Street SE", number: "700", neighborhood: "East Village", status: "free", x: 53, y: 82 },
];

const statusText: Record<SnapshotStatus, string> = { free: "Libre en snapshot", occupied: "Ocupado en snapshot", review: "Revisar evidencia" };
const statusColor: Record<SnapshotStatus, string> = { free: "#247b52", occupied: "#b6543b", review: "#ae7c27" };
const storageKey = "ba-estaciona-mobile-memory";
const traceKey = "ba-estaciona-android-last-trace";

function TabButton({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tabButton}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}

function LocalMap({ spots, selectedId, onSelect }: { spots: Spot[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <View style={styles.mapCanvas}>
      <View style={[styles.mapRoad, styles.roadOne]} /><View style={[styles.mapRoad, styles.roadTwo]} /><View style={[styles.mapRoad, styles.roadThree]} />
      <View style={styles.mapBlockOne} /><View style={styles.mapBlockTwo} /><View style={styles.mapBlockThree} />
      {spots.map((spot) => <Pressable key={spot.id} onPress={() => onSelect(spot.id)} style={[styles.mapMarker, { left: `${spot.x}%`, top: `${spot.y}%`, backgroundColor: statusColor[spot.status] }, spot.id === selectedId && styles.mapMarkerSelected]}><Text style={styles.mapMarkerText}>{spot.id}</Text></Pressable>)}
      <View style={styles.snapshotBadge}><View style={styles.snapshotDot} /><Text style={styles.snapshotText}>SNAPSHOT LOCAL</Text></View>
      <Text style={styles.mapWatermark}>CALGARY / DEMO DATA</Text>
    </View>
  );
}

function LocalEvidence({ spot, onSelect, onAnalyze, checking }: { spot: Spot; onSelect: (spot: Spot) => void; onAnalyze: () => void; checking: boolean }) {
  return (
    <View style={styles.streetScreen}>
      <View style={styles.streetHeading}>
        <View><Text style={styles.kicker}>VISTA DE CALLE</Text><Text style={styles.screenTitle}>{spot.street} {spot.number}</Text><Text style={styles.muted}>{spot.neighborhood} · evidencia local</Text></View>
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View>
      </View>
      <View style={styles.streetFrame}>
        <View style={styles.localFrame}>
          <View style={styles.frameHorizon} /><View style={styles.frameRoad} /><View style={styles.frameCurb} />
          <View style={styles.frameEmpty}><Text style={styles.frameIcon}>◉</Text><Text style={styles.frameTitle}>Frame de cámara</Text><Text style={styles.frameCopy}>Todavía no capturado</Text><Pressable onPress={onAnalyze} disabled={checking} style={styles.captureButton}>{checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureButtonText}>Pedir cámara</Text>}</Pressable></View>
        </View>
        <View style={styles.streetOverlay}><Text style={styles.streetOverlayTitle}>Evidencia local</Text><Text style={styles.streetOverlayCopy}>No se sube ni se guarda el frame</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotPicker}>
        {SPOTS.map((candidate) => <Pressable key={candidate.id} onPress={() => onSelect(candidate)} style={styles.streetChip}><View style={[styles.chipDot, { backgroundColor: statusColor[candidate.status] }]} /><Text style={styles.streetChipText}>{candidate.street} {candidate.number}</Text></Pressable>)}
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("map");
  const [selectedId, setSelectedId] = useState("A-12");
  const [query, setQuery] = useState("");
  const [memory, setMemory] = useState<Memory>({ favoriteIds: [], asked: [] });
  const [cameraPermission, setCameraPermission] = useState<CameraPermission>("unknown");
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [lastTrace, setLastTrace] = useState<MobileTrace | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((value) => { if (value) setMemory(JSON.parse(value) as Memory); }).catch(() => undefined);
    void AsyncStorage.getItem(traceKey).then((value) => { if (value) setLastTrace(JSON.parse(value) as MobileTrace); }).catch(() => undefined);
    void checkCameraPermission();
  }, []);

  const selected = SPOTS.find((spot) => spot.id === selectedId) ?? SPOTS[0];
  const visibleSpots = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return SPOTS;
    return SPOTS.filter((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase().includes(normalized));
  }, [query]);
  const snapshotFreeCount = SPOTS.filter((spot) => spot.status === "free").length;

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

  const checkCameraPermission = async () => {
    if (Platform.OS !== "android") return;
    try {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      setCameraPermission(granted ? "granted" : "unknown");
    } catch { setCameraPermission("unknown"); }
  };

  const analyzeLocally = async () => {
    if (Platform.OS !== "android") return;
    setCheckingCamera(true);
    try {
      const result = cameraPermission === "granted" ? PermissionsAndroid.RESULTS.GRANTED : await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, { title: "Cámara para detectar estacionamiento", message: "La imagen se procesa localmente y no se sube a ningún servidor.", buttonPositive: "Continuar", buttonNegative: "Ahora no" });
      const permission: CameraPermission = result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "blocked" : "denied";
      setCameraPermission(permission);
      if (permission !== "granted") { Alert.alert("No se puede analizar", "Sin permiso de cámara el sistema debe abstenerse."); return; }
      const trace = createBlockedAnalysisTrace(String(Platform.Version));
      setLastTrace(trace);
      await AsyncStorage.setItem(traceKey, JSON.stringify(trace));
    } finally { setCheckingCamera(false); }
  };

  const openStreetTab = () => setTab("street");
  const openSelected = (id: string) => { setSelectedId(id); setTab("map"); };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        {tab === "map" && <View style={styles.mapScreen}>
          <View style={styles.header}><View><Text style={styles.kicker}>BA ESTACIONA</Text><Text style={styles.screenTitle}>Encontrá dónde dejarlo</Text></View><View style={styles.localPill}><View style={styles.liveDot} /><Text style={styles.liveText}>LOCAL</Text></View></View>
          <View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={rememberQuery} placeholder="Destino, calle o barrio" placeholderTextColor="#88958b" style={styles.searchInput} returnKeyType="search" /><Pressable onPress={analyzeLocally} style={styles.locateButton} disabled={checkingCamera}><Text style={styles.locateText}>{checkingCamera ? "…" : "⌖"}</Text></Pressable></View>
          <View style={styles.statsRow}><View><Text style={styles.statNumber}>{snapshotFreeCount}</Text><Text style={styles.statLabel}>en snapshot local</Text></View><View style={styles.statDivider} /><View><Text style={styles.statNumber}>{visibleSpots.length}</Text><Text style={styles.statLabel}>puntos de demo</Text></View><Text style={styles.updated}>sin tiempo real</Text></View>
          <LocalMap spots={visibleSpots} selectedId={selected.id} onSelect={setSelectedId} />
          <View style={styles.mapLegend}><View><View style={[styles.legendDot, { backgroundColor: statusColor.free }]} /><Text style={styles.legendText}>Libre snapshot</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.occupied }]} /><Text style={styles.legendText}>Ocupado</Text></View><View><View style={[styles.legendDot, { backgroundColor: statusColor.review }]} /><Text style={styles.legendText}>Revisar</Text></View></View>
          <View style={styles.selectedCard}><View style={[styles.selectedDot, { backgroundColor: statusColor[selected.status] }]} /><View style={styles.selectedCopy}><Text style={styles.selectedStreet}>{selected.street} {selected.number}</Text><Text style={styles.muted}>{selected.neighborhood} · {statusText[selected.status]}</Text><Text style={styles.warningText}>{lastTrace?.decision ?? "REFUSE"} hasta capturar evidencia</Text></View><Pressable onPress={toggleFavorite} style={styles.starButton}><Text style={styles.star}>{memory.favoriteIds.includes(selected.id) ? "★" : "☆"}</Text></Pressable><Pressable onPress={openStreetTab} style={styles.streetButton}><Text style={styles.streetButtonText}>Ver evidencia</Text></Pressable></View>
        </View>}
        {tab === "street" && <LocalEvidence spot={selected} onSelect={(spot) => setSelectedId(spot.id)} onAnalyze={analyzeLocally} checking={checkingCamera} />}
        {tab === "saved" && <View style={styles.savedScreen}><View style={styles.header}><View><Text style={styles.kicker}>TU MEMORIA</Text><Text style={styles.screenTitle}>Lugares guardados</Text></View><Text style={styles.savedCount}>{memory.favoriteIds.length}</Text></View><Text style={styles.sectionLabel}>FAVORITOS</Text>{memory.favoriteIds.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>☆</Text><Text style={styles.emptyTitle}>Todavía no guardaste lugares</Text><Text style={styles.muted}>Tocá ☆ en cualquier punto del mapa para verlo acá.</Text></View> : <FlatList data={SPOTS.filter((spot) => memory.favoriteIds.includes(spot.id))} keyExtractor={(spot) => spot.id} contentContainerStyle={styles.savedList} renderItem={({ item }) => <Pressable style={styles.savedRow} onPress={() => openSelected(item.id)}><View style={[styles.savedDot, { backgroundColor: statusColor[item.status] }]} /><View style={styles.savedCopy}><Text style={styles.savedStreet}>{item.street} {item.number}</Text><Text style={styles.muted}>{item.neighborhood} · {statusText[item.status]}</Text></View><Text style={styles.rowArrow}>›</Text></Pressable>} />}
          <Text style={styles.sectionLabel}>MÁS BUSCADOS EN ESTE TELÉFONO</Text>{memory.asked.length === 0 ? <Text style={styles.muted}>Tus búsquedas frecuentes aparecerán acá.</Text> : <View style={styles.askedWrap}>{memory.asked.map((place) => <Pressable key={place} style={styles.askedChip} onPress={() => { setQuery(place); setTab("map"); }}><Text style={styles.askedText}>⌕ {place}</Text></Pressable>)}</View>}
          <Pressable style={styles.clearButton} onPress={() => saveMemory({ favoriteIds: [], asked: [] })}><Text style={styles.clearText}>Borrar memoria local</Text></Pressable>
        </View>}
        <View style={styles.tabBar}><TabButton icon="⌖" label="Mapa" active={tab === "map"} onPress={() => setTab("map")} /><TabButton icon="◉" label="Street View" active={tab === "street"} onPress={openStreetTab} /><TabButton icon="★" label="Guardados" active={tab === "saved"} onPress={() => setTab("saved")} /></View>
      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f3ec" }, app: { flex: 1 }, mapScreen: { flex: 1, paddingHorizontal: 18 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 14 }, kicker: { color: "#718075", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 }, screenTitle: { color: "#1f2d25", fontSize: 26, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 }, localPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#e6f1e5" }, livePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: "#edf4eb" }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2f9861" }, liveText: { color: "#37704c", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#d6ddd1", borderRadius: 14, paddingHorizontal: 12, height: 49, shadowColor: "#354c3b", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, searchIcon: { fontSize: 22, color: "#617467", marginRight: 8 }, searchInput: { flex: 1, color: "#26352c", fontSize: 15 }, locateButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4eb" }, locateText: { color: "#247b52", fontSize: 21 }, statsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 }, statNumber: { color: "#247b52", fontSize: 22, fontWeight: "800" }, statLabel: { color: "#718075", fontSize: 11, marginTop: 1 }, statDivider: { width: 1, height: 27, backgroundColor: "#d9ded5", marginHorizontal: 19 }, updated: { marginLeft: "auto", color: "#869188", fontSize: 10 }, map: { flex: 1, minHeight: 310, width: width - 36, borderRadius: 20, overflow: "hidden" }, mapCanvas: { flex: 1, minHeight: 310, width: width - 36, borderRadius: 20, overflow: "hidden", backgroundColor: "#d9e4d5", position: "relative" }, mapRoad: { position: "absolute", backgroundColor: "#f5f3eb", borderWidth: 1, borderColor: "#d2d9ce" }, roadOne: { width: "140%", height: 40, top: "34%", left: "-20%", transform: [{ rotate: "-12deg" }] }, roadTwo: { width: "130%", height: 34, top: "66%", left: "-15%", transform: [{ rotate: "18deg" }] }, roadThree: { width: 34, height: "140%", left: "58%", top: "-20%", transform: [{ rotate: "15deg" }] }, mapBlockOne: { position: "absolute", width: 100, height: 70, top: 34, left: 20, backgroundColor: "#c5d7c1", borderRadius: 8 }, mapBlockTwo: { position: "absolute", width: 120, height: 80, bottom: 30, right: 18, backgroundColor: "#c0d3bd", borderRadius: 8 }, mapBlockThree: { position: "absolute", width: 80, height: 100, top: 85, right: 28, backgroundColor: "#cfddc9", borderRadius: 8 }, mapMarker: { position: "absolute", minWidth: 34, height: 27, paddingHorizontal: 5, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fffdf8", elevation: 3 }, mapMarkerSelected: { transform: [{ scale: 1.22 }], borderColor: "#1f4333" }, mapMarkerText: { color: "#fff", fontSize: 9, fontWeight: "800" }, snapshotBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, snapshotDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#247b52" }, snapshotText: { color: "#49664f", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 }, mapWatermark: { position: "absolute", right: 12, bottom: 12, color: "#829587", fontSize: 9, fontWeight: "700", letterSpacing: 0.7 }, callout: { width: 190, padding: 3 }, calloutStreet: { color: "#203128", fontWeight: "800", fontSize: 13 }, calloutStatus: { fontWeight: "700", fontSize: 12, marginTop: 4 }, calloutHint: { color: "#7d897f", fontSize: 10, marginTop: 7 }, mapLegend: { position: "absolute", bottom: 144, left: 28, flexDirection: "row", gap: 11, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,253,248,.94)" }, legendDot: { width: 7, height: 7, borderRadius: 4, alignSelf: "center", marginBottom: 3 }, legendText: { color: "#68766c", fontSize: 9 }, selectedCard: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 12, padding: 13, borderRadius: 16, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da", shadowColor: "#354c3b", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, selectedDot: { width: 11, height: 11, borderRadius: 6 }, selectedCopy: { flex: 1 }, selectedStreet: { color: "#26352c", fontWeight: "800", fontSize: 13 }, muted: { color: "#7a887e", fontSize: 11, marginTop: 3 }, warningText: { color: "#a66d31", fontSize: 10, fontWeight: "700", marginTop: 3 }, starButton: { width: 31, height: 31, justifyContent: "center", alignItems: "center" }, star: { color: "#247b52", fontSize: 23 }, streetButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#1f4333" }, streetButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" }, streetScreen: { flex: 1, paddingHorizontal: 18 }, streetHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 14 }, streetFrame: { flex: 1, overflow: "hidden", borderRadius: 20, backgroundColor: "#dfe7de" }, localFrame: { flex: 1, backgroundColor: "#9db6a0", overflow: "hidden", position: "relative" }, frameHorizon: { position: "absolute", top: 0, left: 0, right: 0, height: "42%", backgroundColor: "#b9ccb5" }, frameRoad: { position: "absolute", bottom: 0, left: "-25%", width: "150%", height: "68%", backgroundColor: "#899e8b", transform: [{ rotate: "-7deg" }] }, frameCurb: { position: "absolute", bottom: "28%", left: "-10%", width: "130%", height: 10, backgroundColor: "#d8ded0", transform: [{ rotate: "-7deg" }] }, frameEmpty: { position: "absolute", alignItems: "center", justifyContent: "center", top: "27%", left: 24, right: 24, padding: 20, borderRadius: 18, backgroundColor: "rgba(255,253,248,.92)" }, frameIcon: { color: "#247b52", fontSize: 30 }, frameTitle: { color: "#26352c", fontSize: 16, fontWeight: "800", marginTop: 5 }, frameCopy: { color: "#7a887e", fontSize: 11, marginTop: 4 }, captureButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 11, backgroundColor: "#1f4333" }, captureButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" }, streetOverlay: { position: "absolute", left: 14, bottom: 14, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, backgroundColor: "rgba(31,67,51,.9)" }, streetOverlayTitle: { color: "#fff", fontWeight: "800", fontSize: 12 }, streetOverlayCopy: { color: "#d9ead7", fontSize: 10, marginTop: 3 }, spotPicker: { gap: 8, paddingVertical: 12 }, streetChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#dfe3da" }, chipDot: { width: 7, height: 7, borderRadius: 4 }, streetChipText: { color: "#536257", fontSize: 10 }, savedScreen: { flex: 1, paddingHorizontal: 18 }, savedCount: { color: "#247b52", fontSize: 32, fontWeight: "800" }, sectionLabel: { color: "#79857b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 10 }, savedList: { gap: 8 }, savedRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" }, savedDot: { width: 10, height: 10, borderRadius: 5, marginRight: 11 }, savedCopy: { flex: 1 }, savedStreet: { color: "#26352c", fontSize: 14, fontWeight: "800" }, rowArrow: { color: "#97a198", fontSize: 24 }, empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: 24 }, emptyIcon: { color: "#9db49a", fontSize: 48 }, emptyTitle: { color: "#34483a", fontSize: 16, fontWeight: "800", marginTop: 12 }, askedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, askedChip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, backgroundColor: "#edf4eb" }, askedText: { color: "#49664f", fontSize: 11, fontWeight: "700" }, clearButton: { alignSelf: "flex-start", marginTop: 30, paddingVertical: 10 }, clearText: { color: "#9c4935", fontSize: 11, fontWeight: "700" }, tabBar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: "#e1e2da", backgroundColor: "#fffdf8" }, tabButton: { alignItems: "center", justifyContent: "center", minWidth: 90, gap: 2 }, tabIcon: { color: "#91a096", fontSize: 21 }, tabLabel: { color: "#879289", fontSize: 10, fontWeight: "700" }, tabActive: { color: "#247b52" },
});
