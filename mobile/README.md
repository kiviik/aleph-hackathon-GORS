# Calgary Estaciona — mobile

On-device estimation of free curb parking, from Calgary's public traffic cameras.
Vehicle detection runs locally with **YOLO26s** on the **QVAC ONNX engine**
(`@qvac/onnx`) inside a Bare worklet. No inference server, no API key, no frame upload.

Ported from the `calgary-free-parking` prototype. See
[`docs/hackaton/07-mobile.md`](../docs/hackaton/07-mobile.md) for the full record.

## Requirements

- **A physical Android device.** Expo Go and emulators cannot run this: `@qvac/onnx`
  is a native Bare addon and QVAC does not run on emulators.
- Node 22+, and Android SDK/NDK via `expo prebuild` (or use the Docker build below).

`app.json` and `eas.json` also list iOS, and `@qvac/onnx` ships `ios-arm64` prebuilds
with CoreML — but `plugins/withQvacOnnx.js` links the addon for **Android only** today.
An iOS build will run the UI with no detector until that plugin is extended.

## Run

```bash
npm install
(cd node_modules/@qvac/onnx && npm run mobile:copy-prebuilds)
npm run bundle:worklet
npx expo prebuild --platform android
npx expo run:android --device
```

A containerised Android build is also available and needs no local SDK:

```bash
npm run build:android:docker   # APK into artifacts/
```

Open the **Scan** tab first. It is the status surface: it shows the ONNX provider list,
the Bare version, whether the model is downloaded, and whether the runtime really has
`America/Edmonton` timezone data. Nothing on the map should be trusted until the engine
row reads OK.

### Gate 0 — is the addon even linked?

Before anything else, prove the addon loads on the phone:

```bash
npm run bundle:probe
# render <OnnxProbe/> and run on device
```

PASS is a non-empty provider list (expect `NnapiExecutionProvider` and/or
`XnnpackExecutionProvider`, plus `CPUExecutionProvider`). There is no official example
of `@qvac/onnx` inside Expo/react-native-bare-kit, so this is the one genuinely unproven
step. If it fails, `docs/hackaton/07-mobile.md` records the fallbacks.

## Test — no device, no model, no network

```bash
npm test        # 51 tests
```

This covers the detector post-processing, letterbox geometry, dwell tracking, gap
geometry, the appearance texture guard, Calgary rule parsing, the timezone fallback and
the whole decision matrix — by replaying `test/fixtures/detector-golden.json`, raw model
output recorded from the desktop sidecar. `src/core/frame-pipeline.mjs` is the *same*
module the worklet runs, so what is verified here is what ships.

Parity against the desktop pipeline is checked from the source repo:

```bash
# in calgary-free-parking, with `npm run detector` running
node scripts/verify-mobile-preprocess.mjs    # pure-JS letterbox vs sharp
node scripts/verify-mobile-detection.mjs     # same boxes from the real weights
node scripts/verify-mobile-pipeline.mjs 76 4 # full on-device path, live camera
```

## What it does and does not prove

- Detection is genuinely on-device. Frames come from Calgary's public cameras over the
  network; **inference never leaves the phone**.
- **The curb geometry was learned offline**, on a laptop, from hours of camera history.
  The phone consumes `src/data/bands.json` (15 cameras, 16 bands) — it does not learn it.
- Only those 15 cameras are covered, of 208.
- A curb segment needs **three consistent observations** before it can read "free". One
  scan always shows `review`. That is the design, not a bug.
- Two inference passes per frame instead of the desktop's four. Lower recall, but a missed
  car leaves a textured strip that the appearance guard marks *unknown*, never *free*.
- Daytime only. Night, rain and snow are untested, and the quality thresholds in
  `src/evidence/evidence.mjs` are calibrated against a single daytime fixture.

## Layout

```
worklet/        Bare worklet: @qvac/onnx session + framed IPC
src/core/       plain ESM shared by Metro, bare-pack and node --test
src/evidence/   boxes + band geometry -> {state, quality, confidence, roi, detections}
src/policy/     the fail-closed decision gate
src/scan/       per-camera scan, with state persisted across scans
src/data/       bands.json fixture + Calgary frame fetch
plugins/        Expo config plugin that links the addon into jniLibs
```
