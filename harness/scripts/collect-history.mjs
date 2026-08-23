// Collect detection history from the live Calgary cameras, so bands can be re-learned here.
//
//   npm run detector                      # in another terminal
//   npm run collect:history -- --only 76,164 --frames 45
//
// Why this exists: band learning needs ~20+ distinct frames per camera, and the history the
// shipped geometry was learned from stayed in the research repo. Without this, `learn:bands` has
// no input in a clean clone and `state.json` can only be taken on faith.
//
// Three duplicate layers, cheapest first: a conditional GET answered 304 (the City honours both
// If-None-Match and If-Modified-Since), then Last-Modified equality, then a SHA-256 of the bytes.
// Polling re-phases to the camera's own clock, so the request rate stays near 1.5/camera/minute.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { detectVehicles, detectorHealth } from '../src/detector-client.mjs'
import { ensureHistoryDir, lastFrameFile, openAppender, readManifest, tailMeta, writeManifest } from '../src/history.mjs'
import { MOBILE_DATA, rel } from '../src/paths.mjs'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const FRAMES = Number(args.frames ?? 45)
const MINUTES = Number(args.minutes ?? Math.round(FRAMES * 1.6))
const POLL_MS = Number(args['poll-ms'] ?? 10000)
const CONCURRENCY = Number(args.concurrency ?? 6)
const KEEP_FRAMES = Boolean(args['keep-frames'])
const PASSES = String(args.passes ?? 'full,far,side').split(',')

const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
const all = Object.values(doc.cameras)
const only = args.only ? String(args.only).split(',') : null
const cameras = only ? all.filter((c) => only.includes(c.id)) : all
if (!cameras.length) {
  console.error(`no cameras matched${only ? ` --only ${args.only}` : ''}`)
  process.exit(2)
}

// Time of day is not a detail here. Below DARK_LUMA=45 the frames are unusable, and Calgary's
// AM/PM bans empty one curb at a time: a run started at 15:30 finds camera 76's east curb legally
// empty and learns a single band -- reproducing the very bug this data is meant to fix.
const local = localCalgary()
if (!args['allow-window'] && !withinWindow(local)) {
  console.error(`Refusing to collect at ${local.label} Calgary time.`)
  console.error('Collect on a weekday between 09:30 and 15:00: outside that, rush-hour bans empty one')
  console.error('curb and darkness makes the frames unusable, so the learner sees one side of the street.')
  console.error('Pass --allow-window to override (and expect a one-sided result).')
  process.exit(2)
}

if (!(await detectorHealth())) {
  console.error(`No detector sidecar at ${process.env.DETECTOR_URL || 'http://127.0.0.1:3085'} — run \`npm run detector\` first.`)
  process.exit(2)
}

await ensureHistoryDir()
const manifest = await readManifest()
const state = new Map()
for (const cam of cameras) {
  const tail = await tailMeta(cam.id)
  if (tail?.partial) console.warn(`  ${cam.id}: trailing partial line in history — it will be overwritten by the next append`)
  state.set(cam.id, {
    cam,
    frames: 0,
    have: tail?.frames ?? 0,
    capturedAt: tail?.capturedAt ?? null,
    etag: tail?.etag ?? null,
    lastModified: tail?.lastModified ?? null,
    sha256: tail?.sha256 ?? null,
    nextPollAt: 0,
    skipped304: 0,
    dupBytes: 0,
    dupTime: 0,
    errors: [],
    appender: await openAppender(cam.id)
  })
}

console.log(`collecting ${cameras.length} camera(s) — target ${FRAMES} new frames each, ${MINUTES} min cap, passes ${PASSES.join('+')}`)
console.log(`${local.label} Calgary time\n`)

const deadline = Date.now() + MINUTES * 60_000
let detecting = Promise.resolve() // the sidecar is single-flight: it answers 429 on overlap
let stopping = false
process.on('SIGINT', () => { stopping = true; console.log('\nstopping: draining in-flight work…') })

while (!stopping && Date.now() < deadline && [...state.values()].some((s) => s.frames < FRAMES)) {
  const due = [...state.values()].filter((s) => s.frames < FRAMES && Date.now() >= s.nextPollAt)
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await Promise.all(due.slice(i, i + CONCURRENCY).map(poll))
  }
  await sleep(500)
}

for (const s of state.values()) {
  await s.appender.close()
  manifest.cameras[s.cam.id] = {
    id: s.cam.id,
    url: s.cam.url,
    frames: s.have + s.frames,
    addedThisRun: s.frames,
    lastCapturedAt: s.capturedAt,
    skipped304: s.skipped304,
    dupBytes: s.dupBytes,
    dupTime: s.dupTime,
    passes: PASSES,
    errors: s.errors.slice(-10)
  }
}
await writeManifest({ schema: 1, updatedAt: new Date().toISOString(), cameras: manifest.cameras })

console.log('\ncamera   new  total  304s  dup  errors')
for (const s of state.values()) {
  console.log(`${s.cam.id.padEnd(8)} ${String(s.frames).padStart(3)}  ${String(s.have + s.frames).padStart(5)}  ${String(s.skipped304).padStart(4)}  ${String(s.dupBytes + s.dupTime).padStart(3)}  ${s.errors.length}`)
}
console.log(`\nhistory in ${rel(path.dirname(lastFrameFile('x')))} — next: npm run learn:bands -- --all --out data/learned-bands.json`)

async function poll (s) {
  const headers = { 'cache-control': 'no-cache', 'user-agent': 'aleph-hackaton-GOR harness/collect-history (offline band learning)' }
  if (s.etag) headers['if-none-match'] = s.etag
  if (s.lastModified) headers['if-modified-since'] = s.lastModified
  let res
  try {
    res = await fetch(s.cam.url, { headers, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    s.errors.push({ at: Date.now(), code: String(e?.message || e) })
    s.nextPollAt = Date.now() + POLL_MS
    return
  }
  if (res.status === 304) { s.skipped304++; s.nextPollAt = Date.now() + POLL_MS; return }
  if (!res.ok) {
    s.errors.push({ at: Date.now(), code: `HTTP ${res.status}` })
    s.nextPollAt = Date.now() + POLL_MS
    return
  }

  const buf = Buffer.from(await res.arrayBuffer())
  // A camera that is down serves a small placeholder rather than an error.
  if (buf.length < 2000) {
    s.errors.push({ at: Date.now(), code: 'empty image' })
    s.nextPollAt = Date.now() + POLL_MS
    return
  }
  s.etag = res.headers.get('etag') ?? s.etag
  s.lastModified = res.headers.get('last-modified') ?? s.lastModified

  const sha = crypto.createHash('sha256').update(buf).digest('hex')
  if (sha === s.sha256) { s.dupBytes++; s.nextPollAt = Date.now() + POLL_MS; return }
  const capturedAt = s.lastModified ? Date.parse(s.lastModified) : Date.now()
  if (capturedAt === s.capturedAt) { s.dupTime++; s.nextPollAt = Date.now() + POLL_MS; return }

  let det
  try {
    det = await (detecting = detecting.then(() => detectVehicles(buf, { far: PASSES.includes('far'), sides: PASSES.includes('side') })))
  } catch (e) {
    s.errors.push({ at: Date.now(), code: `detect: ${String(e?.message || e)}` })
    s.nextPollAt = Date.now() + POLL_MS
    return
  }

  await s.appender.append({
    capturedAt,
    fetchedAt: Date.now(),
    lastModified: s.lastModified,
    etag: s.etag,
    sha256: sha,
    bytes: buf.length,
    width: det.width,
    height: det.height,
    inferenceMs: det.inferenceMs,
    detector: { scoreMin: Number(process.env.SCORE_MIN || 0.25), passes: PASSES },
    // No dwell: the learner reconstructs it in timestamp order, which keeps this file a plain
    // record of what was seen rather than a snapshot of a tracker's internal state.
    vehicles: det.vehicles
  })
  if (KEEP_FRAMES) await fs.writeFile(path.join(path.dirname(lastFrameFile(s.cam.id)), `${s.cam.id}-${capturedAt}.jpg`), buf)
  await fs.writeFile(lastFrameFile(s.cam.id), buf)

  s.sha256 = sha
  s.capturedAt = capturedAt
  s.frames++
  // Re-phase to the camera's own minute rather than free-running, so polls land just after each
  // refresh instead of drifting across it.
  s.nextPollAt = capturedAt + 55_000
  process.stdout.write(`\r${[...state.values()].map((x) => `${x.cam.id}:${x.frames}`).join(' ')}   `)
}

function sleep (ms) { return new Promise((r) => setTimeout(r, ms)) }

function localCalgary (now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t)?.value
  const weekday = get('weekday')
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  return { weekday, minutes, label: `${weekday} ${get('hour')}:${get('minute')}` }
}

function withinWindow ({ weekday, minutes }) {
  return !['Sat', 'Sun'].includes(weekday) && minutes >= 9 * 60 + 30 && minutes <= 15 * 60
}

function parseArgs (argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ } else out[key] = true
  }
  return out
}
