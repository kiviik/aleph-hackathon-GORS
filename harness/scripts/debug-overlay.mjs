// Draw what the pipeline believes over the frame it believes it about.
//
//   npm run debug:overlay -- 76            # from the last collected frame, or live
//   npm run debug:overlay -- --all --source fixture
//   npm run debug:overlay -- 76 --source learned --out data/overlays --suffix after
//
// This is the human gate before any export. Three questions it exists to answer:
//   1. does every band lie on a curb, rather than in the travel lane or a parking lot?
//   2. are the two curbs of a street two separate bands, or one fat one across both?
//   3. does each band's side/zone caption match the curb it is actually drawn on?
//
// The connector from each car to its band centreline is the point of the whole picture: it shows
// which curb the assignment gave that car, which is what occupancy and free metres are computed
// from. Follows the data/debug-<id>.jpg convention from the research runs.
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { assignVehiclesToBands } from '../../mobile/src/core/band.mjs'
import { annotateDwell } from '../../mobile/src/core/stationary.mjs'
import { isParked } from '../../mobile/src/core/stationary.mjs'
import { bandSide, bandSpanM } from '../../mobile/src/core/placement.mjs'
import { detectVehicles, detectorHealth } from '../src/detector-client.mjs'
import { historyFile, lastFrameFile, normalise, readHistory } from '../src/history.mjs'
import { DATA, MOBILE_DATA, dataFile, rel } from '../src/paths.mjs'

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const valueOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const SOURCE = valueOf('source', 'fixture')
// Writing elsewhere keeps a review run from overwriting the committed data/debug-<id>.jpg archive.
const OUT_DIR = path.resolve(valueOf('out', DATA))
const SUFFIX = valueOf('suffix', '')
const consumed = new Set([SOURCE, OUT_DIR, SUFFIX, valueOf('out', null), valueOf('suffix', null)])
const ids = argv.filter((a) => !a.startsWith('--') && !consumed.has(a))

const HUES = ['#3fbf6f', '#f0a02a', '#57a7ff', '#e0609a']

const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
const learned = await readJson(dataFile('learned-bands.json'), { cameras: {} })
const targets = flags.has('--all') ? Object.keys(doc.cameras) : ids
if (!targets.length) {
  console.error('Usage: npm run debug:overlay -- <cameraId ...|--all> [--source fixture|learned] [--live]')
  process.exit(2)
}

for (const id of targets) {
  const camera = doc.cameras[id]
  if (!camera) { console.error(`${id}: not in bands.json`); continue }
  const geometry = SOURCE === 'learned' && learned.cameras?.[id]
    ? { bands: learned.cameras[id].bands, scales: learned.cameras[id].scales }
    : { bands: camera.bands, scales: camera.scales }

  const frame = await loadFrame(camera, id)
  if (!frame) { console.error(`${id}: no frame — collect history first, or pass --live`); continue }

  const vehicles = frame.vehicles ?? (await detect(frame.jpeg))
  const assigned = assignVehiclesToBands(geometry.bands, vehicles, geometry.scales)
  const meta = await sharp(frame.jpeg).metadata()
  // Dwell only exists when the boxes came from a history log. From a single frame nothing can be
  // called parked OR moving, and labelling every car "moving" would be a claim the frame cannot make.
  const svg = render(camera, geometry, vehicles, assigned, meta.width, meta.height, { dwell: Boolean(frame.vehicles) })
  const out = path.join(OUT_DIR, `debug-${id}${SUFFIX ? `-${SUFFIX}` : ''}.jpg`)
  await fs.mkdir(OUT_DIR, { recursive: true })
  await sharp(frame.jpeg)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toFile(out)

  const summary = geometry.bands
    .map((b) => `${b.id} ${assigned[b.id].length} car(s), ${bandSpanM(b, geometry.scales[b.id]).toFixed(1)} m, ${bandSide(camera, b, geometry.scales[b.id], geometry.bands).label ?? 'no side'}`)
    .join(' | ')
  console.log(`${rel(out)} — ${frame.origin}, ${vehicles.length} vehicle(s) — ${summary}`)
}

function render (camera, geometry, vehicles, assigned, width, height, { dwell = false } = {}) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`]
  parts.push('<style>text{font-family:sans-serif;font-weight:700}</style>')

  geometry.bands.forEach((band, i) => {
    const hue = HUES[i % HUES.length]
    const [nx, ny] = [-band.dir[1], band.dir[0]]
    const at = (t, n) => [band.p0[0] + band.dir[0] * t + nx * n, band.p0[1] + band.dir[1] * t + ny * n]
    const corners = [at(0, -band.halfWidth), at(band.length, -band.halfWidth), at(band.length, band.halfWidth), at(0, band.halfWidth)]
    parts.push(`<polygon points="${corners.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${hue}" fill-opacity="0.14" stroke="${hue}" stroke-width="1.5"/>`)
    // The learned core, before extendBand padded the ends.
    const [c0, c1] = band.coreT ?? [0, band.length]
    const a = at(c0, 0)
    const b = at(c1, 0)
    parts.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${hue}" stroke-width="2" stroke-dasharray="6,4"/>`)

    const side = bandSide(camera, band, geometry.scales[band.id], geometry.bands)
    const label = `${band.id} · ${bandSpanM(band, geometry.scales[band.id]).toFixed(1)} m · ${band.slots ?? '?'} slots · ${side.label ?? 'no side'} · zone ${band.zoneId ?? camera.zone.id}`
    const anchor = at(c0, -band.halfWidth - 6)
    parts.push(text(label, anchor[0], anchor[1], hue))

    for (const v of assigned[band.id]) {
      const [bx, by] = v.bottomCenter
      const { t } = project(band, v.bottomCenter)
      const on = at(Math.max(0, Math.min(band.length, t)), 0)
      parts.push(`<line x1="${bx}" y1="${by}" x2="${on[0].toFixed(1)}" y2="${on[1].toFixed(1)}" stroke="${hue}" stroke-width="1" stroke-opacity="0.85"/>`)
    }
  })

  for (const v of vehicles) {
    const parked = dwell && isParked(v)
    const colour = !dwell ? '#dcdcdc' : parked ? '#2fbf6f' : '#c9c9c9'
    parts.push(`<rect x="${v.box[0]}" y="${v.box[1]}" width="${(v.box[2] - v.box[0]).toFixed(1)}" height="${(v.box[3] - v.box[1]).toFixed(1)}" fill="none" stroke="${colour}" stroke-width="1.5"/>`)
    if (dwell && !parked) parts.push(text('moving', v.box[0], v.box[1] - 3, colour))
  }
  if (!dwell) parts.push(text('single frame: parked vs moving is unknown', 6, height - 8, '#dcdcdc'))

  parts.push('</svg>')
  return parts.join('')
}

function text (value, x, y, fill) {
  const safe = String(value).replace(/[<>&]/g, '')
  return `<text x="${Math.max(2, x).toFixed(1)}" y="${Math.max(10, y).toFixed(1)}" font-size="11" fill="${fill}" stroke="#101713" stroke-width="2.5" paint-order="stroke">${safe}</text>`
}

function project (band, p) {
  const vx = p[0] - band.p0[0]
  const vy = p[1] - band.p0[1]
  return { t: vx * band.dir[0] + vy * band.dir[1], n: -vx * band.dir[1] + vy * band.dir[0] }
}

/**
 * The last collected frame is preferred: it is the one the history (and therefore the bands) was
 * built from, so the overlay shows the geometry over data it was actually derived from.
 */
async function loadFrame (camera, id) {
  try {
    const jpeg = await fs.readFile(lastFrameFile(id))
    const observations = normalise(await readHistory(historyFile(id)))
    const tracked = annotateDwell(observations)
    const last = tracked[tracked.length - 1]
    return { jpeg, vehicles: last?.vehicles ?? null, origin: `collected frame, ${tracked.length} in history` }
  } catch {}
  if (flags.has('--live')) {
    const res = await fetch(camera.url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
    if (res.ok) {
      const jpeg = Buffer.from(await res.arrayBuffer())
      if (jpeg.length > 2000) return { jpeg, vehicles: null, origin: 'live frame' }
    }
  }
  try {
    // The bundled sample, so the overlay works offline for the camera it belongs to.
    if (id === '76') return { jpeg: await fs.readFile(dataFile('cam76-sample.jpg')), vehicles: null, origin: 'bundled sample' }
  } catch {}
  return null
}

async function detect (jpeg) {
  if (!(await detectorHealth())) {
    throw new Error('no detector sidecar — run `npm run detector`, or collect history so boxes come from the log')
  }
  // One frame gives no dwell history, so nothing can be called parked from it alone.
  const { vehicles } = await detectVehicles(jpeg, { far: true, sides: false })
  return vehicles
}

async function readJson (file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}
