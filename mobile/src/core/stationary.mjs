// Parked vs moving: a vehicle is parked when the same box persists across consecutive distinct frames.
import { iou } from './geom.mjs'

export const MATCH_IOU = 0.5
export const PARKED_DWELL = 2 // consecutive frames (camera refreshes, minutes apart)
export const MAX_MISSED = 1   // a track survives this many frames without a detection (flicker on small/far boxes)
export const SIG_MAX_DIST = 12      // mean |Δ| over the 2x2 RGB colour signature (same car across frames: ~1–6; a different car: 20+)
export const SIG_MAX_DIST_NORM = 8  // same, after removing each signature's mean brightness (clouds / sun)

/** Same vehicle by appearance? Colour signatures (see detector-client) — missing signatures (old history) match. */
export function sameSignature (a, b) {
  if (!a || !b || a.length !== b.length) return true
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n
  let d = 0, dn = 0
  for (let i = 0; i < n; i++) { d += Math.abs(a[i] - b[i]); dn += Math.abs((a[i] - ma) - (b[i] - mb)) }
  return d / n <= SIG_MAX_DIST || dn / n <= SIG_MAX_DIST_NORM
}

/** Same physical vehicle? IoU, or (for small jittery boxes) centre shift small relative to size and similar area. */
export function sameBox (a, b) {
  if (iou(a, b) >= MATCH_IOU) return true
  const aw = a[2] - a[0], ah = a[3] - a[1], bw = b[2] - b[0], bh = b[3] - b[1]
  const size = Math.max(aw, ah, bw, bh)
  const dx = (a[0] + a[2] - b[0] - b[2]) / 2, dy = (a[1] + a[3] - b[1] - b[3]) / 2
  const areaRatio = (aw * ah) / Math.max(1, bw * bh)
  return Math.hypot(dx, dy) < 0.3 * size && areaRatio > 0.5 && areaRatio < 2
}

/**
 * Annotate each vehicle in each observation with `dwell` = number of consecutive frames (including this one)
 * in which a matching box was present (tolerating MAX_MISSED gaps). Mutates and returns observations (oldest first).
 */
export function annotateDwell (observations) {
  tracksFromHistory(observations)
  return observations
}

/** Run tracking over a history (annotating dwell on the way) and return the final track list. */
export function tracksFromHistory (observations) {
  let tracks = [] // [{box, dwell, missed}]
  for (const obs of observations) tracks = stepTracks(tracks, obs.vehicles)
  return tracks
}

/** One tracking step: assigns dwell to `vehicles`, returns the new track list (matched + carried-over). */
export function stepTracks (tracks, vehicles) {
  const used = new Set()
  const next = []
  // greedy: highest-dwell tracks first so a long-parked car keeps its history
  const order = [...tracks.keys()].sort((i, j) => tracks[j].dwell - tracks[i].dwell)
  const assigned = new Set()
  for (const ti of order) {
    const t = tracks[ti]
    let best = null, bestIou = -1
    for (let vi = 0; vi < vehicles.length; vi++) {
      if (assigned.has(vi) || !sameBox(t.box, vehicles[vi].box) || !sameSignature(t.sig, vehicles[vi].sig)) continue
      const s = iou(t.box, vehicles[vi].box)
      if (s > bestIou) { bestIou = s; best = vi }
    }
    if (best != null) {
      assigned.add(best); used.add(ti)
      const v = vehicles[best]
      v.dwell = t.dwell + 1
      next.push({ box: v.box, sig: v.sig, dwell: v.dwell, missed: 0 })
    } else if (t.missed < MAX_MISSED) {
      next.push({ box: t.box, sig: t.sig, dwell: t.dwell, missed: t.missed + 1 })
    }
  }
  for (let vi = 0; vi < vehicles.length; vi++) {
    if (assigned.has(vi)) continue
    vehicles[vi].dwell = 1
    next.push({ box: vehicles[vi].box, sig: vehicles[vi].sig, dwell: 1, missed: 0 })
  }
  return next
}

export function isParked (v) { return (v.dwell || 1) >= PARKED_DWELL }

/** Incremental form for the live pipeline: returns updated tracks. */
export function annotateLatest (tracks, vehicles) {
  return stepTracks(tracks || [], vehicles)
}
