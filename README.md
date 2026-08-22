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

The current demo target is iOS. The mobile app lives in [`mobile/`](mobile/)
and includes the map, an embedded Street View tab, and device-local favorites.
Install Expo Go, then run `cd mobile && npm install && npx expo start` and scan
the QR code. Use `npx expo start --tunnel` when the phone cannot reach the
computer over Wi-Fi.

For the landing, set `NEXT_PUBLIC_MOBILE_DOWNLOAD_URL` in Vercel to the Expo
Go link or to the published demo deep link. The primary target is iOS; the
Electron shell remains available as a local fallback but is not the public
experience.

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
[`docs/hackaton/`](docs/hackaton/), and the project-scoped harness in
[`ai-harness/`](ai-harness/). Regenerate the shared context with:

```bash
node ai-harness/context-builder.mjs
node ai-harness/verify-context.mjs
```
