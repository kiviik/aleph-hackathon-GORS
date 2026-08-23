// Exports the laptop-learned artifacts the mobile app consumes as a bundled fixture.
//
// Band learning needs ~20 distinct frames (~30-40 min of history) per camera and is far too
// expensive for a phone, so it stays here. The phone gets the *result*: band geometry, the
// fitted perspective scale, and the matched parking zone with its rule strings.
//
//   node scripts/export-mobile-assets.mjs [outDir]
//     --source auto|learned|state|fixture
//                                   auto (default): learned-bands.json per camera, else state.json;
//                                   fixture: keep the geometry already shipped and only re-match
//                                   zones (no re-learn, so nothing about the curbs changes)
//     --only 76,164                 export just these cameras, keeping the rest of the fixture
//     --dry-run                     print the diff and write nothing
//     --allow-band-loss             permit an export that drops bands or cameras
//
// Default outDir: mobile/src/data
//
// Cameras listed in data/disabled-cameras.json are excluded from every source and are not counted
// as band loss. That file is the permanent record of which cameras the app refuses to ship.
//
// The band-loss guard is not optional caution. `data/state.json` holds ONE band for camera 76,
// while the shipped fixture holds two -- the two-band entry came from a research-repo export that
// cannot be reproduced here. Re-running this script used to silently delete the only camera in the
// fixture that models both curbs of a street.
import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { clampBandExtension } from '../../mobile/src/core/scale.mjs'
import { applyOverrides, proposeBandZones } from '../src/band-zones.mjs'
import { zonesNear, zoneOnCameraStreet, pointAlongZone, zoneLengthM } from '../src/zones.mjs'
import { dataFile, MOBILE_DATA, HARNESS, rel } from '../src/paths.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--dry-run', '--allow-band-loss'].includes(argv[i - 1])))
const OUT = positional[0] ? path.resolve(positional[0]) : MOBILE_DATA
const SOURCE = String(flag('source', 'auto'))
const ONLY = flag('only') ? String(flag('only')).split(',') : null
const DRY_RUN = Boolean(flag('dry-run'))
const ALLOW_BAND_LOSS = Boolean(flag('allow-band-loss'))

const read = async (p, fallback = undefined) => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'))
  } catch (e) {
    if (fallback !== undefined) return fallback
    throw e
  }
}

const state = await read(dataFile('state.json'))
const cameras = await read(dataFile('cameras.json'))
const zones = await read(dataFile('zones.json'))
const learnedDoc = await read(dataFile('learned-bands.json'), { cameras: {} })
const overrides = await read(dataFile('band-zones.json'), { cameras: {} })
const previousDoc = await read(path.join(OUT, 'bands.json'), { cameras: {} })
const disabledDoc = await read(dataFile('disabled-cameras.json'), { cameras: {} })
const byId = new Map(cameras.map((c) => [c.id, c]))

// A disabled camera is filtered out of the shipped fixture *before* anything reads it, which is
// what makes the exclusion hold for every source: `--source fixture` iterates these keys, `--only`
// copies them through untouched, and the band-loss guard diffs against them. Dropping them here
// covers all three at once, and means a disabled camera never counts as lost geometry.
const DISABLED = new Map(Object.entries(disabledDoc.cameras ?? {}))
const previous = {
  ...previousDoc,
  cameras: Object.fromEntries(Object.entries(previousDoc.cameras ?? {}).filter(([id]) => !DISABLED.has(id)))
}
const dropped = Object.keys(previousDoc.cameras ?? {}).filter((id) => DISABLED.has(id))

let sha = 'unknown'
try { sha = execSync('git rev-parse --short HEAD', { cwd: HARNESS, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}

/** Where each camera's geometry comes from: the reviewed learner output, or the checked-in state. */
function geometryFor (id) {
  const learned = learnedDoc.cameras?.[id]
  const fromState = state[id]
  const shipped = previous.cameras?.[id]
  // `fixture` re-runs everything downstream of the geometry -- per-band zone matching above all --
  // against the bands already shipped. Nothing about the curbs moves, which is what makes it safe
  // to run before any history has been collected.
  if (SOURCE === 'fixture') {
    return shipped?.bands?.length
      ? { bands: shipped.bands, scales: shipped.scales, provenance: shipped.provenance ?? { source: 'fixture (geometry unchanged)' } }
      : null
  }
  if (SOURCE === 'state') return fromState?.bands?.length ? { bands: fromState.bands, scales: fromState.scales, provenance: { source: 'state.json' } } : null
  if (learned?.bands?.length) {
    return {
      bands: learned.bands,
      scales: learned.scales,
      provenance: { source: 'learned-bands.json', frames: learned.source?.frames ?? null, learnedAt: learnedDoc.learnedAt ?? null, passes: learned.source?.passes ?? null }
    }
  }
  if (SOURCE === 'learned') return null
  return fromState?.bands?.length ? { bands: fromState.bands, scales: fromState.scales, provenance: { source: 'state.json' } } : null
}

const out = {}
const skipped = []
const notes = []

// --only keeps every camera it does not name exactly as the fixture already has it, so one camera
// can be re-learned and reviewed without republishing the other fourteen.
if (ONLY) for (const [id, cam] of Object.entries(previous.cameras ?? {})) if (!ONLY.includes(id)) out[id] = cam

const ids = ONLY ?? (SOURCE === 'fixture'
  ? Object.keys(previous.cameras ?? {})
  : [...new Set([...Object.keys(state), ...Object.keys(learnedDoc.cameras ?? {})])])
for (const id of ids) {
  // state.json and learned-bands.json still carry rows for disabled cameras; this is what stops
  // `--source auto` from quietly resurrecting one.
  if (DISABLED.has(id)) { skipped.push(`${id}: disabled — ${DISABLED.get(id).why}`); continue }
  const cam = byId.get(id)
  if (!cam) { skipped.push(`${id}: camera not in cameras.json`); continue }
  const geometry = geometryFor(id)
  if (!geometry) { skipped.push(`${id}: no learned bands`); continue }

  // A band with no fitted scale cannot be measured in metres, so it cannot report free space and
  // must not become a map pin. Drop it here rather than shipping something unjudgeable.
  const withScale = geometry.bands.filter((b) => geometry.scales?.[b.id]?.ok)
  if (withScale.length < geometry.bands.length) {
    notes.push(`${id}: dropped ${geometry.bands.length - withScale.length} band(s) with no fitted scale`)
  }
  if (!withScale.length) { skipped.push(`${id}: no band with a fitted scale`); continue }

  // Every source is re-bound here, not just the learner's own output. state.json and the shipped
  // fixture were padded by a flat two car lengths per end in the research repo, with no relation to
  // how much curb each band actually observed -- which is where the false "free" readings came from.
  const scales = {}
  const usable = withScale.map((b) => {
    const clamped = clampBandExtension(b, geometry.scales[b.id])
    scales[b.id] = clamped.scale
    if (clamped.band.length < b.length - 0.5) {
      notes.push(`${id}/${b.id}: extension clamped ${b.length.toFixed(0)} -> ${clamped.band.length.toFixed(0)} px (core ${clamped.band.coreT.map((v) => v.toFixed(0)).join('-')})`)
    }
    return clamped.band
  })

  // Match the camera to its parking zone exactly as the desktop pipeline does, then bake the
  // result so the phone needs neither turf nor the 345 KB zone dataset.
  const near = zonesNear(cam, zones, 120)
  const onStreet = near.filter((n) => zoneOnCameraStreet(n.zone, cam))
  const pick = (onStreet[0] || near[0])
  if (!pick) { skipped.push(`${id}: no parking zone within 120 m`); continue }

  const matches = applyOverrides(id, proposeBandZones(cam, usable, geometry.scales, zones), overrides)
  const zoneById = new Map(near.map((n) => [n.zone.id, { zone: n.zone, distanceM: n.distanceM, onCameraStreet: zoneOnCameraStreet(n.zone, cam) }]))
  const shipped = {}
  for (const m of Object.values(matches)) {
    if (m.zoneId && zoneById.has(m.zoneId)) shipped[m.zoneId] = bakeZone(zoneById.get(m.zoneId))
  }
  const primary = bakeZone({ zone: pick.zone, distanceM: pick.distanceM, onCameraStreet: onStreet.length > 0 })
  shipped[primary.id] ||= primary

  out[id] = {
    id,
    name: cam.name,
    location: cam.location,
    quadrant: cam.quadrant,
    lat: cam.lat,
    lng: cam.lng,
    url: cam.url,
    bands: usable.map((b) => {
      const m = matches[b.id] ?? {}
      return {
        id: b.id, p0: b.p0, p1: b.p1, dir: b.dir, length: b.length,
        halfWidth: b.halfWidth, meanBoxH: b.meanBoxH, coreT: b.coreT, slots: b.slots, support: b.support,
        // Fixture v2: which curb this is, and which zone's rules govern it. Absent means unknown,
        // and the app refuses rather than borrowing the other curb's law.
        ...(m.zoneId ? { zoneId: m.zoneId } : {}),
        ...(m.sideKey ? { sideKey: m.sideKey } : {}),
        ...(m.nearness ? { nearness: m.nearness } : {}),
        ...(m.source ? { zoneMatch: { source: m.source, confidence: m.confidence, why: m.why } } : {})
      }
    }),
    scales: Object.fromEntries(usable.map((b) => [b.id, scales[b.id]])),
    zone: primary,
    zones: shipped,
    provenance: geometry.provenance
  }
}

function bakeZone ({ zone: z, distanceM, onCameraStreet }) {
  return {
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
    distanceM,
    onCameraStreet,
    lengthM: +zoneLengthM(z).toFixed(1),
    // Endpoints only: the phone lerps along these instead of carrying the full polyline.
    p0: pointAlongZone(z, 0).map((v) => +v.toFixed(6)),
    p1: pointAlongZone(z, 1).map((v) => +v.toFixed(6))
  }
}

// ---------- the diff, and the guard ----------

const before = previous.cameras ?? {}
const lost = Object.keys(before).filter((id) => !out[id])
const added = Object.keys(out).filter((id) => !before[id])
const shrunk = Object.keys(out).filter((id) => before[id] && out[id].bands.length < before[id].bands.length)

console.log(`export → ${rel(path.join(OUT, 'bands.json'))}${DRY_RUN ? '  (dry run)' : ''}`)
for (const id of Object.keys(out).sort((a, b) => Number(a) - Number(b))) {
  const p = out[id].provenance ?? {}
  const was = before[id]?.bands.length
  const now = out[id].bands.length
  const delta = was == null ? 'new' : was === now ? `${now} band${now === 1 ? '' : 's'}` : `${was} → ${now} bands`
  const sides = out[id].bands.map((b) => b.sideKey ?? b.nearness ?? '—').join('/')
  console.log(`  ${id.padEnd(4)} ${String(p.source ?? 'kept from fixture').padEnd(26)} ${delta.padEnd(14)} sides ${sides}`)
}
for (const n of notes) console.log(`  note: ${n}`)
for (const s of skipped) console.log(`  skipped ${s}`)
if (added.length) console.log(`  added cameras: ${added.join(', ')}`)
for (const id of dropped) console.log(`  removed ${id} from the fixture — disabled in ${rel(dataFile('disabled-cameras.json'))}`)
if (DISABLED.size) console.log(`  disabled: ${[...DISABLED.keys()].join(', ')}`)

if ((lost.length || shrunk.length) && !ALLOW_BAND_LOSS) {
  console.error('\nREFUSING TO WRITE — this export would remove curb geometry the app already ships:')
  for (const id of lost) console.error(`  camera ${id} disappears (${before[id].bands.length} band(s))`)
  for (const id of shrunk) console.error(`  camera ${id} drops ${before[id].bands.length - out[id].bands.length} band(s)`)
  console.error('\nA camera modelling both curbs of a street is exactly what this repo is trying to keep.')
  console.error('Re-learn the missing cameras first (npm run collect:history && npm run learn:bands),')
  console.error('or pass --allow-band-loss if the loss is genuinely intended.')
  process.exit(3)
}

if (DRY_RUN) {
  console.log('\ndry run: nothing written')
  process.exit(0)
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
console.log(`\nwrote ${rel(file)} — ${Object.keys(out).length} cameras, ${Object.values(out).reduce((s, c) => s + c.bands.length, 0)} bands, ${(bytes / 1024).toFixed(1)} KB`)
console.log('The phone drops its saved band history when exportedAt changes, so every segment re-climbs MIN_TICKS.')
