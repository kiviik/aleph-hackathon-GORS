import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createBlockedAnalysisTrace,
  type CameraPermission,
  type MobileTrace,
  type PipelineStage,
} from "./src/contracts";

const traceStorageKey = "ba-estaciona-android-last-trace";

const stageLabels: Record<PipelineStage, string> = {
  capture: "Captura local",
  detector: "YOLO / ONNX",
  evidence: "Evidencia del ROI",
  tools: "Tools locales",
  policy: "Policy deterministica",
};

const stageOrder: PipelineStage[] = ["capture", "detector", "evidence", "tools", "policy"];

function permissionLabel(permission: CameraPermission): string {
  if (permission === "granted") return "Autorizada";
  if (permission === "denied") return "Denegada";
  if (permission === "blocked") return "Bloqueada en Ajustes";
  return "Sin verificar";
}

function stageColor(status: MobileTrace["events"][number]["status"]): string {
  if (status === "blocked") return colors.amber;
  if (status === "ready") return colors.green;
  return colors.muted;
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "green" | "amber" | "neutral" }) {
  return (
    <View style={[styles.pill, tone === "green" && styles.pillGreen, tone === "amber" && styles.pillAmber]}>
      <View style={[styles.pillDot, tone === "green" && styles.pillDotGreen, tone === "amber" && styles.pillDotAmber]} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function StageRow({ trace, stage }: { trace: MobileTrace | null; stage: PipelineStage }) {
  const event = trace?.events.find((candidate) => candidate.stage === stage);
  const status = event?.status ?? "pending";
  return (
    <View style={styles.stageRow}>
      <View style={[styles.stageMarker, { backgroundColor: stageColor(status) }]} />
      <View style={styles.stageCopy}>
        <Text style={styles.stageTitle}>{stageLabels[stage]}</Text>
        <Text style={styles.stageDetail}>{event?.detail ?? "Pendiente del spike Android"}</Text>
      </View>
      <Text style={[styles.stageStatus, { color: stageColor(status) }]}>
        {status === "blocked" ? "BLOQUEADO" : status === "ready" ? "LISTO" : "PENDIENTE"}
      </Text>
    </View>
  );
}

export default function App() {
  const [cameraPermission, setCameraPermission] = useState<CameraPermission>("unknown");
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [lastTrace, setLastTrace] = useState<MobileTrace | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  useEffect(() => {
    void loadLocalTrace();
    void checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    if (Platform.OS !== "android") return;
    try {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      setCameraPermission(granted ? "granted" : "unknown");
    } catch {
      setCameraPermission("unknown");
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
      Alert.alert("Target Android", "Esta superficie está preparada únicamente para Android.");
      return false;
    }

    setCheckingCamera(true);
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: "Cámara para detectar estacionamiento",
        message: "La imagen se procesa localmente y no se sube a ningún servidor.",
        buttonPositive: "Continuar",
        buttonNegative: "Ahora no",
      });
      const permission: CameraPermission = result === PermissionsAndroid.RESULTS.GRANTED
        ? "granted"
        : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ? "blocked"
          : "denied";
      setCameraPermission(permission);
      return permission === "granted";
    } catch {
      setCameraPermission("denied");
      return false;
    } finally {
      setCheckingCamera(false);
    }
  };

  const loadLocalTrace = async () => {
    try {
      const stored = await AsyncStorage.getItem(traceStorageKey);
      if (stored) setLastTrace(JSON.parse(stored) as MobileTrace);
    } catch {
      // A missing local trace must not prevent the diagnostic screen from opening.
    }
  };

  const startAnalysis = async () => {
    const granted = cameraPermission === "granted" || await requestCameraPermission();
    if (!granted) {
      Alert.alert("No se puede iniciar", "Sin permiso de cámara el sistema debe abstenerse.");
      return;
    }

    const trace = createBlockedAnalysisTrace(String(Platform.Version));
    setLastTrace(trace);
    setShowTrace(true);
    await AsyncStorage.setItem(traceStorageKey, JSON.stringify(trace));
  };

  const clearTrace = async () => {
    setLastTrace(null);
    setShowTrace(false);
    await AsyncStorage.removeItem(traceStorageKey);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>BA ESTACIONA / ANDROID</Text>
            <Text style={styles.title}>¿Puedo estacionar acá?</Text>
            <Text style={styles.subtitle}>Un flujo local, auditable y honesto sobre lo que el teléfono todavía puede detectar.</Text>
          </View>
          <StatusPill label="SIN SERVIDOR" tone="green" />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroAccent} />
          <Text style={styles.heroKicker}>SPIKE M0 · DISPOSITIVO FÍSICO</Text>
          <Text style={styles.heroTitle}>La inferencia vive en tu Android.</Text>
          <Text style={styles.heroCopy}>La cámara, YOLO/ONNX, QVAC y la policy van a correr en el teléfono. Esta primera pantalla prueba el límite local sin fingir un resultado visual.</Text>
          <Pressable accessibilityRole="button" onPress={startAnalysis} disabled={checkingCamera} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            {checkingCamera ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryButtonText}>Pedir cámara y probar flujo</Text>}
          </Pressable>
          <Text style={styles.disclaimer}>No se guardan frames. No se consulta Calgary. No hay inferencia remota.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Estado del teléfono</Text>
          <Text style={styles.sectionMeta}>Android API {String(Platform.Version)}</Text>
        </View>
        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>CÁMARA</Text>
            <Text style={styles.statusValue}>{permissionLabel(cameraPermission)}</Text>
            <Text style={styles.statusHint}>Permiso foreground</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>RED</Text>
            <Text style={styles.statusValue}>No requerida</Text>
            <Text style={styles.statusHint}>Runtime offline</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>YOLO / ONNX</Text>
            <Text style={styles.statusValue}>Pendiente</Text>
            <Text style={styles.statusHint}>Artefacto por fijar</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>QVAC LOCAL</Text>
            <Text style={styles.statusValue}>Pendiente</Text>
            <Text style={styles.statusHint}>Development Build</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pipeline de confianza</Text>
          <StatusPill label={lastTrace?.decision ?? "SIN EJECUTAR"} tone={lastTrace ? "amber" : "neutral"} />
        </View>
        <View style={styles.pipelineCard}>
          {stageOrder.map((stage) => <StageRow key={stage} trace={lastTrace} stage={stage} />)}
        </View>

        {lastTrace && (
          <View style={styles.resultCard}>
            <Text style={styles.resultKicker}>ÚLTIMO ANÁLISIS LOCAL</Text>
            <Text style={styles.resultTitle}>REFUSE · integración incompleta</Text>
            <Text style={styles.resultCopy}>{lastTrace.reason}</Text>
            <View style={styles.resultFacts}>
              <Text style={styles.factText}>session {lastTrace.sessionId}</Text>
              <Text style={styles.factText}>red {lastTrace.network}</Text>
            </View>
            <View style={styles.resultActions}>
              <Pressable accessibilityRole="button" onPress={() => setShowTrace((visible) => !visible)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{showTrace ? "Ocultar trace" : "Ver trace"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={clearTrace} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>Limpiar</Text>
              </Pressable>
            </View>
            {showTrace && <View style={styles.traceBox}>{lastTrace.events.map((event) => <Text key={event.stage} style={styles.traceLine}>{event.stage}: {event.status} · {event.detail}</Text>)}</View>}
          </View>
        )}

        <View style={styles.nextCard}>
          <Text style={styles.nextKicker}>SIGUIENTE GATE</Text>
          <Text style={styles.nextTitle}>Captura real + YOLO26s fijado</Text>
          <Text style={styles.nextCopy}>Antes de mostrar PARK, hay que integrar la cámara nativa, fijar hash/labels/input/NMS del ONNX y medirlo en un Android físico. Sin eso, la ausencia de boxes no significa espacio libre.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  background: "#101a17",
  panel: "#182620",
  panelRaised: "#20342b",
  ink: "#102019",
  white: "#f6f3ea",
  soft: "#cbd8cc",
  muted: "#8da293",
  green: "#8ad79b",
  amber: "#efb56e",
  line: "#30463a",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  header: { gap: 14, paddingTop: 12 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: colors.white, fontSize: 31, fontWeight: "800", letterSpacing: -1, marginTop: 8 },
  subtitle: { color: colors.soft, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 360 },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.panelRaised },
  pillGreen: { backgroundColor: "#244a36" },
  pillAmber: { backgroundColor: "#4a3826" },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
  pillDotGreen: { backgroundColor: colors.green },
  pillDotAmber: { backgroundColor: colors.amber },
  pillText: { color: colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  heroCard: { overflow: "hidden", padding: 20, borderRadius: 24, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  heroAccent: { width: 60, height: 4, borderRadius: 4, backgroundColor: colors.green, marginBottom: 18 },
  heroKicker: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  heroTitle: { color: colors.white, fontSize: 24, fontWeight: "800", lineHeight: 29, marginTop: 8 },
  heroCopy: { color: colors.soft, fontSize: 14, lineHeight: 21, marginTop: 9 },
  primaryButton: { alignItems: "center", justifyContent: "center", minHeight: 50, marginTop: 20, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.green },
  primaryButtonPressed: { opacity: 0.8 },
  primaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 11, textAlign: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  sectionTitle: { color: colors.white, fontSize: 17, fontWeight: "800" },
  sectionMeta: { color: colors.muted, fontSize: 11 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statusCard: { width: "48%", minHeight: 92, padding: 13, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  statusLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  statusValue: { color: colors.white, fontSize: 15, fontWeight: "800", marginTop: 8 },
  statusHint: { color: colors.muted, fontSize: 10, marginTop: 5 },
  pipelineCard: { padding: 14, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 57, borderBottomWidth: 1, borderBottomColor: colors.line },
  stageMarker: { width: 9, height: 9, borderRadius: 5 },
  stageCopy: { flex: 1 },
  stageTitle: { color: colors.white, fontSize: 13, fontWeight: "800" },
  stageDetail: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  stageStatus: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  resultCard: { padding: 18, borderRadius: 20, backgroundColor: "#332a20", borderWidth: 1, borderColor: "#6b4d30" },
  resultKicker: { color: colors.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  resultTitle: { color: colors.white, fontSize: 20, fontWeight: "800", marginTop: 7 },
  resultCopy: { color: "#ead9c4", fontSize: 13, lineHeight: 20, marginTop: 7 },
  resultFacts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  factText: { color: colors.amber, fontSize: 10, fontWeight: "700" },
  resultActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 17 },
  secondaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, backgroundColor: colors.amber },
  secondaryButtonText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  clearButton: { paddingHorizontal: 10, paddingVertical: 10 },
  clearButtonText: { color: "#ead9c4", fontSize: 12, fontWeight: "700" },
  traceBox: { padding: 12, marginTop: 14, borderRadius: 12, backgroundColor: "#211c17" },
  traceLine: { color: "#d8c8b5", fontSize: 10, lineHeight: 17 },
  nextCard: { padding: 18, borderRadius: 20, backgroundColor: colors.panelRaised },
  nextKicker: { color: colors.green, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  nextTitle: { color: colors.white, fontSize: 17, fontWeight: "800", marginTop: 7 },
  nextCopy: { color: colors.soft, fontSize: 13, lineHeight: 20, marginTop: 7 },
});

