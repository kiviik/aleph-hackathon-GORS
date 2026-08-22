# Codex audit brief — the audit LENS

> **Orientation now lives in `CLAUDE.md`** (auto-loaded, and it travels with the
> repo) and in `./verify.sh`, which proves the live tree instead of asserting it.
> This file is kept for the one thing it does best: the lens to audit against.

## The ONLY directories that matter (audit THESE)

- **Frontend (canonical, runs on :3000):**
  `/Users/vicky/Documents/Codex/2026-06-29/here-s-the-practical-way-to/work/atelier-professional`
- **Engine (FastAPI + Postgres, runs on :8000):**
  `/Users/vicky/Documents/Codex/2026-06-29/here-s-the-practical-way-to/work/atelier/atelier-engine`

## IGNORE these — deprecated duplicates (do NOT audit or cite them)

- `…/work/atelier-next/`                       ← OLD frontend (this is what a prior audit wrongly cited)
- `…/work/atelier-next/atelier-professional/`  ← stale nested copy
- `…/work/atelier-science-v2/`, `…/work/atelier_outer/`, `…/work/atelier-v10_2.html`

> Why this matters: a prior audit cited `atelier-next/components/views/Today.jsx` (308 lines, invented
> commercial numbers). The CANONICAL app's `atelier-professional/components/views/Today.jsx` (273 lines)
> is a DIFFERENT, already-fixed file. Always confirm the path is under `atelier-professional/` before
> flagging anything. To be 100% sure which tree is live: `lsof -p $(lsof -tiTCP:3000 -sTCP:LISTEN) | grep cwd`.

## How to run it (to audit the live app, not just code)

```bash
# engine (already may be running)
cd /Users/vicky/Documents/Codex/2026-06-29/here-s-the-practical-way-to/work/atelier/atelier-engine
.venv/bin/uvicorn api.app.main:app --port 8000 --reload
# frontend
cd /Users/vicky/Documents/Codex/2026-06-29/here-s-the-practical-way-to/work/atelier-professional
rm -rf .next   # avoid stale-bundle audits
NEXT_PUBLIC_ATELIER_API=http://127.0.0.1:8000 pnpm dev   # → http://localhost:3000/#/today
```
Engine health: `curl :8000/healthz` · `curl :8000/readyz`. Tests: `.venv/bin/python -m pytest tests/ api/tests/ -q`.

## What to audit (goal: is it safe + coherent for a brand to operate a COLLECTION through?)

Audit against ONE lens: **the collection-development loop** — market evidence → internal brand data →
assortment decision → development → approval → launch → measured outcome. Judge every screen by whether
it advances that loop or is a disconnected destination.

For EACH finding, report: `file:line` (must be under `atelier-professional/`), what it does, whether it
is REAL / ESTIMATED / SAMPLE / STALE, and whether it advances the collection loop. Do NOT re-flag things
already fixed on canonical — verify first.

Priority checks (some may ALREADY be addressed on canonical — confirm, don't assume):
1. **Fabricated numbers on operational screens.** Grep the canonical tree for any user-facing confidence
   %, margin, financial impact, budget, owner, growth/peak/saturation that is computed from rules rather
   than real data. (Note: canonical `Today.jsx` already refuses these — verify it holds; check every OTHER
   view: Brief, Line Plan, Catalog, Opportunities, Results.)
2. **Nav = features not work.** Canonical `lib/nav.js` exposes ~20 destinations. Assess collapsing to
   5 globals (Today · Collections · Market · Results · Data&Admin) with per-collection stages
   (Brief · Range · Concepts · Development · Review · Launch · Results).
3. **Brief = market-discovery card, not a collection brief.** `components/TeamBrief.jsx` picks a rising
   category (it now brand-gates the hero — verify). It is NOT yet a structured, versioned collection brief
   (customer/occasion/gap/analogues/constraints/contradicting-evidence/approvers). Flag the gap.
4. **Line Plan is a thin wrapper, not an editable financial plan.** `components/views/LinePlan.jsx` —
   assess against a real range plan (editable rows: style/colorway, cost/retail/margin, units/budget,
   material/MOQ/lead-time, sample status, owner/approver, forecast+confidence, risk).
5. **Studio approvals.** `lib/studioStore.js` is the strongest area (server persistence, optimistic
   concurrency, provenance). Check: approval references an IMMUTABLE version id, approved versions are
   LOCKED, separate creative/merch/technical approval, authenticated identity (not default personas).
6. **Honesty states + language.** Every number labeled real/estimated/unavailable/stale; no sample-catalog
   data or mixed ES/EN inside the professional workspace.

## Strategic conclusion to test (not assume)
The moat is owning the traceable loop from market evidence → brand-specific decision → creative
development → validation → measured outcome — organized around the COLLECTION as the primary object —
NOT another trend dashboard. Grade how far the canonical app is from that, screen by screen.

## Do NOT
- Cite or "fix" files outside `atelier-professional/` (or the engine).
- Audit a stale `.next` build (delete it first).
- Re-flag `Today.jsx` invented numbers without confirming they're actually present on canonical.
- Treat vendor scale claims (Zhiyi/EDITED/WGSN) as verified facts.
