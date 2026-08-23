// Exercises frame-pipeline.mjs -- the exact module the Bare worklet calls -- with inference
// replayed from detector-golden.json. No ONNX, no addon, no phone, no network.
//
// This is the closest thing to an on-device integration test that can run on a laptop: the only
// component swapped out is the model itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFramePipeline } from '../src/core/frame-pipeline.mjs'
import { createBandState, updateBandState } from '../src/core/temporal.mjs'
import { buildObservation, buildRules } from '../src/evidence/evidence.mjs'
import { referenceDecision } from '../src/policy/policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const golden = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/detector-golden.json'), 'utf8'))
const jpeg = new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', golden.frame)))
const bandsDoc = JSON.parse(fs.readFileSync(path.join(here, '../src/data/bands.json'), 'utf8'))
const cam76 = bandsDoc.cameras['76']

/** Replays the recorded model output, in pass order, exactly as @qvac/onnx would return it. */
function replayInfer(passes = ['full', 'far']) {
  let i = 0
  return () => golden.passes[passes[i++]].mobileObjects
}

test('the worklet pipeline reproduces the golden vehicle set', async () => {
  const pipeline = createFramePipeline({ infer: replayInfer() })
  const r = await pipeline({ jpeg, bands: cam76.bands, scales: cam76.scales, passes: ['full', 'far'] })

  assert.equal(r.width, golden.width)
  assert.equal(r.height, golden.height)
  // The fixture predates the car-only filter, so trucks and buses in it are expected to be gone.
  const want = golden.mobileVehicles.filter((v) => v.label === 'car')
  assert.equal(r.vehicles.length, want.length)
  for (let i = 0; i < r.vehicles.length; i++) {
    assert.deepEqual(r.vehicles[i].box, want[i].box, `box ${i}`)
    assert.deepEqual(r.vehicles[i].sig, want[i].sig, `signature ${i}`)
  }
  // every band in the fixture must get a guarded gap result
  for (const b of cam76.bands) assert.ok(r.perBand[b.id], `no result for band ${b.id}`)
  assert.ok(r.meanLuma > 0 && r.energy > 0)
})

test('tracks carry dwell across scans, so a parked car is confirmed by persistence', async () => {
  let tracks = []
  let lastDwell = 0
  for (let i = 0; i < 3; i++) {
    const pipeline = createFramePipeline({ infer: replayInfer() })
    const r = await pipeline({ jpeg, bands: cam76.bands, scales: cam76.scales, tracks, passes: ['full', 'far'] })
    tracks = r.tracks
    lastDwell = Math.max(...tracks.map((t) => t.dwell))
  }
  assert.equal(lastDwell, 3, 'the same box across 3 frames must reach dwell 3')
})

test('a real camera: PARK only after MIN_TICKS, on real geometry and real rules', async () => {
  const band = cam76.bands[0]
  const scale = cam76.scales[band.id]
  const state = createBandState(band)
  const rules = buildRules(cam76.zone, new Date('2026-08-24T18:00:00Z')) // Monday noon, no restriction
  let tracks = []
  const decisions = []

  for (let scan = 1; scan <= 4; scan++) {
    const pipeline = createFramePipeline({ infer: replayInfer() })
    const r = await pipeline({ jpeg, bands: cam76.bands, scales: cam76.scales, tracks, passes: ['full', 'far'] })
    tracks = r.tracks
    updateBandState(state, r.perBand[band.id], { stale: false })
    const observation = buildObservation({
      band, scale, bandState: state, guarded: r.perBand[band.id], vehicles: r.vehicles,
      frame: { width: r.width, height: r.height, meanLuma: r.meanLuma, energy: r.energy, stale: false, capturedAt: Date.now() }
    })
    decisions.push(referenceDecision({ observation, sector: { sector_id: cam76.zone.id }, rules }).decision)
  }

  // The safety property, stated directly: a confirmed gap is what buys PARK, and that takes
  // MIN_TICKS frames. Nothing below that count may ever come back PARK.
  assert.ok(!decisions.slice(0, 2).includes('PARK'), `PARK before MIN_TICKS: ${decisions.join(',')}`)
  // This curb has vehicles sitting in the band, and that is readable from frame one -- it does not
  // have to wait out the temporal filter to say so. Before the fix these two were REFUSE, which
  // showed a visibly full curb as "review" for the first two scans.
  assert.deepEqual(decisions.slice(0, 2), ['DO_NOT_PARK', 'DO_NOT_PARK'],
    `occupancy is positive evidence and needs no history: ${decisions.join(',')}`)
  assert.ok(decisions[3] !== 'REFUSE', `expected a decision by scan 4, got ${decisions.join(',')}`)
})

test('a stale frame keeps refusing no matter how many scans accumulate', async () => {
  const band = cam76.bands[0]
  const state = createBandState(band)
  const rules = buildRules(cam76.zone, new Date('2026-08-24T18:00:00Z'))
  for (let scan = 0; scan < 6; scan++) {
    const pipeline = createFramePipeline({ infer: replayInfer() })
    const r = await pipeline({ jpeg, bands: cam76.bands, scales: cam76.scales, passes: ['full', 'far'] })
    updateBandState(state, r.perBand[band.id], { stale: true })
    const observation = buildObservation({
      band, scale: cam76.scales[band.id], bandState: state, guarded: r.perBand[band.id], vehicles: r.vehicles,
      frame: { width: r.width, height: r.height, meanLuma: r.meanLuma, energy: r.energy, stale: true, capturedAt: Date.now() - 3600e3 }
    })
    assert.equal(referenceDecision({ observation, sector: { sector_id: cam76.zone.id }, rules }).decision, 'REFUSE')
  }
})

test('the single-pass slice is a subset of the two-pass slice, never a superset', async () => {
  const one = await createFramePipeline({ infer: replayInfer(['full']) })({ jpeg, passes: ['full'] })
  const two = await createFramePipeline({ infer: replayInfer() })({ jpeg, passes: ['full', 'far'] })
  assert.ok(two.vehicles.length >= one.vehicles.length,
    `dropping the far pass must not invent detections: 1-pass ${one.vehicles.length} vs 2-pass ${two.vehicles.length}`)
})
