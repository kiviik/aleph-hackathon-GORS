// Laptop-only parking-band learner. Nothing imports this from the mobile runtime bundle.
//
// The important choice is iterative extraction: fit one narrow curb line, remove only its
// inliers, then fit another. A single global fit widens its corridor until cars parked on both
// sides of a street look like one band, producing false occupancy and badly measured gaps.
//
// Finding straight lines of stationary boxes is the easy half. The hard half is that a city street
// is full of straight lines of stationary boxes that are NOT parking: a queue at a red light, the
// travel lane itself at one frame per minute, an off-street lot, a median strip with traffic on
// both sides. Run against real camera history, line-fitting alone produced four "bands" for a
// street with two curbs. The four rejection tests in buildBand are ported from the research repo
// (calgary-free-parking, src/bands.mjs), where they were tuned against 208 cameras.
import { median, percentile, projectToAxis } from './geom.mjs'

export const DEFAULT_LEARNING_OPTIONS = Object.freeze({
  maxBands: 4,
  minSupport: 12,
  minFrames: 4,
  minSlots: 3,
  minPairSpan: 50,
  residualHeightFraction: 0.32,
  minResidualPx: 3,
  maxResidualPx: 14,
  /** Frames a vehicle must persist to count as parked for LEARNING; the live path uses PARKED_DWELL. */
  learnDwell: 3,
  maxDwellWeight: 10,
  /** A queue re-occupying a spot rarely chains this long; a parked car does. Grows with history. */
  longDwell: 6,
  longDwellFrac: 0.15,
  longDwellMax: 20,
  minLongFrac: 0.5,
  minMedianDwell: 5,
  /** moving / (moving + parked) observations inside the corridor; more means it is a travel lane. */
  maxMovingRatio: 0.4,
  /** Moving vehicles per frame passing BESIDE the corridor; less means an off-street lot. */
  minMovingNear: 0.5,
  /**
   * Share of that passing traffic on the dominant side. A curb has road on ONE side.
   *
   * The reference used 0.7. Measured against overlays of ten learned bands across seven cameras,
   * that is a hair too loose: an off-street lot beside a busy road (camera 14) and a sidewalk strip
   * (camera 130) both scored exactly 0.72, while every band that was visibly a curb scored 0.85 or
   * better. 0.8 sits in that gap. It is calibrated on ten bands, not a large sample, so it is the
   * first knob to revisit if a real curb starts being rejected.
   */
  minSideFrac: 0.8,
  /** Set false only for synthetic fixtures that contain no traffic to measure. */
  requireTraffic: true
})

/**
 * Learn independent image-space curb bands from tracked observations.
 * Vehicles need dwell >= 2; callers with raw detections should run annotateDwell first.
 */
export function learnBands (observations, options = {}) {
  const opts = { ...DEFAULT_LEARNING_OPTIONS, ...options }
  const scene = sceneFrom(observations, opts)
  let remaining = scene.parked
  const bands = []
  const rejected = []

  while (bands.length < opts.maxBands && remaining.length >= opts.minSupport) {
    const seed = bestLine(remaining, opts)
    if (!seed) break

    const first = inliersFor(seed, remaining, opts)
    const refined = fitOrthogonal(first)
    const inliers = inliersFor(refined, remaining, opts)
    const band = buildBand(refined, inliers, bands.length, opts, scene)
    if (!band) break
    // A rejected line still has to be peeled, or the next round rediscovers it forever.
    if (band.rejected) { rejected.push(band.rejected); remaining = peel(remaining, refined, opts); continue }

    bands.push(band)
    // Peel a slightly wider corridor than the acceptance threshold so edge jitter from the first
    // curb cannot be rediscovered as a duplicate second band.
    remaining = peel(remaining, refined, opts)
  }

  const out = bands.sort((a, b) => b.support - a.support).map((band, i) => ({ ...band, id: `b${i}` }))
  // Why a line was thrown away is the most useful thing to read when a camera learns nothing.
  Object.defineProperty(out, 'rejected', { value: rejected, enumerable: false })
  return out
}

function peel (points, line, opts) {
  return points.filter((point) => perpendicular(line, point) > threshold(point, opts) * 1.35)
}

/**
 * Split the history into what teaches geometry (parked cars) and what disqualifies it (moving
 * traffic). Learning uses a STRICTER dwell than the live path: at one frame per minute a car
 * waiting at a red light holds still for two frames, so dwell >= 2 would learn the queue.
 */
function sceneFrom (observations, opts) {
  const parked = []
  const moving = []
  for (let frame = 0; frame < observations.length; frame++) {
    for (const vehicle of observations[frame].vehicles || []) {
      if (!vehicle.bottomCenter) continue
      const [x, y] = vehicle.bottomCenter
      if (![x, y].every(Number.isFinite)) continue
      const dwell = vehicle.dwell || 1
      if (dwell === 1) moving.push([x, y])
      // Buses are excluded on purpose: a bus stop is a straight line of long-dwell boxes along a
      // curb, and it is the one stretch of curb where parking is never allowed.
      if (dwell < opts.learnDwell || vehicle.label === 'bus') continue
      const boxW = vehicle.box ? vehicle.box[2] - vehicle.box[0] : 1
      const boxH = vehicle.box ? vehicle.box[3] - vehicle.box[1] : 1
      parked.push({
        x, y, frame, dwell,
        h: Math.max(1, Number.isFinite(vehicle.h) ? vehicle.h : boxH),
        w: Math.max(1, Number.isFinite(vehicle.w) ? vehicle.w : boxW),
        weight: Math.min(opts.maxDwellWeight, dwell)
      })
    }
  }
  return { parked, moving, frames: observations.length }
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

function buildBand (line, points, index, opts, scene) {
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
  const band = {
    id: `b${index}`,
    p0: p0.map(r1), p1: p1.map(r1),
    dir: [r4(line.dx), r4(line.dy)],
    length: r1(length), halfWidth: r1(halfWidth), meanBoxH: r1(meanBoxH),
    coreT: [0, r1(length)], slots: stats.slots, support: points.length
  }

  // Is this line actually PARKING? Four ways a straight line of stationary boxes is not a curb.
  const dwells = points.map((point) => point.dwell ?? opts.learnDwell).sort((a, b) => a - b)
  const medianDwell = dwells[dwells.length >> 1]
  const longDwell = Math.min(opts.longDwellMax, Math.max(opts.longDwell, Math.round(opts.longDwellFrac * scene.frames)))
  const weight = points.reduce((sum, point) => sum + point.weight, 0)
  const longFrac = points.filter((point) => (point.dwell ?? 0) >= longDwell).reduce((sum, point) => sum + point.weight, 0) / weight
  const traffic = trafficAround(band, scene, meanBoxH)
  const movingRatio = traffic.inside / (traffic.inside + points.length)
  const diag = {
    id: band.id, length: band.length, slots: band.slots, support: band.support,
    medianDwell, longFrac: +longFrac.toFixed(2),
    movingInside: +traffic.movingInside.toFixed(2), movingRatio: +movingRatio.toFixed(2),
    movingNear: +traffic.movingNear.toFixed(2), sideFrac: +traffic.sideFrac.toFixed(2)
  }

  // A queue at a red light is a straight line of boxes that hold still for a frame or two.
  if (medianDwell < opts.minMedianDwell || longFrac < opts.minLongFrac) return { rejected: { why: 'queue', ...diag } }
  if (opts.requireTraffic) {
    // Traffic flows THROUGH a travel lane; it only flows past a parking lane.
    if (movingRatio > opts.maxMovingRatio) return { rejected: { why: 'travel lane', ...diag } }
    // On-street parking always has traffic passing beside it. An off-street lot does not.
    if (traffic.movingNear < opts.minMovingNear) return { rejected: { why: 'off-street', ...diag } }
    // A curb has road on ONE side. Traffic on both sides means a median strip or a lot.
    if (traffic.sideFrac < opts.minSideFrac) return { rejected: { why: 'traffic both sides', ...diag } }
  }
  return { ...band, medianDwell, longFrac: diag.longFrac, movingRatio: diag.movingRatio, movingNear: diag.movingNear, sideFrac: diag.sideFrac }
}

/**
 * Moving traffic inside the corridor, and beside it, split by which side it passes on.
 *
 * The probe corridor is deliberately WIDER than the band that gets shipped. The shipped halfWidth
 * is a tight percentile of parked-car residuals -- that tightness is what keeps two curbs apart --
 * but measuring traffic through a strip narrower than a car undercounts it, and a travel lane would
 * slip past the movingRatio test. Probe at a car's width; ship the tight one.
 */
function trafficAround (band, scene, meanBoxH) {
  let inside = 0, nearPos = 0, nearNeg = 0
  const probe = Math.max(band.halfWidth, meanBoxH * 0.35)
  const reach = probe + 3 * meanBoxH
  for (const point of scene.moving) {
    const { t, n } = projectToAxis(band, point)
    const d = Math.abs(n)
    if (d <= probe && t >= 0 && t <= band.length) inside++
    else if (d <= reach && t >= -band.length && t <= 2 * band.length) { if (n > 0) nearPos++; else nearNeg++ }
  }
  const near = nearPos + nearNeg
  return {
    inside,
    movingInside: inside / Math.max(1, scene.frames),
    movingNear: near / Math.max(1, scene.frames),
    sideFrac: near ? Math.max(nearPos, nearNeg) / near : 0
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
