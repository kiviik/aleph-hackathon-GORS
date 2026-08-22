// Exports the laptop-learned artifacts the mobile app consumes as a bundled fixture.
//
// Band learning needs ~20 distinct frames (~30-40 min of history) per camera and is far too
// expensive for a phone, so it stays here. The phone gets the *result*: band geometry, the
// fitted perspective scale, and the matched parking zone with its rule strings.
//
//   node scripts/export-mobile-assets.mjs [outDir]
//
// Default outDir: mobile/src/data
import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { zonesNear, zoneOnCameraStreet, pointAlongZone, zoneLengthM } from '../src/zones.mjs'
import { dataFile, MOBILE_DATA, HARNESS, rel } from '../src/paths.mjs'

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : MOBILE_DATA
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'))

const state = await read(dataFile('state.json'))
const cameras = await read(dataFile('cameras.json'))
const zones = await read(dataFile('zones.json'))
const byId = new Map(cameras.map((c) => [c.id, c]))

let sha = 'unknown'
try { sha = execSync('git rev-parse --short HEAD', { cwd: HARNESS, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}

const out = {}
const skipped = []
for (const [id, st] of Object.entries(state)) {
  const cam = byId.get(id)
  if (!cam) { skipped.push(`${id}: camera not in cameras.json`); continue }
  if (!st.bands?.length) { skipped.push(`${id}: no learned bands`); continue }

  // Match the camera to its parking zone exactly as the desktop pipeline does, then bake the
  // result so the phone needs neither turf nor the 345 KB zone dataset.
  const near = zonesNear(cam, zones, 120)
  const onStreet = near.filter((n) => zoneOnCameraStreet(n.zone, cam))
  const pick = (onStreet[0] || near[0])
  if (!pick) { skipped.push(`${id}: no parking zone within 120 m`); continue }
  const z = pick.zone

  out[id] = {
    id,
    name: cam.name,
    location: cam.location,
    quadrant: cam.quadrant,
    lat: cam.lat,
    lng: cam.lng,
    url: cam.url,
    bands: st.bands.map((b) => ({
      id: b.id, p0: b.p0, p1: b.p1, dir: b.dir, length: b.length,
      halfWidth: b.halfWidth, meanBoxH: b.meanBoxH, coreT: b.coreT, slots: b.slots, support: b.support
    })),
    scales: st.scales,
    zone: {
      id: z.id,
      address: z.address,
      blockSide: z.blockSide,
      stallType: z.stallType,
      enforceableTime: z.enforceableTime,
      restrictType: z.restrictType,
      restrictTime: z.restrictTime,
      maxTime: z.maxTime,
      priceZone: z.priceZone,
      brz: z.brz,
      distanceM: pick.distanceM,
      onCameraStreet: onStreet.length > 0,
      lengthM: +zoneLengthM(z).toFixed(1),
      // Endpoints only: the phone lerps along these instead of carrying the full polyline.
      p0: pointAlongZone(z, 0).map((v) => +v.toFixed(6)),
      p1: pointAlongZone(z, 1).map((v) => +v.toFixed(6))
    }
  }
}

const doc = {
  exportedAt: new Date().toISOString(),
  sourceRepo: 'aleph-hackaton-GOR/harness',
  sourceSha: sha,
  note: 'Bands learned offline from traffic-camera history. Synthetic of nothing: geometry is real, rules are City of Calgary open data. Not legal parking advice.',
  cameras: out
}

await fs.mkdir(OUT, { recursive: true })
const file = path.join(OUT, 'bands.json')
await fs.writeFile(file, JSON.stringify(doc, null, 1))
const bytes = (await fs.stat(file)).size
console.log(`wrote ${rel(file)} — ${Object.keys(out).length} cameras, ${Object.values(out).reduce((s, c) => s + c.bands.length, 0)} bands, ${(bytes / 1024).toFixed(1)} KB`)
for (const s of skipped) console.log('  skipped', s)
