// Laptop-only parking-band learner. Nothing imports this from the mobile runtime bundle.
//
// The important choice is iterative extraction: fit one narrow curb line, remove only its
// inliers, then fit another. A single global fit widens its corridor until cars parked on both
// sides of a street look like one band, producing false occupancy and badly measured gaps.
import { median, percentile, projectToAxis } from './geom.mjs'
import { isParked } from './stationary.mjs'

export const DEFAULT_LEARNING_OPTIONS = Object.freeze({
  maxBands: 4,
  minSupport: 12,
  minFrames: 4,
  minSlots: 3,
  minPairSpan: 50,
  residualHeightFraction: 0.32,
  minResidualPx: 3,
  maxResidualPx: 14
})

/**
 * Learn independent image-space curb bands from tracked observations.
 * Vehicles need dwell >= 2; callers with raw detections should run annotateDwell first.
 */
export function learnBands (observations, options = {}) {
  const opts = { ...DEFAULT_LEARNING_OPTIONS, ...options }
  let remaining = candidatesFrom(observations)
  const bands = []

  while (bands.length < opts.maxBands && remaining.length >= opts.minSupport) {
    const seed = bestLine(remaining, opts)
    if (!seed) break

    const first = inliersFor(seed, remaining, opts)
    const refined = fitOrthogonal(first)
    const inliers = inliersFor(refined, remaining, opts)
    const band = buildBand(refined, inliers, bands.length, opts)
    if (!band) break

    bands.push(band)
    // Peel a slightly wider corridor than the acceptance threshold so edge jitter from the first
    // curb cannot be rediscovered as a duplicate second band.
    remaining = remaining.filter((point) => perpendicular(refined, point) > threshold(point, opts) * 1.35)
  }

  return bands.sort((a, b) => b.support - a.support).map((band, i) => ({ ...band, id: `b${i}` }))
}

function candidatesFrom (observations) {
  const points = []
  for (let frame = 0; frame < observations.length; frame++) {
    for (const vehicle of observations[frame].vehicles || []) {
      if (vehicle.label !== 'car' || !isParked(vehicle) || !vehicle.bottomCenter) continue
      const [x, y] = vehicle.bottomCenter
      if (![x, y].every(Number.isFinite)) continue
      const boxW = vehicle.box ? vehicle.box[2] - vehicle.box[0] : 1
      const boxH = vehicle.box ? vehicle.box[3] - vehicle.box[1] : 1
      points.push({
        x, y, frame,
        h: Math.max(1, Number.isFinite(vehicle.h) ? vehicle.h : boxH),
        w: Math.max(1, Number.isFinite(vehicle.w) ? vehicle.w : boxW),
        weight: Math.min(6, vehicle.dwell || 2)
      })
    }
  }
  return points
}

function bestLine (points, opts) {
  // Use a deterministic, bounded seed set. Repeated detections of the same parked car do not add
  // useful hypotheses and would otherwise make pair enumeration needlessly quadratic.
  const seeds = spatialSeeds(points, 160)
  let best = null
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const line = lineThrough(seeds[i], seeds[j], opts.minPairSpan)
      if (!line) continue
      const inliers = inliersFor(line, points, opts)
      const stats = supportStats(line, inliers, opts)
      if (!stats.ok) continue
      if (!best || stats.score > best.score) best = { ...line, score: stats.score }
    }
  }
  return best
}

function spatialSeeds (points, limit) {
  const cells = new Map()
  for (const point of points) {
    const key = `${Math.round(point.x / 6)}:${Math.round(point.y / 6)}`
    const prior = cells.get(key)
    if (!prior || point.weight > prior.weight) cells.set(key, point)
  }
  const unique = [...cells.values()]
  if (unique.length <= limit) return unique
  const step = unique.length / limit
  return Array.from({ length: limit }, (_, i) => unique[Math.floor(i * step)])
}

function lineThrough (a, b, minSpan) {
  const dx0 = b.x - a.x, dy0 = b.y - a.y
  const length = Math.hypot(dx0, dy0)
  if (length < minSpan) return null
  let dx = dx0 / length, dy = dy0 / length
  if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy }
  return { x: a.x, y: a.y, dx, dy }
}

function inliersFor (line, points, opts) {
  return points.filter((point) => perpendicular(line, point) <= threshold(point, opts))
}

function perpendicular (line, point) {
  return Math.abs(-(point.x - line.x) * line.dy + (point.y - line.y) * line.dx)
}

function threshold (point, opts) {
  return Math.max(opts.minResidualPx, Math.min(opts.maxResidualPx, opts.residualHeightFraction * point.h))
}

function supportStats (line, points, opts) {
  if (points.length < opts.minSupport) return { ok: false, score: 0 }
  const frames = new Set(points.map((point) => point.frame)).size
  if (frames < opts.minFrames) return { ok: false, score: 0 }
  const ts = points.map((point) => along(line, point))
  const span = percentile(ts, 0.95) - percentile(ts, 0.05)
  const slots = distinctSlots(ts, median(points.map((point) => point.w)))
  if (slots < opts.minSlots || span < opts.minPairSpan) return { ok: false, score: 0 }
  const score = points.reduce((sum, point) => sum + point.weight, 0) + frames * 2 + slots * 4 + span * 0.02
  return { ok: true, score, frames, slots, span }
}

function distinctSlots (values, boxWidth) {
  const gap = Math.max(8, boxWidth * 0.45)
  const sorted = [...values].sort((a, b) => a - b)
  let count = 0, last = -Infinity
  for (const value of sorted) {
    if (value - last < gap) continue
    count++; last = value
  }
  return count
}

function fitOrthogonal (points) {
  const weight = points.reduce((sum, point) => sum + point.weight, 0)
  const x = points.reduce((sum, point) => sum + point.x * point.weight, 0) / weight
  const y = points.reduce((sum, point) => sum + point.y * point.weight, 0) / weight
  let xx = 0, xy = 0, yy = 0
  for (const point of points) {
    const dx = point.x - x, dy = point.y - y
    xx += point.weight * dx * dx; xy += point.weight * dx * dy; yy += point.weight * dy * dy
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
  let dx = Math.cos(angle), dy = Math.sin(angle)
  if (dx < 0 || (Math.abs(dx) < 1e-9 && dy < 0)) { dx = -dx; dy = -dy }
  return { x, y, dx, dy }
}

function buildBand (line, points, index, opts) {
  const stats = supportStats(line, points, opts)
  if (!stats.ok) return null
  const ts = points.map((point) => along(line, point))
  const start = percentile(ts, 0.03), end = percentile(ts, 0.97)
  const length = end - start
  if (length < opts.minPairSpan) return null
  const p0 = [line.x + line.dx * start, line.y + line.dy * start]
  const p1 = [line.x + line.dx * end, line.y + line.dy * end]
  const residuals = points.map((point) => perpendicular(line, point))
  const meanBoxH = median(points.map((point) => point.h))
  const halfWidth = Math.max(4, Math.min(opts.maxResidualPx, percentile(residuals, 0.95) + 2))
  return {
    id: `b${index}`,
    p0: p0.map(r1), p1: p1.map(r1),
    dir: [r4(line.dx), r4(line.dy)],
    length: r1(length), halfWidth: r1(halfWidth), meanBoxH: r1(meanBoxH),
    coreT: [0, r1(length)], slots: stats.slots, support: points.length
  }
}

function along (line, point) {
  return (point.x - line.x) * line.dx + (point.y - line.y) * line.dy
}

function r1 (value) { return +value.toFixed(1) }
function r4 (value) { return +value.toFixed(4) }

/** Signed separation between two band centrelines at the first band's midpoint; useful in audits. */
export function bandSeparation (a, b) {
  const midpoint = [b.p0[0] + b.dir[0] * b.length / 2, b.p0[1] + b.dir[1] * b.length / 2]
  return Math.abs(projectToAxis(a, midpoint).n)
}
