// Spot shape + the pure transforms that turn a scan result into one.
//
// The Spot shape is preserved field-for-field on purpose: the map pins, the status filters, the
// legend, the evidence overlay and the saved tab all read from it. Only the values become real.
//
// Nothing here touches React. The store in ./store.ts owns the state; this file owns the maths.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { cameras, fixtureMeta, usableBands, type BandResult, type Camera } from "../scan/scan";
import { zoneHeading } from "../data/frames";
// @ts-ignore
import { bandSide, placeBand, zoneForBand } from "../core/placement.mjs";
// @ts-ignore
import { packVerdicts, restoreVerdicts } from "../core/verdicts.mjs";

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

/**
 * Two bands of one camera are two curbs of one street: without the side they render as the same
 * name twice, which is exactly the confusion this is meant to remove.
 */
export function spotTitle(spot: Spot): string {
  return spot.sideLabel ? `${spot.street} · ${spot.sideLabel}` : `${spot.street} ${spot.number}`;
}

/** "5 Av → 6 Av · ~15 m of curb · ±10 m" — the extent a pin actually stands for. */
export function spotExtent(spot: Spot, lead?: string | null): string {
  return [
    lead,
    spot.spanM ? `~${Math.round(spot.spanM)} m of curb` : null,
    spot.accuracyM ? `±${spot.accuracyM} m` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

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

export function ago(ts: number | null | undefined): string {
  if (!ts) return "not checked";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Same shape as `ago`, but phrased for a caption: "3 min ago" / "unknown". */
export function agoPhrase(ts: number | null): string {
  if (!ts) return "unknown";
  return `${ago(ts)} ago`;
}

/**
 * `checked` is already a phrase ("3 min", or "not checked"), so it cannot simply be dropped into
 * "checked … ago" — an unscanned segment would read "checked not checked ago".
 */
export function checkedPhrase(checked: string, scanned: boolean | undefined): string {
  return scanned ? `checked ${checked} ago` : "not scanned yet";
}

/** The map-facing half of a band: where it is, how well that is known, and which curb it is. */
function geo(camera: Camera, band: any) {
  const scale = (camera as any).scales[band.id];
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
    curb: (p.endpoints?.map(([lng, lat]: number[]) => [lat, lng]) ?? null) as
      | [number, number][]
      | null,
  };
}

/**
 * A camera's bands, before anything has been scanned.
 *
 * These seed as "unscanned", NOT "review". They were the same amber bucket before, which meant a
 * segment nobody had looked at was presented identically to one the detector had looked at and
 * found genuinely ambiguous. With only DEFAULT_NEARBY cameras scanned per pass, that made most of
 * the map permanently "review" and said nothing true about the curb.
 */
export function seedSpots(): Spot[] {
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
        neighborhood: zone.brz || c.zone.brz || (c as any).quadrant || "Calgary",
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

export function toSpot(prev: Spot, r: BandResult): Spot {
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
    curb: (r.curb?.map(([lng, lat]: number[]) => [lat, lng]) ?? prev.curb ?? null) as
      | [number, number][]
      | null,
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
export async function loadVerdicts(): Promise<Record<string, any>> {
  try {
    const raw = await AsyncStorage.getItem(SPOTS_KEY);
    return restoreVerdicts(raw ? JSON.parse(raw) : null, fixtureMeta.exportedAt);
  } catch {
    return {};
  }
}

export function saveVerdicts(spots: readonly Spot[]) {
  AsyncStorage.setItem(
    SPOTS_KEY,
    JSON.stringify(packVerdicts(spots, fixtureMeta.exportedAt))
  ).catch(() => {});
}

/** Re-apply a restored verdict, re-reading the age of the frame it came from. */
export function applyRestored(spot: Spot, stored: Record<string, any>): Spot {
  const saved = stored[spot.id];
  return saved ? { ...spot, ...saved, checked: ago(saved.capturedAt) } : spot;
}

export const statusLabel: Record<Status, string> = {
  free: "Free",
  occupied: "Occupied",
  review: "Review",
  unscanned: "Not scanned",
};
