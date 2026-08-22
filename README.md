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
