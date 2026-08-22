// Calgary traffic-camera frame ingestion. Ported from the source repo's src/frames.mjs.
//
// Two deviations forced by React Native:
//  - fetch().arrayBuffer() is unreliable for binary bodies on RN, so this uses XHR with
//    responseType 'arraybuffer', which is not.
//  - AbortSignal.timeout() is not guaranteed on RN 0.81; XHR has its own timeout.
export const STALE_MS = 10 * 60 * 1000;

export type Frame = {
  jpeg: Uint8Array | null;
  capturedAt: number | null;
  fetchedAt: number;
  stale: boolean;
  error?: string;
};

export function fetchFrame(url: string, { timeoutMs = 15000 } = {}): Promise<Frame> {
  const fetchedAt = Date.now();
  return new Promise((resolve) => {
    const done = (f: Partial<Frame>) => resolve({ jpeg: null, capturedAt: null, fetchedAt, stale: true, ...f } as Frame);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.timeout = timeoutMs;
      xhr.setRequestHeader("cache-control", "no-cache");
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) return done({ error: `HTTP ${xhr.status}` });
        const lm = xhr.getResponseHeader("last-modified");
        const capturedAt = lm ? Date.parse(lm) : fetchedAt;
        const jpeg = new Uint8Array(xhr.response as ArrayBuffer);
        // A camera that is down often serves a tiny placeholder rather than an error.
        if (jpeg.length < 2000) return done({ capturedAt, error: "empty image" });
        resolve({ jpeg, capturedAt, fetchedAt, stale: fetchedAt - capturedAt > STALE_MS });
      };
      xhr.onerror = () => done({ error: "network error" });
      xhr.ontimeout = () => done({ error: `timeout after ${timeoutMs}ms` });
      xhr.send();
    } catch (e: any) {
      done({ error: String(e?.message || e) });
    }
  });
}

/** Great-circle metres. Ported from pipeline.mjs:haversineM. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Point at `fraction` along the baked zone endpoints -> [lng, lat]. Replaces turf's along(). */
export function pointAlongZone(zone: { p0: number[]; p1: number[] }, fraction: number): [number, number] {
  const f = Math.max(0, Math.min(1, fraction));
  return [zone.p0[0] + (zone.p1[0] - zone.p0[0]) * f, zone.p0[1] + (zone.p1[1] - zone.p0[1]) * f];
}

/** Compass bearing of the zone line, so Street View can face the curb instead of due north. */
export function zoneHeading(zone: { p0: number[]; p1: number[] }): number {
  const [lng1, lat1] = zone.p0;
  const [lng2, lat2] = zone.p1;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
