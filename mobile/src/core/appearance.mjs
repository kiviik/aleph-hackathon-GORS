// Appearance guard: a curb interval may only be called "free" if it *looks like empty asphalt*.
// YOLO26s misses tightly stacked, steep rear-view parked cars; without this guard a missed car reads as free space.
// Texture (mean gradient magnitude) of the strip where a car body would be is compared with the texture of
// vehicles detected in the same frame (lighting/blur invariant): asphalt is flat, a car is not.
import { pxPerMetre, pxForMetres, metresBetween } from './scale.mjs'
import { MIN_GAP_M, CAR_SLOT_M } from './gaps.mjs'
import { inBand } from './band.mjs'

export const TEXTURE_RATIO = 0.5      // gap texture must be below this fraction of the vehicle reference
export const TEXTURE_ABS_MAX = 12     // ... and below this absolute mean gradient (0-255 scale)
export const FALLBACK_REF = 16        // reference when no vehicle is visible in the frame
export const CELL_M = 1.0             // along-band sampling cell


/** Mean gradient magnitude over a set of integer sample points. */
export function energyAt (gray, points) {
  const { data, width, height } = gray
  let sum = 0, n = 0
  for (const [x, y] of points) {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 1 || yi < 1 || xi >= width - 1 || yi >= height - 1) continue
    const i = yi * width + xi
    const gx = data[i + 1] - data[i - 1], gy = data[i + width] - data[i - width]
    sum += Math.hypot(gx, gy) / 2; n++
  }
  return n ? sum / n : null
}

/** Texture inside a detection box (inner 70%). */
export function boxEnergy (gray, box) {
  const [x1, y1, x2, y2] = box
  const w = x2 - x1, h = y2 - y1
  const pts = []
  const step = Math.max(1, Math.floor(Math.min(w, h) / 12))
  for (let y = y1 + 0.15 * h; y <= y2 - 0.15 * h; y += step) for (let x = x1 + 0.15 * w; x <= x2 - 0.15 * w; x += step) pts.push([x, y])
  return energyAt(gray, pts)
}

/** Median texture of vehicles (preferring those in the band) — the "this is what a car looks like here" reference. */
export function vehicleReference (gray, vehicles, bandVehicles = []) {
  const pick = (list) => list.filter((v) => v.w >= 10 && v.h >= 10).map((v) => boxEnergy(gray, v.box)).filter((e) => e != null).sort((a, b) => a - b)
  let e = pick(bandVehicles)
  if (e.length < 2) e = pick(vehicles)
  return e.length ? e[e.length >> 1] : FALLBACK_REF
}

/** Sample points covering where a car body would sit over band parameter [t1,t2]: from the axis line upward ~0.7 box heights. */
function stripPoints (band, scale, t1, t2) {
  const midScale = pxPerMetre(scale, band.length / 2)
  const pts = []
  for (let t = t1; t <= t2; t += 2) {
    const boxH = band.meanBoxH * (pxPerMetre(scale, t) / midScale)
    const ax = band.p0[0] + band.dir[0] * t, ay = band.p0[1] + band.dir[1] * t
    const hw = Math.min(band.halfWidth, 0.25 * boxH)
    for (let n = -hw; n <= hw; n += 3) {
      const bx = ax - band.dir[1] * n, by = ay + band.dir[0] * n
      for (let k = 0.1; k <= 0.7; k += 0.15) pts.push([bx, by - k * boxH])
    }
  }
  return pts
}

/**
 * Split each free gap into CELL_M cells, drop textured cells (→ unknown), return surviving free gaps.
 * Mutates nothing; returns a new gap result {occupied, unknown, free, textured:[[t1,t2]]}.
 */
export function guardGaps (gray, band, scale, gapResult, vehicles) {
  const inBandV = vehicles.filter((v) => inBand(band, v.bottomCenter))
  const ref = vehicleReference(gray, vehicles, inBandV)
  const thr = Math.min(TEXTURE_ABS_MAX, TEXTURE_RATIO * ref)
  const free = [], textured = []
  for (const g of gapResult.free) {
    let runStart = null
    const cells = []
    for (let t = g.t1; t < g.t2;) {
      const len = Math.max(4, pxForMetres(scale, t, CELL_M))
      const tEnd = Math.min(g.t2, t + len)
      const e = energyAt(gray, stripPoints(band, scale, t, tEnd))
      cells.push({ t1: t, t2: tEnd, ok: e != null && e <= thr, e })
      t = tEnd
    }
    const flush = (t1, t2) => {
      const metres = metresBetween(scale, t1, t2)
      if (metres >= MIN_GAP_M) free.push({ t1: r1(t1), t2: r1(t2), metres: +metres.toFixed(1), carsFit: Math.floor(metres / CAR_SLOT_M), centreT: r1((t1 + t2) / 2) })
    }
    for (const c of cells) {
      if (c.ok) { if (runStart == null) runStart = c.t1; continue }
      textured.push([r1(c.t1), r1(c.t2)])
      if (runStart != null) { flush(runStart, c.t1); runStart = null }
    }
    if (runStart != null) flush(runStart, g.t2)
  }
  return { ...gapResult, free, textured, textureRef: +ref.toFixed(1), textureThr: +thr.toFixed(1) }
}

function r1 (v) { return +v.toFixed(1) }
