// The frame the detector actually ran on, with what it found drawn on top.
//
// This replaces the Google Street View panorama, which showed a stock photo of the block from some
// unrelated date and proved nothing about the decision on screen. What matters for "can I park
// here" is the evidence: this exact JPEG, the vehicle boxes YOLO26s emitted from it, the learned
// curb corridor, and the gaps that survived the appearance guard and the temporal filter.
//
// Band geometry, gaps and boxes are all in source-frame pixel space, so a single uniform scale
// factor (view width / frame width) places all three together. That width is measured with
// onLayout rather than read off Dimensions: a Dimensions snapshot is wrong the moment the app is
// rotated or put in split screen, and it silently misplaces every overlay when it is.
import { memo, useCallback, useMemo, useState } from "react";

import { Card, CardTitle, Muted, SectionLabel } from "../components/Card";
import { EvidenceSpotRow } from "../components/EvidenceSpotRow";
import { ListSeparator } from "../components/ListSeparator";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusDot, StatusText } from "../components/StatusDot";
import {
  Button,
  ButtonText,
  Image,
  Pressable,
  ScreenList,
  StatusBarScrim,
  StyleSheet,
  Text,
  View,
  useThemedStyles,
  type ListRenderItemInfo,
  type Theme,
  type ViewStyle,
} from "../design-system";
import type { FrameEvidence } from "../scan/scan";
import { agoPhrase, spotExtent, spotTitle, type Spot, type Status } from "../state/spots";
import { useAppStore } from "../state/store";

const spotKeyExtractor = (spot: Spot) => spot.id;

export function EvidenceScreen() {
  const styles = useThemedStyles(evidenceStyles);
  const spots = useAppStore((s) => s.spots);
  const selectedSpotId = useAppStore((s) => s.selectedSpotId);
  const selectSpot = useAppStore((s) => s.selectSpot);

  // This camera's own curbs first: they are the ones visible in the frame above. Sorting makes a
  // new array but keeps the inner Spot references, which is what the virtualiser compares.
  const ordered = useMemo(() => {
    const selectedCameraId = spots.find((s) => s.id === selectedSpotId)?.cameraId;
    return [...spots].sort(
      (a, b) =>
        Number(b.cameraId === selectedCameraId) - Number(a.cameraId === selectedCameraId)
    );
  }, [selectedSpotId, spots]);

  const renderSpot = useCallback(
    ({ item }: ListRenderItemInfo<Spot>) => (
      <EvidenceSpotRow
        id={item.id}
        title={spotTitle(item)}
        status={item.status}
        cameraId={item.cameraId}
        onPress={selectSpot}
      />
    ),
    [selectSpot]
  );

  // The scrim rides with the screen rather than with the app: this list scrolls under the status
  // bar, so it needs something behind the clock. The map does not.
  return (
    <View style={styles.root}>
      <ScreenList
        data={ordered}
        renderItem={renderSpot}
        keyExtractor={spotKeyExtractor}
        ItemSeparatorComponent={ListSeparator}
        ListHeaderComponent={evidenceHeader}
        contentContainerStyle={styles.content}
      />
      <StatusBarScrim />
    </View>
  );
}

const EvidenceHeader = memo(function EvidenceHeader() {
  const styles = useThemedStyles(evidenceStyles);

  const spots = useAppStore((s) => s.spots);
  const selectedSpotId = useAppStore((s) => s.selectedSpotId);
  const scanning = useAppStore((s) => s.scanning);
  const scan = useAppStore((s) => s.scan);
  const spot = useMemo(
    () => spots.find((candidate) => candidate.id === selectedSpotId) ?? spots[0],
    [selectedSpotId, spots]
  );
  const evidence = useAppStore((s) => (spot?.cameraId ? s.evidence[spot.cameraId] : undefined));

  // Every band of the same camera is visible in the same frame, so draw them all and mark the
  // selected one. Seeing the neighbouring corridor is what makes the geometry legible.
  const siblings = useMemo(
    () => spots.filter((s) => s.cameraId === spot?.cameraId && s.band),
    [spot?.cameraId, spots]
  );

  const onScanCamera = useCallback(() => {
    void scan(spot?.cameraId ? { cameraIds: [spot.cameraId] } : {});
  }, [scan, spot?.cameraId]);

  if (!spot) {
    return (
      <View style={styles.header}>
        <ScreenHeader title="Evidence" />
        <Muted>No curb segments are bundled with this build.</Muted>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <ScreenHeader title="Evidence" />

      <Card>
        <View style={styles.selectedRow}>
          <View style={styles.selectedCopy}>
            <SectionLabel>SELECTED SEGMENT</SectionLabel>
            <CardTitle>{spotTitle(spot)}</CardTitle>
            <Muted>{spotExtent(spot, spot.sideLabel ? spot.number : null)}</Muted>
          </View>
          <View style={styles.selectedStatus}>
            <StatusDot status={spot.status} size="sm" />
            <StatusText status={spot.status} />
          </View>
        </View>
      </Card>

      {evidence ? (
        <>
          <EvidenceFrame evidence={evidence} spot={spot} siblings={siblings} />

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchVehicle]} />
              <Text style={styles.legendText}>vehicle detected</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchCorridor]} />
              <Text style={styles.legendText}>curb watched</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchGap]} />
              <Text style={styles.legendText}>confirmed free</Text>
            </View>
          </View>

          <Card>
            <CardTitle>
              {evidence.vehicles.length} vehicle{evidence.vehicles.length === 1 ? "" : "s"} in frame
              ·{" "}
              {spot.status === "free"
                ? `${spot.freeMetres} m free · ≈${spot.carsFit} car${spot.carsFit === 1 ? "" : "s"}`
                : `${spot.ticks ?? 0} of 3 consistent observations`}
            </CardTitle>
            <Muted>{spot.reason}</Muted>
            {spot.rule ? <Muted>{spot.rule}</Muted> : null}
            <Text style={styles.caveat}>
              Boxes are the model&apos;s raw output. A segment only reads free after three
              consistent observations and the appearance guard; a missed car leaves textured
              asphalt, which reads unknown, never free.
            </Text>
          </Card>
        </>
      ) : (
        <Card>
          <Text style={styles.emptyIcon}>◎</Text>
          <CardTitle>No frame for this camera yet</CardTitle>
          <Muted>
            Nothing is drawn here until the detector has actually run on a frame. Scanning fetches
            one and shows you exactly what it judged.
          </Muted>
          <Button onPress={onScanCamera} disabled={scanning}>
            <ButtonText>{scanning ? "Scanning…" : "Scan this camera"}</ButtonText>
          </Button>
        </Card>
      )}

      <SectionLabel>OTHER SEGMENTS</SectionLabel>
    </View>
  );
});

/**
 * The frame plus its overlays. Owns its own measured width so nothing above it has to thread a
 * Dimensions snapshot down, and so a rotation simply re-runs onLayout.
 */
const EvidenceFrame = memo(function EvidenceFrame({
  evidence,
  spot,
  siblings,
}: {
  evidence: FrameEvidence;
  spot: Spot;
  siblings: readonly Spot[];
}) {
  const styles = useThemedStyles(evidenceStyles);
  const onSelectCurb = useAppStore((s) => s.selectSpot);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    // Primitive state: no need to compare before setting.
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const k = width > 0 ? width / evidence.width : 0;
  const frameHeight = evidence.height * k;

  const frameStyle = useMemo<ViewStyle>(() => ({ height: frameHeight }), [frameHeight]);

  const corridors = useMemo(
    () =>
      k === 0
        ? []
        : siblings.map((sib) => ({
            id: sib.id,
            selected: sib.id === spot.id,
            status: sib.status,
            sideLabel: sib.sideLabel ?? null,
            label: spotTitle(sib),
            style: segmentStyle(sib.band, 0, sib.band.length, sib.band.halfWidth, k),
          })),
    [k, siblings, spot.id]
  );

  const vehicles = useMemo(
    () =>
      k === 0
        ? []
        : evidence.vehicles.map((v, index) => ({
            key: `v-${index}`,
            parked: v.parked,
            style: {
              left: v.box[0] * k,
              top: v.box[1] * k,
              width: (v.box[2] - v.box[0]) * k,
              height: (v.box[3] - v.box[1]) * k,
            } as ViewStyle,
          })),
    [evidence.vehicles, k]
  );

  const gaps = useMemo(
    () =>
      k === 0
        ? []
        : siblings.flatMap((sib) =>
            (sib.gaps ?? []).map((g: any, index: number) => ({
              key: `gap-${sib.id}-${index}`,
              // A sibling's confirmed gap belongs to the OTHER curb; drawn identically it reads as
              // free space on the segment the user is looking at.
              other: sib.id !== spot.id,
              style: segmentStyle(sib.band, g.t1, g.t2, sib.band.halfWidth, k),
            }))
          ),
    [k, siblings, spot.id]
  );

  return (
    <View style={[styles.frameCard, frameStyle]} onLayout={onLayout}>
      {width > 0 ? (
        <Image
          source={evidence.dataUri}
          style={styles.frameImage}
          contentFit="cover"
          // Without this, a recycled view keeps showing the previous camera's frame for a beat.
          recyclingKey={evidence.cameraId}
          cachePolicy="memory"
        />
      ) : null}

      {/* The learned curb corridor, per band. Tapping one selects that curb: this is how the two
          pins on the map are told apart -- by pointing at the curb each one means. */}
      {corridors.map((c) => (
        <CorridorOverlay
          key={`band-${c.id}`}
          id={c.id}
          label={c.label}
          sideLabel={c.sideLabel}
          status={c.status}
          selected={c.selected}
          style={c.style}
          onPress={onSelectCurb}
        />
      ))}

      {/* Vehicle boxes, straight from the model. */}
      {vehicles.map((v) => (
        <View
          key={v.key}
          pointerEvents="none"
          style={[styles.box, v.parked ? styles.boxParked : styles.boxMoving, v.style]}
        />
      ))}

      {/* Confirmed free curb: the only thing here that ever means "you can park". */}
      {gaps.map((g) => (
        <View
          key={g.key}
          pointerEvents="none"
          style={[g.style, styles.gap, g.other ? styles.gapOther : null]}
        />
      ))}

      {evidence.stale ? (
        <View style={styles.staleTag}>
          <Text style={styles.staleText}>STALE FRAME</Text>
        </View>
      ) : null}
      <View style={styles.sourceTag}>
        <Text style={styles.sourceText}>
          {evidence.cameraName} · {agoPhrase(evidence.capturedAt)}
        </Text>
      </View>
    </View>
  );
});

/** One curb corridor drawn over the frame, tappable so it can be selected by pointing at it. */
const CorridorOverlay = memo(function CorridorOverlay({
  id,
  label,
  sideLabel,
  status,
  selected,
  style,
  onPress,
}: {
  id: string;
  label: string;
  sideLabel: string | null;
  status: Status;
  selected: boolean;
  style: ViewStyle;
  onPress: (spotId: string) => void;
}) {
  const styles = useThemedStyles(evidenceStyles);
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Select ${label}`}
      onPress={handlePress}
      style={[
        style,
        styles.corridor,
        styles[status],
        selected ? styles.corridorSelected : styles.corridorSibling,
      ]}
    >
      {sideLabel ? (
        <View style={[styles.sideBadge, selected ? styles.sideBadgeOn : null]} pointerEvents="none">
          <Text style={styles.sideBadgeText}>{sideLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/** A rotated rectangle laid along the band axis, from t0 to t1 in band-parameter space. */
function segmentStyle(band: any, t0: number, t1: number, halfWidth: number, k: number): ViewStyle {
  const [dx, dy] = band.dir;
  const mid = (t0 + t1) / 2;
  const cx = (band.p0[0] + dx * mid) * k;
  const cy = (band.p0[1] + dy * mid) * k;
  const w = Math.max(2, (t1 - t0) * k);
  const h = Math.max(2, halfWidth * 2 * k);
  return {
    position: "absolute",
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
    transform: [{ rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg` }],
  };
}

// Passed to the list as an *element*, not a component type: FlashList's getValidComponent only
// accepts an element or a plain function, and memo() returns neither — a memo type is silently
// dropped, leaving a list with no header at all.
const evidenceHeader = <EvidenceHeader />;

const evidenceStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: theme.space.lg, paddingBottom: theme.space.xl },
    header: { gap: theme.space.md, paddingBottom: theme.space.md },
    selectedRow: { flexDirection: "row", alignItems: "center", gap: theme.space.md },
    selectedCopy: { flex: 1, gap: theme.space.xs },
    selectedStatus: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
    frameCard: {
      width: "100%",
      overflow: "hidden",
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      backgroundColor: theme.color.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    frameImage: { ...StyleSheet.absoluteFillObject },
    corridor: { borderRadius: 2, borderCurve: "continuous" },
    corridorSelected: { borderWidth: 2.5, backgroundColor: "rgba(255,255,255,0.10)" },
    corridorSibling: { borderWidth: 1.5, opacity: 0.55, backgroundColor: "rgba(255,255,255,0.06)" },
    free: { borderColor: theme.color.free },
    occupied: { borderColor: theme.color.occupied },
    review: { borderColor: theme.color.review },
    unscanned: { borderColor: theme.color.unscanned },
    sideBadge: {
      position: "absolute",
      left: 2,
      top: -2,
      paddingHorizontal: theme.space.xs,
      borderRadius: theme.radius.sm / 2,
      borderCurve: "continuous",
      backgroundColor: "rgba(16,23,19,0.62)",
    },
    sideBadgeOn: { backgroundColor: "rgba(16,23,19,0.85)" },
    sideBadgeText: {
      color: "#ffffff",
      fontSize: theme.fontSize.caption,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    box: { position: "absolute", borderWidth: 2, borderRadius: 3, borderCurve: "continuous" },
    boxParked: { borderColor: theme.color.occupied },
    boxMoving: { borderColor: "rgba(182,84,59,0.55)" },
    gapOther: { opacity: 0.3 },
    gap: {
      borderWidth: 1.5,
      borderRadius: 2,
      borderCurve: "continuous",
      borderColor: theme.color.free,
      backgroundColor: "rgba(36,123,82,0.45)",
    },
    staleTag: {
      position: "absolute",
      top: theme.space.sm,
      right: theme.space.sm,
      paddingHorizontal: theme.space.sm,
      paddingVertical: theme.space.xs,
      borderRadius: theme.radius.sm,
      borderCurve: "continuous",
      backgroundColor: "rgba(174,124,39,0.92)",
    },
    staleText: {
      color: "#ffffff",
      fontSize: theme.fontSize.caption,
      fontWeight: "800",
      letterSpacing: 0.6,
    },
    sourceTag: {
      position: "absolute",
      left: theme.space.sm,
      bottom: theme.space.sm,
      paddingHorizontal: theme.space.sm,
      paddingVertical: theme.space.xs,
      borderRadius: theme.radius.sm,
      borderCurve: "continuous",
      backgroundColor: theme.color.accentStrong,
    },
    sourceText: { color: theme.color.onAccent, fontSize: theme.fontSize.caption, fontWeight: "700" },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: theme.space.md },
    legendItem: { flexDirection: "row", alignItems: "center", gap: theme.space.xs },
    swatch: { width: 18, height: 12, borderWidth: 2, borderRadius: 3, borderCurve: "continuous" },
    swatchVehicle: { borderColor: theme.color.occupied },
    swatchCorridor: { borderColor: "#ffffff", backgroundColor: "rgba(255,255,255,0.12)" },
    swatchGap: { borderColor: theme.color.free, backgroundColor: "rgba(36,123,82,0.45)" },
    legendText: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    caveat: { color: theme.color.textMuted, fontSize: theme.fontSize.caption, lineHeight: 19 },
    emptyIcon: { color: theme.color.textMuted, fontSize: theme.fontSize.title },
  });
