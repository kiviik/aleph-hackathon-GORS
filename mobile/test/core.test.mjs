// Ported from the source repo's test/pipeline-core.test.mjs and test/review-fixes.test.mjs.
// The band-LEARNING cases are intentionally dropped: learnBands does not ship to mobile (it needs
// ~20 distinct frames of history per camera). Everything that runs per-frame on the phone is here,
// with the band supplied the way the app supplies it -- prebaked geometry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { annotateDwell, isParked, sameSignature, stepTracks } from '../src/core/stationary.mjs'
import { inBand } from '../src/core/band.mjs'
import { metresBetween, groundExtent } from '../src/core/scale.mjs'
import { computeGaps, merge } from '../src/core/gaps.mjs'
import { createBandState, updateBandState, stableGaps, MAX_GAP_MS } from '../src/core/temporal.mjs'
import { guardGaps, energyAt } from '../src/core/appearance.mjs'
import { dedupe } from '../src/core/boxes.mjs'

function car (x, y, w, h, label = 'car', score = 0.9) {
  return { label, score, box: [x, y, x + w, y + h], bottomCenter: [x + w / 2, y + h], w, h }
}

/** Synthetic camera: a curb lane along y = 300 + 0.1x, cars 50px long at x=100..700. */
function syntheticHistory (frames = 40, { missingSlot = null, curbY = 300, slope = 0.1 } = {}) {
  const obs = []
  for (let f = 0; f < frames; f++) {
    const vehicles = []
    for (let i = 0; i < 10; i++) {
      if (i === missingSlot && f >= frames / 2) continue // vacated half-way through
      const x = 100 + i * 65
      vehicles.push(car(x, curbY + slope * x - 30, 50, 30))
    }
    vehicles.push(car(50 + (f * 137) % 700, curbY + 95, 60, 35))  // moving traffic
    vehicles.push(car(80 + (f * 211) % 700, 150, 40, 25))
    obs.push({ capturedAt: 1e12 + f * 120000, width: 840, height: 630, vehicles })
  }
  return obs
}

/** The band the laptop would have learned for the synthetic curb above -- what bands.json ships. */
function syntheticBand ({ curbY = 300, slope = 0.1 } = {}) {
  const p0 = [125, curbY + slope * 100]
  const p1 = [710, curbY + slope * 685]
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
  const length = Math.hypot(dx, dy)
  return { id: 'b0', p0, p1, dir: [dx / length, dy / length], length, halfWidth: 27, meanBoxH: 30, coreT: [0, length] }
}

/** px/m for 50px cars at 4.6 m, flat (no perspective) -- what fitScale would have produced. */
const flatScale = { a: 50 / 4.6, b: 0, samples: 40, ok: true }

function frame (width, height, texturedRect) {
  const data = new Uint8Array(width * height).fill(90)
  if (texturedRect) {
    const [x1, y1, x2, y2] = texturedRect
    let seed = 7
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[y * width + x] = 40 + (seed % 150) }
  }
  return { data, width, height }
}

test('dwell: static boxes accumulate, moving do not', () => {
  const h = annotateDwell(syntheticHistory(5))
  const last = h[4].vehicles
  assert.ok(last.slice(0, 10).every((v) => v.dwell === 5))
  assert.ok(last.slice(10).every((v) => v.dwell === 1 && !isParked(v)))
})

test('prebaked band: curb points are inside, the travel lane is not', () => {
  const b = syntheticBand()
  assert.ok(inBand(b, [400, 300 + 0.1 * 400]))
  assert.ok(!inBand(b, [400, 430]))
})

test('gaps: a vacated slot is one car-sized free interval, measured in metres', () => {
  const hist = annotateDwell(syntheticHistory(40, { missingSlot: 5 }))
  const b = syntheticBand()
  const gaps = computeGaps(b, flatScale, hist[hist.length - 1].vehicles)
  assert.equal(gaps.free.length, 1, JSON.stringify(gaps.free))
  assert.ok(gaps.free[0].metres >= 5.5 && gaps.free[0].metres < 8, `metres ${gaps.free[0].metres}`)
  assert.equal(gaps.free[0].carsFit, 1)
})

test('a moving vehicle over a gap makes it unknown, never free', () => {
  const hist = annotateDwell(syntheticHistory(40, { missingSlot: 5 }))
  const b = syntheticBand()
  const last = hist[hist.length - 1]
  const mover = car(100 + 5 * 65, 300 + 0.1 * 425 - 30, 50, 30)
  mover.dwell = 1
  const gaps = computeGaps(b, flatScale, [...last.vehicles, mover])
  assert.equal(gaps.free.length, 0)
  assert.equal(gaps.unknown.length, 1)
})

test('temporal: needs MIN_TICKS consistent observations; stale never reads free', () => {
  const hist = annotateDwell(syntheticHistory(40, { missingSlot: 5 }))
  const b = syntheticBand()
  const g = computeGaps(b, flatScale, hist[hist.length - 1].vehicles)
  const st = createBandState(b)
  updateBandState(st, g)
  assert.equal(stableGaps(st, flatScale).length, 0, 'one observation can never be free')
  updateBandState(st, g); updateBandState(st, g); updateBandState(st, g)
  const runs = stableGaps(st, flatScale)
  assert.equal(runs.length, 1)
  assert.ok(runs[0].metres >= 5.5)
  updateBandState(st, null, { stale: true })
  assert.equal(stableGaps(st, flatScale).length, 0, 'stale is never reported as free')
})

test('temporal: a transient failure suspends the verdict but does not discard the history', () => {
  // The blip that used to cost a band everything: one unreadable frame between good ones. Zeroing
  // ticks there restarted the MIN_TICKS climb, so a phone scanning once a minute could never get
  // ahead of its own flakiness.
  const hist = annotateDwell(syntheticHistory(40, { missingSlot: 5 }))
  const b = syntheticBand()
  const g = computeGaps(b, flatScale, hist[hist.length - 1].vehicles)
  const st = createBandState(b)
  updateBandState(st, g); updateBandState(st, g); updateBandState(st, g)
  assert.equal(stableGaps(st, flatScale).length, 1, 'three good observations earn a gap')

  updateBandState(st, null, { stale: true })
  assert.equal(stableGaps(st, flatScale).length, 0, 'while the frame is missing, nothing reads free')
  assert.equal(st.ticks, 3, 'but the history it already earned survives the blip')

  updateBandState(st, g)
  assert.equal(stableGaps(st, flatScale).length, 1, 'and one good frame restores the verdict')
})

test('temporal: silence longer than MAX_GAP_MS does expire the evidence', () => {
  // The other half: not resetting on a blip must not become "trust a ten-minute-old EMA".
  const hist = annotateDwell(syntheticHistory(40, { missingSlot: 5 }))
  const b = syntheticBand()
  const g = computeGaps(b, flatScale, hist[hist.length - 1].vehicles)
  const st = createBandState(b)
  const t0 = 1_700_000_000_000
  updateBandState(st, g, { now: t0 }); updateBandState(st, g, { now: t0 + 1000 }); updateBandState(st, g, { now: t0 + 2000 })
  assert.equal(stableGaps(st, flatScale).length, 1)

  updateBandState(st, g, { now: t0 + 2000 + MAX_GAP_MS + 1 })
  assert.equal(st.ticks, 1, 'the stale EMA is thrown away and the count restarts')
  assert.equal(stableGaps(st, flatScale).length, 0, 'so a curb nobody watched for 10 min is not free')
})

test('appearance guard: a missed car (textured curb) is never free; flat asphalt stays free', () => {
  const hist = annotateDwell(syntheticHistory(40, { missingSlot: 5, curbY: 270, slope: 0 }))
  const b = syntheticBand({ curbY: 270, slope: 0 })
  const last = hist[hist.length - 1].vehicles
  const raw = computeGaps(b, flatScale, last)
  assert.equal(raw.free.length, 1)
  const flat = guardGaps(frame(840, 630, null), b, flatScale, raw, last)
  assert.equal(flat.free.length, 1, JSON.stringify(flat.free))
  // an undetected car sits in the vacated slot (body above the curb line) -> guard drops it
  const busy = guardGaps(frame(840, 630, [420, 225, 480, 270]), b, flatScale, raw, last)
  assert.equal(busy.free.length, 0, JSON.stringify(busy.free))
  assert.ok(busy.textured.length > 0)
})

test('energyAt: flat -> 0, noise -> high', () => {
  const g = frame(100, 100, [0, 0, 50, 100])
  const pts = (x0) => Array.from({ length: 40 }, (_, i) => [x0 + (i % 8) * 4, 10 + Math.floor(i / 8) * 10])
  assert.equal(energyAt(g, pts(60)), 0)
  assert.ok(energyAt(g, pts(5)) > 20)
})

test('signature: same car matches, brightness shift matches, different car does not', () => {
  const a = [120, 118, 115, 122, 120, 117, 60, 58, 55, 62, 60, 57]
  assert.ok(sameSignature(a, a.map((v) => v + 3)))
  assert.ok(sameSignature(a, a.map((v) => v + 40)))                  // sun came out
  assert.ok(!sameSignature(a, a.map((v, i) => (i < 6 ? 30 : 200))))  // a different car
  assert.ok(sameSignature(a, undefined))                             // history without signatures
  const box = [100, 100, 150, 130]
  let tracks = stepTracks([], [{ box, sig: a }])
  const v = { box, sig: a.map((_, i) => (i < 6 ? 30 : 200)) }
  tracks = stepTracks(tracks, [v])
  assert.equal(v.dwell, 1, 'a different car in the same pixels does not inherit dwell')
})

test('metresBetween integrates linear scale', () => {
  assert.ok(Math.abs(metresBetween({ a: 10, b: 0 }, 0, 100) - 10) < 1e-9)
  const m = metresBetween({ a: 5, b: 0.05 }, 0, 100) // px/m from 5 -> 10
  assert.ok(m > 10 && m < 20)
})

test('merge + dedupe', () => {
  assert.deepEqual(merge([[5, 10], [1, 3], [2, 6]]), [[1, 10]])
  const d = dedupe([
    { score: 0.9, box: [0, 0, 10, 10] },
    { score: 0.5, box: [0, 0, 10, 10.5] },
    { score: 0.7, box: [50, 50, 60, 60] }
  ])
  assert.equal(d.length, 2, 'the end-to-end head emits one vehicle as both car and truck')
})

test('groundExtent uses only the bottom edge', () => {
  const b = syntheticBand()
  const [lo, hi] = groundExtent(b, [200, 250, 260, 320])
  assert.ok(hi > lo && hi - lo > 50 && hi - lo < 70)
})
