# Experimentation harness

Laptop-side tooling for the Expo app in [`../mobile`](../mobile). The phone runs YOLO26s on the
QVAC ONNX engine over pure-JS preprocessing; this harness answers the question that cannot be
answered on the phone: **does the on-device path produce the same result as the reference
implementation it was ported from?**

It comes from the `calgary-free-parking` research repo, where these scripts already imported
across the filesystem into this one. They now live next to the code they test.

## What is here

| Piece | Role |
|---|---|
| `detector/detector.mjs` | QVAC ONNX sidecar (Bare runtime). Loads YOLO26s and serves `POST /detect` on raw 640×640 RGB. Stands in for `@qvac/onnx` on the phone. |
| `src/detector-client.mjs` | The **reference** path: `sharp` letterboxing, 4-pass detection, class-agnostic dedupe, colour signatures. What mobile is compared against. |
| `src/geom.mjs` | IoU and robust-fit helpers used by the comparison. |
| `src/zones.mjs` | Calgary parking-zone rules and camera ↔ zone matching, for the band export. |
| `src/paths.mjs` | Filesystem anchors, so every script resolves `harness/data` and `../mobile` regardless of cwd. |
| `data/` | Calgary fixtures and collected detection history — see [Data](#data). |

## Setup

```bash
cd harness
npm install
npm run download-model        # yolo26s.onnx (Ultralytics, AGPL-3.0) -> models/, ~40 MB, not committed
```

The three `verify:*` scripts need the sidecar running in another terminal:

```bash
npm run detector              # listens on 127.0.0.1:3085
```

`npm run verify:preprocess` is the exception — it needs neither the sidecar nor the model.

## The gates

### 1. Preprocessing parity — `npm run verify:preprocess`

The mobile letterbox is hand-written JS over `jpeg-js`; the reference is `sharp`/libvips. This
compares both on a real Calgary frame: letterbox **geometry must match exactly** (otherwise boxes
unmap to the wrong pixels) and mean per-channel difference must stay under 2/255, against a JPEG
decoder floor of ~0.73.

The `full` and `far` passes are gated. The side crops are a ~1.016× *upscale*, where libvips
switches to an affine bicubic interpolator a separable resample cannot match byte-for-byte; they
are reported but not gated, and mobile does not run them.

### 2. Detection parity — `npm run verify:detection`

Pixel parity is only a proxy. This is the contract: **does the mobile path feed the pipeline the
same vehicles?** Compared after class-agnostic dedupe, because that is what the pipeline consumes —
YOLO26's end-to-end head routinely emits one physical vehicle as both `car` and `truck`, and which
of the pair ranks higher is unstable under sub-1/255 input differences.

Side effect, and the reason to re-run it after touching post-processing: it writes
`../mobile/test/fixtures/detector-golden.json` plus the frame, which is what lets `mobile/test`
validate the whole detector path with **no ONNX, no addon and no phone**.

### 3. Pipeline rehearsal — `npm run verify:pipeline [cameraId] [scans]`

Runs `mobile/src/core/frame-pipeline.mjs` — the exact module the Bare worklet calls — against the
real weights via the sidecar, the real learned bands, and a live camera frame (falling back to the
bundled fixture offline). Prints per-scan vehicles, timings, band state, and the policy decision.
The only thing left unexercised is `@qvac/onnx` linking itself, which needs a device.

```bash
npm run verify:pipeline 76 4
```

### 4. Side-aware band learning — `npm run learn:bands -- history.jsonl`

The learner fits one narrow curb line, removes only that line's inliers, and continues looking for
another supported line. Cars parked on opposite sides therefore remain independent bands instead
of pulling one wide fit toward the middle of the road. Its JSON output contains `bands` and fitted
`scales` for review; it never overwrites `data/state.json` or the mobile fixture implicitly.

The input can be a JSON observation array, `{ "observations": [...] }`, or JSONL with one
observation per line. Each observation needs `vehicles[].box`; tracked `dwell` values are used when
present and otherwise reconstructed in timestamp order. Use local, privacy-safe history only.

### 5. Band export — `npm run export:bands`

Band learning needs ~20 distinct frames per camera and is far too expensive for a phone, so it
stays offline. The phone gets the *result*: band geometry, the fitted perspective scale, and the
matched parking zone with its rule strings, baked into `../mobile/src/data/bands.json` so the app
needs neither `turf` nor the 340 KB zone dataset.

## Data

| Path | Size | Used by |
|---|---|---|
| `data/cam76-sample.jpg` | 114 KB | every parity script; the offline pipeline fallback |
| `data/cameras.json` | 35 KB | `export:bands` — 208 Calgary cameras |
| `data/zones.json` | 337 KB | `export:bands` — parking zones (City of Calgary open data) |
| `data/state.json` | 72 KB | `export:bands` — bands and scales already learned |
| `data/snapshots/`, `data/debug-*.jpg` | 6.6 MB | archive — reference overlays from the research runs |

The raw detection history those bands were learned from is **not** here. It is 208 cameras of
per-frame `.jsonl` (~19 MB). The side-aware learner can now consume an explicitly supplied local
history, but `state.json` remains the trusted checked-in input for `export:bands`; no retained
history means the existing geometry cannot be automatically reconstructed in a clean clone.
`data/snapshots/labels.csv` is likewise inert: an unfilled label template for the accuracy-scoring
script, which also stayed behind.

`state.json` was copied while the research repo was still collecting, so it holds *more* history
than the export that produced the committed `mobile/src/data/bands.json`. Running `export:bands`
therefore changes the app's bundled data — cameras come and go and band geometry shifts. That is a
product decision, not a side effect of running a gate; review the diff before keeping it.

## Licenses

Code Apache-2.0. `yolo26s.onnx` is an Ultralytics model (AGPL-3.0), downloaded at setup and not
committed. `@qvac/onnx` is Apache-2.0. Calgary data under the City of Calgary's Open Data terms.
