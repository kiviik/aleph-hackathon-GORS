// Detector post-processing, pure JS. Ported from the source repo's detector/detector.mjs
// (LABELS + the [1,300,6] row decode) and src/detector-client.mjs (unletterbox, dedupe, signature).
// Nothing here touches pixels-in, model, or transport, so it is fully unit-testable off-device.

export const SIZE = 640
export const SCORE_MIN_RAW = 0.15 // detector-side floor; the client applies its own threshold
export const SCORE_MIN = 0.25     // low on purpose: parked vehicles are confirmed by persistence, not score
export const DEDUPE_IOU = 0.55
/**
 * What occupies curb. `car` alone was the original filter, on the reasoning that the model counts
 * car-sized spots -- but that conflates "how big is a spot" with "is this stretch taken". A parked
 * pickup takes the curb whether or not it fits the slot arithmetic, and YOLO26 routinely calls
 * SUVs, vans and pickups `truck`: over the 29 archived Calgary snapshots the car-only filter
 * discarded 19 vehicles no `car` box covered, including a 0.743 pickup sitting inside camera 14's
 * shipped band. The appearance guard caught that one as texture and said `unknown`; a dark vehicle
 * in shadow would not have been caught, and `unknown` is in any case a worse answer than `occupied`
 * when the pixels plainly show a vehicle.
 *
 * `motorcycle` stays out: it is small enough to hide inside a legal gap, and the class doubles as
 * the model's guess for bicycles at rack-sized scales.
 */
export const VEHICLE_LABELS = new Set(['car', 'truck', 'bus'])

export const LABELS = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush']

/**
 * Decode YOLO26's end-to-end (NMS-free) output tensor.
 * Layout is [1, 300, 6]: rows of [x1, y1, x2, y2, score, cls] in 640px space.
 * There is no anchor decoding and no NMS — the head emits final boxes.
 * @returns {{label:string, cls:number, score:number, box:number[]}[]} box normalised 0..1
 */
export function decodeRows (out, { scoreMin = SCORE_MIN_RAW, maxDet = 100, rows = 300 } = {}) {
  const dets = []
  for (let i = 0; i < rows; i++) {
    const b = i * 6
    const sc = out[b + 4]
    if (sc < scoreMin) continue
    const cls = out[b + 5] | 0
    dets.push({
      label: LABELS[cls] || 'object',
      cls,
      score: +sc.toFixed(3),
      box: [out[b] / SIZE, out[b + 1] / SIZE, out[b + 2] / SIZE, out[b + 3] / SIZE]
    })
    if (dets.length >= maxDet) break
  }
  return dets
}

/**
 * Map normalised 640-space boxes back to source pixels, undoing the letterbox and any crop offset,
 * and keep only vehicles above threshold. `lb` is the object returned by preprocess.letterbox().
 * @returns {{label,cls,score,box,bottomCenter,w,h}[]}
 */
export function toSourceVehicles (objects, lb, scoreMin = SCORE_MIN) {
  const out = []
  for (const o of objects) {
    if (!VEHICLE_LABELS.has(o.label) || o.score < scoreMin) continue
    const x1 = (o.box[0] * SIZE - lb.padX) / lb.scale
    const y1 = (o.box[1] * SIZE - lb.padY) / lb.scale
    const x2 = (o.box[2] * SIZE - lb.padX) / lb.scale
    const y2 = (o.box[3] * SIZE - lb.padY) / lb.scale
    const box = [
      clamp(x1, 0, lb.width) + lb.offX,
      clamp(y1, 0, lb.height) + lb.offY,
      clamp(x2, 0, lb.width) + lb.offX,
      clamp(y2, 0, lb.height) + lb.offY
    ].map((v) => +v.toFixed(1))
    out.push({
      label: o.label,
      cls: o.cls,
      score: o.score,
      box,
      bottomCenter: [+((box[0] + box[2]) / 2).toFixed(1), box[3]],
      w: +(box[2] - box[0]).toFixed(1),
      h: +(box[3] - box[1]).toFixed(1)
    })
  }
  return out
}

/** Class-agnostic suppression: the end-to-end head can emit the same box as car and truck. */
export function dedupe (dets, iouThr = DEDUPE_IOU) {
  const sorted = [...dets].sort((a, b) => b.score - a.score)
  const kept = []
  for (const d of sorted) {
    if (kept.every((k) => iou(k.box, d.box) < iouThr)) kept.push(d)
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

/**
 * Colour signature per box: mean RGB of each quadrant of the inner 70% of the box (12 uint8s).
 * Lets tracking tell "the same parked car" from "a different car stopped in the same spot".
 * `rgb` is an HWC buffer at (width, height) with `channels` bytes per pixel (3 = packed RGB,
 * 4 = RGBA straight from the JPEG decoder, which avoids materialising a second buffer).
 */
export function signature (rgb, width, height, box, channels = 3) {
  const [x1, y1, x2, y2] = box
  const w = x2 - x1, h = y2 - y1
  const ix1 = x1 + 0.15 * w, iy1 = y1 + 0.15 * h, iw = 0.7 * w, ih = 0.7 * h
  const sig = []
  for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
    const ax = Math.round(ix1 + qx * iw / 2), ay = Math.round(iy1 + qy * ih / 2)
    const bx = Math.max(ax + 1, Math.round(ix1 + (qx + 1) * iw / 2))
    const by = Math.max(ay + 1, Math.round(iy1 + (qy + 1) * ih / 2))
    let r = 0, g = 0, b = 0, n = 0
    for (let y = Math.max(0, ay); y < Math.min(height, by); y++) {
      for (let x = Math.max(0, ax); x < Math.min(width, bx); x++) {
        const i = (y * width + x) * channels
        r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; n++
      }
    }
    sig.push(n ? Math.round(r / n) : 0, n ? Math.round(g / n) : 0, n ? Math.round(b / n) : 0)
  }
  return sig
}

/** Attach colour signatures to vehicles, in place. `img` is a decoded {data,width,height,channels}. */
export function addSignatures (img, vehicles) {
  for (const v of vehicles) v.sig = signature(img.data, img.width, img.height, v.box, img.channels ?? 3)
  return vehicles
}

function clamp (v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
