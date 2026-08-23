import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignVehiclesToBands } from '../src/core/band.mjs'
import { bandSeparation, learnBands } from '../src/core/band-learning.mjs'

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
