// Replaces every sharp call in the desktop pipeline. sharp is libvips-backed and cannot run on
// device, but its footprint here was only three call sites -- letterbox(), addSignatures() and
// appearance.grayFrame() -- and all three derive from a single JPEG decode.
//
// Nothing allocates per frame except the decode itself: the CHW tensor is created once and reused,
// and the gray plane is optional. Pixels never leave this module's caller (the Bare worklet);
// a 640x640x3 float tensor is 4.9 MB and must never cross the RN bridge.
import decode from 'jpeg-js/lib/decoder.js'

export const SIZE = 640
export const PAD = 114          // sharp's grey letterbox fill, matched exactly
const PAD_N = PAD / 255

/**
 * Decode a baseline JPEG to RGBA. Calgary traffic-camera frames are baseline SOF0 840x630,
 * which is jpeg-js's fast path. Returns a 4-channel buffer; callers index with stride 4 rather
 * than paying for an RGB repack.
 */
export function decodeJpeg (bytes) {
  const { data, width, height } = decode(bytes, { useTArray: true })
  return { data, width, height, channels: 4 }
}

/** The reusable CHW input tensor. Allocate once per session, not per frame. */
export function createTensor () { return new Float32Array(3 * SIZE * SIZE) }

/** Lanczos kernel, a = 3. Matches sharp/libvips' default `lanczos3` resize kernel. */
function lanczos3 (x) {
  x = Math.abs(x)
  if (x < 1e-8) return 1
  if (x >= 3) return 0
  const px = Math.PI * x
  return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px)
}

/** Catmull-Rom cubic (a = -0.5), support 2. libvips uses a fixed bicubic interpolator when
 *  enlarging -- it ignores the resize kernel on upscale -- so matching it needs this, not Lanczos. */
function catmullRom (x) {
  x = Math.abs(x)
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2
  return 0
}

/**
 * Precompute per-destination-pixel source spans and normalised weights for one axis.
 * Downscale uses Lanczos3 with support widened by 1/scale (the standard low-pass rule), which is
 * what keeps a 840->640 reduction from aliasing. Upscale uses Catmull-Rom, matching libvips.
 * Truncated at the edges and renormalised.
 */
function buildWeights (srcOffset, srcLen, dstLen) {
  const scale = dstLen / srcLen
  const down = scale < 1
  const kernel = down ? lanczos3 : catmullRom
  const filterScale = down ? 1 / scale : 1
  const support = (down ? 3 : 2) * filterScale
  const rows = new Array(dstLen)
  for (let i = 0; i < dstLen; i++) {
    const center = srcOffset + (i + 0.5) / scale
    const start = Math.max(srcOffset, Math.floor(center - support + 0.5))
    const stop = Math.min(srcOffset + srcLen, Math.ceil(center + support + 0.5))
    const n = Math.max(1, stop - start)
    const w = new Float32Array(n)
    let sum = 0
    for (let k = 0; k < n; k++) {
      const v = kernel((start + k + 0.5 - center) / filterScale)
      w[k] = v; sum += v
    }
    if (sum !== 0) for (let k = 0; k < n; k++) w[k] /= sum
    rows[i] = { start, w }
  }
  return rows
}

/**
 * Letterbox `img` (optionally a fractional crop of it) into a SIZExSIZE CHW float32 tensor,
 * fused with the /255 normalisation. Mirrors sharp's
 *   .extract(region).resize(dw,dh).extend({background:114}).removeAlpha().raw()
 * using the same separable Lanczos3 kernel, so detections match the desktop pipeline.
 *
 * @returns {{tensor, scale, padX, padY, width, height, offX, offY, full}} the same field set the
 *   desktop letterbox() returned, so boxes.toSourceVehicles() maps back unchanged.
 */
export function letterbox (img, { crop = null, tensor = null, scratch = null } = {}) {
  const { data, width: fw, height: fh, channels: ch } = img
  const full = { width: fw, height: fh }
  const region = crop
    ? {
        left: Math.round(crop.left * fw),
        top: Math.round(crop.top * fh),
        width: Math.round(crop.width * fw),
        height: Math.round(crop.height * fh)
      }
    : { left: 0, top: 0, width: fw, height: fh }

  const { width, height } = region
  const scale = Math.min(SIZE / width, SIZE / height)
  const dw = Math.round(width * scale)
  const dh = Math.round(height * scale)
  const padX = Math.floor((SIZE - dw) / 2)
  const padY = Math.floor((SIZE - dh) / 2)

  const HW = SIZE * SIZE
  const t = tensor || createTensor()
  t.fill(PAD_N) // pad bands; the dw x dh window below overwrites the rest

  // Pass 1 (horizontal): region -> dw wide, full region height, into a reusable scratch buffer.
  const xw = buildWeights(region.left, width, dw)
  const yw = buildWeights(region.top, height, dh)
  const need = dw * height * 3
  const tmp = (scratch && scratch.length >= need) ? scratch : new Float32Array(need)
  for (let y = 0; y < height; y++) {
    const srow = (region.top + y) * fw
    const drow = y * dw * 3
    for (let x = 0; x < dw; x++) {
      const { start, w } = xw[x]
      let r = 0, g = 0, b = 0
      let p = (srow + start) * ch
      for (let k = 0; k < w.length; k++, p += ch) {
        const wk = w[k]
        r += data[p] * wk; g += data[p + 1] * wk; b += data[p + 2] * wk
      }
      const o = drow + x * 3
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b
    }
  }

  // Pass 2 (vertical): dw x height -> dw x dh, written straight into the CHW tensor as /255.
  for (let y = 0; y < dh; y++) {
    const { start, w } = yw[y]
    const base = start - region.top
    const di = (y + padY) * SIZE + padX
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0
      for (let k = 0; k < w.length; k++) {
        const o = ((base + k) * dw + x) * 3
        const wk = w[k]
        r += tmp[o] * wk; g += tmp[o + 1] * wk; b += tmp[o + 2] * wk
      }
      const i = di + x
      t[i] = clamp255(r) / 255
      t[HW + i] = clamp255(g) / 255
      t[2 * HW + i] = clamp255(b) / 255
    }
  }

  return { tensor: t, scale, padX, padY, width, height, offX: region.left, offY: region.top, full }
}

/** Scratch buffer for letterbox pass 1. Size it for the largest region you will pass. */
export function createScratch (maxRegionHeight = 1080) { return new Float32Array(SIZE * maxRegionHeight * 3) }

function clamp255 (v) { return v < 0 ? 0 : v > 255 ? 255 : v }

/**
 * 8-bit luma plane at native resolution, replacing appearance.grayFrame().
 * The texture guard works in source-pixel space, so this is NOT the 640 tensor.
 */
export function grayPlane (img) {
  const { data, width, height, channels: ch } = img
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += ch) {
    out[i] = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8
  }
  return { data: out, width, height }
}

/** Mean luma 0..255 — the DARK quality signal. Sampled, not exhaustive. */
export function meanLuma (img, step = 7) {
  const { data, width, height, channels: ch } = img
  let sum = 0, n = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const p = (y * width + x) * ch
      sum += (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8
      n++
    }
  }
  return n ? sum / n : 0
}
