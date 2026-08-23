// Scan orchestration: pipeline.mjs:tickCamera, minus everything that only existed to LEARN.
//
// State persistence is not optional here. isParked needs dwell >= 2 and stableGaps needs
// MIN_TICKS = 3 consistent observations, so a single scan can NEVER yield FREE -- by design.
// Without carrying tracks and band EMA across scans the app would sit at "review" forever.
import AsyncStorage from "@react-native-async-storage/async-storage";
// @ts-ignore
import bandsDoc from "../data/bands.json";
// @ts-ignore
import { createBandState, updateBandState } from "../core/temporal.mjs";
// @ts-ignore
import { buildObservation, buildRules } from "../evidence/evidence.mjs";
// @ts-ignore
import { referenceDecision } from "../policy/policy.mjs";
// @ts-ignore
import { assignVehiclesToBands } from "../core/band.mjs";
import { detector } from "../detector/client";
import { status as modelStatus } from "../model/model";
import { bytesToBase64, fetchFrame, haversineM, pointAlongZone, zoneHeading } from "../data/frames";
import type { PipelineStage, TraceEvent } from "../contracts";

const STATE_KEY = "ba-estaciona-scan-state-v1";
/** Keep the phone honest about cost: only ever scan a handful of cameras on demand. */
export const DEFAULT_NEARBY = 3;
export const MAX_NEARBY = 5;
/**
 * Calgary rewrites every camera JPEG once a minute (measured: loc13 went 00:39:04 -> 00:40:04).
 * Polling faster than that only re-reads the same frame, which `fresh` below correctly refuses to
 * count -- so this is the fastest cadence at which the temporal filter can actually make progress.
 */
export const CAMERA_REFRESH_MS = 60_000;

export type Camera = {
  id: string; name: string; location: string; quadrant: string;
  lat: number; lng: number; url: string;
  bands: any[]; scales: Record<string, any>; zone: any;
};
export const cameras: Camera[] = Object.values(bandsDoc.cameras as Record<string, Camera>);
export const fixtureMeta = { exportedAt: bandsDoc.exportedAt, sourceSha: bandsDoc.sourceSha };

export type BandResult = {
  cameraId: string;
  bandId: string;
  observation: any;
  decision: any;
  rules: any;
  lat: number;
  lng: number;
  heading: number;
  /** Prebaked geometry, carried through so the evidence view can draw the corridor it judged. */
  band: any;
};

/**
 * The frame the detector actually ran on, plus the boxes it produced -- kept so the app can show
 * its own evidence instead of asking the user to trust a number. Band geometry, gaps and boxes are
 * all in the same source-pixel space, so one uniform scale factor draws them together.
 */
export type FrameEvidence = {
  cameraId: string;
  cameraName: string;
  address: string;
  dataUri: string;
  width: number;
  height: number;
  capturedAt: number | null;
  stale: boolean;
  vehicles: { box: number[]; label: string; score: number; parked: boolean }[];
};

type Persisted = Record<string, { bandStates: Record<string, any>; tracks: any[]; lastCapturedAt: number | null }>;

let memory: Persisted = {};
let loaded = false;

async function loadState(): Promise<Persisted> {
  if (loaded) return memory;
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    memory = raw ? JSON.parse(raw) : {};
  } catch {
    memory = {};
  }
  loaded = true;
  return memory;
}

async function saveState() {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(memory));
  } catch {
    // A failed persist costs confidence on the next scan, nothing more.
  }
}

export async function resetState() {
  memory = {};
  loaded = true;
  await AsyncStorage.removeItem(STATE_KEY).catch(() => {});
}

let detectorReady: Promise<void> | null = null;

async function bootDetector(): Promise<void> {
  const health = await detector.start();
  if (health.loaded) return;
  const m = await modelStatus();
  if (!m.present) throw new Error("El modelo YOLO26s todavía no está descargado (pestaña Scan).");
  const loaded = await detector.loadModel(m.path);
  // Trust the worklet's own flag: a failed createSession otherwise looks healthy here and only
  // resurfaces as "model not loaded" on every frame of every later scan.
  if (!loaded?.loaded) throw new Error(`La sesión ONNX no cargó: ${JSON.stringify(loaded)}`);
}

/**
 * Bring the worklet and the ONNX session up, once per process, before any frame is detected on.
 *
 * This bootstrap used to live ONLY in ScanScreen: the worklet started when the Scan tab mounted,
 * and the session was loaded only by the "Download model" button's own handler. Two ways that left
 * the app with no inference at all:
 *   - relaunching with the model already on disk started the worklet but never re-created the
 *     session, so every scan came back "model not loaded" until the button was pressed again;
 *   - scanning from the map or evidence tab, which never mounts ScanScreen, had no worklet at all.
 * Both ended identically -- refuseAll, and every band amber. Detection is the pipeline's own
 * responsibility, so it is bootstrapped here. A failure clears the cache so the next scan retries.
 */
export function ensureDetector(): Promise<void> {
  if (!detectorReady) {
    detectorReady = bootDetector().catch((e) => {
      detectorReady = null;
      throw e;
    });
  }
  return detectorReady;
}

/** Every camera, nearest first. The full ordering, so a caller can rotate through all of them. */
export function camerasByDistance(lat: number, lng: number): Camera[] {
  return [...cameras]
    .map((c) => ({ c, d: haversineM(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.c);
}

/** Nearest cameras that actually have learned bands. Cameras without one can never report. */
export function nearestCameras(lat: number, lng: number, n = DEFAULT_NEARBY): Camera[] {
  return camerasByDistance(lat, lng).slice(0, Math.min(n, MAX_NEARBY));
}

/**
 * One scan of one camera. Returns a result per band.
 * `passes` defaults to the 2-pass slice; the desktop runs 4, which is not affordable on a phone.
 */
export async function scanCamera(
  camera: Camera,
  { passes = ["full", "far"], at = new Date(), onStage }: { passes?: string[]; at?: Date; onStage?: (s: PipelineStage, e: Partial<TraceEvent>) => void } = {}
): Promise<{ results: BandResult[]; trace: TraceEvent[]; frameError?: string; evidence?: FrameEvidence }> {
  const trace: TraceEvent[] = [];
  const stage = (s: PipelineStage, status: TraceEvent["status"], detail: string) => {
    const ev = { stage: s, status, detail };
    trace.push(ev);
    // A blocked stage means this camera produced no inference at all. The Scan tab shows it, but
    // only for the scan in flight and only while that tab is open, so an intermittent failure left
    // no trace anywhere and "it sometimes doesn't detect" was undiagnosable from outside the app.
    // `adb logcat -s ReactNativeJS` now shows every one of them.
    if (status === "blocked") console.warn(`[scan] ${camera.id} ${s} BLOCKED: ${detail}`);
    onStage?.(s, ev);
    return ev;
  };

  await loadState();
  const mem = (memory[camera.id] ||= {
    bandStates: Object.fromEntries(camera.bands.map((b: any) => [b.id, createBandState(b)])),
    tracks: [],
    lastCapturedAt: null,
  });
  // A fixture added after the state was first written would otherwise have no band state.
  for (const b of camera.bands) mem.bandStates[b.id] ||= createBandState(b);

  const rules = buildRules(camera.zone, at);

  // Bring inference up BEFORE spending a camera fetch on a frame that nothing can look at. With
  // auto-scan running, a phone whose model is not downloaded yet would otherwise pull a JPEG per
  // camera per minute and discard every one of them at the detector.
  try {
    await ensureDetector();
  } catch (e: any) {
    stage("detector", "blocked", `Detector: ${e?.message || e}`);
    for (const b of camera.bands) updateBandState(mem.bandStates[b.id], null, { stale: true });
    await saveState();
    return { results: refuseAll(camera, rules, `Detector no disponible: ${e?.message || e}`), trace };
  }

  const f = await fetchFrame(camera.url);
  if (!f.jpeg) {
    stage("capture", "blocked", `No se pudo leer la cámara: ${f.error}`);
    for (const b of camera.bands) updateBandState(mem.bandStates[b.id], null, { stale: true });
    await saveState();
    return { results: refuseAll(camera, rules, `No se pudo leer la cámara: ${f.error}`), trace, frameError: f.error };
  }
  stage("capture", "ready", `Frame de ${(f.jpeg.length / 1024).toFixed(0)} KB${f.stale ? " (vencido)" : ""}`);

  // Whether this is a frame we have not already judged. The desktop pipeline skips detection
  // outright when the camera has not refreshed; this does NOT (it still needs the boxes to report
  // occupancy, and caching them per camera is not worth the state). What `fresh` gates is the
  // temporal filter: re-reading one JPEG must never manufacture agreement out of a single frame.
  const fresh = f.capturedAt !== mem.lastCapturedAt;

  let r: any;
  try {
    r = await detector.detect(f.jpeg, { bands: camera.bands, scales: camera.scales, tracks: mem.tracks, passes });
  } catch (e: any) {
    stage("detector", "blocked", `Detector: ${e?.message || e}`);
    for (const b of camera.bands) updateBandState(mem.bandStates[b.id], null, { stale: true });
    await saveState();
    return { results: refuseAll(camera, rules, `Detector no disponible: ${e?.message || e}`), trace };
  }
  stage("detector", "ready", `${r.vehicles.length} vehículos · ${r.ms.decode}ms decode + ${r.ms.infer}ms inferencia`);

  if (fresh) {
    mem.tracks = r.tracks;
    mem.lastCapturedAt = f.capturedAt;
  }

  const results: BandResult[] = [];
  const vehiclesByBand = assignVehiclesToBands(camera.bands, r.vehicles);
  for (const band of camera.bands) {
    const guarded = r.perBand[band.id];
    // Only a genuinely new frame advances the temporal filter; re-scanning a stale frame must not
    // manufacture confidence.
    if (fresh) updateBandState(mem.bandStates[band.id], guarded, { stale: f.stale });

    const observation = buildObservation({
      band,
      scale: camera.scales[band.id],
      bandState: mem.bandStates[band.id],
      guarded,
      vehicles: vehiclesByBand[band.id] || [],
      source: "calgary-traffic-camera",
      frame: {
        width: r.width,
        height: r.height,
        meanLuma: r.meanLuma,
        energy: r.energy,
        stale: f.stale,
        capturedAt: f.capturedAt,
      },
    });

    const decision = referenceDecision({ observation, sector: { sector_id: camera.zone.id }, rules });

    // Place the result on the actual curb rather than on the camera pin.
    const centre = observation.gaps.length
      ? observation.gaps.reduce((s: number, g: any) => s + g.centreT, 0) / observation.gaps.length / band.length
      : 0.5;
    const [lng, lat] = pointAlongZone(camera.zone, centre);

    results.push({ cameraId: camera.id, bandId: band.id, observation, decision, rules, lat, lng, heading: zoneHeading(camera.zone), band });
  }

  stage("evidence", "ready", `${results.filter((x) => x.observation.state === "FREE").length}/${results.length} tramos con hueco confirmado`);
  stage("policy", "ready", results.map((x) => x.decision.decision).join(", "));
  await saveState();

  const evidence: FrameEvidence = {
    cameraId: camera.id,
    cameraName: camera.name,
    address: camera.zone?.address ?? camera.location,
    dataUri: `data:image/jpeg;base64,${bytesToBase64(f.jpeg)}`,
    width: r.width,
    height: r.height,
    capturedAt: f.capturedAt,
    stale: f.stale,
    vehicles: r.vehicles.map((v: any) => ({
      box: v.box,
      label: v.label,
      score: v.score,
      parked: (v.dwell || 1) >= 2,
    })),
  };
  return { results, trace, evidence };
}

function refuseAll(camera: Camera, rules: any, reason: string): BandResult[] {
  return camera.bands.map((band: any) => ({
    cameraId: camera.id,
    bandId: band.id,
    rules,
    observation: { state: "UNCERTAIN", quality: "USABLE", confidence: 0, explanation: reason, detections: [], gaps: [], carsFit: 0, freeMetres: 0, ticks: 0 },
    decision: { decision: "REFUSE", code: "DATA_MISSING", reason, confidence: 0 },
    lat: camera.lat,
    lng: camera.lng,
    heading: zoneHeading(camera.zone),
    band,
  }));
}
