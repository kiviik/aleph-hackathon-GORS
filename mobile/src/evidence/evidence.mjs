// Turns detector output + prebaked band geometry into the observation contract the policy consumes.
// Extended per docs/hackaton/07-mobile.md with `roi` and `detections[].overlap_with_roi`.
//
// The invariant that matters: ABSENCE OF BOXES IS NOT EVIDENCE OF FREE SPACE. A gap becomes FREE
// only after the appearance guard (it must look like empty asphalt) and the temporal filter
// (MIN_TICKS consistent observations) both agree. Everything else is UNCERTAIN.
import { inBand } from '../core/band.mjs'
import { boxExtent } from '../core/scale.mjs'
import { MIN_TICKS, stableGaps } from '../core/temporal.mjs'
import { legality } from '../core/zones-rules.mjs'

// Quality thresholds. NOTE: these are starting points calibrated against the daytime fixture only.
// docs/hackaton/07-mobile.md requires calibration on real frames before they are trusted; night,
// rain and snow are untested.
export const DARK_LUMA = 45          // mean luma below this -> DARK
export const BLURRY_ENERGY = 3.5     // whole-frame mean gradient below this -> BLURRY
export const OCCLUDED_TEXTURED_FRAC = 0.7 // this much of the band flagged textured -> OCCLUDED

/** Normalised bounding box of the band corridor, as the ROI the model is being asked about. */
export function bandRoi (band, width, height) {
  const { p0, dir, length, halfWidth } = band
  const nx = -dir[1] * halfWidth, ny = dir[0] * halfWidth
  const ex = p0[0] + dir[0] * length, ey = p0[1] + dir[1] * length
  const xs = [p0[0] + nx, p0[0] - nx, ex + nx, ex - nx]
  const ys = [p0[1] + ny, p0[1] - ny, ey + ny, ey - ny]
  const x1 = Math.max(0, Math.min(...xs)), x2 = Math.min(width, Math.max(...xs))
  const y1 = Math.max(0, Math.min(...ys)), y2 = Math.min(height, Math.max(...ys))
  return {
    x: +(x1 / width).toFixed(4),
    y: +(y1 / height).toFixed(4),
    width: +((x2 - x1) / width).toFixed(4),
    height: +((y2 - y1) / height).toFixed(4)
  }
}

/** Fraction of a vehicle's along-axis extent that lies within the band. 0 when it is not in the band. */
export function overlapWithRoi (band, v) {
  if (!inBand(band, v.bottomCenter)) return 0
  const [lo, hi] = boxExtent(band, v.box)
  const span = hi - lo
  if (span <= 0) return 0
  const clipped = Math.min(band.length, hi) - Math.max(0, lo)
  return +Math.max(0, Math.min(1, clipped / span)).toFixed(3)
}

/**
 * Build the observation for one band.
 * @param {object} a
 * @param {object} a.band            prebaked band geometry
 * @param {object} a.scale           prebaked perspective fit
 * @param {object} a.bandState       persisted temporal state (survives across scans)
 * @param {object} a.guarded         result of guardGaps() for this frame
 * @param {object[]} a.vehicles      detected vehicles for this frame
 * @param {object} a.frame           {width, height, meanLuma, energy, stale, capturedAt}
 * @param {string} a.source
 */
export function buildObservation ({ band, scale, bandState, guarded, vehicles, frame, source = 'calgary-traffic-camera' }) {
  const stable = stableGaps(bandState, scale)
  const carsFit = stable.reduce((s, g) => s + g.carsFit, 0)
  const freeMetres = +stable.reduce((s, g) => s + g.metres, 0).toFixed(1)
  const inBandV = vehicles.filter((v) => inBand(band, v.bottomCenter))

  const quality = frameQuality({ band, guarded, vehicles: inBandV, frame })

  // State. Note the deliberate asymmetry: OCCUPIED needs positive evidence (vehicles actually seen
  // in the band); an empty detection list with no confirmed gap is UNCERTAIN, never FREE.
  //
  // Branch ORDER carries as much weight as the branches. FREE keeps precedence over OCCUPIED -- a
  // confirmed gap is still a gap when the rest of the band is parked up -- and stays behind the
  // tick gate, because a gap is only ever earned from temporal agreement. OCCUPIED is deliberately
  // NOT behind that gate: it is read off the vehicles in THIS frame and needs no history at all.
  // Gating it made a visibly packed curb report "review" for its first two scans, which is the
  // opposite of honest, and on a phone that scans on demand it was most spots most of the time.
  let state, explanation
  if (frame.stale) {
    state = 'UNCERTAIN'
    explanation = 'La cámara no se actualizó recientemente; la evidencia está vencida.'
  } else if (bandState.ticks >= MIN_TICKS && carsFit > 0) {
    state = 'FREE'
    explanation = `Hueco confirmado de ${freeMetres} m sobre el cordón (entran ~${carsFit}).`
  } else if (inBandV.length > 0) {
    state = 'OCCUPIED'
    explanation = `${inBandV.length} vehículo(s) ocupan el tramo observable.`
  } else if (bandState.ticks < MIN_TICKS) {
    state = 'UNCERTAIN'
    explanation = `Evidencia insuficiente: ${bandState.ticks} de ${MIN_TICKS} observaciones consistentes.`
  } else {
    state = 'UNCERTAIN'
    explanation = 'No se detectaron vehículos, pero tampoco un hueco medible: la ausencia de cajas no prueba que haya lugar.'
  }

  // Confidence is the temporal EMA over the confirmed gaps -- how consistently the curb read free.
  const confidence = state === 'FREE'
    ? +(stable.reduce((s, g) => s + g.confidence, 0) / stable.length).toFixed(2)
    : state === 'OCCUPIED' ? 0.9 : 0.5

  return {
    state,
    quality,
    confidence,
    explanation,
    roi: bandRoi(band, frame.width, frame.height),
    detections: inBandV.map((v) => ({
      label: v.label,
      confidence: v.score,
      parked: (v.dwell || 1) >= 2,
      overlap_with_roi: overlapWithRoi(band, v)
    })),
    gaps: stable,
    carsFit,
    freeMetres,
    ticks: bandState.ticks,
    source,
    capturedAt: frame.capturedAt
  }
}

/** USABLE / DARK / BLURRY / OCCLUDED, in that precedence. */
export function frameQuality ({ band, guarded, vehicles, frame }) {
  if (frame.meanLuma != null && frame.meanLuma < DARK_LUMA) return 'DARK'
  if (frame.energy != null && frame.energy < BLURRY_ENERGY) return 'BLURRY'
  const texturedPx = (guarded?.textured || []).reduce((s, [t1, t2]) => s + (t2 - t1), 0)
  if (band.length > 0 && texturedPx / band.length > OCCLUDED_TEXTURED_FRAC) return 'OCCLUDED'
  const wide = vehicles.some((v) => overlapWithRoi(band, v) > 0 && v.w > 0.6 * band.length)
  if (wide) return 'OCCLUDED'
  return 'USABLE'
}

/** Calgary open-data rules for this camera's zone, in the shape the policy expects. */
export function buildRules (zone, at = new Date()) {
  if (!zone) return { sourceStatus: 'UNAVAILABLE', parkingAllowed: false, confidence: 0, explanation: 'Sin zona de estacionamiento asociada.' }
  const l = legality(zone, at)
  return {
    sourceStatus: 'AVAILABLE',
    parkingAllowed: l.parkable,
    paid: l.paid,
    confidence: 1,
    explanation: l.parkable
      ? `Permitido ahora (${l.reason}).`
      : `Prohibido ahora: ${l.reason}.`,
    zoneId: zone.id,
    address: zone.address,
    enforceableTime: zone.enforceableTime,
    restrictTime: zone.restrictTime,
    maxTime: zone.maxTime
  }
}
