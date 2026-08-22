# Atelier Professional

Independent working clone of Atelier focused on a brand-safe, professional
workflow: honest evidence, reliable saving, traceable decisions, collection
planning, materials, review, and outcomes.

## Run

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

## Hackathon prototype

The QVAC Track 2 prototype lives in [`ba-estaciona-qvac/`](ba-estaciona-qvac/)
and is intentionally isolated from the Atelier frontend. Work on the
`hackaton` branch, not `main`.

```bash
cd ba-estaciona-qvac
npm install
npm test
npm run evaluate:mock
```

Team and AI-agent context is maintained in [`AGENTS.md`](AGENTS.md),
[`docs/hackaton/`](docs/hackaton/), and the project-scoped harness in
[`ai-harness/`](ai-harness/). Regenerate the shared context with:

```bash
node ai-harness/context-builder.mjs
node ai-harness/verify-context.mjs
```
