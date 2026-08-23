// What survives an app restart, and what must not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESTORE_MAX_AGE_MS, packVerdicts, restoreVerdicts, verdictOf } from '../src/core/verdicts.mjs'

const FIXTURE = '2026-08-22T21:31:47.905Z'
const now = 1787500000000

const spot = (over = {}) => ({
  id: '76-b0', street: '7 St SW', number: '5 Av → 6 Av', neighborhood: 'Downtown',
  latitude: 51.0486, longitude: -114.0785, heading: 190, band: { id: 'b0', length: 523 },
  sideLabel: 'near curb', accuracyM: 14, spanM: 28.4,
  status: 'free', confidence: '82%', checked: '2 min', capturedAt: now - 60_000,
  carsFit: 2, freeMetres: 11.4, decision: 'PARK', reason: 'Hueco confirmado', rule: 'Permitido ahora',
  ticks: 3, gaps: [{ t1: 10, t2: 200 }], scanned: true, ...over
})

test('only the scan half of a spot is stored: geometry is re-seeded, never restored', () => {
  const v = verdictOf(spot())
  assert.equal(v.status, 'free')
  assert.equal(v.freeMetres, 11.4)
  // Geometry and labels come from the fixture on every mount. Storing them is how the two drift.
  for (const key of ['latitude', 'longitude', 'band', 'sideLabel', 'accuracyM', 'spanM', 'street', 'heading']) {
    assert.equal(v[key], undefined, `${key} must not be stored`)
  }
})

test('an unscanned spot is not stored at all', () => {
  const blob = packVerdicts([spot(), spot({ id: '14-b0', scanned: false, status: 'unscanned' })], FIXTURE)
  assert.deepEqual(Object.keys(blob.spots), ['76-b0'])
})

test('a fresh verdict comes back, with its own frame time', () => {
  const blob = packVerdicts([spot()], FIXTURE)
  const restored = restoreVerdicts(blob, FIXTURE, now)
  assert.equal(restored['76-b0'].status, 'free')
  assert.equal(restored['76-b0'].capturedAt, now - 60_000)
  assert.equal(restored['76-b0'].ticks, 3)
})

test('a verdict older than its evidence is dropped, not shown as current', () => {
  // Matched to temporal.mjs MAX_GAP_MS: past this the band state behind it is wiped as too old to
  // build on, so the verdict it produced must not stay on the map either.
  const stale = packVerdicts([spot({ capturedAt: now - RESTORE_MAX_AGE_MS - 1000 })], FIXTURE)
  assert.deepEqual(restoreVerdicts(stale, FIXTURE, now), {})

  const edge = packVerdicts([spot({ capturedAt: now - RESTORE_MAX_AGE_MS + 1000 })], FIXTURE)
  assert.equal(Object.keys(restoreVerdicts(edge, FIXTURE, now)).length, 1)
})

test('a verdict without a frame time is dropped: its age cannot be checked', () => {
  assert.deepEqual(restoreVerdicts(packVerdicts([spot({ capturedAt: null })], FIXTURE), FIXTURE, now), {})
  assert.deepEqual(restoreVerdicts(packVerdicts([spot({ capturedAt: undefined })], FIXTURE), FIXTURE, now), {})
})

test('a verdict does not survive a fixture change', () => {
  // Band ids are positional -- the learner sorts by support and renames b0..bn -- so after a
  // re-export "76-b0" can be the other curb entirely. Showing last night's answer on it would
  // attach a verdict to a curb it was never about.
  const blob = packVerdicts([spot()], FIXTURE)
  assert.deepEqual(restoreVerdicts(blob, '2026-09-01T00:00:00.000Z', now), {})
})

test('a missing or corrupt store restores nothing rather than throwing', () => {
  assert.deepEqual(restoreVerdicts(null, FIXTURE, now), {})
  assert.deepEqual(restoreVerdicts({}, FIXTURE, now), {})
  assert.deepEqual(restoreVerdicts({ exportedAt: FIXTURE }, FIXTURE, now), {})
  assert.deepEqual(restoreVerdicts({ exportedAt: FIXTURE, spots: { x: null } }, FIXTURE, now), {})
})
