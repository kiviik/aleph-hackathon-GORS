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
| `src/history.mjs` | Collected detection history: JSONL append/read/resume helpers. |
| `src/band-zones.mjs` | Which parking zone governs which curb — proposals, and the human override table. |
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

### 4. History collection — `npm run collect:history -- --frames 45`

Band learning needs frames the repo did not have: the history the shipped geometry was learned from
stayed in the research repo, so a clean clone could not re-derive a single band. This collects its
own, from the live cameras, into `data/history/<id>.jsonl` (git-ignored).

```bash
npm run detector                                    # in another terminal
npm run collect:history -- --only 76,162 --frames 45
```

If the `calgary-free-parking` research repo is checked out beside this one, its `data/history/`
already holds hundreds of frames per camera in exactly this format — copy the files you need into
`data/history/` and skip straight to `learn:bands`. That is how the learner's rejection tests were
tuned; a fresh collection is only needed for cameras that repo never covered.

Append-only and resumable: re-running costs almost nothing for frames already seen, because the
City honours conditional GETs (`304`, zero bytes) and duplicates are caught again by `Last-Modified`
and by a SHA-256 of the bytes. A failed fetch writes **no** line at all — an observation with an
empty vehicle list would read as an empty curb and reset every dwell that crossed it.

**Collect on a weekday between 09:30 and 15:00 Calgary time.** This is a correctness constraint, not
politeness: below `DARK_LUMA = 45` the frames are unusable, and Calgary's AM/PM bans empty one curb
at a time — a run started at 15:30 finds camera 76's east curb legally empty and learns a single
band, reproducing the exact bug this data exists to fix. The script refuses outside that window
unless you pass `--allow-window`.

Roughly 45 frames per camera (~45 min) is the recommended target; 25 is the workable minimum and
fewer than 5 collected frames produce nothing at all, because the tracker gives frame 1 `dwell: 1`.
Collection runs all four detector passes but tags each box with the passes that produced it, and the
learner defaults to the `full,far` subset the phone actually runs — learning from detections the
2-pass phone cannot reproduce would teach it curb that then reads as free space.

### 5. Side-aware band learning — `npm run learn:bands -- data/history/76.jsonl`

The learner fits one narrow curb line, removes only that line's inliers, and continues looking for
another supported line. Cars parked on opposite sides therefore remain independent bands instead
of pulling one wide fit toward the middle of the road. Its JSON output contains `bands` and fitted
`scales` for review; it never overwrites `data/state.json` or the mobile fixture implicitly.

```bash
npm run learn:bands -- data/history/76.jsonl                  # stdout, for review
npm run learn:bands -- --all --out data/learned-bands.json    # the reviewed overlay export:bands reads
```

Straight lines of stationary boxes are easy to find and mostly are not parking. Before a line is
accepted it must survive four tests ported from the research repo's `src/bands.mjs`, where they were
tuned against 208 cameras: **queue** (a red-light queue holds still for a frame or two; a parked car
chains dozens), **travel lane** (traffic flows *through* it), **off-street** (no traffic passes
beside it, so it is a lot), and **traffic both sides** (a median strip, not a curb). Without them,
line-fitting alone produced four "bands" for a street with two curbs. Rejections are reported with
the numbers that caused them, which is the most useful thing to read when a camera learns nothing.

Each learned band is then **scale-gated and extended**: a band whose `fitScale` misses its 5-sample
floor is dropped rather than shipped with a guessed px/m (a guessed scale becomes guessed free
metres, and then PARK), and the survivors are padded so the gap logic and the texture guard can
judge the curb just past the parked cars — by up to two car lengths per end, but never by more than
half of what the band actually observed. That bound is not cosmetic: unbounded, camera 76's far curb
learned 9.6 m of parked cars and came out with 21.3 m of guessed curb attached, and short bands
routinely tripled.

The input can be a JSON observation array, `{ "observations": [...] }`, or JSONL with one
observation per line. Each observation needs `vehicles[].box`; tracked `dwell` values are used when
present and otherwise reconstructed in timestamp order. Use local, privacy-safe history only.

### 6. Overlay review — `npm run debug:overlay -- 76`

The human gate, written to `data/debug-<id>.jpg` in the research runs' convention: band corridors,
the learned core, each car's box, and a connector from every car to the band it was assigned to.
Three questions to answer by eye before exporting anything — does every band lie on a curb, does any
band straddle the travel lane or a parking lot, and does each side/zone caption match the curb it is
drawn on?

### 6b. What the *mobile* pipeline sees — `npm run diag:overlay -- <frame.jpg> <cameraId> [outDir]`

`debug:overlay` draws the reference client's boxes. This draws `mobile/src/core/frame-pipeline.mjs`'s
own output over the same frame — every detection with its class and score, the band corridor, and
the three states the gap logic ends up in: **red** occupied, **yellow** moving, **purple** textured
(the appearance guard said unknown), **green** confirmed free. It replays the frame three times so
dwell reaches `isParked`, and prints the per-band JSON alongside.

It is the fastest way to answer "why did this curb read free?", and it is what caught two of the
findings below. Snapshots to run it on live in `data/snapshots/`.

```bash
npm run diag:overlay -- data/snapshots/76-1787427611000.jpg 76 /tmp/diag
npm run diag:classes            # what the vehicle keep-set drops, over every snapshot
```

### 6c. Re-binding shipped geometry — `npm run clamp:bands`

`extendBandBounded` only binds bands this repo learns. Everything in `mobile/src/data/bands.json`
was padded in the research repo by a flat two car lengths per end, with no relation to how much curb
each band observed — measured against their own cores, **all fourteen were over the bound**. Camera
76's far curb carried 20.4 m of guessed curb on 8.9 m of evidence; camera 169 carried 23.9 m on
7.0 m. `clamp:bands` applies `clampBandExtension` to the shipped fixture in place — geometry only,
no re-learn and no re-match of zones — and bumps `exportedAt`, which is what makes the phone discard
band history that now describes a different stretch of curb. `export:bands` applies the same bound
to every source, so this is a one-off for geometry that predates it.

### 6d. Where FREE may be claimed — `npm run bake:freerange`

The clamp above bounds how far a band may be *padded*. This bounds what may be *sold*.

A band is padded past its last parked car so the gap logic and the texture guard can look just
beyond it. Looking is fine; claiming is not. Camera 219's band runs off its curb and straight across
the 6 Ave SW / 10 St SW intersection — and the texture guard passes it, because an empty junction is
flat asphalt. Replaying its 302 collected frames (`npm run diag:freeab`), **144 of the 230 frames
that reported free space put that free space entirely outside the curb the band was learned on.**
No metre bound fixes it: at 31 px/m the near end swallows a whole junction in seven metres.

What does fix it is the thing the padding discards — whether a car has ever been there.
`bake:freerange` walks the history, marks every pixel of the axis a parked car's *ground contact*
has covered (`groundExtent`, not `boxExtent`, which leaks box height into length on a steep band),
and writes the outermost run supported by ≥1% of frames as `freeT` on the band. `computeGaps` clips
free intervals to it; occupancy and the texture guard still read the whole band.

The fitted `coreT` is not a good enough substitute — it is anchor-based and inlier-filtered, so it
sits systematically inside the real curb. Cameras 27 and 76's near curb are parkable end to end;
clipping them to their cores threw away most of their genuine free space. `coreT` is only the
fallback for a camera with no collected history, which reads conservatively until it has some.

```bash
npm run bake:freerange -- --dry-run
npm run diag:freeab                 # A/B the clip over every collected history
npm run diag:envelope               # per-band coverage bars: where cars have actually parked
npm run diag:traffic -- 219         # per-metre moving/parked profile along a band
```

Measured over the 2107 collected frames, free-reporting frames go 1068 → 703, and every one of the
184 confirmed gaps that lay entirely outside a band's observed curb is gone.

### 6e. Dropping a camera — `npm run prune:disabled`

`data/disabled-cameras.json` is the permanent record of which cameras must never ship, and
`export:bands` honours it for every source. But a full export also re-runs zone matching, which
moves rules and side wording at the same time; when the only decision made is *this camera must not
ship*, `prune:disabled` applies just that to the shipped fixture in place and bumps `exportedAt`.

Four cameras are out: **162** and **182** pan away from the view their bands were learned on, and
**169** and **171** hold their view but carry a band drawn on the wrong surface — 169's along a
shopfront pavement, 171's down a travel lane and out through an intersection, where it was reporting
8.5 m free and a PARK verdict. The evidence for each is in the file, reproducible with
`npm run diag:overlay`.

### 7. Band export — `npm run export:bands`

Band learning needs ~20 distinct frames per camera and is far too expensive for a phone, so it
stays offline. The phone gets the *result*: band geometry, the fitted perspective scale, and the
matched parking zone with its rule strings, baked into `../mobile/src/data/bands.json` so the app
needs neither `turf` nor the 340 KB zone dataset.

```bash
npm run export:bands -- --only 76 --dry-run     # print the diff, write nothing
npm run export:bands -- --source fixture        # keep today's geometry, re-match zones only
```

It **refuses to write** (exit 3) when an export would drop a camera or a band, unless
`--allow-band-loss`. That guard is not hypothetical: `state.json` holds one band for camera 76 while
the fixture ships two, so the plain gate used to silently delete the only camera that models both
curbs of a street.

It also matches a **zone per band** where the evidence supports it (two bands converging on one
street, an opposite-`blockSide` zone pair on a camera street, a clear near/far ordering) — and emits
`zoneId: null` otherwise, which makes the app report occupancy but refuse to authorise parking.
Automatic matches are heuristics: `cameras.json` carries no camera pose, so pixels cannot be
projected onto the ground. `data/band-zones.json` is the human-verified override table, and it wins.
Fill it in against the overlay before shipping a per-band zone.

## Data

| Path | Size | Used by |
|---|---|---|
| `data/cam76-sample.jpg` | 114 KB | every parity script; the offline pipeline fallback |
| `data/cameras.json` | 35 KB | `export:bands` — 208 Calgary cameras |
| `data/zones.json` | 337 KB | `export:bands` — parking zones (City of Calgary open data) |
| `data/state.json` | 72 KB | `export:bands` — bands and scales already learned |
| `data/history/*.jsonl` | ~3.3 KB per frame | `learn:bands`, `debug:overlay` — collected detections, **git-ignored** |
| `data/learned-bands.json` | ~1.5 KB per camera | `export:bands` — reviewed learner output |
| `data/band-zones.json` | < 2 KB | `export:bands` — human-verified band → zone assignments |
| `data/snapshots/`, `data/debug-*.jpg` | 6.6 MB | archive — reference overlays from the research runs |

The raw detection history those bands were learned from is **not** here. It was 208 cameras of
per-frame `.jsonl` (~19 MB) and it stayed in the research repo. `npm run collect:history` now
regenerates history of the same shape on demand, so a re-learn is reproducible from this repo — but
a fresh collection will **not** reproduce the original geometry. Different day, different cars: the
`bands.json` diff for a re-learned camera is total, not incremental. Re-learn one camera at a time,
review its overlay, and export with `--only`.
`data/snapshots/labels.csv` is likewise inert: an unfilled label template for the accuracy-scoring
script, which also stayed behind.

`state.json` was copied while the research repo was still collecting, so it holds *more* history
than the export that produced the committed `mobile/src/data/bands.json`. Running `export:bands`
therefore changes the app's bundled data — cameras come and go and band geometry shifts. That is a
product decision, not a side effect of running a gate; review the diff before keeping it.

## Licenses

Code Apache-2.0. `yolo26s.onnx` is an Ultralytics model (AGPL-3.0), downloaded at setup and not
committed. `@qvac/onnx` is Apache-2.0. Calgary data under the City of Calgary's Open Data terms.
