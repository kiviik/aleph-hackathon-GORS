// Diagnostic: render EXACTLY what the mobile frame-pipeline computes over a still frame.
//   node scripts/diag-overlay.mjs <jpegPath> <cameraId> [outDir]
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { createFramePipeline } from '../../mobile/src/core/frame-pipeline.mjs'
import { assignVehiclesToBands } from '../../mobile/src/core/band.mjs'
import { SIZE } from '../../mobile/src/core/preprocess.mjs'
import { DETECTOR_URL } from '../src/detector-client.mjs'
import { MOBILE_DATA } from '../src/paths.mjs'

const HW = SIZE * SIZE
const argv = process.argv.slice(2)
const LEARNED = argv.includes('--learned')
const [jpegPath, CAM, outDir = '/tmp/diag'] = argv.filter((a) => !a.startsWith('--'))
const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
const cam = doc.cameras[CAM]
if (!cam) throw new Error(`no camera ${CAM}`)
// --learned swaps in data/learned-bands.json geometry, so a re-learn can be reviewed against the
// shipped one over the same frame before anything is exported.
if (LEARNED) {
  const learned = JSON.parse(await fs.readFile(new URL('../data/learned-bands.json', import.meta.url), 'utf8'))
  const g = learned.cameras?.[CAM]
  if (!g?.bands?.length) throw new Error(`no learned bands for ${CAM}`)
  cam.bands = g.bands
  cam.scales = g.scales
}

const infer = async (tensor) => {
  const body = Buffer.alloc(HW * 3)
  for (let i = 0; i < HW; i++) {
    body[i * 3] = Math.round(tensor[i] * 255)
    body[i * 3 + 1] = Math.round(tensor[HW + i] * 255)
    body[i * 3 + 2] = Math.round(tensor[2 * HW + i] * 255)
  }
  const res = await fetch(`${DETECTOR_URL}/detect`, { method: 'POST', body, headers: { 'content-type': 'application/octet-stream' } })
  if (!res.ok) throw new Error(`detector ${res.status}`)
  return (await res.json()).objects
}

const pipeline = createFramePipeline({ infer })
const jpeg = new Uint8Array(await fs.readFile(jpegPath))
// mark every vehicle parked so gap geometry is exercised (dwell=3)
const r = await pipeline({ jpeg, bands: cam.bands, scales: cam.scales, tracks: [], passes: ['full', 'far'] })
const r2 = await pipeline({ jpeg, bands: cam.bands, scales: cam.scales, tracks: r.tracks, passes: ['full', 'far'] })
const r3 = await pipeline({ jpeg, bands: cam.bands, scales: cam.scales, tracks: r2.tracks, passes: ['full', 'far'] })
const out = r3
const byBand = assignVehiclesToBands(cam.bands, out.vehicles, cam.scales)

const HUES = ['#3fbf6f', '#f0a02a', '#57a7ff', '#e0609a']
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}">`, '<style>text{font-family:sans-serif;font-weight:700}</style>']
const T = (s,x,y,f) => `<text x="${Math.max(2,x).toFixed(1)}" y="${Math.max(10,y).toFixed(1)}" font-size="11" fill="${f}" stroke="#000" stroke-width="2.5" paint-order="stroke">${String(s).replace(/[<>&]/g,'')}</text>`

cam.bands.forEach((band, i) => {
  const hue = HUES[i % HUES.length]
  const [nx, ny] = [-band.dir[1], band.dir[0]]
  const at = (t, n) => [band.p0[0] + band.dir[0]*t + nx*n, band.p0[1] + band.dir[1]*t + ny*n]
  const corners = [at(0,-band.halfWidth), at(band.length,-band.halfWidth), at(band.length,band.halfWidth), at(0,band.halfWidth)]
  parts.push(`<polygon points="${corners.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${hue}" stroke-width="1.5" stroke-dasharray="3,3"/>`)
  const g = out.perBand[band.id]
  if (!g) { parts.push(T(`${band.id} SKIPPED (no scale)`, at(0,0)[0], at(0,0)[1], '#ff4444')); return }
  const seg = (t1,t2,colour,off) => { const a=at(t1,off), b=at(t2,off); return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${colour}" stroke-width="5" stroke-linecap="butt" stroke-opacity="0.9"/>` }
  for (const [t1,t2] of g.occupied) parts.push(seg(t1,t2,'#ff3b30', -6))
  for (const [t1,t2] of g.unknown)  parts.push(seg(t1,t2,'#ffcc00', -6))
  for (const [t1,t2] of (g.textured||[])) parts.push(seg(t1,t2,'#9b59b6', 6))
  for (const f of g.free) parts.push(seg(f.t1,f.t2,'#00e676', 0))
  const a0 = at(0, -band.halfWidth - 8)
  parts.push(T(`${band.id} free ${g.free.map(f=>f.metres+'m').join('+')||'none'} · ref ${g.textureRef} thr ${g.textureThr} · ${byBand[band.id].length} cars`, a0[0], a0[1], hue))
})
for (const v of out.vehicles) {
  const parked = (v.dwell||1) >= 2
  parts.push(`<rect x="${v.box[0]}" y="${v.box[1]}" width="${(v.box[2]-v.box[0]).toFixed(1)}" height="${(v.box[3]-v.box[1]).toFixed(1)}" fill="none" stroke="${parked?'#ffffff':'#888'}" stroke-width="1.5"/>`)
  parts.push(T(`${v.label} ${v.score}`, v.box[0], v.box[1]-2, '#ffffff'))
  parts.push(`<circle cx="${v.bottomCenter[0]}" cy="${v.bottomCenter[1]}" r="2.5" fill="#ff0"/>`)
}
parts.push(T(`luma ${out.meanLuma} energy ${out.energy} · ${out.vehicles.length} vehicles · red=occupied yellow=moving purple=textured green=FREE`, 4, out.height-6, '#fff'))
parts.push('</svg>')

await fs.mkdir(outDir, { recursive: true })
const dest = path.join(outDir, `diag-${CAM}${LEARNED ? '-learned' : ''}.jpg`)
await sharp(Buffer.from(jpeg)).composite([{ input: Buffer.from(parts.join('')), top: 0, left: 0 }]).jpeg({ quality: 90 }).toFile(dest)
console.log(JSON.stringify({ camera: CAM, dest, vehicles: out.vehicles.length, luma: out.meanLuma, energy: out.energy, skippedBands: out.skippedBands, perBand: Object.fromEntries(Object.entries(out.perBand).map(([k,v])=>[k,{occupied:v.occupied,unknown:v.unknown,free:v.free,textured:v.textured,textureRef:v.textureRef,textureThr:v.textureThr}])), byBand: Object.fromEntries(Object.entries(byBand).map(([k,v])=>[k,v.length])) }, null, 1))
