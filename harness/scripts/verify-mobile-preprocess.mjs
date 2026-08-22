// Parity gate: the mobile pure-JS preprocessing vs sharp, on a real Calgary frame.
// Runs entirely on the laptop -- no device, no phone build, no ONNX addon required.
//
//   node scripts/verify-mobile-preprocess.mjs [frame.jpg]
//
// Pixel parity is only a proxy. The contract that actually matters is detection parity, checked by
// scripts/verify-mobile-detection.mjs once the detector sidecar is running.
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { letterbox as mobileLetterbox, decodeJpeg, grayPlane } from '../../mobile/src/core/preprocess.mjs'
import { FAR_CROP, SIDE_CROPS } from '../src/detector-client.mjs'
import { dataFile } from '../src/paths.mjs'

const SIZE = 640
const FRAME = dataFile(process.argv[2] || 'cam76-sample.jpg')
const jpeg = await fs.readFile(FRAME)

/** The desktop letterbox, returning a packed RGB buffer (sharp / Lanczos3). */
async function sharpLetterbox (crop) {
  const meta = await sharp(jpeg).metadata()
  const full = { width: meta.width, height: meta.height }
  const region = crop
    ? { left: Math.round(crop.left * full.width), top: Math.round(crop.top * full.height), width: Math.round(crop.width * full.width), height: Math.round(crop.height * full.height) }
    : { left: 0, top: 0, width: full.width, height: full.height }
  const { width, height } = region
  const scale = Math.min(SIZE / width, SIZE / height)
  const dw = Math.round(width * scale), dh = Math.round(height * scale)
  const padX = Math.floor((SIZE - dw) / 2), padY = Math.floor((SIZE - dh) / 2)
  let img = sharp(jpeg)
  if (crop) img = img.extract(region)
  const rgb = await img.resize(dw, dh)
    .extend({ top: padY, bottom: SIZE - dh - padY, left: padX, right: SIZE - dw - padX, background: { r: 114, g: 114, b: 114 } })
    .removeAlpha().raw().toBuffer()
  return { rgb, scale, padX, padY, width, height, offX: region.left, offY: region.top, full }
}

const img = decodeJpeg(jpeg)
console.log(`frame ${FRAME} — ${img.width}x${img.height}, ${(jpeg.length / 1024).toFixed(0)} KB`)

// `gate: true` cases must pass -- these are the passes the mobile slice actually runs.
// The side crops are a ~1.016x UPSCALE, where libvips switches from its resize kernel to an
// affine bicubic interpolator with a different half-pixel convention; a separable resample cannot
// match it byte-for-byte. They are reported but not gated, and are not enabled on mobile yet.
const cases = [
  ['full', null, true],
  ['far', FAR_CROP, true],
  ['left', SIDE_CROPS[0], false],
  ['right', SIDE_CROPS[1], false]
]

let worst = 0
for (const [name, crop, gate] of cases) {
  const s = await sharpLetterbox(crop)
  const m = mobileLetterbox(img, { crop })

  // geometry must match exactly, or the unletterbox maps boxes to the wrong place
  const geom = ['scale', 'padX', 'padY', 'width', 'height', 'offX', 'offY']
  const bad = geom.filter((k) => Math.abs(s[k] - m[k]) > 1e-9)
  if (bad.length) { console.log(`  ${name}: GEOMETRY MISMATCH ${bad.map((k) => `${k} sharp=${s[k]} mobile=${m[k]}`).join(', ')}`); process.exitCode = 1 }

  // pixel diff: sharp packed RGB vs mobile CHW float
  const HW = SIZE * SIZE
  let sum = 0, max = 0
  for (let i = 0; i < HW; i++) {
    for (let c = 0; c < 3; c++) {
      const a = s.rgb[i * 3 + c]
      const b = m.tensor[c * HW + i] * 255
      const d = Math.abs(a - b)
      sum += d; if (d > max) max = d
    }
  }
  const mean = sum / (HW * 3)
  if (gate) worst = Math.max(worst, mean)
  const ok = mean < 2
  const verdict = ok ? 'PASS' : (gate ? 'FAIL' : 'deviates (upscale, not gated, unused on mobile)')
  console.log(`  ${name.padEnd(6)} geom ok  mean|d|=${mean.toFixed(3)}  max|d|=${max.toFixed(0)}  ${verdict}`)
  if (!ok && gate) process.exitCode = 1
}

// grayscale plane vs sharp's greyscale
const sg = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true })
const mg = grayPlane(img)
let gsum = 0, gmax = 0
for (let i = 0; i < mg.data.length; i++) { const d = Math.abs(sg.data[i] - mg.data[i]); gsum += d; if (d > gmax) gmax = d }
const gmean = gsum / mg.data.length
console.log(`  gray   mean|d|=${gmean.toFixed(3)}  max|d|=${gmax}  ${gmean < 2 ? 'PASS' : 'FAIL'}`)
if (gmean >= 2) process.exitCode = 1

console.log(process.exitCode
  ? 'PARITY FAILED'
  : `parity ok on the gated passes (worst mean |d| = ${worst.toFixed(3)}/255; JPEG decoder floor alone is ~0.73)`)
