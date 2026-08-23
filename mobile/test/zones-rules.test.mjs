// Ported from the source repo's test/zones.test.mjs (rules half only -- the turf geometry is
// precomputed into bands.json), plus coverage for the no-ICU fallback that Hermes forces.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnforceable, parseRestrict, legality, localNow, tzSupport } from '../src/core/zones-rules.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

// Monday 2026-08-24, Sunday 2026-08-23, in Calgary local time (MDT = UTC-6).
const mon1730 = new Date('2026-08-24T23:30:00Z')
const mon1200 = new Date('2026-08-24T18:00:00Z')
const sun1730 = new Date('2026-08-23T23:30:00Z')

test('parseEnforceable handles real formats', () => {
  assert.equal(parseEnforceable('0910-1750 MON-SAT').length, 1)
  assert.equal(parseEnforceable('0910-1520 MON-FRI,0910-1750 SAT').length, 2)
  assert.equal(parseEnforceable('0910-1420 MON-THU,1540-1750 MON-THU,0910-1220 FRI,1340-1750 FRI').length, 4)
  assert.equal(parseEnforceable('0840-1520 MON-FRI, 0001-2359 SAT-SUN')[1].days.has(0), true)
  assert.equal(parseEnforceable('garbage'), null)
})

test('parseRestrict', () => {
  assert.deepEqual(parseRestrict('none', 'none'), [])
  assert.equal(parseRestrict('AM&PM', '07:00 - 08:30 , 15:30 - 18:00').length, 2)
  assert.equal(parseRestrict('PM', '15:30 -18:00')[0].from, 930)
  assert.equal(parseRestrict('PM', undefined), null)
})

test('legality: rush-hour restriction blocks weekdays only', () => {
  const z = { enforceableTime: '0910-1750 MON-SAT', restrictType: 'AM&PM', restrictTime: '07:00 - 08:30 , 15:30 - 18:00' }
  assert.equal(legality(z, mon1730).parkable, false)
  assert.equal(legality(z, mon1200).parkable, true)
  assert.equal(legality(z, mon1200).paid, true)
  assert.equal(legality(z, sun1730).parkable, true)
  assert.equal(legality(z, sun1730).paid, false)
})

test('an unparseable restriction is refused, never assumed parkable', () => {
  assert.equal(legality({ restrictType: 'PM' }, mon1200).parkable, false)
  assert.equal(legality({ restrictType: 'AM', restrictTime: 'sometimes' }, mon1200).parkable, false)
})

test('the no-ICU fallback agrees with Intl for every hour of 2026', () => {
  assert.equal(tzSupport(), true, 'node should have full ICU; this test compares against it')
  let mismatches = 0
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3600 * 1000) {
    const d = new Date(t)
    const icu = localNow(d)
    const fb = localNow(d, { forceFallback: true })
    if (icu.dow !== fb.dow || icu.minutes !== fb.minutes) mismatches++
  }
  assert.equal(mismatches, 0)
})

test('the fallback gets both DST transitions right', () => {
  // 2026: DST starts Mar 8, ends Nov 1.
  const cases = [
    ['2026-03-08T08:59:00Z', 119], // 01:59 MST
    ['2026-03-08T09:00:00Z', 180], // 03:00 MDT -- 02:00 does not exist
    ['2026-11-01T07:59:00Z', 119], // 01:59 MDT
    ['2026-11-01T08:00:00Z', 60]   // 01:00 MST -- the hour repeats
  ]
  for (const [iso, minutes] of cases) {
    assert.equal(localNow(new Date(iso), { forceFallback: true }).minutes, minutes, iso)
  }
})

test('every zone in the shipped fixture parses; none is silently unparseable', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(here, '../src/data/bands.json'), 'utf8'))
  const cams = Object.values(doc.cameras)
  assert.ok(cams.length > 0)
  for (const c of cams) {
    const r = parseRestrict(c.zone.restrictType, c.zone.restrictTime)
    assert.notEqual(r, null, `camera ${c.id}: unparseable restrict "${c.zone.restrictType}" / "${c.zone.restrictTime}"`)
    const verdict = legality(c.zone, mon1200)
    assert.ok(typeof verdict.parkable === 'boolean')
    assert.ok(typeof verdict.reason === 'string' && verdict.reason.length > 0)
  }
})

test('fixture integrity: every camera has bands, a scale per band, and a zone', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(here, '../src/data/bands.json'), 'utf8'))
  for (const [id, c] of Object.entries(doc.cameras)) {
    assert.equal(c.id, id)
    assert.ok(c.bands.length > 0, `camera ${id} has no bands`)
    assert.ok(c.url && c.url.startsWith('https://'), `camera ${id} url must be https`)
    assert.ok(Number.isFinite(c.lat) && Number.isFinite(c.lng))
    for (const b of c.bands) {
      assert.ok(c.scales[b.id]?.ok, `camera ${id} band ${b.id} has no usable scale`)
      assert.ok(b.length > 0 && b.halfWidth > 0 && b.meanBoxH > 0)
      assert.ok(Math.abs(Math.hypot(b.dir[0], b.dir[1]) - 1) < 1e-3, 'dir must be a unit vector')
      // Fixture v2 fields are optional, but a band that carries one must carry a usable one:
      // a half-stated side is worse than none, because the UI would name the wrong curb.
      if (b.zoneId) assert.ok(c.zones?.[b.zoneId], `camera ${id} band ${b.id} names zone ${b.zoneId}, which is not shipped`)
      if (b.sideKey) assert.ok(['N', 'S', 'E', 'W'].includes(b.sideKey), `camera ${id} band ${b.id} side ${b.sideKey}`)
      if (b.nearness) assert.ok(['near', 'far'].includes(b.nearness))
    }
    // Two bands of one camera are two different curbs: they may not claim the same side, the same
    // zone or the same distance rank, or the map would draw one on top of the other.
    for (const key of ['sideKey', 'nearness', 'zoneId']) {
      const stated = c.bands.map((b) => b[key]).filter(Boolean)
      assert.equal(new Set(stated).size, stated.length, `camera ${id} repeats ${key} across bands`)
    }
  }
})
