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
import { detector } from "../detector/client";
import { bytesToBase64, fetchFrame, haversineM, pointAlongZone, zoneHeading } from "../data/frames";
import type { PipelineStage, TraceEvent } from "../contracts";

const STATE_KEY = "ba-estaciona-scan-state-v1";
/** Keep the phone honest about cost: only ever scan a handful of cameras on demand. */
export const DEFAULT_NEARBY = 3;
export const MAX_NEARBY = 5;

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

/** Nearest cameras that actually have learned bands. Cameras without one can never report. */
export function nearestCameras(lat: number, lng: number, n = DEFAULT_NEARBY): Camera[] {
  return [...cameras]
    .map((c) => ({ c, d: haversineM(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(n, MAX_NEARBY))
    .map((x) => x.c);
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

  const f = await fetchFrame(camera.url);
  if (!f.jpeg) {
    stage("capture", "blocked", `No se pudo leer la cámara: ${f.error}`);
    for (const b of camera.bands) updateBandState(mem.bandStates[b.id], null, { stale: true });
    await saveState();
    return { results: refuseAll(camera, rules, `No se pudo leer la cámara: ${f.error}`), trace, frameError: f.error };
  }
  stage("capture", "ready", `Frame de ${(f.jpeg.length / 1024).toFixed(0)} KB${f.stale ? " (vencido)" : ""}`);

  // The desktop pipeline skips detection when the camera has not refreshed. Same saving here,
  // but the observation is still rebuilt so the UI shows current rule state.
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
      vehicles: r.vehicles,
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
