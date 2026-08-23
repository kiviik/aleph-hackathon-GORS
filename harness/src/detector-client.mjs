// Client for the @qvac/onnx detector sidecar (detector/detector.mjs).
// Letterboxes a JPEG to 640x640 raw RGB, posts it, and maps boxes back to source pixels.
import sharp from 'sharp'

export const DETECTOR_URL = process.env.DETECTOR_URL || 'http://127.0.0.1:3085'
const SIZE = 640
// Cars only, matching mobile/src/core/boxes.mjs.
const VEHICLE_LABELS = new Set(['car'])
// Low on purpose: parked vehicles are confirmed by persistence across frames (stationary.mjs), not by score.
export const SCORE_MIN = Number(process.env.SCORE_MIN || 0.25)

export async function detectorHealth () {
  try {
    const r = await fetch(`${DETECTOR_URL}/health`)
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Zoomed crop (fractions of the frame) re-run to catch small, far vehicles. */
export const FAR_CROP = { left: 0.1, top: 0.05, width: 0.8, height: 0.55 }
/** Left/right halves at ~1.5x: YOLO26s scores steep rear views of parked cars poorly at full-frame scale. */
export const SIDE_CROPS = [{ left: 0, top: 0, width: 0.6, height: 1 }, { left: 0.4, top: 0, width: 0.6, height: 1 }]
export const DEDUPE_IOU = 0.55

/** Letterbox a JPEG buffer (optionally a crop of it) into a SIZExSIZE raw RGB buffer. */
export async function letterbox (jpeg, crop = null) {
  const meta = await sharp(jpeg).metadata()
  const full = { width: meta.width, height: meta.height }
  const region = crop
    ? { left: Math.round(crop.left * full.width), top: Math.round(crop.top * full.height), width: Math.round(crop.width * full.width), height: Math.round(crop.height * full.height) }
    : { left: 0, top: 0, width: full.width, height: full.height }
  const { width, height } = region
  const scale = Math.min(SIZE / width, SIZE / height)
  const dw = Math.round(width * scale)
  const dh = Math.round(height * scale)
  const padX = Math.floor((SIZE - dw) / 2)
  const padY = Math.floor((SIZE - dh) / 2)
  let img = sharp(jpeg)
  if (crop) img = img.extract(region)
  const rgb = await img
    .resize(dw, dh)
    .extend({ top: padY, bottom: SIZE - dh - padY, left: padX, right: SIZE - dw - padX, background: { r: 114, g: 114, b: 114 } })
    .removeAlpha()
    .raw()
    .toBuffer()
  return { rgb, scale, padX, padY, width, height, offX: region.left, offY: region.top, full }
}

/**
 * Run detection on a JPEG buffer. Returns vehicles in source pixel coords:
 * [{label, cls, score, box:[x1,y1,x2,y2], bottomCenter:[x,y], w, h}]
 */
export async function detectVehicles (jpeg, { retries = 3, far = true, sides = true } = {}) {
  const a = await detectOnce(jpeg, null, retries, 'full')
  let all = [...a.vehicles], ms = a.inferenceMs
  if (far) {
    const b = await detectOnce(jpeg, FAR_CROP, retries, 'far')
    // keep far-crop boxes only when they are small (the crop exists for small objects; big ones are better from the full frame)
    all.push(...b.vehicles.filter((v) => Math.max(v.w, v.h) < 0.12 * a.width))
    ms += b.inferenceMs
  }
  if (sides) {
    for (const [i, crop] of SIDE_CROPS.entries()) {
      const c = await detectOnce(jpeg, crop, retries, i === 0 ? 'side-l' : 'side-r')
      // drop boxes touching the crop's inner edge (cut-off vehicles)
      const x1 = crop.left * a.width, x2 = (crop.left + crop.width) * a.width
      all.push(...c.vehicles.filter((v) => (crop.left === 0 ? v.box[2] < x2 - 2 : v.box[0] > x1 + 2)))
      ms += c.inferenceMs
    }
  }
  const vehicles = dedupe(all, DEDUPE_IOU)
  await addSignatures(jpeg, vehicles)
  return { vehicles, inferenceMs: ms, width: a.width, height: a.height }
}

/**
 * Colour signature per box: mean RGB of each quadrant of the inner 70% of the box (12 uint8s).
 * Lets tracking tell "the same parked car" from "a different car stopped in the same spot".
 */
export async function addSignatures (jpeg, vehicles) {
  if (!vehicles.length) return vehicles
  const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  for (const v of vehicles) v.sig = signature(data, info.width, info.height, v.box)
  return vehicles
}

export function signature (rgb, width, height, box) {
  const [x1, y1, x2, y2] = box
  const w = x2 - x1, h = y2 - y1
  const ix1 = x1 + 0.15 * w, iy1 = y1 + 0.15 * h, iw = 0.7 * w, ih = 0.7 * h
  const sig = []
  for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
    const ax = Math.round(ix1 + qx * iw / 2), ay = Math.round(iy1 + qy * ih / 2)
    const bx = Math.max(ax + 1, Math.round(ix1 + (qx + 1) * iw / 2)), by = Math.max(ay + 1, Math.round(iy1 + (qy + 1) * ih / 2))
    let r = 0, g = 0, b = 0, n = 0
    for (let y = Math.max(0, ay); y < Math.min(height, by); y++) for (let x = Math.max(0, ax); x < Math.min(width, bx); x++) {
      const i = (y * width + x) * 3
      r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; n++
    }
    sig.push(n ? Math.round(r / n) : 0, n ? Math.round(g / n) : 0, n ? Math.round(b / n) : 0)
  }
  return sig
}

async function detectOnce (jpeg, crop, retries, pass = 'full') {
  const lb = await letterbox(jpeg, crop)
  let res
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${DETECTOR_URL}/detect`, { method: 'POST', body: lb.rgb, headers: { 'content-type': 'application/octet-stream' } })
    if (res.status !== 429 || attempt >= retries) break
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
  }
  if (!res.ok) throw new Error(`detector ${res.status}: ${await res.text()}`)
  const { objects, ms } = await res.json()
  const out = []
  for (const o of objects) {
    if (!VEHICLE_LABELS.has(o.label) || o.score < SCORE_MIN) continue
    const x1 = (o.box[0] * SIZE - lb.padX) / lb.scale
    const y1 = (o.box[1] * SIZE - lb.padY) / lb.scale
    const x2 = (o.box[2] * SIZE - lb.padX) / lb.scale
    const y2 = (o.box[3] * SIZE - lb.padY) / lb.scale
    const box = [clamp(x1, 0, lb.width) + lb.offX, clamp(y1, 0, lb.height) + lb.offY, clamp(x2, 0, lb.width) + lb.offX, clamp(y2, 0, lb.height) + lb.offY].map((v) => +v.toFixed(1))
    out.push({ label: o.label, cls: o.cls, score: o.score, box, bottomCenter: [+((box[0] + box[2]) / 2).toFixed(1), box[3]], w: +(box[2] - box[0]).toFixed(1), h: +(box[3] - box[1]).toFixed(1), passes: [pass] })
  }
  return { vehicles: out, inferenceMs: ms, width: lb.full.width, height: lb.full.height }
}

/**
 * Class-agnostic suppression: the end-to-end head can emit the same box as car and truck.
 *
 * A suppressed duplicate donates its pass name to the survivor. That record is what lets the band
 * learner be re-run over only the passes the PHONE runs: learning from 4-pass detections the
 * 2-pass phone cannot reproduce would teach it curb that then reads as free space.
 */
export function dedupe (dets, iouThr = DEDUPE_IOU) {
  const sorted = [...dets].sort((a, b) => b.score - a.score)
  const kept = []
  for (const d of sorted) {
    const hit = kept.find((k) => iou(k.box, d.box) >= iouThr)
    if (!hit) { kept.push({ ...d, passes: [...(d.passes || [])] }); continue }
    for (const pass of d.passes || []) if (!hit.passes?.includes(pass)) (hit.passes ||= []).push(pass)
  }
  return kept
}

export function iou (a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const inter = ix * iy
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return ua > 0 ? inter / ua : 0
}

function clamp (v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
