// Which curb gets which parking zone. Runs on the checked-in Calgary data, no sidecar, no model.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applyOverrides, bandsShareStreet, proposeBandZones } from '../src/band-zones.mjs'
import { dataFile, MOBILE_DATA } from '../src/paths.mjs'
import path from 'node:path'

const doc = JSON.parse(fs.readFileSync(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
const cameras = JSON.parse(fs.readFileSync(dataFile('cameras.json'), 'utf8'))
const zones = JSON.parse(fs.readFileSync(dataFile('zones.json'), 'utf8'))
const camera = (id) => cameras.find((c) => c.id === id)

test('camera 76: two converging curbs of one street, not two crossing streets', () => {
  const [b0, b1] = doc.cameras['76'].bands
  assert.equal(bandsShareStreet(b0, b1), true)
})

test('two bands that cross inside their own extents are two streets, and are refused', () => {
  const a = { id: 'a', p0: [0, 100], p1: [400, 100], dir: [1, 0], length: 400 }
  const b = { id: 'b', p0: [200, 0], p1: [200, 400], dir: [0, 1], length: 400 }
  assert.equal(bandsShareStreet(a, b), false)
})

test('camera 76 proposes the east zone for the near curb and the west zone for the far one', () => {
  // The two curbs really are different law: 1716 (E) bans 07:00-08:30 and 15:30-18:00, 1695 (W)
  // has no restriction at all. Getting this backwards authorises parking inside a ban.
  const cam = doc.cameras['76']
  const p = proposeBandZones(camera('76'), cam.bands, cam.scales, zones)
  assert.equal(p.b0.zoneId, '1716')
  assert.equal(p.b0.sideKey, 'E')
  assert.equal(p.b0.nearness, 'near') // meanBoxH 60.4 vs 38.8
  assert.equal(p.b1.zoneId, '1695')
  assert.equal(p.b1.sideKey, 'W')
  assert.equal(p.b1.nearness, 'far')
  assert.equal(p.b0.confidence, 'high')
})

test('a single-band camera keeps exactly the camera-level match it has today', () => {
  for (const id of ['14', '108', '157', '219']) {
    const cam = doc.cameras[id]
    const p = proposeBandZones(camera(id), cam.bands, cam.scales, zones)
    assert.equal(Object.keys(p).length, 1)
    assert.equal(p[cam.bands[0].id].zoneId, cam.zone.id, `camera ${id} changed its zone match`)
    assert.equal(p[cam.bands[0].id].confidence, 'none', 'a lone band has no per-band evidence')
  }
})

test('an override wins over the proposal, and an explicit null means "unknown"', () => {
  const cam = doc.cameras['76']
  const proposals = proposeBandZones(camera('76'), cam.bands, cam.scales, zones)
  const merged = applyOverrides('76', proposals, {
    cameras: { 76: { b0: { zoneId: '1717', verifiedBy: 'streetview' }, b1: null } }
  })
  assert.equal(merged.b0.zoneId, '1717')
  assert.equal(merged.b0.source, 'override')
  assert.equal(merged.b1.zoneId, null, 'null must survive as unknown, not fall back to a guess')
  assert.equal(merged.b1.source, 'override')
})

test('the shipped override table is empty until a human has actually checked a curb', () => {
  // Not decoration: an unverified per-band zone is the one failure mode that can send someone to
  // park in a rush-hour ban. The exporter is allowed to propose; only a person may confirm.
  const table = JSON.parse(fs.readFileSync(dataFile('band-zones.json'), 'utf8'))
  for (const [id, bands] of Object.entries(table.cameras)) {
    for (const [bandId, entry] of Object.entries(bands ?? {})) {
      if (!entry) continue
      assert.ok(entry.verifiedBy, `${id}/${bandId} has no verifiedBy`)
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedAt ?? ''), `${id}/${bandId} has no verifiedAt`)
    }
  }
})
