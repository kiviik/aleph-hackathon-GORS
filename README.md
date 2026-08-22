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
