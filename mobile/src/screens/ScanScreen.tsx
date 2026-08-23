// Local status + scan. This is also the Gate 0/Gate 1 debug surface: it shows the provider list
// straight from @qvac/onnx, the Bare version, the model's provenance, and whether the runtime
// really has America/Edmonton timezone data (Hermes often does not, which would silently corrupt
// the parking rules).
//
// docs/hackaton/07-mobile.md is explicit that a failing stage must LOOK like a failing stage.
// There is no success animation over a broken pipeline here.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { detector, type Health } from "../detector/client";
import { ensureDetector } from "../scan/scan";
import { ensureModel, status as modelStatus, type ModelStatus, MODEL_URL, MODEL_LICENSE } from "../model/model";
import { tzSupport } from "../core/zones-rules.mjs";
import type { ScanProgress } from "../spots/useSpots";

const GREEN = "#247b52";
const AMBER = "#ae7c27";
const RED = "#b6543b";

type Props = {
  darkMode: boolean;
  scanning: boolean;
  progress: ScanProgress[];
  error: string | null;
  scannedCount: number;
  totalSpots: number;
  lastScanAt: number | null;
  fixtureMeta: { exportedAt: string; sourceSha: string };
  onScan: () => void;
};

function Row({ label, value, tone, dark }: { label: string; value: string; tone?: string; dark: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, dark && s.dimDark]}>{label}</Text>
      <Text style={[s.rowValue, dark && s.textDark, tone ? { color: tone } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function ScanScreen(props: Props) {
  const { darkMode: dark } = props;
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [booting, setBooting] = useState(true);

  const boot = useCallback(async () => {
    setBooting(true);
    setHealthError(null);
    try {
      const h = await detector.start();
      setHealth(h);
      // Re-create the ONNX session when the model is already on disk. boot() used to stop at
      // start(), so every relaunch showed "session: not loaded" and refused every scan until the
      // user pressed the button again. A first run with no model lands in the catch below, which is
      // not an engine failure -- the Model card already says "not downloaded".
      try {
        await ensureDetector();
        setHealth(await detector.health());
      } catch {}
    } catch (e: any) {
      // This is the Gate 0 failure surface. Say so plainly rather than showing an empty screen.
      setHealthError(String(e?.message || e));
    }
    try {
      setModel(await modelStatus());
    } catch {}
    setBooting(false);
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const download = async () => {
    setDownloading(0);
    try {
      const st = await ensureModel((f) => setDownloading(f));
      setModel(st);
      if (health?.addon === "loaded") {
        const loaded = await detector.loadModel(st.path);
        // Trust the worklet's own `loaded` flag. Hardcoding `true` here made a failed
        // createSession look like a healthy engine, and the failure only resurfaced later as
        // "Detector: model not loaded" on every frame of a scan.
        setHealth((h) => (h ? { ...h, loaded: !!loaded.loaded, model: loaded.model } : h));
        if (!loaded.loaded) setHealthError(`ONNX session did not load: ${JSON.stringify(loaded)}`);
      }
    } catch (e: any) {
      setHealthError(String(e?.message || e));
    } finally {
      setDownloading(null);
    }
  };

  const addonOk = health?.addon === "loaded" && (health?.providers?.length ?? 0) > 0;
  const ready = addonOk && model?.present && health?.loaded;

  return (
    <ScrollView style={[s.screen, dark && s.screenDark]} contentContainerStyle={s.content}>
      <Text style={[s.kicker, dark && s.dimDark]}>LOCAL STATUS</Text>
      <Text style={[s.title, dark && s.textDark]}>On-device detector</Text>

      <View style={[s.card, dark && s.cardDark]}>
        <Text style={[s.cardTitle, dark && s.textDark]}>Engine</Text>
        {booting ? (
          <View style={s.center}><ActivityIndicator color={GREEN} /><Text style={[s.dim, dark && s.dimDark]}>starting worklet…</Text></View>
        ) : healthError ? (
          <>
            <Row label="@qvac/onnx" value="FAILED TO LOAD" tone={RED} dark={dark} />
            <Text style={[s.error, dark && s.textDark]}>{healthError}</Text>
            <Text style={[s.dim, dark && s.dimDark]}>
              The Bare addon did not link into this build. Detection is unavailable — no result on this
              screen can be trusted until this line reads OK.
            </Text>
          </>
        ) : (
          <>
            <Row label="@qvac/onnx" value={addonOk ? "loaded" : "no providers"} tone={addonOk ? GREEN : RED} dark={dark} />
            <Row label="providers" value={(health?.providers ?? []).join(", ") || "none"} dark={dark} />
            <Row label="Bare" value={`${health?.bare ?? "?"} · ${health?.platform ?? "?"}/${health?.arch ?? "?"}`} dark={dark} />
            <Row label="input size" value={`${health?.size ?? 640}×${health?.size ?? 640}`} dark={dark} />
          </>
        )}
      </View>

      <View style={[s.card, dark && s.cardDark]}>
        <Text style={[s.cardTitle, dark && s.textDark]}>Model</Text>
        <Row label="YOLO26s" value={model?.present ? `present (${(model.bytes / 1e6).toFixed(1)} MB)` : "not downloaded"} tone={model?.present ? GREEN : AMBER} dark={dark} />
        <Row label="session" value={health?.loaded ? "loaded" : "not loaded"} tone={health?.loaded ? GREEN : AMBER} dark={dark} />
        <Row label="licence" value={MODEL_LICENSE} dark={dark} />
        <Row label="source" value={MODEL_URL.replace("https://", "")} dark={dark} />
        {downloading !== null ? (
          <View style={s.center}><ActivityIndicator color={GREEN} /><Text style={[s.dim, dark && s.dimDark]}>downloading… {Math.round(downloading * 100)}%</Text></View>
        ) : !model?.present || !health?.loaded ? (
          <Pressable style={s.secondary} onPress={download} disabled={!addonOk}>
            <Text style={s.secondaryText}>{model?.present ? "Load model" : "Download model (38 MB)"}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[s.card, dark && s.cardDark]}>
        <Text style={[s.cardTitle, dark && s.textDark]}>Data</Text>
        <Row label="curb geometry" value={`learned offline · exported ${props.fixtureMeta.exportedAt.slice(0, 10)}`} dark={dark} />
        <Row label="rules" value="City of Calgary open data (snapshot)" dark={dark} />
        <Row label="frames" value="live trafficcam.calgary.ca, on demand" dark={dark} />
        <Row
          label="timezone"
          value={tzSupport() ? "America/Edmonton (ICU)" : "Mountain Time fallback (no ICU)"}
          tone={tzSupport() ? GREEN : AMBER}
          dark={dark}
        />
        <Row label="scanned" value={`${props.scannedCount} of ${props.totalSpots} curb segments`} dark={dark} />
      </View>

      <Pressable
        style={[s.primary, (!ready || props.scanning) && s.primaryDisabled]}
        onPress={props.onScan}
        disabled={!ready || props.scanning}
      >
        {props.scanning ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{ready ? "Scan nearby cameras" : "Detector not ready"}</Text>}
      </Pressable>

      {props.error && <Text style={[s.error, dark && s.textDark]}>{props.error}</Text>}

      {props.progress.length > 0 && (
        <View style={[s.card, dark && s.cardDark]}>
          <Text style={[s.cardTitle, dark && s.textDark]}>Pipeline</Text>
          {props.progress.map((p, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.rowLabel, dark && s.dimDark]}>{`${p.cameraId} · ${p.stage}`}</Text>
              <Text
                style={[s.rowValue, dark && s.textDark, { color: p.status === "ready" ? GREEN : p.status === "blocked" ? RED : AMBER }]}
                numberOfLines={2}
              >
                {p.detail}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[s.footnote, dark && s.dimDark]}>
        Curb geometry was learned offline from traffic-camera history on a laptop; this phone consumes it
        and does not learn it. Only {props.totalSpots} curb segments across 15 cameras are covered. A
        segment needs three consistent observations before it can ever read “free”. Not legal parking advice.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f3ec" },
  screenDark: { backgroundColor: "#12201a" },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  kicker: { fontSize: 11, letterSpacing: 1.5, color: "#65776a", fontWeight: "700" },
  title: { fontSize: 26, fontWeight: "700", color: "#1f4333", marginBottom: 4 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 8 },
  cardDark: { backgroundColor: "#1b2f26" },
  cardTitle: { fontSize: 13, fontWeight: "700", color: "#1f4333", marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  rowLabel: { fontSize: 12, color: "#65776a", flexShrink: 0 },
  rowValue: { fontSize: 12, color: "#1f4333", fontWeight: "600", flex: 1, textAlign: "right" },
  dim: { fontSize: 12, color: "#65776a" },
  dimDark: { color: "#8fa89a" },
  textDark: { color: "#eef5f0" },
  center: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 6 },
  primary: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryDisabled: { backgroundColor: "#9bb3a5" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: GREEN, borderRadius: 12, paddingVertical: 10, alignItems: "center", marginTop: 6 },
  secondaryText: { color: GREEN, fontWeight: "700", fontSize: 13 },
  error: { color: RED, fontSize: 12, fontWeight: "600" },
  footnote: { fontSize: 11, color: "#65776a", lineHeight: 16 },
});
