// Band -> map placement, against the shipped fixture. No model, no device, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MIN_ACCURACY_M, STREET_WIDTH_M,
  bandSide, bandSpanM, coreRange, judgeableRange, localFrame, metresFromNearEnd, nearEnd,
  offsetForSide, placeBand, zoneAxis, zoneForBand
} from '../src/core/placement.mjs'
import { metresBetween, pxPerMetre } from '../src/core/scale.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const doc = JSON.parse(fs.readFileSync(path.join(here, '../src/data/bands.json'), 'utf8'))
const cam = (id) => doc.cameras[id]

function haversineM (aLat, aLng, bLat, bLng) {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

test('localFrame round-trips a point to within a millimetre', () => {
  const frame = localFrame([-114.0786, 51.04882])
  const target = [-114.07835, 51.04901]
  const [lng, lat] = frame.toGeo(frame.toLocal(target))
  assert.ok(haversineM(target[1], target[0], lat, lng) < 0.001)
})

test('nearEnd reads the perspective slope, and refuses to guess on a flat fit', () => {
  // px/m grows toward the camera: b > 0 puts the near end at t = length.
  assert.equal(nearEnd(cam('76').bands[0], cam('76').scales.b0), 't1') // b +0.046755
  assert.equal(nearEnd(cam('76').bands[1], cam('76').scales.b1), 't1') // b +0.096136
  assert.equal(nearEnd(cam('157').bands[0], cam('157').scales.b0), 't0') // b -0.030211
  assert.equal(nearEnd(cam('219').bands[0], cam('219').scales.b0), 't0') // b -0.060233
  assert.equal(nearEnd(cam('76').bands[0], { a: 10, b: 0, ok: true }), null)
  assert.equal(nearEnd(cam('76').bands[0], { a: 10, b: 0.046, ok: false }), null)
})

test('metresFromNearEnd is zero at the near end and the full span at the far one', () => {
  const band = cam('76').bands[0]
  const scale = cam('76').scales.b0
  const [c0, c1] = judgeableRange(band, scale)
  const span = bandSpanM(band, scale)
  assert.ok(Math.abs(span - metresBetween(scale, c0, c1)) < 1e-9)
  assert.ok(Math.abs(metresFromNearEnd(band, scale, c1)) < 1e-9, 'near end (t1) must be 0 m')
  assert.ok(Math.abs(metresFromNearEnd(band, scale, c0) - span) < 1e-9)
  // outside the core it clamps rather than extrapolating
  assert.equal(metresFromNearEnd(band, scale, band.length * 2), metresFromNearEnd(band, scale, c1))
  assert.equal(metresFromNearEnd(band, scale, -500), metresFromNearEnd(band, scale, c0))
})

test('the judgeable span is the stretch gaps can actually be measured on', () => {
  // gaps.mjs refuses any gap below MIN_PX_PER_M, so the far end of a steep band can never read
  // free. Reporting the learned core instead put "8.9 m of curb" next to "23.9 m free" on camera
  // 76's far band; the judgeable span for it is 17.8 m, which is consistent with what it reports.
  // (It was 24.5 m before the extension bound was enforced on the fixture: that band observed
  // 8.9 m of parked cars and carried 27 m of guessed curb, 20.4 m of it on one end.)
  const camera = cam('76')
  for (const band of camera.bands) {
    const scale = camera.scales[band.id]
    const [t0, t1] = judgeableRange(band, scale)
    assert.ok(t0 >= 0 && t1 <= band.length && t1 > t0)
    assert.ok(pxPerMetre(scale, (t0 + t1) / 2) >= 3)
  }
  assert.ok(Math.abs(bandSpanM(camera.bands[1], camera.scales.b1) - 17.8) < 0.2)
})

test('a placement never leaves the surveyed zone segment', () => {
  for (const [id, camera] of Object.entries(doc.cameras)) {
    const axis = zoneAxis(camera.zone)
    for (const band of camera.bands) {
      const p = placeBand(camera, band, camera.scales[band.id])
      const [e, n] = axis.frame.toLocal([p.lng, p.lat])
      const s = e * axis.u[0] + n * axis.u[1]
      assert.ok(s >= -0.5 && s <= axis.lengthM + 0.5, `${id}/${band.id}: ${s.toFixed(1)} m outside [0, ${axis.lengthM.toFixed(1)}]`)
      assert.ok(p.accuracyM >= MIN_ACCURACY_M)
      assert.equal(p.placement, 'anchored')
      assert.equal(p.offsetM, 0, 'no fixture band carries a side yet, so nothing may be offset')
    }
  }
})

test('camera 219 clamps: a 20 m band on an 11.9 m segment stops at the end', () => {
  const camera = cam('219')
  const axis = zoneAxis(camera.zone)
  const p = placeBand(camera, camera.bands[0], camera.scales.b0)
  assert.ok(bandSpanM(camera.bands[0], camera.scales.b0) > axis.lengthM)
  const [lng, lat] = camera.zone.p1
  assert.ok(haversineM(lat, lng, p.lat, p.lng) < axis.lengthM + 1)
})

test('placement is deterministic: gap sets do not move the pin', () => {
  const camera = cam('76')
  const a = placeBand(camera, camera.bands[0], camera.scales.b0)
  const b = placeBand(camera, camera.bands[0], camera.scales.b0)
  assert.deepEqual(a, b)
  // asking about a specific t moves the reported point, but only when a caller asks for it
  const at0 = placeBand(camera, camera.bands[0], camera.scales.b0, { t: camera.bands[0].coreT[0] })
  assert.notDeepEqual([at0.lng, at0.lat], [a.lng, a.lat])
})

test('a flat perspective fit degrades to the zone midpoint and says so', () => {
  const camera = cam('76')
  const p = placeBand(camera, camera.bands[0], { a: 12, b: 0, ok: true })
  const axis = zoneAxis(camera.zone)
  const mid = axis.frame.toGeo([axis.u[0] * axis.lengthM / 2, axis.u[1] * axis.lengthM / 2])
  assert.equal(p.placement, 'zone-midpoint')
  assert.ok(haversineM(mid[1], mid[0], p.lat, p.lng) < 0.2)
  assert.equal(p.endpoints, null)
})

test('the two bands of camera 76 are placed apart and ranked near/far', () => {
  const camera = cam('76')
  const b0 = placeBand(camera, camera.bands[0], camera.scales.b0)
  const b1 = placeBand(camera, camera.bands[1], camera.scales.b1)
  const side0 = bandSide(camera, camera.bands[0], camera.scales.b0, camera.bands)
  const side1 = bandSide(camera, camera.bands[1], camera.scales.b1, camera.bands)
  // meanBoxH 60.4 vs 38.8: b0 is the near curb.
  assert.equal(side0.nearness, 'near')
  assert.equal(side1.nearness, 'far')
  assert.equal(side0.source, 'nearness')
  assert.equal(side0.label, 'near curb')
  assert.notDeepEqual([b0.lng, b0.lat], [b1.lng, b1.lat])
  // Their curb segments DO coincide here, and that is the honest answer: both bands read more curb
  // (23.7 m and 17.8 m) than the 16.7 m zone segment they currently share, so both clamp to the
  // whole of it. Only a per-band zone match separates them geographically -- until then the map
  // tells them apart by label and by screen-space declutter, not by pretending to know where the
  // far curb is. The next test covers the matched case.
  assert.deepEqual(b0.endpoints, b1.endpoints)
  assert.ok(bandSpanM(camera.bands[0], camera.scales.b0) > zoneAxis(camera.zone).lengthM)
})

test('a single-band camera gets no side wording it cannot justify', () => {
  const camera = cam('14')
  const side = bandSide(camera, camera.bands[0], camera.scales.b0, camera.bands)
  assert.deepEqual(side, { key: null, nearness: null, label: null, source: 'none' })
})

test('a matched per-band zone supplies the compass side and needs no offset', () => {
  const camera = cam('76')
  const west = { id: '1695', blockSide: 'W', p0: [-114.078742, 51.048686], p1: [-114.078752, 51.048536] }
  const band = { ...camera.bands[1], zoneId: '1695' }
  const withZones = { ...camera, zones: { 1695: west } }
  assert.equal(zoneForBand(withZones, band).id, '1695')
  const side = bandSide(withZones, band, camera.scales.b1, camera.bands)
  assert.equal(side.key, 'W')
  assert.equal(side.source, 'zone')
  const p = placeBand(withZones, band, camera.scales.b1)
  assert.equal(p.zoneId, '1695')
  assert.equal(p.offsetM, 0, 'the zone line already sits on its own curb')
  // and it lands on the west curb, ~12 m from the east one
  const east = placeBand(camera, camera.bands[1], camera.scales.b1)
  assert.ok(haversineM(east.lat, east.lng, p.lat, p.lng) > 10)
})

test('the perpendicular offset is one street width, and only when the side is known', () => {
  // A due-north zone on the east curb; its west twin is one street width away.
  const zone = { id: 'z', blockSide: 'E', p0: [-114.0, 51.0], p1: [-114.0, 51.001] }
  assert.equal(offsetForSide(zone, 'E'), 0, 'same side as the zone: no offset')
  assert.equal(offsetForSide(zone, null), 0)
  assert.equal(offsetForSide({ ...zone, blockSide: null }, 'W'), 0)
  const west = offsetForSide(zone, 'W')
  assert.equal(Math.abs(west), STREET_WIDTH_M)

  const camera = { lat: 51.0005, lng: -114.0, zone, bands: [] }
  const band = { id: 'b0', p0: [0, 0], p1: [100, 0], dir: [1, 0], length: 100, coreT: [0, 100], meanBoxH: 40, sideKey: 'W' }
  const scale = { a: 10, b: 0.01, ok: true }
  const p = placeBand(camera, band, scale)
  const base = placeBand(camera, { ...band, sideKey: null }, scale)
  assert.ok(p.lng < base.lng, 'W must move west')
  assert.ok(Math.abs(haversineM(base.lat, base.lng, p.lat, p.lng) - STREET_WIDTH_M) < 0.1)
  assert.equal(placeBand(camera, { ...band, sideKey: 'E' }, scale).offsetM, 0)
})

test('a band stripped of every optional field still places without throwing', () => {
  const camera = cam('76')
  const bare = { id: 'b0', p0: camera.bands[0].p0, p1: camera.bands[0].p1, dir: camera.bands[0].dir, length: camera.bands[0].length }
  const p = placeBand(camera, bare, camera.scales.b0)
  assert.equal(p.placement, 'anchored')
  assert.ok(p.accuracyM >= MIN_ACCURACY_M)
  assert.deepEqual(coreRange(bare), [0, bare.length], 'a band without coreT reads as its whole length')
  assert.equal(bandSide(camera, bare, camera.scales.b0, [bare]).label, null)
})

test('a camera without usable zone endpoints falls back to the camera pin, flagged', () => {
  const camera = { ...cam('76'), zone: { id: 'x' } }
  const p = placeBand(camera, camera.bands[0], camera.scales.b0)
  assert.equal(p.placement, 'camera')
  assert.equal(p.lat, camera.lat)
  assert.equal(p.lng, camera.lng)
})
