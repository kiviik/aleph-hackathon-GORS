// Validates the mobile detector path with NO ONNX, NO addon and NO phone, by replaying
// detector-golden.json -- the raw model output captured from the desktop sidecar.
// Regenerate with: npm run verify:detection (in ../harness, with the sidecar running).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeJpeg, letterbox, grayPlane, meanLuma, SIZE, PAD } from '../src/core/preprocess.mjs'
import { decodeRows, toSourceVehicles, dedupe, addSignatures, signature, iou, LABELS, VEHICLE_LABELS } from '../src/core/boxes.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const golden = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/detector-golden.json'), 'utf8'))
const jpeg = fs.readFileSync(path.join(here, 'fixtures', golden.frame))

test('jpeg-js decodes the Calgary frame to the expected dimensions', () => {
  const img = decodeJpeg(jpeg)
  assert.equal(img.width, golden.width)
  assert.equal(img.height, golden.height)
  assert.equal(img.channels, 4)
  assert.equal(img.data.length, img.width * img.height * 4)
  const luma = meanLuma(img)
  assert.ok(luma > 20 && luma < 235, `implausible mean luma ${luma}`)
})

test('letterbox geometry matches what the desktop pipeline produced', () => {
  const img = decodeJpeg(jpeg)
  const lb = letterbox(img)
  // 840x630 -> scale 640/840, dw 640, dh 480, pad 80 top and bottom
  assert.equal(lb.width, 840)
  assert.equal(lb.height, 630)
  assert.equal(lb.padX, 0)
  assert.equal(lb.padY, 80)
  assert.ok(Math.abs(lb.scale - 640 / 840) < 1e-9)
  assert.equal(lb.tensor.length, 3 * SIZE * SIZE)
})

test('letterbox pads with grey 114 and leaves no unwritten cells', () => {
  const img = decodeJpeg(jpeg)
  const lb = letterbox(img)
  const HW = SIZE * SIZE
  // top pad row 0 and bottom pad row 639 must be exactly the pad value
  for (const y of [0, 39, 79, 560, 600, 639]) {
    for (const x of [0, 320, 639]) {
      const v = lb.tensor[y * SIZE + x] * 255
      assert.ok(Math.abs(v - PAD) < 1e-4, `pad row ${y} col ${x} = ${v}`)
    }
  }
  // the image window must NOT be all pad
  let differs = 0
  for (let i = 0; i < HW; i++) if (Math.abs(lb.tensor[i] * 255 - PAD) > 1) differs++
  assert.ok(differs > HW * 0.3, `only ${differs} non-pad cells`)
  // every channel in range
  for (let i = 0; i < lb.tensor.length; i += 997) {
    assert.ok(lb.tensor[i] >= 0 && lb.tensor[i] <= 1, `out of range at ${i}: ${lb.tensor[i]}`)
  }
})

test('a reused tensor gives byte-identical output to a fresh one', () => {
  const img = decodeJpeg(jpeg)
  const a = letterbox(img)
  const scratch = new Float32Array(SIZE * img.height * 3)
  const reuse = new Float32Array(3 * SIZE * SIZE).fill(999)
  const b = letterbox(img, { tensor: reuse, scratch })
  assert.equal(a.tensor.length, b.tensor.length)
  for (let i = 0; i < a.tensor.length; i++) {
    if (a.tensor[i] !== b.tensor[i]) assert.fail(`tensor reuse differs at ${i}: ${a.tensor[i]} vs ${b.tensor[i]}`)
  }
})

test('decodeRows reproduces the sidecar objects from the raw tensor layout', () => {
  // Rebuild the flat [1,300,6] buffer from the golden objects and check the decode round-trips.
  const objs = golden.passes.full.sharpObjects
  const flat = new Float32Array(300 * 6)
  objs.forEach((o, i) => {
    const b = i * 6
    flat[b] = o.box[0] * SIZE; flat[b + 1] = o.box[1] * SIZE
    flat[b + 2] = o.box[2] * SIZE; flat[b + 3] = o.box[3] * SIZE
    flat[b + 4] = o.score; flat[b + 5] = o.cls
  })
  const decoded = decodeRows(flat)
  assert.equal(decoded.length, objs.length)
  for (let i = 0; i < objs.length; i++) {
    assert.equal(decoded[i].label, objs[i].label)
    assert.equal(decoded[i].cls, objs[i].cls)
    assert.ok(Math.abs(decoded[i].score - objs[i].score) < 1e-3)
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(decoded[i].box[k] - objs[i].box[k]) < 1e-6)
  }
})

test('toSourceVehicles reproduces the desktop 2-pass slice exactly', () => {
  const img = decodeJpeg(jpeg)
  const full = letterbox(img)
  const far = letterbox(img, { crop: golden.passes.far.crop })
  const vFull = toSourceVehicles(golden.passes.full.mobileObjects, full)
  const vFarAll = toSourceVehicles(golden.passes.far.mobileObjects, far)
  const vFar = vFarAll.filter((v) => Math.max(v.w, v.h) < 0.12 * img.width)
  const got = addSignatures(img, dedupe([...vFull, ...vFar]))
  const want = golden.mobileVehicles

  assert.equal(got.length, want.length)
  for (let i = 0; i < want.length; i++) {
    assert.equal(got[i].label, want[i].label, `label at ${i}`)
    assert.deepEqual(got[i].box, want[i].box, `box at ${i}`)
    assert.deepEqual(got[i].sig, want[i].sig, `signature at ${i}`)
  }
})

test('only vehicle classes survive, and every box is inside the frame', () => {
  const img = decodeJpeg(jpeg)
  const lb = letterbox(img)
  const v = toSourceVehicles(golden.passes.full.mobileObjects, lb)
  assert.ok(v.length > 0)
  for (const x of v) {
    assert.ok(VEHICLE_LABELS.has(x.label), `non-vehicle ${x.label}`)
    assert.ok(x.score >= 0.25)
    assert.ok(x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= img.width && x.box[3] <= img.height, `box out of frame ${x.box}`)
    assert.ok(x.box[2] > x.box[0] && x.box[3] > x.box[1])
    assert.deepEqual(x.bottomCenter, [+((x.box[0] + x.box[2]) / 2).toFixed(1), x.box[3]])
  }
  // a person/traffic-light class must be filtered out
  const withPerson = toSourceVehicles([{ label: 'person', cls: 0, score: 0.99, box: [0.1, 0.1, 0.2, 0.2] }], lb)
  assert.equal(withPerson.length, 0)
})

test('signature reads RGBA (stride 4) and packed RGB (stride 3) identically', () => {
  const w = 20, h = 20
  const rgba = new Uint8Array(w * h * 4)
  const rgb = new Uint8Array(w * h * 3)
  let seed = 3
  for (let i = 0; i < w * h; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const r = seed % 256, g = (seed >> 8) % 256, b = (seed >> 16) % 256
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b
  }
  const box = [2, 2, 18, 18]
  assert.deepEqual(signature(rgba, w, h, box, 4), signature(rgb, w, h, box, 3))
})

test('grayPlane is full resolution and tracks luma', () => {
  const img = decodeJpeg(jpeg)
  const g = grayPlane(img)
  assert.equal(g.width, img.width)
  assert.equal(g.height, img.height)
  assert.equal(g.data.length, img.width * img.height)
  const mean = g.data.reduce((s, v) => s + v, 0) / g.data.length
  assert.ok(Math.abs(mean - meanLuma(img)) < 3, `gray mean ${mean} vs sampled ${meanLuma(img)}`)
})

test('LABELS is COCO-80 with car/truck/bus/motorcycle at the known ids', () => {
  assert.equal(LABELS.length, 80)
  assert.equal(LABELS[2], 'car')
  assert.equal(LABELS[3], 'motorcycle')
  assert.equal(LABELS[5], 'bus')
  assert.equal(LABELS[7], 'truck')
  assert.deepEqual([...VEHICLE_LABELS].sort(), ['bus', 'car', 'motorcycle', 'truck'])
})

test('iou basics', () => {
  assert.equal(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1)
  assert.equal(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0)
  assert.ok(Math.abs(iou([0, 0, 10, 10], [0, 0, 10, 5]) - 0.5) < 1e-9)
})
