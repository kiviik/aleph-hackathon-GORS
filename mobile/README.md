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
npm test        # 92 tests
npm run typecheck
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
  The phone consumes `src/data/bands.json` (11 cameras, 12 bands) — it does not learn it.
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
- Only those 11 cameras are covered, of 208.
- **Some of the City's cameras pan.** A band is geometry in the pixels of one view, so a camera that
  changes preset makes its own band meaningless — and nothing in the pipeline notices: there is no
  view fingerprint, and a re-aimed camera keeps being judged against stale geometry. Cameras 162 and
  182 were caught doing exactly this and are permanently excluded via
  [`harness/data/disabled-cameras.json`](../harness/data/disabled-cameras.json), which the exporter
  honours for every source. With 208 cameras in the city, dropping one that will not hold still is
  cheaper than trusting it. Verify a new camera holds its view before adding it.
- **A band drawn on the wrong surface is the same failure, without the pan.** Cameras 169 and 171
  are excluded for it. 169's corridor lies along the Holt Renfrew shopfront with pedestrians walking
  through it and no roadway under any part of it; 171's runs off the kerb, down the travel lane and
  out through the intersection, and it was reporting 8.5 m free — and PARK — in live traffic. Both
  views are stable over two minutes, so neither is a pan caught in progress; the geometry is simply
  wrong against the view the camera holds today. Nothing in the pipeline can tell: a band is
  geometry, and an empty traffic lane is flat asphalt to the texture guard.
- **Cameras 36 and 108 are still open questions.** On a live night frame 108's corridor crosses the
  travel lanes and the kerb it was learned on is now behind construction hoarding, and 36's runs
  over the roadway. One night frame is not enough to disable a camera on — both need a daytime
  overlay (`npm run diag:overlay`, 09:30–15:00 Calgary time) before a call is made.
- A curb segment needs **three consistent observations** before it can read "free". One
  scan always shows `review`. That is the design, not a bug.
- **Opening the app is not a blank slate.** The curb segments are drawn from the bundled fixture on
  the first frame, and the last session's verdicts are restored with them — labelled with the age of
  the frame they came from, and dropped entirely once that frame is over 30 minutes old, the same
  cut-off at which the band's own history is discarded. Without that, re-opening showed an all-grey
  map for the five minutes the camera rotation needs to revisit all 13 cameras, despite already
  knowing the answers. A first-ever launch still has to download the model and take its own frames.
- Two inference passes per frame instead of the desktop's four. Lower recall, but a missed
  car leaves a textured strip that the appearance guard marks *unknown*, never *free*.
- **`car`, `truck` and `bus` all occupy curb.** The keep-set was `car` alone, on the reasoning that
  the model counts car-sized spots — but that is a question about slot arithmetic, not about whether
  a stretch is taken, and YOLO26 calls most SUVs, vans and pickups `truck`. Across the 29 archived
  Calgary snapshots the car-only filter discarded 19 vehicles no `car` box covered, one of them a
  0.743 pickup parked inside camera 14's own band. `motorcycle` stays out: it hides inside a legal
  gap, and the class doubles as the model's guess for bicycles at rack scale.
- **FREE is only claimed where a car has been seen parked.** A band's padded ends exist so the
  texture guard can look past the last parked car; they are not curb the app may sell. Camera 219's
  band runs off its curb and across the 6 Ave SW / 10 St SW intersection, which is flat asphalt and
  so passes the texture guard — replaying its 302 collected frames, **144 of the 230 frames that
  reported free space put it entirely in that junction**. `band.freeT`, baked offline by
  `harness`'s `npm run bake:freerange` from where parked cars' ground contact has actually covered
  the axis, is what `computeGaps` now clips free intervals to; occupancy and the texture guard still
  read the whole band. The 7 cameras with no collected history fall back to the learned core and
  therefore read conservatively — collecting history for them is the outstanding work.
- **A band is padded by at most half the curb it observed, per end.** `scale.mjs` has enforced that
  on anything learned here for a while; the shipped fixture predated it and every one of its
  fourteen bands was over — camera 76's far curb carried 20.4 m of guessed curb on 8.9 m of
  evidence. `harness`'s `npm run clamp:bands` re-bound them in place. Guessed curb is where the
  false "free" readings live.
- Daytime only. Night, rain and snow are untested, and the quality thresholds in
  `src/evidence/evidence.mjs` are calibrated against a single daytime fixture.

## Layout

```
worklet/            Bare worklet: @qvac/onnx session + framed IPC
src/core/           plain ESM shared by Metro, bare-pack and node --test
src/evidence/       boxes + band geometry -> {state, quality, confidence, roi, detections}
src/policy/         the fail-closed decision gate
src/scan/           per-camera scan, with state persisted across scans
src/data/           bands.json fixture + Calgary frame fetch
plugins/            Expo config plugin that links the addon into jniLibs

App.tsx             providers only: SafeAreaProvider + NavigationContainer
src/navigation/     native bottom tabs (UITabBarController / BottomNavigationView)
src/screens/        one file per tab
src/components/     memoised list rows, OsmMap, and small shared pieces
src/design-system/  tokens + the re-exported primitives all UI code imports
src/state/          the zustand store, the pure spot transforms, the rescan loop
src/lib/            module-scope formatters
assets/tabs/        tab bar icons (1x/2x/3x); iOS uses SF Symbols instead
```

## UI conventions

The UI follows the React Native performance rules in
[`.claude/skills/vercel-react-native-skills`](../.claude/skills/vercel-react-native-skills).
The parts worth knowing before editing a screen:

- **Navigation is native.** `@bottom-tabs/react-navigation` drives a real
  `UITabBarController` / `BottomNavigationView`. There is no `useState<Tab>` and no
  hand-drawn tab bar; screens navigate with `navigation.navigate("Evidence")`.
- **Every list is a `List`** (FlashList) from the design system — including the short
  horizontal ones. `ScrollView` + `.map()` is not used for array-backed content, and a
  virtualiser is never nested inside a `ScrollView`: section content goes in
  `ListHeaderComponent` / `ListFooterComponent`, **passed as elements, not component
  types** — FlashList silently drops a `memo()`-wrapped component there.
- **Rows take primitives and are `memo`ised.** Anything that changes per row without the
  list changing — favourite, selection, a reviewer's verdict, whether a camera has a frame
  yet — is read inside the row with a store selector (`src/state/store.ts`), so one tap
  re-renders one row.
- **Shared state lives in the zustand store**, not in React Context, for the same reason.
  The scan pipeline lives there too, so a scan survives a tab switch.
- **All UI imports come from `src/design-system`**, never from `react-native`,
  `@shopify/flash-list`, `expo-image` or `expo-status-bar` directly.
- **Images go through `expo-image`**, never react-native's `Image`.
- **The app is dark-only.** One palette in `design-system/theme.ts`, no theme switch and no
  toggle. `useThemedStyles(factory)` builds each stylesheet once and hands back the same object
  every render, so no `dark && styles.xDark` arrays and no inline style objects in rows. Four font
  sizes only — hierarchy comes from weight and colour. `borderRadius` always ships with
  `borderCurve: "continuous"`, elevation is a CSS `boxShadow` string, spacing is `gap`.
- **Never `{value && <View/>}`** where `value` can be `""` or `0`; use a ternary with `null`.
- **Nothing reads `Dimensions`.** The evidence overlay scales off a width measured with
  `onLayout`, so a rotation or split screen cannot misplace the boxes.
- **Safe areas** are handled by the platform: `contentInsetAdjustmentBehavior="automatic"`
  on scrolling roots, the native tab bar for the bottom edge. `src/design-system/screen.tsx`
  is the only place that touches insets for layout, and only on Android; the status-bar
  strip is painted by `StatusBarScrim`, which is chrome, not padding.
- **React Compiler is on** (`experiments.reactCompiler` in `app.json`). Destructure
  functions off hooks and props at the top of render rather than dotting into objects.
