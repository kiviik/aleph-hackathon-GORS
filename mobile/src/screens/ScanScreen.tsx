// Local status + scan. This is also the Gate 0/Gate 1 debug surface: it shows the provider list
// straight from @qvac/onnx, the Bare version, the model's provenance, and whether the runtime
// really has America/Edmonton timezone data (Hermes often does not, which would silently corrupt
// the parking rules).
//
// docs/hackaton/07-mobile.md is explicit that a failing stage must LOOK like a failing stage.
// There is no success animation over a broken pipeline here.
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardTitle, Muted, SectionLabel } from "../components/Card";
import { DetailRow } from "../components/DetailRow";
import { PipelineRow } from "../components/PipelineRow";
import { ScreenHeader } from "../components/ScreenHeader";
import {
  ActivityIndicator,
  Button,
  ButtonText,
  type ListRenderItemInfo,
  ScreenList,
  StyleSheet,
  Text,
  type Theme,
  View,
  useTheme,
  useThemedStyles,
} from "../design-system";
import { tzSupport } from "../core/zones-rules.mjs";
import { detector, type Health } from "../detector/client";
import {
  ensureModel,
  status as modelStatus,
  type ModelStatus,
  MODEL_URL,
  MODEL_LICENSE,
} from "../model/model";
import { ensureDetector } from "../scan/scan";
import { fixtureMeta, type ScanProgress } from "../state/spots";
import { countScanned, useAppStore } from "../state/store";

const progressKeyExtractor = (entry: ScanProgress, index: number) =>
  `${entry.cameraId}:${entry.stage}:${index}`;

export function ScanScreen() {
  const styles = useThemedStyles(scanStyles);
  const progress = useAppStore((s) => s.progress);

  const renderProgress = useCallback(
    ({ item }: ListRenderItemInfo<ScanProgress>) => (
      <PipelineRow
        cameraId={item.cameraId}
        stage={item.stage}
        status={item.status}
        detail={item.detail}
      />
    ),
    []
  );

  return (
    <ScreenList
      data={progress}
      renderItem={renderProgress}
      keyExtractor={progressKeyExtractor}
      ListHeaderComponent={scanHeader}
      ListFooterComponent={scanFooter}
      contentContainerStyle={styles.content}
    />
  );
}

/**
 * Owns the engine/model probe state. Memoised with no props, so the pipeline rows streaming in
 * during a scan never re-render the diagnostics above them.
 */
const ScanHeader = memo(function ScanHeader() {
  const styles = useThemedStyles(scanStyles);
  const theme = useTheme();

  const spots = useAppStore((s) => s.spots);
  const scanning = useAppStore((s) => s.scanning);
  const scanError = useAppStore((s) => s.scanError);
  const hasProgress = useAppStore((s) => s.progress.length > 0);
  const scan = useAppStore((s) => s.scan);

  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [booting, setBooting] = useState(true);

  const scannedCount = useMemo(() => countScanned(spots), [spots]);

  const boot = useCallback(async () => {
    setBooting(true);
    setHealthError(null);
    try {
      const h = await detector.start();
      setHealth(h);
    } catch (e: any) {
      // This is the Gate 0 failure surface. Say so plainly rather than showing an empty screen.
      setHealthError(String(e?.message || e));
    }
    try {
      setModel(await modelStatus());
      // Re-create the ONNX session when the model is already on disk. boot() used to stop at
      // start(), so every relaunch showed "session: not loaded" and refused every scan until the
      // user pressed the button again. A first run with no model lands in the catch below, which is
      // not an engine failure -- the Model card already says "not downloaded".
      await ensureDetector();
      setHealth(await detector.health());
    } catch {
      // A missing model file is a normal first-run state, not an error worth shouting about.
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const addonOk = health?.addon === "loaded" && (health?.providers?.length ?? 0) > 0;
  const ready = Boolean(addonOk && model?.present && health?.loaded);

  const download = useCallback(async () => {
    setDownloading(0);
    try {
      const st = await ensureModel((f) => setDownloading(f));
      setModel(st);
      if (health?.addon === "loaded") {
        const loaded = await detector.loadModel(st.path);
        // Trust the worklet's own `loaded` flag. Hardcoding `true` here made a failed
        // createSession look like a healthy engine, and the failure only resurfaced later as
        // "Detector: model not loaded" on every frame of a scan.
        setHealth((prev) => (prev ? { ...prev, loaded: !!loaded.loaded, model: loaded.model } : prev));
        if (!loaded.loaded) setHealthError(`ONNX session did not load: ${JSON.stringify(loaded)}`);
      }
    } catch (e: any) {
      setHealthError(String(e?.message || e));
    } finally {
      setDownloading(null);
    }
  }, [health?.addon]);

  const onScan = useCallback(() => {
    void scan();
  }, [scan]);

  return (
    <View style={styles.header}>
      <ScreenHeader title="On-device detector" />

      <Card>
        <CardTitle>Engine</CardTitle>
        {booting ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={theme.color.accent} />
            <Muted>starting worklet…</Muted>
          </View>
        ) : healthError ? (
          <>
            <DetailRow label="@qvac/onnx" value="FAILED TO LOAD" tone="bad" />
            <Text style={styles.error}>{healthError}</Text>
            <Muted>
              The Bare addon did not link into this build. Detection is unavailable — no result on
              this screen can be trusted until this line reads OK.
            </Muted>
          </>
        ) : (
          <>
            <DetailRow
              label="@qvac/onnx"
              value={addonOk ? "loaded" : "no providers"}
              tone={addonOk ? "ok" : "bad"}
            />
            <DetailRow label="providers" value={(health?.providers ?? []).join(", ") || "none"} />
            <DetailRow
              label="Bare"
              value={`${health?.bare ?? "?"} · ${health?.platform ?? "?"}/${health?.arch ?? "?"}`}
            />
            <DetailRow label="input size" value={`${health?.size ?? 640}×${health?.size ?? 640}`} />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Model</CardTitle>
        <DetailRow
          label="YOLO26s"
          value={model?.present ? `present (${(model.bytes / 1e6).toFixed(1)} MB)` : "not downloaded"}
          tone={model?.present ? "ok" : "warn"}
        />
        <DetailRow
          label="session"
          value={health?.loaded ? "loaded" : "not loaded"}
          tone={health?.loaded ? "ok" : "warn"}
        />
        <DetailRow label="licence" value={MODEL_LICENSE} />
        <DetailRow label="source" value={MODEL_URL.replace("https://", "")} />
        {downloading !== null ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={theme.color.accent} />
            <Muted>downloading… {Math.round(downloading * 100)}%</Muted>
          </View>
        ) : !model?.present || !health?.loaded ? (
          <Button variant="secondary" onPress={download} disabled={!addonOk}>
            <ButtonText variant="secondary">
              {model?.present ? "Load model" : "Download model (38 MB)"}
            </ButtonText>
          </Button>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Data</CardTitle>
        <DetailRow
          label="curb geometry"
          value={`learned offline · exported ${fixtureMeta.exportedAt.slice(0, 10)}`}
        />
        <DetailRow label="rules" value="City of Calgary open data (snapshot)" />
        <DetailRow label="frames" value="live trafficcam.calgary.ca, on demand" />
        <DetailRow
          label="timezone"
          value={tzSupport() ? "America/Edmonton (ICU)" : "Mountain Time fallback (no ICU)"}
          tone={tzSupport() ? "ok" : "warn"}
        />
        <DetailRow label="scanned" value={`${scannedCount} of ${spots.length} curb segments`} />
      </Card>

      <Button onPress={onScan} disabled={!ready || scanning}>
        {scanning ? (
          <ActivityIndicator color={theme.color.onAccent} />
        ) : (
          <ButtonText>{ready ? "Scan nearby cameras" : "Detector not ready"}</ButtonText>
        )}
      </Button>

      {scanError ? <Text style={styles.error}>{scanError}</Text> : null}

      {hasProgress ? <SectionLabel>PIPELINE</SectionLabel> : null}
    </View>
  );
});

const ScanFooter = memo(function ScanFooter() {
  const styles = useThemedStyles(scanStyles);
  const spotCount = useAppStore((s) => s.spots.length);

  return (
    <View style={styles.footer}>
      <Text style={styles.footnote}>
        Curb geometry was learned offline from traffic-camera history on a laptop; this phone
        consumes it and does not learn it. Only {spotCount} curb segments across 15 cameras are
        covered. A segment needs three consistent observations before it can ever read “free”. Not
        legal parking advice.
      </Text>
    </View>
  );
});

// Passed to the list as *elements*, not component types: FlashList's getValidComponent only
// accepts an element or a plain function, and memo() returns neither — a memo type is silently
// dropped. Hoisted to module scope so the reference stays stable across renders.
const scanHeader = <ScanHeader />;
const scanFooter = <ScanFooter />;

const scanStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: theme.space.lg, paddingBottom: theme.space.xl },
    header: { gap: theme.space.md, paddingBottom: theme.space.md },
    centerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.sm,
      paddingVertical: theme.space.xs,
    },
    error: { color: theme.color.occupied, fontSize: theme.fontSize.caption, fontWeight: "600" },
    footer: { paddingTop: theme.space.md },
    footnote: {
      color: theme.color.textMuted,
      fontSize: theme.fontSize.caption,
      lineHeight: 20,
    },
  });
