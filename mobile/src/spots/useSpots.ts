// Replaces the hardcoded SPOTS array in App.tsx with real detections.
//
// The Spot shape is preserved field-for-field on purpose: markers, callouts, the status filters,
// the legend and the saved tab all read from it and need no changes. Only the values become real.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cameras,
  nearestCameras,
  scanCamera,
  fixtureMeta,
  DEFAULT_NEARBY,
  type BandResult,
  type Camera,
} from "../scan/scan";
import { pointAlongZone, zoneHeading } from "../data/frames";
import type { PipelineStage, TraceEvent } from "../contracts";

export type Status = "free" | "occupied" | "review";

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
  scanned?: boolean;
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

/** A camera's bands, before anything has been scanned. Everything starts in "review". */
function seedSpots(): Spot[] {
  const out: Spot[] = [];
  for (const c of cameras as Camera[]) {
    for (const band of c.bands as any[]) {
      const [lng, lat] = pointAlongZone(c.zone, 0.5);
      const { street, number } = splitAddress(c.zone.address);
      out.push({
        id: `${c.id}-${band.id}`,
        cameraId: c.id,
        street,
        number,
        neighborhood: c.zone.brz || c.quadrant || "Calgary",
        status: "review",
        latitude: lat,
        longitude: lng,
        confidence: "—",
        checked: "not checked",
        heading: zoneHeading(c.zone),
        scanned: false,
        reason: "Sin escanear todavía.",
      });
    }
  }
  return out;
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
    confidence: o.confidence ? `${Math.round(o.confidence * 100)}%` : "—",
    checked: ago(o.capturedAt),
    carsFit: o.carsFit,
    freeMetres: o.freeMetres,
    decision: decision.decision,
    reason: decision.reason,
    rule: r.rules?.explanation,
    ticks: o.ticks,
    scanned: true,
  };
}

export type ScanProgress = { cameraId: string; stage: PipelineStage; status: TraceEvent["status"]; detail: string };

export function useSpots(userLocation: { latitude: number; longitude: number } | null) {
  const [spots, setSpots] = useState<Spot[]>(() => seedSpots());
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<ScanProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  const scan = useCallback(
    async (opts: { cameraIds?: string[]; count?: number } = {}) => {
      if (scanning) return;
      setScanning(true);
      setError(null);
      setProgress([]);

      const targets: Camera[] = opts.cameraIds
        ? (cameras as Camera[]).filter((c) => opts.cameraIds!.includes(c.id))
        : userLocation
          ? nearestCameras(userLocation.latitude, userLocation.longitude, opts.count ?? DEFAULT_NEARBY)
          : (cameras as Camera[]).slice(0, opts.count ?? DEFAULT_NEARBY);

      try {
        for (const camera of targets) {
          const { results } = await scanCamera(camera, {
            onStage: (stage, e) =>
              setProgress((p) => [...p, { cameraId: camera.id, stage, status: e.status!, detail: e.detail! }]),
          });
          if (cancelled.current) return;
          setSpots((current) =>
            current.map((s) => {
              const r = results.find((x) => `${x.cameraId}-${x.bandId}` === s.id);
              return r ? toSpot(s, r, camera) : s;
            })
          );
        }
        setLastScanAt(Date.now());
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setScanning(false);
      }
    },
    [scanning, userLocation]
  );

  const scannedCount = useMemo(() => spots.filter((s) => s.scanned).length, [spots]);

  return { spots, scanning, lastScanAt, progress, error, scan, scannedCount, fixtureMeta };
}
