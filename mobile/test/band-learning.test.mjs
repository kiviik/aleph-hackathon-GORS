import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assignVehiclesToBands, freeRange } from '../src/core/band.mjs'
import { bandSeparation, learnBands } from '../src/core/band-learning.mjs'
import { computeGaps } from '../src/core/gaps.mjs'
import { CAR_LENGTH_M, EXTEND_CAR_LENGTHS, EXTEND_MAX_FRAC_OF_CORE, clampBandExtension, extendBand, extendBandBounded, metresBetween, pxPerMetre } from '../src/core/scale.mjs'

function car (x, groundY, frame, dwell = frame + 2) {
  const w = 44, h = 28
  return { label: 'car', box: [x - w / 2, groundY - h, x + w / 2, groundY], bottomCenter: [x, groundY], w, h, dwell }
}

function twoSidedHistory () {
  return Array.from({ length: 8 }, (_, frame) => {
    const vehicles = []
    for (const x of [110, 180, 250, 320, 390]) {
      vehicles.push(car(x, 245 + 0.08 * x + ((frame % 3) - 1) * 0.4, frame))
      vehicles.push(car(x, 345 + 0.08 * x + ((frame % 2) - 0.5) * 0.5, frame))
    }
    // Moving traffic between the curbs must never become a learned parking band.
    vehicles.push(car(70 + frame * 53, 300, frame, 1))
    return { capturedAt: frame, vehicles }
  })
}

test('learner keeps opposite curb sides as two independent bands', () => {
  const bands = learnBands(twoSidedHistory())
  assert.equal(bands.length, 2, JSON.stringify(bands))
  assert.ok(bandSeparation(bands[0], bands[1]) > 80, `separation ${bandSeparation(bands[0], bands[1])}`)
  assert.ok(bands.every((band) => band.halfWidth < 10), JSON.stringify(bands))
})

test('learner does not invent a second band for one-sided parking plus moving traffic', () => {
  const history = twoSidedHistory().map((observation) => ({
    ...observation,
    vehicles: observation.vehicles.filter((vehicle) => vehicle.bottomCenter[1] < 300 || vehicle.dwell === 1)
  }))
  assert.equal(learnBands(history).length, 1)
})

test('overlapping perspective corridors assign a vehicle to only the nearest curb band', () => {
  const bands = [
    { id: 'near', p0: [0, 100], dir: [1, 0], length: 300, halfWidth: 35 },
    { id: 'far', p0: [0, 145], dir: [1, 0], length: 300, halfWidth: 35 }
  ]
  const nearCar = car(100, 119, 1)
  const farCar = car(200, 137, 1)
  const assigned = assignVehiclesToBands(bands, [nearCar, farCar])
  assert.deepEqual(assigned.near, [nearCar])
  assert.deepEqual(assigned.far, [farCar])
})

/** A line of boxes that hold still for a frame or two: a queue at a red light, not parking. */
function queueHistory () {
  return Array.from({ length: 8 }, (_, frame) => ({
    capturedAt: frame,
    // dwell 3 clears the learning floor but nothing sits here for long: at one frame per minute a
    // parked car chains dozens of frames, a queue re-forms from different cars every cycle.
    vehicles: [110, 180, 250, 320, 390, 460].map((x) => car(x, 300 + 0.05 * x, frame, 3))
  }))
}

test('a queue at a red light is not learned as a parking band', () => {
  const bands = learnBands(queueHistory())
  assert.equal(bands.length, 0, JSON.stringify(bands))
  assert.ok(bands.rejected.some((r) => r.why === 'queue'), JSON.stringify(bands.rejected))
})

test('a lane with traffic flowing through it is not learned as a parking band', () => {
  // Long-dwell boxes on the line, so it passes the queue test -- but moving vehicles keep passing
  // straight through the corridor, which is what a travel lane looks like and a curb never does.
  const history = Array.from({ length: 10 }, (_, frame) => {
    const vehicles = [120, 200, 280, 360].map((x) => car(x, 300 + 0.05 * x, frame, 30))
    for (const x of [90, 170, 250, 330, 410, 490]) vehicles.push(car(x, 300 + 0.05 * x, frame, 1))
    return { capturedAt: frame, vehicles }
  })
  const bands = learnBands(history)
  assert.equal(bands.length, 0, JSON.stringify(bands))
  assert.ok(bands.rejected.some((r) => r.why === 'travel lane'), JSON.stringify(bands.rejected))
})

test('requireTraffic:false lets a fixture with no traffic at all still learn', () => {
  // Real cameras always have passing traffic; synthetic fixtures need not, and the off-street test
  // would otherwise reject every band in them.
  const history = Array.from({ length: 8 }, (_, frame) => ({
    capturedAt: frame,
    vehicles: [110, 180, 250, 320, 390].map((x) => car(x, 300 + 0.05 * x, frame, 30))
  }))
  assert.equal(learnBands(history).length, 0, 'no traffic beside it reads as an off-street lot')
  assert.equal(learnBands(history, { requireTraffic: false }).length, 1)
})

test('a band is never padded with more curb than it actually observed', () => {
  // extendBand pads a flat two car lengths per end. On a short band that is nearly all invention:
  // measured on real history, camera 76's far curb learned 9.6 m of parked cars and came out with
  // 21.3 m of guessed curb attached. The bound keeps the extrapolation under half the evidence.
  const band = { id: 'b0', p0: [100, 300], p1: [260, 300], dir: [1, 0], length: 160, halfWidth: 8, meanBoxH: 30, coreT: [0, 160] }
  const scale = { a: 16, b: 0, ok: true } // 16 px/m -> a 10 m core
  const coreM = metresBetween(scale, 0, band.length)
  assert.ok(Math.abs(coreM - 10) < 0.01)

  const flat = extendBand(band, scale, 840, 630)
  const bounded = extendBandBounded(band, scale, 840, 630)
  const addedM = (b, sc) => metresBetween(sc, 0, b.coreT[0]) + metresBetween(sc, b.coreT[1], b.length)

  assert.ok(addedM(flat.band, flat.scale) > coreM, 'the unbounded pad exceeds the evidence')
  assert.ok(addedM(bounded.band, bounded.scale) <= coreM + 0.01, 'the bound caps total padding at the core length')
  assert.ok(bounded.band.length < flat.band.length)
  // and the core itself is untouched: only the ends move
  assert.ok(Math.abs(metresBetween(bounded.scale, bounded.band.coreT[0], bounded.band.coreT[1]) - coreM) < 0.01)

  // A long band is under the absolute cap already, so the bound changes nothing for it.
  const long = { ...band, p1: [1100, 300], length: 1000, coreT: [0, 1000] }
  assert.equal(extendBandBounded(long, scale, 1200, 630).band.length, extendBand(long, scale, 1200, 630).band.length)
  assert.ok(EXTEND_CAR_LENGTHS * CAR_LENGTH_M > 0)
})

test('an already-extended band can be re-bound, from either end and under perspective', () => {
  // extendBandBounded only binds geometry this module produced. Everything in bands.json was padded
  // elsewhere, so the bound has to be enforceable after the fact -- on a band whose scale already
  // carries the extension in its parametrisation.
  const scale = { a: 6, b: 0.06, ok: true }   // 6 px/m at t=0, 36 px/m at t=500: steep perspective
  const band = { id: 'b0', p0: [40, 400], p1: [540, 200], dir: [0.928, -0.371], length: 500, halfWidth: 10, meanBoxH: 30, coreT: [200, 300] }

  const coreM = metresBetween(scale, 200, 300)
  const cap = Math.min(EXTEND_CAR_LENGTHS * CAR_LENGTH_M, EXTEND_MAX_FRAC_OF_CORE * coreM)
  assert.ok(metresBetween(scale, 0, 200) > cap && metresBetween(scale, 300, 500) > cap, 'both ends start over')

  const { band: out, scale: s2 } = clampBandExtension(band, scale)
  const [c0, c1] = out.coreT
  assert.ok(Math.abs(metresBetween(s2, 0, c0) - cap) < 0.05, 'near end trimmed to the cap')
  assert.ok(Math.abs(metresBetween(s2, c1, out.length) - cap) < 0.05, 'far end trimmed to the cap')
  // The trim is in METRES, so perspective must make the two ends different lengths in pixels.
  assert.ok(Math.abs(c0 - (out.length - c1)) > 20, 'a metre-based trim is not a pixel-based one')
  // The core survives untouched: same metres, same pixels on the ground, same endpoints.
  assert.ok(Math.abs(metresBetween(s2, c0, c1) - coreM) < 0.01)
  assert.ok(Math.abs(pxPerMetre(s2, c0) - pxPerMetre(scale, 200)) < 0.01, 'the scale is re-parametrised, not re-fitted')
  const coreStart = [band.p0[0] + band.dir[0] * 200, band.p0[1] + band.dir[1] * 200]
  assert.ok(Math.hypot(out.p0[0] + out.dir[0] * c0 - coreStart[0], out.p0[1] + out.dir[1] * c0 - coreStart[1]) < 0.2)

  // Idempotent, and a band already inside the bound is returned as-is.
  const again = clampBandExtension(out, s2)
  assert.equal(again.band, out)
  assert.equal(again.scale, s2)
  // A band with no core cannot be judged over-extended, so it is left alone.
  assert.equal(clampBandExtension({ ...band, coreT: undefined }, scale).band.coreT, undefined)
})

test('every shipped band respects the extension bound', () => {
  const doc = JSON.parse(readFileSync(new URL('../src/data/bands.json', import.meta.url), 'utf8'))
  for (const [id, cam] of Object.entries(doc.cameras)) {
    for (const band of cam.bands) {
      const scale = cam.scales[band.id]
      const [c0, c1] = band.coreT
      const cap = Math.min(EXTEND_CAR_LENGTHS * CAR_LENGTH_M, EXTEND_MAX_FRAC_OF_CORE * metresBetween(scale, c0, c1))
      assert.ok(metresBetween(scale, 0, c0) <= cap + 0.05, `${id}/${band.id}: ${metresBetween(scale, 0, c0).toFixed(1)} m guessed before a ${cap.toFixed(1)} m cap`)
      assert.ok(metresBetween(scale, c1, band.length) <= cap + 0.05, `${id}/${band.id}: ${metresBetween(scale, c1, band.length).toFixed(1)} m guessed after a ${cap.toFixed(1)} m cap`)
    }
  }
})

test('FREE is claimed only where a car has been seen parked', () => {
  // The padded ends of a band are there for the texture guard to look at, not for the app to sell.
  // Camera 219's band runs off its curb and across an intersection; replaying its 302 collected
  // frames, 144 of the 230 frames that reported free space put it ENTIRELY in that junction.
  const band = { id: 'b0', p0: [0, 100], p1: [400, 100], dir: [1, 0], length: 400, halfWidth: 12, meanBoxH: 30, coreT: [100, 300] }
  const scale = { a: 10, b: 0, ok: true } // 10 px/m throughout: the whole band is 40 m
  const empty = []

  // No freeT: the learned core is the bound, and nothing outside it can be claimed.
  const onCore = computeGaps(band, scale, empty)
  assert.deepEqual(onCore.free.map((g) => [g.t1, g.t2]), [[100, 300]])
  assert.deepEqual(freeRange(band), [100, 300])

  // freeT baked from history is wider than the anchor-based core, and it wins.
  const baked = { ...band, freeT: [60, 380] }
  assert.deepEqual(freeRange(baked), [60, 380])
  assert.deepEqual(computeGaps(baked, scale, empty).free.map((g) => [g.t1, g.t2]), [[60, 380]])

  // A dead end shorter than MIN_GAP_M after clipping disappears rather than being reported short.
  const car = { box: [355, 70, 395, 105], bottomCenter: [375, 105], dwell: 5, w: 40, h: 35 }
  const blocked = computeGaps({ ...baked, freeT: [340, 400] }, scale, [car])
  assert.deepEqual(blocked.free, [], 'a 1.5 m sliver is not free space')
  // ... but the car still counts as occupying the band, clipping or not.
  assert.equal(blocked.occupied.length, 1)

  // A band with no coreT and no freeT is claimable end to end: nothing says otherwise.
  const bare = { id: 'b0', p0: [0, 100], p1: [400, 100], dir: [1, 0], length: 400, halfWidth: 12, meanBoxH: 30 }
  assert.deepEqual(freeRange(bare), [0, 400])
  assert.deepEqual(computeGaps(bare, scale, empty).free.map((g) => [g.t1, g.t2]), [[0, 400]])
})

test('every band with baked history keeps freeT inside the band', () => {
  const doc = JSON.parse(readFileSync(new URL('../src/data/bands.json', import.meta.url), 'utf8'))
  let baked = 0
  for (const [id, cam] of Object.entries(doc.cameras)) {
    for (const band of cam.bands) {
      if (!band.freeT) continue
      baked++
      const [lo, hi] = band.freeT
      assert.ok(lo >= 0 && hi <= band.length && hi > lo, `${id}/${band.id}: freeT ${band.freeT} outside [0, ${band.length}]`)
      assert.ok(band.freeSupport?.frames > 0, `${id}/${band.id}: freeT with no recorded support`)
      assert.deepEqual(freeRange(band), [lo, hi])
    }
  }
  assert.ok(baked >= 7, `expected the collected cameras to carry freeT, got ${baked}`)
})
