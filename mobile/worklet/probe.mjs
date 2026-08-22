// Gate 0. The smallest thing that can answer the only question that matters before any other work:
// does the @qvac/onnx Bare addon actually link into an Expo/react-native-bare-kit build and load
// on a physical device? No model, no camera, no pipeline, no UI.
//
//   npm run bundle:probe && npx expo run:android --device
//
// PASS = a non-empty provider list. Expect NnapiExecutionProvider and/or XnnpackExecutionProvider
// and CPUExecutionProvider. If this fails, stop and take the fallback in the plan -- do not build
// on top of it.
/* global BareKit, Bare */
const IPC = BareKit.IPC
const say = (o) => IPC.write(JSON.stringify(o) + '\n')

say({ step: 'boot', bare: typeof Bare !== 'undefined' ? Bare.version : null, platform: typeof Bare !== 'undefined' ? Bare.platform : null, arch: typeof Bare !== 'undefined' ? Bare.arch : null })

try {
  const onnx = require('@qvac/onnx')
  say({ step: 'require', ok: true, keys: Object.keys(onnx) })
  onnx.configureEnvironment({ loggingLevel: 'error' })
  say({ step: 'configureEnvironment', ok: true })
  say({ step: 'providers', ok: true, providers: onnx.getAvailableProviders() })
} catch (e) {
  say({ step: 'FAILED', ok: false, message: String(e && e.message), stack: String(e && e.stack) })
}

// Hermes ships without full ICU; the parking rules depend on America/Edmonton. Checked here so the
// answer arrives in the same 30 seconds as the addon answer.
try {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Edmonton', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(Date.UTC(2026, 0, 15, 12, 0)))
    .find((p) => p.type === 'hour').value
  say({ step: 'icu', tzSupported: Number(h) === 5, sawHour: h, note: 'expect 5 (05:00 MST); 12 means no tz data' })
} catch (e) {
  say({ step: 'icu', tzSupported: false, error: String(e && e.message) })
}
