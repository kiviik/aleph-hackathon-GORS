// Band membership test, extracted from the source repo's src/bands.mjs.
// The band *learner* deliberately does not ship to mobile: it needs ~20 distinct frames
// (~30-40 min) of history per camera. Learned bands arrive as a fixture (src/data/bands.json).
import { projectToAxis } from './geom.mjs'

/** Is point p inside the band corridor (within halfWidth, and along the axis with slack)? */
export function inBand (band, p, slack = 0.15) {
  const { t, n } = projectToAxis(band, p)
  return Math.abs(n) <= band.halfWidth && t >= -slack * band.length && t <= band.length * (1 + slack)
}

/**
 * Assign every detection to at most one band. Opposite curbs converge in perspective, so their
 * corridors can overlap near the vanishing point; counting the same car in both bands corrupts
 * occupancy and gap measurements. The closest centreline, normalised by corridor width, wins.
 */
export function assignVehiclesToBands (bands, vehicles) {
  const out = Object.fromEntries(bands.map((band) => [band.id, []]))
  for (const vehicle of vehicles) {
    let best = null
    for (const band of bands) {
      if (!inBand(band, vehicle.bottomCenter)) continue
      const { n } = projectToAxis(band, vehicle.bottomCenter)
      const distance = Math.abs(n) / Math.max(1, band.halfWidth)
      if (!best || distance < best.distance) best = { band, distance }
    }
    if (best) out[best.band.id].push(vehicle)
  }
  return out
}
