// Perspective scale per band: pixels-per-metre along the axis, learned from parked car lengths.
import { isParked } from './stationary.mjs'
import { inBand } from './band.mjs'
import { projectToAxis, theilSen, percentile } from './geom.mjs'

export const CAR_LENGTH_M = 4.6 // median parked passenger car incl. typical spacing ~0
export const MIN_PX_PER_M = 1

/** Extent of a box projected on the band axis: [tMin, tMax]. */
export function boxExtent (band, box) {
  const corners = [[box[0], box[3]], [box[2], box[3]], [box[0], box[1]], [box[2], box[1]]]
  let lo = Infinity, hi = -Infinity
  for (const c of corners) { const { t } = projectToAxis(band, c); lo = Math.min(lo, t); hi = Math.max(hi, t) }
  return [lo, hi]
}

/** Only the bottom edge (ground contact) to avoid the box's height leaking into length on steep views. */
export function groundExtent (band, box) {
  const a = projectToAxis(band, [box[0], box[3]]).t, b = projectToAxis(band, [box[2], box[3]]).t
  return a < b ? [a, b] : [b, a]
}

/**
 * Fit pxPerMetre(t) = a + b·t from parked cars supporting the band.
 * @returns {a, b, samples, ok}
 */
export function fitScale (band, observations) {
  const ts = [], lens = []
  for (const obs of observations) {
    for (const v of obs.vehicles) {
      if (!isParked(v) || v.label !== 'car' || !inBand(band, v.bottomCenter)) continue
      const [lo, hi] = boxExtent(band, v.box)
      const len = hi - lo
      if (len <= 2) continue
      ts.push((lo + hi) / 2); lens.push(len)
    }
  }
  if (lens.length < 5) return { a: NaN, b: 0, samples: lens.length, ok: false }
  // trim extreme lengths (partially occluded / merged boxes)
  const lo = percentile(lens, 0.1), hi = percentile(lens, 0.9)
  const T = [], L = []
  for (let i = 0; i < lens.length; i++) if (lens[i] >= lo && lens[i] <= hi) { T.push(ts[i]); L.push(lens[i]) }
  const fit = theilSen(T, L)
  let a = fit.a / CAR_LENGTH_M, b = fit.b / CAR_LENGTH_M
  // guard positivity along the band
  const atEnd = a + b * band.length
  if (a < MIN_PX_PER_M || atEnd < MIN_PX_PER_M) { a = Math.max(MIN_PX_PER_M, (fit.a + fit.b * band.length / 2) / CAR_LENGTH_M); b = 0 }
  return { a: +a.toFixed(4), b: +b.toFixed(6), samples: L.length, ok: true }
}

export function pxPerMetre (scale, t) { return Math.max(MIN_PX_PER_M, scale.a + scale.b * t) }

/** Metres spanned by [t1, t2] along the axis: ∫ dt / pxPerMetre(t). */
export function metresBetween (scale, t1, t2) {
  if (t2 <= t1) return 0
  const { a, b } = scale
  if (Math.abs(b) < 1e-9) return (t2 - t1) / Math.max(MIN_PX_PER_M, a)
  const f1 = Math.max(MIN_PX_PER_M, a + b * t1), f2 = Math.max(MIN_PX_PER_M, a + b * t2)
  return Math.log(f2 / f1) / b
}

/** Pixels along the axis that cover `metres` starting at t (first-order). */
export function pxForMetres (scale, t, metres) { return metres * pxPerMetre(scale, t) }

export const EXTEND_CAR_LENGTHS = 2

/**
 * Extend a learned band past each end by up to EXTEND_CAR_LENGTHS car lengths (in local pixels), clipped to the
 * frame. Parked cars only teach where cars *have* parked; the extension lets the gap logic — and the
 * asphalt-texture guard — judge the curb just beyond them. Returns a new band and a re-parametrised scale.
 */
export function extendBand (band, scale, width, height, carLengths = EXTEND_CAR_LENGTHS) {
  if (!scale?.ok) return { band, scale }
  const margin = 4
  const fits = (p) => p[0] >= margin && p[0] <= width - margin && p[1] >= margin && p[1] <= height - margin
  const want0 = pxForMetres(scale, 0, carLengths * CAR_LENGTH_M)
  const want1 = pxForMetres(scale, band.length, carLengths * CAR_LENGTH_M)
  // shrink each extension until its end point lies inside the frame
  let ext0 = want0, ext1 = want1
  const at = (t) => [band.p0[0] + band.dir[0] * t, band.p0[1] + band.dir[1] * t]
  while (ext0 > 0 && !fits(at(-ext0))) ext0 = Math.max(0, ext0 - 4)
  while (ext1 > 0 && !fits(at(band.length + ext1))) ext1 = Math.max(0, ext1 - 4)
  if (ext0 === 0 && ext1 === 0) return { band, scale }
  const length = band.length + ext0 + ext1
  const p0 = at(-ext0), p1 = at(band.length + ext1)
  const out = { ...band, p0: p0.map((v) => +v.toFixed(1)), p1: p1.map((v) => +v.toFixed(1)), length: +length.toFixed(1), coreT: [+ext0.toFixed(1), +(ext0 + band.length).toFixed(1)] }
  // px/m = a + b·t with t' = t + ext0  →  a' = a − b·ext0
  return { band: out, scale: { ...scale, a: +(scale.a - scale.b * ext0).toFixed(4) } }
}
