// End-to-end rehearsal of the ON-DEVICE pipeline, on the laptop.
//
// Runs mobile/src/core/frame-pipeline.mjs -- the exact module the Bare worklet calls -- against the
// real YOLO26s weights (via the desktop sidecar) and the real learned bands from bands.json.
// The only thing not exercised is the @qvac/onnx addon linking itself, which needs a phone.
//
//   node scripts/verify-mobile-pipeline.mjs [cameraId] [scans]
import fs from 'node:fs/promises'
import path from 'node:path'
import { createFramePipeline } from '../../mobile/src/core/frame-pipeline.mjs'
import { SIZE } from '../../mobile/src/core/preprocess.mjs'
import { createBandState, updateBandState } from '../../mobile/src/core/temporal.mjs'
import { buildObservation, buildRules } from '../../mobile/src/evidence/evidence.mjs'
import { referenceDecision } from '../../mobile/src/policy/policy.mjs'
import { DETECTOR_URL } from '../src/detector-client.mjs'
import { dataFile, MOBILE_DATA } from '../src/paths.mjs'

const CAM = process.argv[2] || '76'
const SCANS = Number(process.argv[3] || 4)
const HW = SIZE * SIZE

const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
const cam = doc.cameras[CAM]
if (!cam) throw new Error(`camera ${CAM} not in bands.json (have ${Object.keys(doc.cameras).join(', ')})`)

// Stand-in for @qvac/onnx: repack the CHW tensor to HWC uint8 and POST to the desktop sidecar.
const infer = async (tensor) => {
  const body = Buffer.alloc(HW * 3)
  for (let i = 0; i < HW; i++) {
    body[i * 3] = Math.round(tensor[i] * 255)
    body[i * 3 + 1] = Math.round(tensor[HW + i] * 255)
    body[i * 3 + 2] = Math.round(tensor[2 * HW + i] * 255)
  }
  const res = await fetch(`${DETECTOR_URL}/detect`, { method: 'POST', body, headers: { 'content-type': 'application/octet-stream' } })
  if (!res.ok) throw new Error(`detector ${res.status}`)
  const { objects } = await res.json()
  return objects
}

const pipeline = createFramePipeline({ infer })

console.log(`camera ${CAM} — ${cam.location}`)
console.log(`zone: ${cam.zone.address} (${cam.zone.distanceM} m${cam.zone.onCameraStreet ? ', on camera street' : ', DIFFERENT street'})`)
console.log(`rules: enforceable "${cam.zone.enforceableTime}" | restrict "${cam.zone.restrictType}" "${cam.zone.restrictTime}"`)
console.log(`bands: ${cam.bands.map((b) => `${b.id} ${b.length.toFixed(0)}px slots~${b.slots}`).join(', ')}\n`)

const states = Object.fromEntries(cam.bands.map((b) => [b.id, createBandState(b)]))
let tracks = []
let lastCapturedAt = null

// Try the live camera; fall back to the bundled fixture so this runs offline too.
async function nextFrame () {
  try {
    const res = await fetch(cam.url, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const lm = res.headers.get('last-modified')
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length < 2000) throw new Error('empty image')
    const capturedAt = lm ? Date.parse(lm) : Date.now()
    return { jpeg: buf, capturedAt, stale: Date.now() - capturedAt > 10 * 60 * 1000, live: true }
  } catch (e) {
    const jpeg = new Uint8Array(await fs.readFile(dataFile('cam76-sample.jpg')))
    return { jpeg, capturedAt: Date.now(), stale: false, live: false, why: String(e.message || e) }
  }
}

for (let scan = 1; scan <= SCANS; scan++) {
  const f = await nextFrame()
  if (!f.live && scan === 1) console.log(`(live fetch unavailable: ${f.why} — replaying the bundled fixture)\n`)
  const fresh = f.capturedAt !== lastCapturedAt
  lastCapturedAt = f.capturedAt

  const r = await pipeline({
    jpeg: f.jpeg,
    bands: cam.bands,
    scales: cam.scales,
    tracks,
    passes: ['full', 'far']
  })
  tracks = r.tracks

  for (const b of cam.bands) {
    const guarded = r.perBand[b.id]
    updateBandState(states[b.id], guarded, { stale: f.stale })
    const obs = buildObservation({
      band: b,
      scale: cam.scales[b.id],
      bandState: states[b.id],
      guarded,
      vehicles: r.vehicles,
      frame: { width: r.width, height: r.height, meanLuma: r.meanLuma, energy: r.energy, stale: f.stale, capturedAt: f.capturedAt }
    })
    const decision = referenceDecision({ observation: obs, sector: { sector_id: cam.zone.id }, rules: buildRules(cam.zone) })
    if (b.id === cam.bands[0].id) {
      console.log(`scan ${scan}  ${r.vehicles.length} vehicles  ${r.ms.decode}ms decode + ${r.ms.infer}ms infer  luma ${r.meanLuma} energy ${r.energy}${fresh ? '' : '  (camera not refreshed)'}`)
    }
    console.log(`   band ${b.id}: ${obs.state}/${obs.quality} conf ${obs.confidence} ticks ${obs.ticks} — ${obs.carsFit} cars fit, ${obs.freeMetres} m  => ${decision.decision} (${decision.code})`)
    if (scan === SCANS) console.log(`             ${obs.explanation}\n             rules: ${buildRules(cam.zone).explanation}`)
  }
}
