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
 *
 * KNOWN BIAS, deliberately left in place. `boxExtent` projects all four corners of the box, so it
 * adds h·|dir_y| -- pure box height leaking into "length". Measured on the golden frame that is
 * +1.5-1.9 m per car on camera 76's near band and +2.5-3.1 m on its far one, and the two bands are
 * biased by different amounts because they sit at different angles.
 *
 * It is not fixed by swapping in `groundExtent` here: `computeGaps` shares the same extent
 * function, so the errors currently cancel in the conservative direction (a car measures 4.6 m by
 * construction, while an empty stretch -- which has no height to inflate -- reads 1.5-2.6x SHORT,
 * so real gaps get dropped at MIN_GAP_M rather than invented). Changing only the fit would flip
 * that optimistic and manufacture free space; changing both is also wrong, because `groundExtent`
 * measures a near-end-on car at 1.3-1.5 m.
 *
 * The real fix is to fit px/m from the median centre-to-centre spacing of ADJACENT parked cars
 * (5.5-6.0 m, no height leakage at any view angle), which must ship together with a re-learn of
 * every scale plus an `extentModel` field in bands.json so the fixture and this module cannot
 * drift apart. Until then, gap metres here are conservative, and `bandSpanM / slots` reads
 * 2.0-3.0 m per slot on several cameras -- physically impossible for parallel parking, and the
 * signal that this is still outstanding.
 *
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
 * ... but never more than this share of what the band actually observed, per end.
 *
 * Two car lengths is an absolute figure, and on a short band it is nearly all extrapolation:
 * measured over real history, camera 76's far curb learned 9.6 m of parked cars and was padded
 * with 21.3 m of guessed curb (2.2x its own evidence), and camera 164's second band reached across
 * a crosswalk into the intersection. Extending past a few observed slots is not "judging the curb
 * just beyond the parked cars" any more, it is inventing curb.
 */
export const EXTEND_MAX_FRAC_OF_CORE = 0.5

/**
 * Extend a learned band past each end by up to EXTEND_CAR_LENGTHS car lengths (in local pixels), clipped to the
 * frame. Parked cars only teach where cars *have* parked; the extension lets the gap logic — and the
 * asphalt-texture guard — judge the curb just beyond them. Returns a new band and a re-parametrised scale.
 */
export function extendBandBounded (band, scale, width, height, { maxFracOfCore = EXTEND_MAX_FRAC_OF_CORE } = {}) {
  if (!scale?.ok) return { band, scale }
  const [c0, c1] = Array.isArray(band.coreT) && band.coreT.length === 2 ? band.coreT : [0, band.length]
  const coreM = metresBetween(scale, Math.min(c0, c1), Math.max(c0, c1))
  const allowedM = Math.min(EXTEND_CAR_LENGTHS * CAR_LENGTH_M, maxFracOfCore * coreM)
  return extendBand(band, scale, width, height, allowedM / CAR_LENGTH_M)
}

/**
 * Enforce the EXTEND_MAX_FRAC_OF_CORE bound on a band that is ALREADY extended.
 *
 * `extendBandBounded` only binds geometry this module produces. Every band in the shipped fixture
 * predates it: they come from `state.json`, padded in the research repo by a flat two car lengths
 * per end with no relation to how much curb was observed. Measured against their own cores, all
 * fourteen are over — camera 76's far curb carries 20.4 m of guessed curb on 8.9 m of evidence, and
 * camera 169 carries 23.9 m on 7.0 m. That guessed curb is where the false "free" readings live:
 * camera 219 offered 10.3 m of parking across an intersection, entirely outside its core.
 *
 * Trimming is done in metres, per end, so perspective does not hand the near end a longer
 * extension than the far one just for being closer to the camera. Returns a new band and a
 * re-parametrised scale; a band already inside the bound is returned untouched.
 */
export function clampBandExtension (band, scale, { maxFracOfCore = EXTEND_MAX_FRAC_OF_CORE, maxCarLengths = EXTEND_CAR_LENGTHS } = {}) {
  if (!scale?.ok || !Array.isArray(band.coreT) || band.coreT.length !== 2) return { band, scale }
  const c0 = Math.min(band.coreT[0], band.coreT[1])
  const c1 = Math.max(band.coreT[0], band.coreT[1])
  if (!(c1 > c0) || c0 < 0 || c1 > band.length) return { band, scale }

  const allowedM = Math.min(maxCarLengths * CAR_LENGTH_M, maxFracOfCore * metresBetween(scale, c0, c1))
  // Walk inward from each end until the remaining extension fits in `allowedM`.
  const trim0 = bisect(0, c0, (t) => metresBetween(scale, t, c0), allowedM)
  const trim1 = (band.length - c1) - bisect(0, band.length - c1, (d) => metresBetween(scale, c1, c1 + d), allowedM)
  if (trim0 < 0.5 && trim1 < 0.5) return { band, scale }

  const at = (t) => [band.p0[0] + band.dir[0] * t, band.p0[1] + band.dir[1] * t]
  const length = band.length - trim0 - trim1
  const p0 = at(trim0), p1 = at(band.length - trim1)
  const out = {
    ...band,
    p0: p0.map((v) => +v.toFixed(1)),
    p1: p1.map((v) => +v.toFixed(1)),
    length: +length.toFixed(1),
    coreT: [+(c0 - trim0).toFixed(1), +(c1 - trim0).toFixed(1)]
  }
  // px/m = a + b·t with t' = t − trim0  →  a' = a + b·trim0
  return { band: out, scale: { ...scale, a: +(scale.a + scale.b * trim0).toFixed(4) } }
}

/**
 * The x in [lo, hi] where a monotone f(x) meets `target`, clamped to the interval when it never
 * does. Direction is read off the endpoints, so the same call serves both ends of the band —
 * metres shrink as the start walks inward and grow as the end walks outward.
 */
function bisect (lo, hi, f, target) {
  const flo = f(lo), fhi = f(hi)
  if ((flo - target) * (fhi - target) >= 0) return Math.abs(flo - target) <= Math.abs(fhi - target) ? lo : hi
  const rising = fhi > flo
  let a = lo, b = hi
  for (let i = 0; i < 48; i++) {
    const m = (a + b) / 2
    if ((f(m) < target) === rising) a = m; else b = m
  }
  return (a + b) / 2
}

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
