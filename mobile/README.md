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

iOS is supported too: `plugins/withQvacOnnx.js` links the addon on both platforms, and
`@qvac/onnx` ships `ios-arm64` prebuilds with CoreML. Building it needs a Mac (or EAS)
for `npx expo prebuild --platform ios` and `pod install`; the detector itself is not the
blocker. Note that `npm run bundle:worklet` packs with `--preset mobile`, so one bundle
serves both platforms — a bundle packed for one will fail to find the addon on the other.

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

The builder generates `worklet/bundle.js` before Gradle. That file is ignored
because it is derived from `worklet/detector.worklet.mjs`, but it is required
when the release variant bundles JavaScript with Metro.

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
npm test        # 75 tests
```

This covers the detector post-processing, letterbox geometry, dwell tracking, gap
geometry, per-curb band assignment and map placement, the appearance texture guard, Calgary rule
parsing, the timezone fallback and the whole decision matrix — by replaying `test/fixtures/detector-golden.json`, raw model
output recorded from the desktop sidecar. `src/core/frame-pipeline.mjs` is the *same*
module the worklet runs, so what is verified here is what ships.

Parity against the reference pipeline is checked by the harness in [`../harness`](../harness):

```bash
cd ../harness
npm run detector                  # QVAC ONNX sidecar, in another terminal
npm run verify:preprocess         # pure-JS letterbox vs sharp (no sidecar needed)
npm run verify:detection          # same boxes from the real weights; rewrites the golden fixture
npm run verify:pipeline 76 4      # full on-device path, live camera
```

## What it does and does not prove

- Detection is genuinely on-device. Frames come from Calgary's public cameras over the
  network; **inference never leaves the phone**.
- **The curb geometry was learned offline**, on a laptop, from hours of camera history.
  The phone consumes `src/data/bands.json` (15 cameras, 16 bands) — it does not learn it.
- The offline learner is side-aware: it extracts one narrow line at a time and removes only that
  line's inliers, so opposite curbs become separate bands instead of one widened corridor. At
  runtime a detection is assigned to **one** band — the nearest centreline in metres — so a car on
  the far curb can no longer block the near one. Regenerate `bands.json` with the harness
  (`collect:history` → `learn:bands` → `debug:overlay` → `export:bands`) to apply this to a camera;
  the checked-in fixture cannot reconstruct a missing side because it contains geometry, not raw
  history.
- **Each curb is placed and judged on its own.** A band's pin is anchored where the camera meets the
  zone line and walked along it by the band's own metres, clamped to the surveyed segment, with
  `±accuracy` stated — it no longer slides to the mean gap centre, which resolved metres inside a
  mapping whose own error is tens of metres. Where the fixture matches a zone per curb, each band is
  judged under *its* rules: 47% of opposite-side zone pairs in the City data differ somewhere, and
  25% differ in the restriction window itself.
- Only those 15 cameras are covered, of 208.
- A curb segment needs **three consistent observations** before it can read "free". One
  scan always shows `review`. That is the design, not a bug.
- **Opening the app is not a blank slate.** The curb segments are drawn from the bundled fixture on
  the first frame, and the last session's verdicts are restored with them — labelled with the age of
  the frame they came from, and dropped entirely once that frame is over 30 minutes old, the same
  cut-off at which the band's own history is discarded. Without that, re-opening showed an all-grey
  map for the five minutes the camera rotation needs to revisit all 15 cameras, despite already
  knowing the answers. A first-ever launch still has to download the model and take its own frames.
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
