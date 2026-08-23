// The on-device detector, running inside a Bare worklet (react-native-bare-kit).
//
// This is the IPC shell only: it owns the @qvac/onnx session and speaks the framed protocol.
// The actual per-frame work lives in src/core/frame-pipeline.mjs, which is shared with the laptop
// tests, so the code path validated off-device is the same one that runs on the phone.
//
// The whole pixel pipeline stays on this side of IPC on purpose: a 640x640x3 float tensor is
// 4.9 MB, and shipping it across the RN bridge per frame would cost more than the inference.
// Only the JPEG comes in (~116 KB) and JSON goes out (~2 KB).
/* global BareKit, Bare */
import onnx from '@qvac/onnx'
import { RPC, encodeFrame, createFrameReader } from './protocol.mjs'
import { createFramePipeline } from '../src/core/frame-pipeline.mjs'
import { createTensor, createScratch, SIZE } from '../src/core/preprocess.mjs'
import { decodeRows } from '../src/core/boxes.mjs'

// @qvac/onnx returns a NUMERIC session handle, and the very first session in a worklet is 0.
// Every check on `session` must therefore compare against null, never test truthiness: `!!0` is
// false, which made a perfectly loaded session report `loaded: false` and every DETECT fail with
// 'model not loaded' while getInputInfo/getOutputInfo were happily returning real tensor shapes.
let session = null
let modelPath = null
let inputName = null
let providers = []
let busy = false

// Allocated once per session, never per frame.
const tensor = createTensor()
const scratch = createScratch(1080)

const pipeline = createFramePipeline({
  tensor,
  scratch,
  infer: () => {
    const out = onnx.run(session, [{ name: inputName, shape: [1, 3, SIZE, SIZE], type: 'float32', data: tensor }])
    return decodeRows(out[0].data)
  }
})

const IPC = BareKit.IPC
const send = (header, payload) => IPC.write(encodeFrame(header, payload))
const reply = (id, body) => send({ id, ok: true, ...body })
const fail = (id, error, code = 'ERROR') => send({ id, ok: false, code, error: String(error?.message || error) })

function health () {
  return {
    bare: typeof Bare !== 'undefined' ? Bare.version : null,
    platform: typeof Bare !== 'undefined' ? Bare.platform : null,
    arch: typeof Bare !== 'undefined' ? Bare.arch : null,
    addon: 'loaded',
    providers,
    model: modelPath,
    loaded: session !== null,
    size: SIZE
  }
}

function load (path) {
  if (session !== null) return { already: true, ...health() }
  const t0 = Date.now()
  session = onnx.createSession(path, { provider: 'auto_gpu' })
  modelPath = path
  const input = onnx.getInputInfo(session)
  const output = onnx.getOutputInfo(session)
  inputName = input[0].name
  return { ms: Date.now() - t0, input, output, ...health() }
}

const read = createFrameReader(async (header, payload) => {
  const { id, type } = header
  try {
    if (type === RPC.HEALTH) return reply(id, health())
    if (type === RPC.LOAD) return reply(id, load(header.modelPath))
    if (type === RPC.UNLOAD) {
      if (session !== null) { try { onnx.releaseSession?.(session) } catch {} }
      session = null; modelPath = null; inputName = null
      return reply(id, { released: true })
    }
    if (type === RPC.DETECT) {
      if (session === null) return fail(id, 'model not loaded', 'NO_MODEL')
      // onnx.run is synchronous and the worklet is single-threaded, so requests must serialise.
      if (busy) return fail(id, 'inference in progress', 'BUSY')
      busy = true
      try {
        return reply(id, await pipeline({ ...header, jpeg: payload }))
      } finally {
        busy = false
      }
    }
    return fail(id, `unknown type ${type}`, 'UNKNOWN')
  } catch (e) {
    return fail(id, e)
  }
})

// `configureEnvironment` sets a NATIVE singleton, and the singleton outlives this worklet: a
// second worklet in the same process gets "OnnxRuntime::configure() must be called before the
// first instance() call". That is not a failure -- the environment is configured, by the worklet
// that ran before this one -- but it used to be caught here and reported as `ready: false`, which
// blocked every DETECT for the life of the process. On the phone that turns one JS reload into an
// app whose map keeps updating while nothing is being detected at all, with no error surfaced past
// a console warning. Only the provider list decides readiness; configuring is best-effort.
let configureError = null
try {
  onnx.configureEnvironment({ loggingLevel: 'error' })
} catch (e) {
  configureError = String(e?.message || e)
}
try {
  providers = onnx.getAvailableProviders()
  if (!providers?.length) throw new Error('no ONNX execution providers')
  send({ id: 0, type: 'ready', ok: true, ...health(), configureError })
} catch (e) {
  send({ id: 0, type: 'ready', ok: false, error: String(e?.message || e), configureError })
}

IPC.on('data', read)
IPC.on('error', () => {})
