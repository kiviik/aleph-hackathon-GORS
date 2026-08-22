// QVAC ONNX detector service (Bare runtime).
// Adapted from tetherto/qvac-examples/qvac-smart-camera/detector/detector.mjs.
// Loads YOLO26s (ONNX, COCO-80, end-to-end/NMS-free) on the @qvac/onnx engine and exposes:
//   GET  /health              -> { ok, model, size, providers }
//   POST /detect              body = raw RGB 640x640 uint8 HWC -> { ok, ms, objects:[{label,cls,score,box}] }
// box = [x1, y1, x2, y2] normalised to 0..1 of the 640x640 input.
import onnx from '@qvac/onnx'
import http from 'bare-http1'
import { Buffer } from 'bare-buffer'

const argv = (typeof Bare !== 'undefined' && Bare.argv) || []
const PORT = Number(argv[3] || 3085)
const SIZE = 640
const HW = SIZE * SIZE
const MODEL = argv[2] || 'models/yolo26s.onnx'
const SCORE_MIN = 0.15 // the client applies its own threshold; keep more here

const LABELS = ['person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush']

onnx.configureEnvironment({ loggingLevel: 'error' })
const providers = onnx.getAvailableProviders()
console.log('[detector] providers:', JSON.stringify(providers))
console.log('[detector] loading model:', MODEL)
const session = onnx.createSession(MODEL, { provider: 'auto_gpu' })
const INPUT = onnx.getInputInfo(session)[0].name

const tensor = new Float32Array(3 * HW)
let busy = false

// yolo26 end-to-end output [1, 300, 6]: rows of [x1, y1, x2, y2, score, cls] in 640px space.
function infer (rgb) {
  for (let i = 0; i < HW; i++) {
    tensor[i] = rgb[i * 3] / 255
    tensor[HW + i] = rgb[i * 3 + 1] / 255
    tensor[2 * HW + i] = rgb[i * 3 + 2] / 255
  }
  const out = onnx.run(session, [{ name: INPUT, shape: [1, 3, SIZE, SIZE], type: 'float32', data: tensor }])
  const o = out[0].data
  const dets = []
  for (let i = 0; i < 300; i++) {
    const b = i * 6
    const sc = o[b + 4]
    if (sc < SCORE_MIN) continue
    const cls = o[b + 5] | 0
    dets.push({ label: LABELS[cls] || 'object', cls, score: +sc.toFixed(3), box: [o[b] / SIZE, o[b + 1] / SIZE, o[b + 2] / SIZE, o[b + 3] / SIZE] })
    if (dets.length >= 100) break
  }
  return dets
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, engine: '@qvac/onnx', model: MODEL, size: SIZE, providers }))
    return
  }

  if (req.method === 'POST' && req.url.startsWith('/detect')) {
    if (busy) { res.writeHead(429); res.end('{"error":"busy"}'); return }
    const chunks = []
    let len = 0
    req.on('data', (c) => { chunks.push(c); len += c.length })
    req.on('end', () => {
      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
      if (len < 3 * HW) { res.writeHead(400); res.end('{"error":"frame too small"}'); return }
      busy = true
      const t0 = Date.now()
      let dets
      try { dets = infer(body) } catch (e) { busy = false; res.writeHead(500); res.end(JSON.stringify({ error: String(e && e.message || e) })); return }
      busy = false
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ms: Date.now() - t0, objects: dets }))
    })
    req.on('error', () => { busy = false; try { res.writeHead(500); res.end('{"error":"stream"}') } catch {} })
    return
  }

  res.writeHead(404); res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => console.log('[detector] listening on ' + PORT))
