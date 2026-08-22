# Atelier audit — 2026-07-24

**Scope:** `work/atelier-professional/` (frontend) + `work/atelier/atelier-engine/` (engine). Every other `atelier-*` tree ignored.

**Live tree confirmed:** `lsof -p $(lsof -tiTCP:3000 -sTCP:LISTEN) | grep cwd` → PID 181 cwd = `…/work/atelier-professional`. `.next` deleted before auditing; the running dev server could not recover from the delete (it began serving a pages-router error fallback), so it was restarted with the documented command and re-verified (app router + `/_next/static/css/app/layout.css` serving, engine live).

**Test status:** engine `188 passed, 3 skipped`; frontend `npm test` → `7 passed`. Engine migrations at head `0024_discovery_runs`.

**Lens:** does the screen advance market evidence → brand data → assortment decision → development → approval → launch → measured outcome?

---

## Headline

The engine already implements most of the collection-development spine. The frontend bypasses it and reimplements a weaker version in `localStorage` and hardcoded constants. Three of the five audit priorities are **wiring problems, not build problems**:

| Priority | Engine has it | Frontend uses it |
|---|---|---|
| Structured collection brief | `GET /brands/{id}/brief` | ✗ `lib/api.js:190` wraps it — **zero callers** |
| Editable financial plan | `POST/GET /brands/{id}/collection-plans` | ✗ plan kept in `localStorage` |
| Immutable-version approvals | `POST /brands/{id}/concepts/{id}/approve` | ✗ approves a mutable boolean |

`GET /brands/{complot}/concepts` → `[]` and `GET …/collection-plans` → `{"items":[]}`: these tables have never been written to.

---

## Findings

### F1 — CRITICAL · Brand selector is desynced from persistence (cross-tenant read/write)

- `lib/config.js:4` — `BRAND = "Complot"`, so `TARGET_BRAND` is `complot`.
- `components/EngineProvider.jsx:44-47` — `setBrand()` writes the selection to `localStorage["atelier-active-brand"]`, and `getLatestResult(preferred)` honours it.
- `lib/api.js:31-39` — `getBrandId()` resolves **only** `TARGET_BRAND`, else `brands[0]`. It never reads the pref.
- `lib/studioStore.js:54` calls `getBrandId()`, so Studio, Range Plan and Review Room all bind to Complot regardless of the selector.

**Verified live.** With the shell on Meridian: Meridian has **0** server collections; the mirror `studioStore.js:59` writes held **Complot's 4 collections with their server `version` numbers** (`Colección 4`, `Pilot`, `Con token`, `Colección nueva`).

Data: **REAL, wrong tenant.** Loop: **actively corrupts it** — an approval or plan edit is recorded against another brand while the UI names yours. This is the one finding that must be fixed before any pilot touches a second brand.

### F2 — HIGH · A hardcoded Complot catalog is presented as "your" data

`lib/catalog.js:18+` holds 36 Complot products. The file is honest about itself (`lib/catalog.js:12-17`: identity fields real as of 2026-07-11, velocity/returns/weeks-on-sale **SAMPLE**). The consumers are not:

- `components/views/BrandDNA.jsx:66-78` — when the engine returns no `priceArchitecture`, it computes tertile bands over Complot's prices, labels them **`· de tu catálogo real`**, and tags them **`source: "engine"`**. False provenance on a brand-data screen.
- `components/views/DesignStudio.jsx:869` — renders "derivadas de tus 36 prendas reales" for whichever brand is loaded.
- `lib/differentiation.js:47-55` — labels these refs `owner: "your catalog"`.
- `lib/whitespace.js:13, 39-42` — Complot-specific category map is the brand side of every gap.

Data: **REAL for Complot, FABRICATED for anyone else.** Loop: breaks the brand-data step.

*Fairly noted:* Opportunities degrades honestly on Meridian (0 huecos + "corré un refresh de Competitors"), because the competitor crawl is empty — the leak is latent there, not visible.

### F3 — HIGH · A heuristic score is persisted into the decision ledger

- `lib/differentiation.js:85-94` — `scoreVariation()` returns `Math.round(100 * (1 - pressure))` from weighted RGB distance + a hand-written texture/fabric similarity table (`:36-44`).
- `components/views/DesignStudio.jsx:483-486` writes that score into the decision record, which is saved locally **and** `postDecision()`-ed to the engine (`:490-497`).
- `components/views/DesignStudio.jsx:357` — `liveTrends` is `undefined` when the engine has no trends; `lib/differentiation.js:61` then falls back to `TRENDS`.
- `lib/signals.js:31-43` — `TRENDS` is fabricated: `score: 94`, `yoy: "+212%"`, `signals: 914`, `resale: "+160%"`, `geo: "Seoul · Paris"`.

No sample flag travels with the persisted number. Data: **ESTIMATED, silently, into an append-only record.** Loop: poisons the measured-outcome step.

### F4 — HIGH · The Opportunities score contradicts the screen's own honesty copy

`lib/whitespace.js:154-158` — `score = depth × openness × local × trendBoost × 100`. Rendered as the headline dial (`components/views/Opportunities.jsx:222-225`).

Verified on screen: the page states *"Sin pronósticos: cada número es un conteo de cosas reales."* The counts are real; the score is not a count. Data: **ESTIMATED presented under a REAL banner.**

### F5 — HIGH · No authenticated identity; approvals attributable to nobody

- `lib/auth.js:10` — `setToken()` is exported and **never called from any UI**. Verified live: `localStorage["atelier-token"]` is `null`, so `engineFetch` sends no `Authorization` header.
- `lib/team.js:5-73` — a fictional six-person roster (`Diseñadora 01`…`Dirección de diseño`); `:79-81` default ids.
- `components/views/Review.jsx:117-119` — `approve()` stamps `approvedBy` from a **self-selected** persona; the button reads "Aprobar como {approver}". Anyone with the browser open is any of them.
- Engine `api/app/main.py:35-42` — a production tenancy gate already enforces auth on `/brands/{id}`, but only when `settings.is_production` (currently `mode: "demo"`). **Flipping to production 401s the entire frontend**, which is exactly what `lib/auth.js:1-3` warns about.

Loop: the approval step has no evidentiary value.

### F6 — HIGH · Approval doesn't reference an immutable version, and approved work isn't locked

- `components/views/Review.jsx:115-121` and `components/views/DesignStudio.jsx:498-503` set `approved: true` on the mutable item. **No `approvedVersionId`** — `item.images` keeps growing after approval, so "approved" points at nothing specific.
- `components/views/DesignStudio.jsx:346` — `patchItem` has **no `approved` guard**; cover and versions remain editable post-approval.
- `lib/team.js:77` — `COMMERCIAL_APPROVERS` is defined and **never imported**. There is one creative approval and no separate merch/technical sign-off.

**The engine already does this correctly:** `api/app/routers/concepts.py:184-206` — `approve_concept()` points `approved_version_id` at an immutable `ConceptVersion` row, records `approved_by` + `approved_at`, and re-approving simply re-points. The frontend stores JSONB blobs in `studio_collections` instead, and `/concepts` is empty.

*Credit where due:* `lib/studioStore.js:77-97` has real optimistic concurrency — a 409 returns the colleague's document rather than overwriting it.

### F7 — HIGH · Range Plan's commercial half never leaves the browser

- `components/views/LinePlan.jsx:6, 13-18` — targets live in `localStorage["atelier-line-plans-v2"]`, while the collection's items go to the engine.
- `components/views/LinePlan.jsx:175` — the chip "● compartido con el equipo" (collection scope) renders directly beside browser-local targets. Misleading.
- `components/views/LinePlan.jsx:185` — `targetMargin` is collected and **never consumed anywhere**. Dead input.
- Missing for a real range plan: cost, units, budget, MOQ, lead time, forecast, sample status, approver. Currency is inconsistent — `$…es-AR` at `:193` vs `AR$` at `:230`, with no currency field.

**Engine already has it:** `api/app/routers/collection_plans.py:150-204` — server-owned plan (`season`, `brief`, `status`, `model_version`) with `CollectionLine` rows carrying `quantity`, `quantity_basis`, `price`, `risk`, `evidence`, and `kind` (`carryover` vs `new_direction`), plus totals that separate `carryover_proven` from `new_directions_unproven`, computed from real sales and stock.

*Credit:* `LinePlan.jsx:27-34` deliberately leaves targets empty rather than defaulting to 62% margin — correct call.

### F8 — MEDIUM · Brief is a market card; the engine's structured brief is dead code

`components/TeamBrief.jsx` is the best-reasoned file in the tree. The brand gate (`:107-127`) is genuinely good: with a brand catalog connected, an off-brand category can **never** be the hero — it abstains (`:454-468`) rather than pitch. Stale-cache labelling (`:281-287`) and the "oferta, no demanda" framing (`:307`, `:338`) are honest.

But it answers *"what is rising in the market"*, not *"what is this collection"*. There is no customer, occasion, gap, analogue set, constraint, contradicting evidence, approver — and no version.

Meanwhile `lib/api.js:190` wraps `GET /brands/{id}/brief` and **nothing calls it**. That endpoint returns real structured data today (verified): `headline` with `estimated_impact_ars: null` plus an `impact_basis` string explaining it is revenue-at-stake and not margin, `decisions[]`, `collection`, and `opportunities[]` with `brand_fit` / `action` / `why` / `signal_basis`.

### F9 — MEDIUM · Nav is five headers over 21 destinations, not five globals + per-collection stages

`lib/nav.js:28-74` — 1 + 10 + 5 + 1 + 4 = **21 destinations**. The 07-24 reorg (`nav.js:20-27`) delivered five *group headers*; it did not collapse destinations, and the ten "Colección" entries are still **global** screens rather than stages of a selected collection.

There is no collection route or context. Each screen independently picks its own active collection — `LinePlan.jsx:67` takes `colls[0]`, `Review.jsx:51-52` takes the first item with a cover. Three screens can sit on three different collections at once.

*Already done, verified:* `nav.js:37` renames "The Brief" → "Market Direction", which is honest about what that screen is.

### F10 — MEDIUM · Two `VIEW_DATA_STATUS` labels overstate the data

- `lib/nav.js:161` — `whitespace: "mixed"`, but its brand side is 100% hardcoded (F2).
- `lib/nav.js:166` — `brand: "mixed"`, but the price-band fallback is tagged `ENGINE` (F2).

**Checked and cleared — do not re-flag:**
- `boards: "live"` is fine. `components/views/Pipeline.jsx:395-398` shows the demo `BOARD` only behind an explicit *"Ver ejemplo de un board completo (muestra)"* toggle; live cards come from engine bets.
- `components/views/Competitors.jsx:121-129` plainly labels its sample block and separates the real dated crawl as *New arrivals*.
- `components/views/Today.jsx` is clean, as the brief said — it renders only engine-owned cases, shows "Impacto económico todavía no calculado" rather than inventing one (`:95`), and refuses to fabricate a tray when the engine is down (`:225-229`).

### F11 — MEDIUM · Fabricated commercial claims attached to real named companies

`lib/data.js` `CMP_BRANDS_DATA` invents specific competitive behaviour for **real businesses** — *"Muaa bajó precios de entrada 12%"*, *"47 Street: Denim share up 18% → 27% in 45 days"*, *"Brandy Melville: 40+ estampas activas"*. The block is honestly labelled as sample, so this is not a data-honesty failure — but publishing invented pricing and assortment moves under real company names is a separate legal/reputational exposure. Use placeholder names in sample data.

### F12 — LOW · Mixed ES/EN inside the professional workspace

`lib/nav.js:37-46` puts English labels under Spanish group headers; the partially-live banner renders in English over Spanish views (verified on screen); `Today.jsx` is fully Spanish.

### F13 — LOW · Unsplash stock photography as trend imagery

`lib/signals.js:3-15` + `:18-29` map garment types to Unsplash URLs. This contradicts the repo's own stated rule — `TeamBrief.jsx:8-10` describes removing exactly this ("a decorative stock signal image"). Only renders when the engine is not live.

---

## What is genuinely strong

- **The market layer is real and substantial.** Verified live: 90,752 observations, 47,804 distinct products, 484 reachable stores across 30+ countries. This is not a mock.
- **`Today.jsx`** — holds the line completely. Empty-and-labelled beats plausible, throughout.
- **`TeamBrief.jsx` brand gate** — abstaining rather than pitching an off-brand category is the single most commercially credible behaviour in the product.
- **`studioStore.js` concurrency** — 409 handling that returns the colleague's document instead of clobbering it.
- **The engine** — 188 tests green, migrations at head, a production tenancy gate already written, and correct domain models for concepts/versions/approval, collection plans, bets and outcomes.

---

## Market research

Treated as unverified per instruction: any Zhiyi / EDITED / WGSN *scale* claims.

**The trend-intelligence category is mature, slow-growing, and consolidating into product/supply-chain owners.**

- **WGSN** — Ascential sold it to Apax Partners in Feb 2024 for **up to £700M**. Subscriptions run **up to ~$25k/yr**. Now ships an AI layer (TrendCurve).
- **EDITED** — folded into **Launchmetrics**, which **Lectra** took majority control of (Jan 2024, ~50.3% for ~$85M; staged to a total of **$200–240M** through 2030). Launchmetrics posted **€45M ARR in 2025, +8.7% YoY** at ~17.5% EBITDA margin.
- **Bamboo Rose** acquired **Backbone PLM** to reach design and development teams directly.
- **Raspberry AI** — the closest positional competitor: **$24M Series A led by a16z** (Jan 2025), ~$28.5M total; customers include Under Armour, MCM Worldwide, Gruppo Teddy, Li & Fung. Positioned exactly as concept → visual prototype acceleration.

**Read:** +8.7% growth on a €45M base is a mature category being absorbed by PLM/supply-chain incumbents who want the *decision*, not the *feed*. Selling another trend dashboard means competing with a £700M asset on content depth. Selling *concept generation* means competing with a16z-funded Raspberry AI on model quality and enterprise logos.

The gap neither side owns is the **traceable line from market evidence → brand-specific decision → development → approval → measured outcome, organised around the collection**. WGSN stops at evidence. Raspberry stops at the image. PLM starts after the decision is made and is famously indifferent to why. That is a real, defensible position — and the audit's most important finding is that **the engine has already built most of it** (`concepts`/`versions`/`approve`, `collection_plans`, `brief`, `decision_cases`, `bets`, `outcomes`). The frontend is the thing standing between this product and its own thesis.

---

## Recommended order

1. **Fix `getBrandId()` to honour the selector pref** (`lib/api.js:31-39`). Near-trivial; stops cross-tenant writes. Blocking for any second brand.
2. **Cut `lib/catalog.js` as a runtime data source.** Drive Studio / BrandDNA / whitespace from the engine's `catalog-mix`; until then, gate those surfaces on the active brand actually being Complot, and delete the `source: "engine"` tag at `BrandDNA.jsx:66-78`.
3. **Wire Studio + Review to `/concepts`** — approve an immutable `version_client_key`, then lock the item (`patchItem` guard). Retire `studio_collections` for concept work.
4. **Wire Range Plan to `/collection-plans`.** Delete `PLAN_KEY`; the engine already models units/price/risk/evidence and separates proven carryover from unproven new directions.
5. **Wire the Brief to `GET /brands/{id}/brief`**, then extend it into a versioned collection brief. Keep `TeamBrief` as the Market Direction card it now honestly claims to be.
6. **Ship a token/login.** The engine gate exists; the frontend has no way to authenticate, so production mode is currently unreachable.
7. **Introduce a collection route** (`#/collection/{id}/{stage}`) so the ten "Colección" destinations become stages of one selected object, and the three screens stop disagreeing about which collection is active.
8. Strip the differentiation score from persisted decisions until it is computed from real fingerprints (or persist it with an explicit `basis: "heuristic"` flag).

Items 1–4 are the difference between a demo and a system a brand can operate a collection through.
