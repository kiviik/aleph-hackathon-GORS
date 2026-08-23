// How many vehicles does the car-only filter lose? Count truck/bus/motorcycle boxes above
// SCORE_MIN that do NOT overlap any kept car box, per snapshot, and how many land in a band.
import fs from 'node:fs/promises'
import path from 'node:path'
import { decodeJpeg, letterbox, createTensor, createScratch, SIZE } from '../../mobile/src/core/preprocess.mjs'
import { FAR_CROP, FAR_MAX_FRAC } from '../../mobile/src/core/frame-pipeline.mjs'
import { iou, SCORE_MIN } from '../../mobile/src/core/boxes.mjs'
import { inBand } from '../../mobile/src/core/band.mjs'
import { DETECTOR_URL } from '../src/detector-client.mjs'
import { dataFile, MOBILE_DATA } from '../src/paths.mjs'
const HW = SIZE * SIZE
const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
const infer = async (tensor) => {
  const body = Buffer.alloc(HW * 3)
  for (let i = 0; i < HW; i++) { body[i*3]=Math.round(tensor[i]*255); body[i*3+1]=Math.round(tensor[HW+i]*255); body[i*3+2]=Math.round(tensor[2*HW+i]*255) }
  const res = await fetch(`${DETECTOR_URL}/detect`, { method:'POST', body, headers:{'content-type':'application/octet-stream'} })
  return (await res.json()).objects
}
function unmap (o, lb) {
  const f = (i, pad, s) => (o.box[i] * SIZE - pad) / s
  const x1 = Math.max(0, Math.min(lb.width,  f(0, lb.padX, lb.scale))) + lb.offX
  const y1 = Math.max(0, Math.min(lb.height, f(1, lb.padY, lb.scale))) + lb.offY
  const x2 = Math.max(0, Math.min(lb.width,  f(2, lb.padX, lb.scale))) + lb.offX
  const y2 = Math.max(0, Math.min(lb.height, f(3, lb.padY, lb.scale))) + lb.offY
  return { label: o.label, score: o.score, box: [x1,y1,x2,y2], w: x2-x1, h: y2-y1, bottomCenter: [(x1+x2)/2, y2] }
}
const files = (await fs.readdir(dataFile('snapshots'))).filter((f) => f.endsWith('.jpg') && !f.includes('debug'))
let totLost = 0, totInBand = 0, totCars = 0
for (const file of files.sort()) {
  const id = file.split('-')[0]
  const img = decodeJpeg(new Uint8Array(await fs.readFile(dataFile(path.join('snapshots', file)))))
  const t = createTensor(), s = createScratch(img.height)
  let all = []
  for (const pass of ['full','far']) {
    const lb = letterbox(img, { crop: pass === 'far' ? FAR_CROP : null, tensor: t, scratch: s })
    let v = (await infer(t)).filter((o) => o.score >= SCORE_MIN).map((o) => unmap(o, lb))
    if (pass === 'far') v = v.filter((x) => Math.max(x.w, x.h) < FAR_MAX_FRAC * img.width)
    all = all.concat(v)
  }
  const cars = all.filter((o) => o.label === 'car')
  const others = all.filter((o) => ['truck','bus','motorcycle'].includes(o.label))
  const lost = others.filter((o) => cars.every((c) => iou(c.box, o.box) < 0.55))
  // dedupe the lost set against itself
  const kept = []
  for (const d of lost.sort((a,b)=>b.score-a.score)) if (kept.every((k)=>iou(k.box,d.box) < 0.55)) kept.push(d)
  const bands = doc.cameras[id]?.bands || []
  const inB = kept.filter((o) => bands.some((b) => inBand(b, o.bottomCenter)))
  totCars += cars.length; totLost += kept.length; totInBand += inB.length
  if (kept.length) console.log(`${id.padStart(4)} cars ${String(cars.length).padStart(3)}  LOST ${String(kept.length).padStart(2)} [${kept.map(o=>`${o.label} ${o.score}${bands.some(b=>inBand(b,o.bottomCenter))?'*IN-BAND*':''}`).join(', ')}]`)
}
console.log(`\ntotal cars ${totCars}, lost non-car vehicles ${totLost}, of which in a shipped band ${totInBand}`)
