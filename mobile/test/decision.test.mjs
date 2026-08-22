// The acceptance matrix from docs/hackaton/07-mobile.md, plus parity with the
// ba-estaciona-qvac policy contract. These are the honesty guarantees of the whole app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { referenceDecision, DEFAULT_CONFIDENCE_THRESHOLD } from '../src/policy/policy.mjs'
import { buildObservation, buildRules, bandRoi, overlapWithRoi } from '../src/evidence/evidence.mjs'
import { createBandState, updateBandState } from '../src/core/temporal.mjs'
import { computeGaps } from '../src/core/gaps.mjs'
import { guardGaps } from '../src/core/appearance.mjs'

const band = { id: 'b0', p0: [100, 300], p1: [700, 300], dir: [1, 0], length: 600, halfWidth: 27, meanBoxH: 30, coreT: [0, 600] }
const scale = { a: 50 / 4.6, b: 0, ok: true }
const sector = { sector_id: 's1' }
const openZone = { id: 'z1', enforceableTime: '0910-1750 MON-SAT', restrictType: 'none', restrictTime: 'none' }
const rushZone = { id: 'z2', enforceableTime: '0910-1750 MON-SAT', restrictType: 'AM&PM', restrictTime: '07:00 - 08:30 , 15:30 - 18:00' }
const mon1200 = new Date('2026-08-24T18:00:00Z')
const mon1730 = new Date('2026-08-24T23:30:00Z')

const car = (x, w = 50) => ({ label: 'car', score: 0.9, box: [x, 270, x + w, 300], bottomCenter: [x + w / 2, 300], w, h: 30, dwell: 3 })
const flatFrame = (w = 840, h = 630) => ({ data: new Uint8Array(w * h).fill(90), width: w, height: h })

/** Run n identical observations through the temporal filter, as repeated scans would. */
function observe (vehicles, n, { gray = flatFrame(), stale = false, frame = {} } = {}) {
  const st = createBandState(band)
  let guarded
  for (let i = 0; i < n; i++) {
    guarded = guardGaps(gray, band, scale, computeGaps(band, scale, vehicles), vehicles)
    updateBandState(st, guarded, { stale })
  }
  return buildObservation({
    band, scale, bandState: st, guarded, vehicles,
    frame: { width: 840, height: 630, meanLuma: 120, energy: 20, stale, capturedAt: Date.now(), ...frame }
  })
}

// A full curb, then the same curb with slot 4 vacated.
const fullCurb = Array.from({ length: 10 }, (_, i) => car(100 + i * 60))
const gapCurb = fullCurb.filter((_, i) => i !== 4)

test('ROI free + rule allows -> PARK, but only with enough evidence', () => {
  const obs = observe(gapCurb, 4)
  assert.equal(obs.state, 'FREE')
  assert.ok(obs.carsFit >= 1, JSON.stringify(obs.gaps))
  const d = referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) })
  assert.equal(d.decision, 'PARK', JSON.stringify(d))
})

test('ROI occupied -> DO_NOT_PARK', () => {
  const obs = observe(fullCurb, 4)
  assert.equal(obs.state, 'OCCUPIED')
  const d = referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) })
  assert.equal(d.decision, 'DO_NOT_PARK')
  assert.equal(d.code, 'NO_FREE_SPACE')
})

test('an active rush-hour rule beats a visually free curb -> DO_NOT_PARK', () => {
  const obs = observe(gapCurb, 4)
  assert.equal(obs.state, 'FREE')
  const d = referenceDecision({ observation: obs, sector, rules: buildRules(rushZone, mon1730) })
  assert.equal(d.decision, 'DO_NOT_PARK')
  assert.equal(d.code, 'RULE_PROHIBITS')
})

test('a single observation can never be PARK', () => {
  const obs = observe(gapCurb, 1)
  assert.equal(obs.state, 'UNCERTAIN')
  assert.match(obs.explanation, /1 de 3/)
  assert.equal(referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) }).decision, 'REFUSE')
})

test('a stale frame is never PARK', () => {
  const obs = observe(gapCurb, 4, { stale: true })
  assert.equal(obs.state, 'UNCERTAIN')
  assert.equal(referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) }).decision, 'REFUSE')
})

test('no boxes + DOUBTFUL asphalt is never FREE -- absence of detections is not evidence', () => {
  // The acceptance-matrix row is "YOLO sin boxes pero ROI dudosa -> REFUSE". The doubt comes from
  // the appearance guard: a car the detector missed still leaves a textured strip.
  const gray = flatFrame()
  let seed = 5
  for (let y = 250; y < 300; y++) for (let x = 100; x < 700; x++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; gray.data[y * 840 + x] = 40 + (seed % 150) }
  const obs = observe([], 5, { gray })
  assert.notEqual(obs.state, 'FREE')
  assert.equal(obs.carsFit, 0)
  assert.match(obs.explanation, /ausencia de cajas/)
  assert.equal(referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) }).decision, 'REFUSE')
})

test('no boxes + genuinely flat asphalt MAY be free -- this is the desktop contract, kept', () => {
  // Deliberately asserting the real behaviour rather than over-refusing: an empty curb that also
  // looks like empty asphalt is free. The guard, not the absence of boxes, is what earns that.
  const obs = observe([], 5)
  assert.equal(obs.state, 'FREE')
  assert.ok(obs.carsFit > 0)
  assert.equal(referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) }).decision, 'PARK')
})

test('a textured curb (a car the detector missed) is never FREE', () => {
  const gray = flatFrame()
  // paint noise where the vacated slot is -> the appearance guard must reject it
  let seed = 11
  for (let y = 250; y < 300; y++) for (let x = 335; x < 400; x++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; gray.data[y * 840 + x] = 40 + (seed % 150) }
  const obs = observe(gapCurb, 5, { gray })
  assert.notEqual(obs.state, 'FREE', JSON.stringify(obs.gaps))
  assert.equal(obs.carsFit, 0)
  // The band still holds 9 detected cars, so the honest answer is OCCUPIED. What matters for
  // safety is only that the missed car never becomes a PARK.
  const d = referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) })
  assert.notEqual(d.decision, 'PARK')
  assert.equal(d.decision, 'DO_NOT_PARK')
})

test('a dark frame refuses before any geometry is considered', () => {
  const obs = observe(gapCurb, 5, { frame: { meanLuma: 20 } })
  assert.equal(obs.quality, 'DARK')
  const d = referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) })
  assert.equal(d.decision, 'REFUSE')
  assert.equal(d.code, 'FRAME_UNUSABLE')
})

test('a blurry frame refuses', () => {
  const obs = observe(gapCurb, 5, { frame: { energy: 1 } })
  assert.equal(obs.quality, 'BLURRY')
  assert.equal(referenceDecision({ observation: obs, sector, rules: buildRules(openZone, mon1200) }).code, 'FRAME_UNUSABLE')
})

test('missing rules refuse, they do not default to allowed', () => {
  const obs = observe(gapCurb, 4)
  const d = referenceDecision({ observation: obs, sector, rules: buildRules(null, mon1200) })
  assert.equal(d.decision, 'REFUSE')
  assert.equal(d.code, 'RULES_UNAVAILABLE')
})

test('missing evidence of any kind refuses', () => {
  for (const ev of [{}, { observation: null, sector, rules: {} }, { observation: {}, sector: null, rules: {} }]) {
    assert.equal(referenceDecision(ev).decision, 'REFUSE')
  }
})

test('confidence below the 0.78 threshold refuses even when everything else is fine', () => {
  const obs = observe(gapCurb, 4)
  const weak = { ...obs, confidence: DEFAULT_CONFIDENCE_THRESHOLD - 0.01 }
  assert.equal(referenceDecision({ observation: weak, sector, rules: buildRules(openZone, mon1200) }).code, 'LOW_CONFIDENCE')
})

test('roi is normalised and clipped to the frame', () => {
  const roi = bandRoi(band, 840, 630)
  assert.ok(roi.x >= 0 && roi.y >= 0 && roi.x + roi.width <= 1.0001 && roi.y + roi.height <= 1.0001, JSON.stringify(roi))
  assert.ok(roi.width > 0 && roi.height > 0)
})

test('overlap_with_roi is 0 outside the band and high for a car sitting in it', () => {
  assert.equal(overlapWithRoi(band, car(300)), 1)
  const away = { ...car(300), bottomCenter: [325, 500] }
  assert.equal(overlapWithRoi(band, away), 0)
})

test('detections carry parked/moving so the UI cannot present traffic as a parked car', () => {
  const moving = { ...car(300), dwell: 1 }
  const obs = observe([moving, ...gapCurb], 4)
  const d = obs.detections.find((x) => x.overlap_with_roi > 0 && x.parked === false)
  assert.ok(d, 'a dwell-1 vehicle must be reported parked:false')
})
