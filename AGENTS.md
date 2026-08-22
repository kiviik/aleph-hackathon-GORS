# Repository context for AI coding agents

This repository contains two related but separate surfaces:

- `app/`, `components/`, and `lib/` are the existing Atelier Professional
  frontend. Do not change it while working on the hackathon prototype unless
  the task explicitly requires a shared integration.
- `ba-estaciona-qvac/` is the self-contained BA Estaciona prototype for the
  QVAC Track 2 hackathon submission. Its own `README.md`, `package.json`, test
  suite, and local JSON fixtures are the source of truth for that prototype.
- `proposals/` contains non-runtime pilot and institutional material.
- `docs/hackaton/` contains the current product context, architecture, plan,
  evaluation protocol, and submission checklist.
- `ai-harness/` contains the project-scoped AI context harness adapted from
  `G4sp4rCS/hard-allow`. It is a context and handoff system, not a permission
  bypass or a global agent-control plane.

## Working rules

1. Work on the `hackaton` branch for the QVAC prototype. Keep `main` and the
   existing Atelier branches untouched.
2. Read `ai-harness/context/CONTEXT.md` and `docs/hackaton/01-plan.md` before
   changing the prototype.
3. Preserve unrelated user changes. Stage named files instead of using
   `git add -A` at the repository root.
4. Treat all parking rules in `ba-estaciona-qvac/data/` as synthetic demo data.
   They are not GCBA legal advice and must never be presented as authoritative.
5. All QVAC inference must run locally. Do not add cloud model fallbacks,
   API keys, government camera access, face recognition, or license-plate
   recognition to the hackathon prototype.
6. Do not commit recordings, faces, readable license plates, model caches,
   reports containing sensitive data, credentials, or tokens.
7. A model suggestion is evidence, not authority. Keep the deterministic
   validation, refusal paths, trace, and tests intact when improving prompts.

## Commands

```bash
# Frontend (existing Atelier surface)
pnpm test
pnpm build

# Hackathon prototype
cd ba-estaciona-qvac
npm install
npm test
npm run evaluate:mock
```

Regenerate the team context after changing the docs:

```bash
node ai-harness/context-builder.mjs
node ai-harness/verify-context.mjs
```

## Reporting format for agent handoffs

Every handoff should state: files changed, commands run, tests/build evidence,
the local target boundary, any remaining limitation, and whether cleanup is
complete. Never include secret values in the handoff.
