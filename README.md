# Aleph Hackathon GOR

Event repository for **BA Estaciona**, a local-first QVAC Track 2 prototype
that answers “¿Puedo estacionar acá, ahora?” by chaining visual evidence,
location, parking rules, and a conservative decision policy.

The repository also preserves the existing Atelier Professional surface under
`app/`, `components/`, and `lib/` as the starting workspace from which the
hackathon branch was prepared. The event prototype is isolated in
`ba-estaciona-qvac/`.

## Event prototype

```bash
cd ba-estaciona-qvac
npm install
npm test
npm run evaluate:mock
```

See [`ba-estaciona-qvac/README.md`](ba-estaciona-qvac/README.md) for QVAC
setup, local inference, recording, evaluation, and submission instructions.
The Calgary data research and integration plan lives in
[`docs/hackaton/06-calgary.md`](docs/hackaton/06-calgary.md).
The mobile execution plan lives in
[`docs/hackaton/07-mobile.md`](docs/hackaton/07-mobile.md).

## Desktop app (Electron)

The public web surface is only a Vercel landing page for downloading the app.
Electron starts the local Next UI on `127.0.0.1:3210` and loads `/estaciona` inside a
native window; the map is not exposed as a public web route on Vercel:

```bash
npm install
npm run electron:dev
```

For a production build, run `npm run build` first and then `npm run electron`.
The map still uses OpenStreetMap tiles and Nominatim for the destination search
when network access is available; the desktop shell and UI remain local. The
current public target is the Expo app described below.

Deploy the landing with `vercel --prod`. Vercel serves `/` only; the
`middleware.ts` guard redirects `/estaciona` back to the landing when running
on Vercel. Publish the Electron installer separately (for example as a GitHub
Release) only if the desktop fallback is needed; otherwise set the mobile Expo
deep link described below in the Vercel project environment variables.

## Mobile demo (Expo)

The demo target is **Android on a physical device**. The mobile app lives in
[`mobile/`](mobile/) and runs YOLO26s on the QVAC ONNX engine locally, on frames
from Calgary's public traffic cameras.

```bash
cd mobile
npm install
(cd node_modules/@qvac/onnx && npm run mobile:copy-prebuilds)
npm run bundle:worklet          # pack the Bare worklet
npx expo prebuild --platform android
npx expo run:android --device
```

**Expo Go cannot run this app**, and neither can an emulator. `@qvac/onnx` is a
native Bare addon and QVAC does not run under `llamacpp` on emulators, so a
development build on real hardware is required. `npm test` in `mobile/` runs the
whole pure-JS core — detector post-processing, gap geometry, the appearance
guard, parking rules and the decision policy — on a laptop with no device and no
model, against a recorded golden fixture.

iOS is supported as well: `@qvac/onnx` ships `ios-arm64` prebuilds with CoreML and
`mobile/plugins/withQvacOnnx.js` links the addon on both platforms. It only needs a
Mac (or EAS) to build.

For the landing, set `NEXT_PUBLIC_MOBILE_DOWNLOAD_URL` in Vercel to the published
demo build. The Electron shell remains a local fallback but is not the public
experience.

> The app reports *likely free* curb length from public camera imagery and
> synthetic-free City of Calgary rule data. It is a prototype, not legal parking
> advice.

## Experimentation harness

The laptop-side tooling that validates the mobile port lives in [`harness/`](harness/). The phone
cannot answer whether its pure-JS preprocessing and 2-pass detector agree with the reference
implementation they were ported from; the harness can, without a device:

```bash
cd harness
npm install
npm run download-model            # yolo26s.onnx -> harness/models (not committed)
npm run detector                  # QVAC ONNX sidecar, in another terminal

npm run verify:preprocess         # letterbox geometry + pixels vs sharp (no sidecar needed)
npm run verify:detection          # same vehicles from the real weights; rewrites the golden fixture
npm run verify:pipeline 76 4      # the worklet's own frame-pipeline, end to end
npm run export:bands              # re-bake mobile/src/data/bands.json from learned state
```

`verify:detection` is what produces `mobile/test/fixtures/detector-golden.json`, which is why
`mobile/`'s own test suite can check the whole detector path with no ONNX, no addon and no phone.
See [`harness/README.md`](harness/README.md) for what each gate proves and what it does not.

Note that `harness/` (experimentation) and [`ai-harness/`](ai-harness/) (agent context) are
unrelated: the first tests the vision pipeline, the second maintains the shared LLM context.

## Original Atelier surface

```bash
pnpm install
pnpm dev
```

The frontend expects the Atelier engine at `http://127.0.0.1:8000` by default.
Set `NEXT_PUBLIC_ATELIER_API` and `NEXT_PUBLIC_ATELIER_BRAND` to use another
engine or pilot brand. Without the engine, the interface explicitly identifies
sample/local data and blocks data-dependent conclusions.

## Verify

```bash
pnpm test
pnpm build
```

## Team and AI-agent context

Context is maintained in [`AGENTS.md`](AGENTS.md),
[`docs/hackaton/`](docs/hackaton/), and the project-scoped context harness in
[`ai-harness/`](ai-harness/) — not to be confused with the vision-pipeline
[`harness/`](harness/) above. Regenerate the shared context with:

```bash
node ai-harness/context-builder.mjs
node ai-harness/verify-context.mjs
```
