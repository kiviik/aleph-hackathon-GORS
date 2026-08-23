// Band membership test, extracted from the source repo's src/bands.mjs.
// The band *learner* deliberately does not ship to mobile: it needs ~20 distinct frames
// (~30-40 min) of history per camera. Learned bands arrive as a fixture (src/data/bands.json).
import { projectToAxis } from './geom.mjs'
import { pxPerMetre } from './scale.mjs'

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
