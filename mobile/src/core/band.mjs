// Band membership test, extracted from the source repo's src/bands.mjs.
// The band *learner* deliberately does not ship to mobile: it needs ~20 distinct frames
// (~30-40 min) of history per camera. Learned bands arrive as a fixture (src/data/bands.json).
import { projectToAxis } from './geom.mjs'
import { pxPerMetre } from './scale.mjs'

/** The band parameter interval the learner actually saw cars in, falling back to the whole band. */
export function coreRange (band) {
  const [t0, t1] = Array.isArray(band.coreT) && band.coreT.length === 2 ? band.coreT : [0, band.length]
  return [Math.max(0, Math.min(t0, t1)), Math.min(band.length, Math.max(t0, t1))]
}

/**
 * The stretch of the band FREE space may be claimed on.
 *
 * `freeT` is baked from collected history: the run of the band that parked cars have actually
 * covered, at a support threshold, so one mis-tracked car cannot open a junction. It is wider and
 * more honest than the fitted core, which is anchor-based and inlier-filtered — camera 27 and
 * camera 76's near curb turn out to be parkable end to end, and clipping them to their cores threw
 * away most of their real free space.
 *
 * Without it the core is the fallback, because the core is still *observation*, where the padded
 * ends of the band are not. Cameras with no collected history therefore read conservatively until
 * `npm run bake:freerange` has something to work from.
 */
export function freeRange (band) {
  const raw = Array.isArray(band.freeT) && band.freeT.length === 2 ? band.freeT : coreRange(band)
  return [Math.max(0, Math.min(raw[0], raw[1])), Math.min(band.length, Math.max(raw[0], raw[1]))]
}

/** Is point p inside the band corridor (within halfWidth, and along the axis with slack)? */
export function inBand (band, p, slack = 0.15) {
  const { t, n } = projectToAxis(band, p)
  return Math.abs(n) <= band.halfWidth && t >= -slack * band.length && t <= band.length * (1 + slack)
}

/**
 * Assign every detection to at most one band. Opposite curbs converge in perspective, so their
 * corridors can overlap near the vanishing point; counting the same car in both bands corrupts
 * occupancy and gap measurements. The closest centreline wins.
 *
 * Distance is measured in *metres* when every contending band has a fitted scale, because
 * `halfWidth` is itself a product of perspective — the nearer curb gets the wider corridor
 * (21.1 px vs 13.6 px at camera 76), so normalising by it would systematically hand contested
 * cars to the near band. Without scales it falls back to the corridor-relative measure, which is
 * all the older fixtures support.
 *
 * @param {any[]} bands
 * @param {any[]} vehicles
 * @param {Record<string, any>|null} [scales]
 * @returns {Record<string, any[]>}
 */
export function assignVehiclesToBands (bands, vehicles, scales = null) {
  const out = Object.fromEntries(bands.map((band) => [band.id, []]))
  const inMetres = bands.length > 0 && bands.every((band) => scales?.[band.id]?.ok)
  for (const vehicle of vehicles) {
    let best = null
    for (const band of bands) {
      if (!inBand(band, vehicle.bottomCenter)) continue
      const { t, n } = projectToAxis(band, vehicle.bottomCenter)
      const distance = inMetres
        ? Math.abs(n) / pxPerMetre(scales[band.id], t)
        : Math.abs(n) / Math.max(1, band.halfWidth)
      if (!best || distance < best.distance) best = { band, distance }
    }
    if (best) out[best.band.id].push(vehicle)
  }
  return out
}
