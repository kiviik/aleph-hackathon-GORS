// Detection parity: does the mobile pure-JS path feed the pipeline the SAME VEHICLES as the
// desktop sharp path? Pixel parity is a proxy; this is the contract.
//
// The comparison is made AFTER class-agnostic dedupe, because that is what the pipeline consumes.
// YOLO26's end-to-end head routinely emits one physical vehicle as both `car` and `truck`; which
// of the pair ranks higher is unstable under sub-1/255 input differences, so a pre-dedupe diff
// measures an artifact the pipeline deliberately discards.
//
// Also writes detector-golden.json so the mobile post-processing can be unit-tested with no ONNX,
// no addon and no phone.
//
// Requires the detector sidecar: `npm run detector` in another terminal.
//   node scripts/verify-mobile-detection.mjs [frame.jpg]
import fs from 'node:fs/promises'
import path from 'node:path'
import { letterbox as sharpLetterbox, detectVehicles, DETECTOR_URL, FAR_CROP } from '../src/detector-client.mjs'
import { letterbox as mobileLetterbox, decodeJpeg, SIZE } from '../../mobile/src/core/preprocess.mjs'
import { decodeRows, toSourceVehicles, dedupe, addSignatures } from '../../mobile/src/core/boxes.mjs'
import { iou } from '../src/geom.mjs'
import { dataFile, MOBILE_FIXTURES, rel } from '../src/paths.mjs'

const FRAME = dataFile(process.argv[2] || 'cam76-sample.jpg')
const jpeg = await fs.readFile(FRAME)
const HW = SIZE * SIZE
const IOU_GATE = 0.95

async function detect (rgbHwc) {
  const res = await fetch(`${DETECTOR_URL}/detect`, {
    method: 'POST', body: rgbHwc, headers: { 'content-type': 'application/octet-stream' }
  })
  if (!res.ok) throw new Error(`detector ${res.status}: ${await res.text()}`)
  return res.json()
}

/** The mobile tensor is CHW float 0..1; the sidecar wants HWC uint8. Test-only repack. */
function tensorToHwc (t) {
  const out = Buffer.alloc(HW * 3)
  for (let i = 0; i < HW; i++) {
    out[i * 3] = Math.round(t[i] * 255)
    out[i * 3 + 1] = Math.round(t[HW + i] * 255)
    out[i * 3 + 2] = Math.round(t[2 * HW + i] * 255)
  }
  return out
}

/** Greedy one-to-one IoU match. @returns {matched, unmatchedA, unmatchedB, worstIou, maxDelta} */
function compare (a, b) {
  const taken = new Set()
  let matched = 0, worstIou = 1, maxDelta = 0
  for (const x of a) {
    let bj = -1, bi = -1
    for (let j = 0; j < b.length; j++) {
      if (taken.has(j)) continue
      const v = iou(x.box, b[j].box)
      if (v > bi) { bi = v; bj = j }
    }
    if (bj >= 0 && bi >= IOU_GATE) {
      taken.add(bj); matched++
      worstIou = Math.min(worstIou, bi)
      maxDelta = Math.max(maxDelta, Math.abs(x.score - b[bj].score))
    }
  }
  return { matched, unmatchedA: a.length - matched, unmatchedB: b.length - taken.size, worstIou, maxDelta }
}

const img = decodeJpeg(jpeg)
console.log(`frame ${FRAME} — ${img.width}x${img.height}`)

const golden = { frame: path.basename(FRAME), width: img.width, height: img.height, passes: {} }
let failed = false

// --- per pass, pre-dedupe: informational (box geometry is the signal here) ---
const sharpPasses = {}
const mobilePasses = {}
for (const [name, crop] of [['full', null], ['far', FAR_CROP]]) {
  const sLb = await sharpLetterbox(jpeg, crop)
  const mLb = mobileLetterbox(img, { crop })
  const sRes = await detect(sLb.rgb)
  const mRes = await detect(tensorToHwc(mLb.tensor))
  golden.passes[name] = { crop, sharpObjects: sRes.objects, mobileObjects: mRes.objects, inferenceMs: sRes.ms }

  const sVeh = toSourceVehicles(sRes.objects, sLb)
  const mVeh = toSourceVehicles(mRes.objects, mLb)
  sharpPasses[name] = sVeh
  mobilePasses[name] = mVeh

  const c = compare(sVeh, mVeh)
  for (const k of ['scale', 'padX', 'padY', 'width', 'height', 'offX', 'offY']) {
    if (Math.abs(sLb[k] - mLb[k]) > 1e-9) { console.log(`  ${name}: GEOMETRY MISMATCH ${k}`); failed = true }
  }
  console.log(`  ${name.padEnd(5)} pre-dedupe  sharp=${String(sVeh.length).padStart(2)} mobile=${String(mVeh.length).padStart(2)}  matched=${c.matched} @IoU>=${IOU_GATE}  worstIoU=${c.matched ? c.worstIou.toFixed(3) : 'n/a'}  maxScoreDelta=${c.maxDelta.toFixed(3)}`)
}

// --- the gate: the 2-pass slice, post-dedupe, as the pipeline consumes it ---
const farFilter = (v, w) => Math.max(v.w, v.h) < 0.12 * w
const sharpSlice = dedupe([...sharpPasses.full, ...sharpPasses.far.filter((v) => farFilter(v, img.width))])
const mobileSlice = dedupe([...mobilePasses.full, ...mobilePasses.far.filter((v) => farFilter(v, img.width))])
const g = compare(sharpSlice, mobileSlice)
const ok = g.unmatchedA === 0 && g.unmatchedB === 0
if (!ok) failed = true
console.log(`\n  2-pass slice POST-dedupe  sharp=${sharpSlice.length} mobile=${mobileSlice.length}  matched=${g.matched}  worstIoU=${g.worstIou.toFixed(3)}  maxScoreDelta=${g.maxDelta.toFixed(3)}  ${ok ? 'PASS' : 'FAIL'}`)
if (g.maxDelta >= 0.05) {
  console.log(`         note: score wobble up to ${g.maxDelta.toFixed(3)} on ambiguous boxes. Boxes are identical; the`)
  console.log('         pipeline confirms parked vehicles by persistence across frames, never by score.')
}

// --- golden reference for off-device unit tests ---
const desktop = await detectVehicles(jpeg)
golden.desktopVehicles = desktop.vehicles
golden.mobileVehicles = addSignatures(img, mobileSlice)
golden.sharpSliceVehicles = sharpSlice
golden.note = 'Raw detector output per pass, the desktop 4-pass result, and the mobile 2-pass slice. Lets mobile/test validate post-processing with no ONNX.'
console.log(`  desktop 4-pass: ${desktop.vehicles.length} vehicles | mobile 2-pass slice: ${mobileSlice.length}`)

const out = path.join(MOBILE_FIXTURES, 'detector-golden.json')
await fs.mkdir(path.dirname(out), { recursive: true })
await fs.writeFile(out, JSON.stringify(golden, null, 1))
await fs.copyFile(FRAME, path.join(path.dirname(out), path.basename(FRAME)))
console.log(`  wrote ${rel(out)} (${((await fs.stat(out)).size / 1024).toFixed(1)} KB) + frame fixture`)
console.log(failed ? 'DETECTION PARITY FAILED' : 'detection parity ok')
if (failed) process.exitCode = 1
