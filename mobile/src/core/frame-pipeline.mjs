// The per-frame pipeline, with inference injected. This is pipeline.mjs:tickCamera from the
// desktop repo, minus everything that only exists to LEARN (history, band learning, scale fitting).
//
// Inference is a callback so the exact same code runs in three places:
//   - the Bare worklet on the phone, backed by @qvac/onnx
//   - laptop tests, backed by the desktop detector sidecar over HTTP
//   - laptop tests, backed by a recorded fixture (no model at all)
import { decodeJpeg, letterbox, grayPlane, meanLuma, createTensor, createScratch } from './preprocess.mjs'
import { toSourceVehicles, dedupe, addSignatures } from './boxes.mjs'
import { annotateLatest } from './stationary.mjs'
import { computeGaps } from './gaps.mjs'
import { guardGaps, energyAt } from './appearance.mjs'

export const FAR_CROP = { left: 0.1, top: 0.05, width: 0.8, height: 0.55 }
/** The far crop only contributes small/distant boxes; large ones read better from the full frame. */
export const FAR_MAX_FRAC = 0.12

/**
 * @param {object} o
 * @param {(tensor: Float32Array) => Promise<object[]>|object[]} o.infer
 *   Runs the model on the CHW tensor and returns decoded rows [{label,cls,score,box(normalised)}].
 */
export function createFramePipeline ({ infer, tensor = null, scratch = null, maxRegionHeight = 1080 } = {}) {
  const t = tensor || createTensor()
  const s = scratch || createScratch(maxRegionHeight)

  return async function processFrame ({ jpeg, bands = [], scales = {}, tracks = [], passes = ['full'] }) {
    const t0 = Date.now()
    const img = decodeJpeg(jpeg)
    const tDecode = Date.now()

    let all = []
    for (const pass of passes) {
      const crop = pass === 'far' ? FAR_CROP : null
      const lb = letterbox(img, { crop, tensor: t, scratch: s })
      let v = toSourceVehicles(await infer(t), lb)
      if (pass === 'far') v = v.filter((x) => Math.max(x.w, x.h) < FAR_MAX_FRAC * img.width)
      all = all.concat(v)
    }
    const tInfer = Date.now()

    const vehicles = addSignatures(img, dedupe(all))
    const nextTracks = annotateLatest(tracks, vehicles)

    // Frame-quality signals, taken from pixels already in hand.
    const gray = grayPlane(img)
    const luma = meanLuma(img)
    const grid = []
    for (let y = 4; y < img.height - 4; y += 9) for (let x = 4; x < img.width - 4; x += 9) grid.push([x, y])
    const energy = energyAt(gray, grid)

    // Gap + texture guard per band, here rather than on the far side of IPC: the gray plane is
    // ~529 KB and has no business crossing a bridge.
    const perBand = {}
    for (const band of bands) {
      const scale = scales[band.id]
      if (!scale) continue
      perBand[band.id] = guardGaps(gray, band, scale, computeGaps(band, scale, vehicles), vehicles)
    }

    return {
      width: img.width,
      height: img.height,
      vehicles,
      tracks: nextTracks.map(({ box, sig, dwell, missed }) => ({ box, sig, dwell, missed })),
      perBand,
      meanLuma: +luma.toFixed(1),
      energy: energy == null ? null : +energy.toFixed(2),
      ms: { decode: tDecode - t0, infer: tInfer - tDecode, total: Date.now() - t0 }
    }
  }
}
