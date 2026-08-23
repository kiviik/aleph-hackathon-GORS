import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignVehiclesToBands } from '../src/core/band.mjs'
import { bandSeparation, learnBands } from '../src/core/band-learning.mjs'
import { CAR_LENGTH_M, EXTEND_CAR_LENGTHS, extendBand, extendBandBounded, metresBetween } from '../src/core/scale.mjs'

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
