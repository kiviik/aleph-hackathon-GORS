// Replaces the hardcoded SPOTS array in App.tsx with real detections.
//
// The Spot shape is preserved field-for-field on purpose: markers, callouts, the status filters,
// the legend and the saved tab all read from it and need no changes. Only the values become real.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  cameras,
  camerasByDistance,
  scanCamera,
  usableBands,
  fixtureMeta,
  CAMERA_REFRESH_MS,
  DEFAULT_NEARBY,
  MAX_NEARBY,
  type BandResult,
  type Camera,
  type FrameEvidence,
} from "../scan/scan";
import { zoneHeading } from "../data/frames";
// @ts-ignore
import { bandSide, placeBand, zoneForBand } from "../core/placement.mjs";
// @ts-ignore
import { packVerdicts, restoreVerdicts } from "../core/verdicts.mjs";
import type { PipelineStage, TraceEvent } from "../contracts";

export type Status = "free" | "occupied" | "review" | "unscanned";

export type Spot = {
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
  // added, optional so nothing existing breaks
  carsFit?: number;
  freeMetres?: number;
  decision?: string;
  reason?: string;
  rule?: string;
  ticks?: number;
  cameraId?: string;
  bandId?: string;
  scanned?: boolean;
  /** Which curb this is: a compass side when a zone matched it, else near/far in the camera view. */
  sideKey?: string | null;
  nearness?: string | null;
  sideLabel?: string | null;
  zoneId?: string | null;
  /** Metres of uncertainty on the coordinate, and metres of curb the band can read. */
  accuracyM?: number;
  spanM?: number;
  placement?: string;
  /** The stretch of curb, as [lat, lng] pairs for Leaflet. */
  curb?: [number, number][] | null;
  /** Siblings that share a camera and must be told apart on the map. */
  pairKey?: string;
  /** When the frame behind this verdict was taken, so its age can be re-read after a restart. */
  capturedAt?: number | null;
  /** Prebaked corridor geometry + the confirmed gaps, both in source-frame pixels. */
  band?: any;
  gaps?: any[];
};

/** "7 St SW ,  Fr 5 Av SW To 6 Av SW" -> { street: "7 St SW", number: "5 Av → 6 Av" } */
function splitAddress(address: string): { street: string; number: string } {
  const [head, ...rest] = (address || "").split(",");
  const tail = rest.join(",").trim();
  const m = /Fr\s+(.+?)\s+To\s+(.+)/i.exec(tail);
  return {
    street: (head || "").trim(),
    number: m ? `${m[1].trim()} → ${m[2].trim()}` : tail,
  };
}

function ago(ts: number | null | undefined): string {
  if (!ts) return "not checked";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/**
 * A camera's bands, before anything has been scanned.
 *
 * These seed as "unscanned", NOT "review". They were the same amber bucket before, which meant a
 * segment nobody had looked at was presented identically to one the detector had looked at and
 * found genuinely ambiguous. With only DEFAULT_NEARBY cameras scanned per pass, that made most of
 * the map permanently "review" and said nothing true about the curb.
 */
function seedSpots(): Spot[] {
  const out: Spot[] = [];
  for (const c of cameras as Camera[]) {
    // Seed and scan go through the same placement, so a pin never jumps on its first result.
    for (const band of usableBands(c)) {
      const zone = zoneForBand(c, band) ?? c.zone;
      const { street, number } = splitAddress(zone.address ?? c.zone.address);
      out.push({
        id: `${c.id}-${band.id}`,
        cameraId: c.id,
        bandId: band.id,
        band,
        street,
        number,
        neighborhood: zone.brz || c.zone.brz || c.quadrant || "Calgary",
        status: "unscanned",
        confidence: "—",
        checked: "not checked",
        scanned: false,
        reason: "Sin escanear todavía.",
        pairKey: c.id,
        ...geo(c, band),
      });
    }
  }
  return out;
}

/** The map-facing half of a band: where it is, how well that is known, and which curb it is. */
function geo(camera: Camera, band: any) {
  const scale = camera.scales[band.id];
  const zone = zoneForBand(camera, band) ?? camera.zone;
  const p = placeBand(camera, band, scale);
  const side = bandSide(camera, band, scale, usableBands(camera));
  return {
    latitude: p.lat,
    longitude: p.lng,
    heading: zone?.p0 && zone?.p1 ? zoneHeading(zone) : 0,
    accuracyM: p.accuracyM,
    spanM: p.spanM,
    placement: p.placement,
    zoneId: p.zoneId,
    sideKey: side.key,
    nearness: side.nearness,
    sideLabel: side.label,
    curb: (p.endpoints?.map(([lng, lat]: number[]) => [lat, lng]) ?? null) as [number, number][] | null,
  };
}

function toSpot(prev: Spot, r: BandResult, camera: Camera): Spot {
  const { observation: o, decision } = r;
  // review is the honest bucket for REFUSE/UNCERTAIN -- it is already coloured amber in the UI.
  const status: Status =
    decision.decision === "PARK" ? "free" : decision.decision === "DO_NOT_PARK" ? "occupied" : "review";
  return {
    ...prev,
    status,
    latitude: r.lat,
    longitude: r.lng,
    heading: r.heading,
    accuracyM: r.accuracyM,
    spanM: r.spanM,
    placement: r.placement,
    zoneId: r.zoneId,
    sideKey: r.sideKey,
    nearness: r.nearness,
    sideLabel: r.sideLabel,
    curb: (r.curb?.map(([lng, lat]: number[]) => [lat, lng]) ?? prev.curb ?? null) as [number, number][] | null,
    confidence: o.confidence ? `${Math.round(o.confidence * 100)}%` : "—",
    checked: ago(o.capturedAt),
    capturedAt: o.capturedAt ?? null,
    carsFit: o.carsFit,
    freeMetres: o.freeMetres,
    decision: decision.decision,
    reason: decision.reason,
    rule: r.rules?.explanation,
    ticks: o.ticks,
    band: r.band ?? prev.band,
    gaps: o.gaps ?? [],
    scanned: true,
  };
}

const SPOTS_KEY = "ba-estaciona-spots-v1";

/**
 * Last session's answers, so re-opening the app does not show "unscanned" for the five minutes the
 * rotation needs to look at every camera again. What may be restored -- and what has gone stale --
 * is decided by core/verdicts.mjs, which is unit-tested off-device; this only does the I/O.
 */
async function loadVerdicts(): Promise<Record<string, any>> {
  try {
    const raw = await AsyncStorage.getItem(SPOTS_KEY);
    return restoreVerdicts(raw ? JSON.parse(raw) : null, fixtureMeta.exportedAt);
  } catch {
    return {};
  }
}

function saveVerdicts(spots: Spot[]) {
  AsyncStorage.setItem(SPOTS_KEY, JSON.stringify(packVerdicts(spots, fixtureMeta.exportedAt))).catch(() => {});
}

export type ScanProgress = { cameraId: string; stage: PipelineStage; status: TraceEvent["status"]; detail: string };

export function useSpots(
  userLocation: { latitude: number; longitude: number } | null,
  { autoScan = true }: { autoScan?: boolean } = {}
) {
  const [spots, setSpots] = useState<Spot[]>(() => seedSpots());
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<ScanProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Newest frame per camera, so the evidence view can show what the detector actually saw.
  const [evidence, setEvidence] = useState<Record<string, FrameEvidence>>({});
  const cancelled = useRef(false);
  // The re-entrancy guard has to be a ref, not the `scanning` state: setScanning is async, so two
  // callers in the same tick (a tap landing on an auto-scan tick) both read `scanning === false`
  // and run two concurrent scans over the same band state.
  const scanningRef = useRef(false);
  // Where the round-robin has got to. A fixed nearest-N never touched the other cameras at all.
  const rotation = useRef(0);

  useEffect(() => {
    // Set on mount, not just cleared on unmount: StrictMode's double-mount would otherwise leave
    // this latched true for the rest of the session and silently discard every scan result.
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  // Paint last session's verdicts before the first scan can land, so a returning user is not shown
  // an all-grey map for the five minutes the rotation needs to revisit every camera. A restored
  // verdict keeps the age of the frame it came from, and anything older than RESTORE_MAX_AGE_MS is
  // dropped rather than presented as current.
  useEffect(() => {
    let live = true;
    loadVerdicts().then((stored) => {
      if (!live || !Object.keys(stored).length) return;
      setSpots((current) =>
        current.map((s) => (stored[s.id] ? { ...s, ...stored[s.id], checked: ago(stored[s.id].capturedAt) } : s))
      );
    });
    return () => { live = false; };
  }, []);

  const scan = useCallback(
    async (opts: { cameraIds?: string[]; count?: number; rotate?: boolean } = {}) => {
      if (scanningRef.current) return;
      scanningRef.current = true;
      setScanning(true);
      setError(null);
      setProgress([]);

      const count = opts.count ?? DEFAULT_NEARBY;
      const ordered = userLocation
        ? camerasByDistance(userLocation.latitude, userLocation.longitude)
        : (cameras as Camera[]);

      let targets: Camera[];
      if (opts.cameraIds) {
        targets = (cameras as Camera[]).filter((c) => opts.cameraIds!.includes(c.id));
      } else if (opts.rotate) {
        // Round-robin over the WHOLE fixture, nearest first. Scanning a fixed nearest-N meant the
        // remaining cameras were never looked at even once, so their segments kept their seeded
        // value for the life of the app. The cursor only advances on a scan that actually ran, so
        // a skipped tick cannot silently step over a camera.
        targets = Array.from({ length: Math.min(count, ordered.length) }, (_, i) => ordered[(rotation.current + i) % ordered.length]);
        rotation.current = (rotation.current + targets.length) % ordered.length;
      } else {
        targets = ordered.slice(0, Math.min(count, MAX_NEARBY));
      }

      try {
        for (const camera of targets) {
          const { results, evidence: ev } = await scanCamera(camera, {
            onStage: (stage, e) =>
              setProgress((p) => [...p, { cameraId: camera.id, stage, status: e.status!, detail: e.detail! }]),
          });
          if (cancelled.current) return;
          if (ev) setEvidence((current) => ({ ...current, [ev.cameraId]: ev }));
          setSpots((current) => {
            const next = current.map((s) => {
              const r = results.find((x) => `${x.cameraId}-${x.bandId}` === s.id);
              return r ? toSpot(s, r, camera) : s;
            });
            saveVerdicts(next);
            return next;
          });
        }
        setLastScanAt(Date.now());
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        scanningRef.current = false;
        setScanning(false);
      }
    },
    [userLocation]
  );

  // A band needs MIN_TICKS frames before it can leave "review", and only a genuinely new frame
  // counts (see scan.ts). Manual taps never got there: three taps inside a minute all read the same
  // JPEG and advance the filter once. Re-scan on the camera's own cadence instead -- foreground
  // only, since each pass costs a fetch plus local inference per camera.
  const scanRef = useRef(scan);
  useEffect(() => { scanRef.current = scan; }, [scan]);

  useEffect(() => {
    if (!autoScan) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let kicked = false;
    const start = () => {
      if (timer) return;
      // Scan once straight away rather than making the user watch an untouched map for a minute,
      // and cast a slightly wider net on that first pass: a first-ever launch has no stored
      // verdicts to fall back on, so the opening burst is the only thing standing between the user
      // and an all-grey map. Later ticks go back to DEFAULT_NEARBY, which is the cost the rotation
      // is budgeted for. Only on the first foreground: re-kicking on every resume would re-fetch on
      // every glance.
      if (!kicked) { kicked = true; void scanRef.current({ rotate: true, count: MAX_NEARBY }); }
      timer = setInterval(() => { void scanRef.current({ rotate: true }); }, CAMERA_REFRESH_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (next) => (next === "active" ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [autoScan]);

  const scannedCount = useMemo(() => spots.filter((s) => s.scanned).length, [spots]);

  return { spots, scanning, lastScanAt, progress, error, scan, scannedCount, fixtureMeta, evidence };
}
