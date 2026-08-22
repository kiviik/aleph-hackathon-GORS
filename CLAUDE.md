# Atelier — frontend (canonical)

Brand-conditioned product-development platform. This repo is the **only** frontend.
Its engine is a sibling repo: `../atelier/atelier-engine` (FastAPI + Postgres).

**Run `./verify.sh` before trusting anything below.** It proves which tree is
live, whether both services are up, and that both suites pass. A doc can go
stale; the script cannot.

## The one mistake that keeps happening

A previous audit spent its whole run reviewing `atelier-next/` — a tree that no
longer exists. Every `atelier-*` directory other than this one and
`../atelier/atelier-engine` was deleted on 2026-07-24. **Any document citing
`atelier-next/...` is stale.** Confirm the live tree yourself:

```bash
lsof -p $(lsof -tiTCP:3000 -sTCP:LISTEN) | grep cwd
```

## Gotchas that have actually cost time

- **Never `rm -rf .next` while `next dev` is running.** The server does not
  recover — it starts serving a pages-router error fallback with no CSS, which
  looks like an app bug. Stop the server, delete, restart.
- **Concurrent sessions share these trees.** Commit *scoped* (`git add <files>`),
  never `git add -A` at the repo root, and never switch branches. Two sessions
  have already collided on an Alembic revision number.
- **The engine suite is order-dependent** under `pytest-randomly` (~4/207 fail on
  random ordering; passes with `-p no:randomly`). Tests share a database. Any
  "N passed" is seed-dependent.
- **Two things are deliberately empty, not broken:** a brand with no ingested
  catalog, and a brand with no engine run. Both render labelled empty states.
  Do not "fix" them by adding fallback data — that was the bug.

## The rule this codebase is built on

Nothing fake reaches a user-facing surface. Empty-and-labelled beats plausible.
If a number cannot be computed from real data, the UI says so — `Today.jsx` and
`TeamBrief.jsx` are the reference implementations. Before adding any number, ask
what happens when the data is missing.

Brand-scoped state: every localStorage key holding one brand's work goes through
`lib/brandStore.js`. Unlisted keys are scoped **by default**.
`tests/brandSwitch.test.mjs` enforces both that rule and the effect-dependency
rule that a brand switch depends on.

## Where the real documentation is, in reading order

1. `../atelier/atelier-engine/ROADMAP.md` — **the governing plan.** Status table,
   numbered acceptance criteria (A0.1…A12.x), schemas, delivery order. Update the
   status table in the same commit as the work.
2. `../atelier/atelier-engine/HANDOFF.md` — current state and gotchas.
3. `../atelier/atelier-engine/DECISIONS.md` — every decision, with the why.
   Append here the same day you decide something.
4. `AUDIT-2026-07-24-frontend.md` — the last full audit of this repo.

## Commands

```bash
pnpm dev            # http://localhost:3000  (engine must be on :8000)
npm test            # node --test over pure modules
npx next lint       # must stay at 0 errors
```
