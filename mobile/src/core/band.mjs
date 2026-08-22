// Band membership test, extracted from the source repo's src/bands.mjs.
// The band *learner* deliberately does not ship to mobile: it needs ~20 distinct frames
// (~30-40 min) of history per camera. Learned bands arrive as a fixture (src/data/bands.json).
import { projectToAxis } from './geom.mjs'

/** Is point p inside the band corridor (within halfWidth, and along the axis with slack)? */
export function inBand (band, p, slack = 0.15) {
  const { t, n } = projectToAxis(band, p)
  return Math.abs(n) <= band.halfWidth && t >= -slack * band.length && t <= band.length * (1 + slack)
}
