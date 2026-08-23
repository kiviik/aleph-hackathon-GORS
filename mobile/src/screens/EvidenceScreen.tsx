// The frame the detector actually ran on, with what it found drawn on top.
//
// This replaces the Google Street View panorama, which showed a stock photo of the block from some
// unrelated date and proved nothing about the decision on screen. What matters for "can I park
// here" is the evidence: this exact JPEG, the vehicle boxes YOLO26s emitted from it, the learned
// curb corridor, and the gaps that survived the appearance guard and the temporal filter.
//
// Band geometry, gaps and boxes are all in source-frame pixel space, so a single uniform scale
// factor (view width / frame width) places all three together.
import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FrameEvidence } from "../scan/scan";
import type { Spot, Status } from "../spots/useSpots";

const GREEN = "#247b52";
const RED = "#b6543b";
const AMBER = "#ae7c27";

const statusColor: Record<Status, string> = { free: GREEN, occupied: RED, review: AMBER };
const statusText: Record<Status, string> = { free: "Free", occupied: "Occupied", review: "Review" };

type Props = {
  spot: Spot;
  spots: Spot[];
  evidence: Record<string, FrameEvidence>;
  darkMode: boolean;
  scanning: boolean;
  onToggleTheme: () => void;
  onSelect: (spot: Spot) => void;
  onScan: () => void;
  width: number;
};

function ago(ts: number | null): string {
  if (!ts) return "unknown";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** A rotated rectangle laid along the band axis, from t0 to t1 in band-parameter space. */
function segmentStyle(band: any, t0: number, t1: number, halfWidth: number, k: number) {
  const [dx, dy] = band.dir;
  const mid = (t0 + t1) / 2;
  const cx = (band.p0[0] + dx * mid) * k;
  const cy = (band.p0[1] + dy * mid) * k;
  const w = Math.max(2, (t1 - t0) * k);
  const h = Math.max(2, halfWidth * 2 * k);
  return {
    position: "absolute" as const,
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
    transform: [{ rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg` }],
  };
}

export default function EvidenceScreen(props: Props) {
  const { spot, spots, evidence, darkMode: dark, scanning, onToggleTheme, onSelect, onScan, width } = props;
  const ev = spot.cameraId ? evidence[spot.cameraId] : undefined;

  // Every band of the same camera is visible in the same frame, so draw them all and mark the
  // selected one. Seeing the neighbouring corridor is what makes the geometry legible.
  const siblings = useMemo(
    () => spots.filter((s) => s.cameraId === spot.cameraId && s.band),
    [spots, spot.cameraId]
  );

  const k = ev ? width / ev.width : 1;
  const frameH = ev ? ev.height * k : 0;

  return (
    <View style={[s.screen, dark && s.screenDark]}>
      <View style={s.topBar}>
        <View>
          <Text style={[s.kicker, dark && s.mutedDark]}>WHAT THE DETECTOR SAW</Text>
          <Text style={[s.title, dark && s.textDark]}>Evidence</Text>
        </View>
        <Pressable onPress={onToggleTheme} style={[s.themeButton, dark && s.themeButtonDark]}>
          <Text style={s.themeIcon}>{dark ? "☀" : "☾"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.header, dark && s.darkCard]}>
          <View style={s.headerCopy}>
            <Text style={[s.headerLabel, dark && s.mutedDark]}>SELECTED SEGMENT</Text>
            <Text style={[s.headerTitle, dark && s.textDark]} numberOfLines={2}>
              {spot.street} {spot.number}
            </Text>
          </View>
          <View style={[s.pill, { backgroundColor: `${statusColor[spot.status]}22` }]}>
            <View style={[s.pillDot, { backgroundColor: statusColor[spot.status] }]} />
            <Text style={[s.pillText, { color: statusColor[spot.status] }]}>{statusText[spot.status]}</Text>
          </View>
        </View>

        {!ev ? (
          <View style={[s.empty, dark && s.darkCard]}>
            <Text style={[s.emptyIcon, dark && s.textDark]}>◎</Text>
            <Text style={[s.emptyTitle, dark && s.textDark]}>No frame for this camera yet</Text>
            <Text style={[s.muted, dark && s.mutedDark]}>
              Nothing is drawn here until the detector has actually run on a frame. Scanning fetches one
              and shows you exactly what it judged.
            </Text>
            <Pressable onPress={onScan} disabled={scanning} style={[s.scanButton, scanning && s.scanButtonOff]}>
              <Text style={s.scanButtonText}>{scanning ? "Scanning…" : "Scan nearby cameras"}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[s.frameCard, { width, height: frameH }]}>
              <Image source={{ uri: ev.dataUri }} style={{ width, height: frameH }} resizeMode="cover" />

              {/* The learned curb corridor, per band. */}
              {siblings.map((sib) => {
                const on = sib.id === spot.id;
                return (
                  <View
                    key={`band-${sib.id}`}
                    pointerEvents="none"
                    style={[
                      segmentStyle(sib.band, 0, sib.band.length, sib.band.halfWidth, k),
                      s.corridor,
                      { borderColor: on ? "#ffffff" : "rgba(255,255,255,.35)" },
                    ]}
                  />
                );
              })}

              {/* Vehicle boxes, straight from the model. */}
              {ev.vehicles.map((v, i) => (
                <View
                  key={`v-${i}`}
                  pointerEvents="none"
                  style={[
                    s.box,
                    {
                      left: v.box[0] * k,
                      top: v.box[1] * k,
                      width: (v.box[2] - v.box[0]) * k,
                      height: (v.box[3] - v.box[1]) * k,
                      borderColor: v.parked ? RED : "rgba(182,84,59,.55)",
                    },
                  ]}
                />
              ))}

              {/* Confirmed free curb: the only thing here that ever means "you can park". */}
              {siblings.flatMap((sib) =>
                (sib.gaps ?? []).map((g: any, i: number) => (
                  <View
                    key={`gap-${sib.id}-${i}`}
                    pointerEvents="none"
                    style={[segmentStyle(sib.band, g.t1, g.t2, sib.band.halfWidth, k), s.gap]}
                  />
                ))
              )}

              {ev.stale && (
                <View style={s.staleTag}>
                  <Text style={s.staleText}>STALE FRAME</Text>
                </View>
              )}
              <View style={s.sourceTag}>
                <Text style={s.sourceText}>
                  {ev.cameraName} · {ago(ev.capturedAt)}
                </Text>
              </View>
            </View>

            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendSwatch, { borderColor: RED }]} />
                <Text style={[s.legendText, dark && s.mutedDark]}>vehicle detected</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendSwatch, { borderColor: "#fff", backgroundColor: "rgba(255,255,255,.12)" }]} />
                <Text style={[s.legendText, dark && s.mutedDark]}>curb watched</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendSwatch, { borderColor: GREEN, backgroundColor: "rgba(36,123,82,.45)" }]} />
                <Text style={[s.legendText, dark && s.mutedDark]}>confirmed free</Text>
              </View>
            </View>

            <View style={[s.readCard, dark && s.darkCard]}>
              <Text style={[s.readTitle, dark && s.textDark]}>
                {ev.vehicles.length} vehicle{ev.vehicles.length === 1 ? "" : "s"} in frame ·{" "}
                {spot.status === "free"
                  ? `≈${spot.carsFit} car${spot.carsFit === 1 ? "" : "s"} fit · ${spot.freeMetres} m free`
                  : `${spot.ticks ?? 0} of 3 consistent observations`}
              </Text>
              <Text style={[s.muted, dark && s.mutedDark]}>{spot.reason}</Text>
              {spot.rule ? <Text style={[s.muted, dark && s.mutedDark]}>{spot.rule}</Text> : null}
              <Text style={[s.caveat, dark && s.mutedDark]}>
                Boxes are the model's raw output. A segment only reads free after three consistent
                observations and the appearance guard; a missed car leaves textured asphalt, which reads
                unknown, never free.
              </Text>
            </View>
          </>
        )}

        <Text style={[s.sectionLabel, dark && s.mutedDark]}>OTHER SEGMENTS</Text>
        <View style={s.picker}>
          {spots.map((other) => {
            const on = other.id === spot.id;
            const has = other.cameraId ? Boolean(evidence[other.cameraId]) : false;
            return (
              <Pressable
                key={other.id}
                onPress={() => onSelect(other)}
                style={[s.chip, dark && s.darkCard, on && s.chipOn]}
              >
                <View style={[s.chipDot, { backgroundColor: statusColor[other.status] }]} />
                <Text style={[s.chipText, dark && s.textDark, on && s.chipTextOn]} numberOfLines={1}>
                  {other.street} {other.number}
                </Text>
                {!has && <Text style={[s.chipPending, on && s.chipTextOn]}>no frame</Text>}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18 },
  screenDark: { backgroundColor: "#101713" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, paddingBottom: 12 },
  kicker: { color: "#718075", fontSize: 10, fontWeight: "700", letterSpacing: 1.4 },
  title: { color: "#1f2d25", fontSize: 25, fontWeight: "800", letterSpacing: -0.9, marginTop: 3 },
  themeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#d8e0d5", backgroundColor: "#fffdf8" },
  themeButtonDark: { borderColor: "#405548", backgroundColor: "#26372c" },
  themeIcon: { color: "#46614d", fontSize: 18, fontWeight: "700" },
  content: { paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da", marginBottom: 10 },
  headerCopy: { flex: 1 },
  headerLabel: { color: "#859287", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  headerTitle: { color: "#26352c", fontSize: 15, fontWeight: "800", marginTop: 3 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 18 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 10, fontWeight: "800" },
  frameCard: { borderRadius: 16, overflow: "hidden", backgroundColor: "#dfe7de", borderWidth: 1, borderColor: "#d9e1d6" },
  corridor: { borderWidth: 1.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,.10)" },
  gap: { borderWidth: 1.5, borderColor: GREEN, borderRadius: 2, backgroundColor: "rgba(36,123,82,.45)" },
  box: { position: "absolute", borderWidth: 2, borderRadius: 3 },
  staleTag: { position: "absolute", top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: "rgba(174,124,39,.92)" },
  staleText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  sourceTag: { position: "absolute", left: 10, bottom: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(31,67,51,.88)" },
  sourceText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingVertical: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 15, height: 11, borderWidth: 2, borderRadius: 3 },
  legendText: { color: "#68766c", fontSize: 10 },
  readCard: { padding: 12, borderRadius: 14, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" },
  readTitle: { color: "#26352c", fontSize: 13, fontWeight: "800" },
  muted: { color: "#7a887e", fontSize: 11, marginTop: 4 },
  mutedDark: { color: "#a7b4aa" },
  textDark: { color: "#f4f7f1" },
  darkCard: { backgroundColor: "#1a251f", borderColor: "#34473b" },
  caveat: { color: "#8a968c", fontSize: 10, marginTop: 8, lineHeight: 14 },
  empty: { alignItems: "center", padding: 22, borderRadius: 16, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" },
  emptyIcon: { color: "#5d6b62", fontSize: 26 },
  emptyTitle: { color: "#34483a", fontSize: 15, fontWeight: "800", marginTop: 8, textAlign: "center" },
  scanButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: GREEN },
  scanButtonOff: { backgroundColor: "#9fb9a9" },
  scanButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  sectionLabel: { color: "#79857b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 8 },
  picker: { gap: 7 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 11, backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e0e2da" },
  chipOn: { backgroundColor: "#1f4333", borderColor: "#1f4333" },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { flex: 1, color: "#30473a", fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  chipPending: { color: "#98a49a", fontSize: 9, fontWeight: "700" },
});
