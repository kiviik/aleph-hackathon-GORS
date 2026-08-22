// Thin client for the Atelier engine API (FastAPI, api/ in atelier-engine).
// Every call is best-effort: any network/HTTP failure resolves to null so the
// app falls back to the bundled demo data without an error state.

import { BRAND } from "./config";
import { engineFetch } from "./auth";
import { matchBrand, readBrandPref } from "./brandPref";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
const TARGET_BRAND = (process.env.NEXT_PUBLIC_ATELIER_BRAND || BRAND || "").toLowerCase();

async function get(path) {
  const res = await engineFetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

// Minimal shape check so a contract drift degrades to demo data instead of a
// blank render mid-demo.
function isValidPayload(data) {
  return (
    data && typeof data.brand === "string" &&
    Array.isArray(data.matches) &&
    data.matches.every((m) => typeof m.trend_name === "string") &&
    data.dna && typeof data.dna === "object"
  );
}

// The ACTIVE brand's id, independent of whether it has a run yet. Studio
// persistence needs this: a brand can own collections before its first engine
// run, so it must not depend on getLatestResult().
//
// Resolution order is the shared one (lib/brandPref.js): the user's selection,
// then the configured pilot brand, then NOTHING. The old `brands[0]` fallback
// silently bound every write to whichever tenant the API listed first — with the
// shell on Meridian, Studio/Range Plan/Review read and wrote Complot. Returning
// null instead lets callers show an honest local scope (ROADMAP §1).
// ⚠ THIS ASKED `/brands`, WHICH EVERY TENANT IS FORBIDDEN (owner bug hunt,
// 2026-08-13). `GET /brands` is `Policy.PLATFORM_ADMIN`, and
// `route_policy.is_platform_admin()` documents its own answer: "⚠ NOBODY IS,
// YET". So in production this 403'd for every signed-in user, the `catch`
// swallowed it, and the whole app quietly decided it had no brand.
//
// What that looked like: correct brand in the topbar and a healthy `/me`,
// while Studio saved "solo en este navegador" into the shared `::brand:none`
// bucket, Range Plan showed the engine's rows beside a panel claiming there
// was no connection, and every market screen reported the run unreadable.
// Demo mode masks it completely, which is why it survived — `/brands` is open
// there, so the failure only exists in the environment nobody develops in.
//
// `getEngineStatus` below was migrated to `/me` for exactly this reason and
// carries the explanation; these two callers were missed. Identity first, and
// the tenant list only as the demo-mode fallback it always was.
export async function getBrandId() {
  try {
    const me = await get("/me").catch(() => null);
    if (me?.brand?.id) return me.brand.id;

    // No identity: demo/pilot, where `/brands` is open. In production this
    // 403s and null is the honest answer — the same one it gave before, but
    // now only when it is actually true.
    const brands = await get("/brands").catch(() => null);
    if (!brands) return null;
    const target = matchBrand(brands, readBrandPref()) || matchBrand(brands, TARGET_BRAND);
    return target?.id || null;
  } catch {
    return null;
  }
}

// Latest completed run across brands: the first brand that has a result.
// Returns { brand, result } or null when the API is down / nothing ran yet.
// ⚠ SAME `/brands` DEFECT AS `getBrandId` ABOVE. In production this returned
// null for every tenant, so `EngineProvider` reported `reason: "run-unreadable"`
// — "the brand claims a result and it could not be loaded" — for brands whose
// run was complete and perfectly readable. The identity path answers first now;
// the list is only consulted when there is no identity to ask about.
export async function getLatestResult(preferred) {
  try {
    const me = await get("/me").catch(() => null);
    if (me?.brand?.id) {
      const mine = await get(`/brands/${me.brand.id}`).catch(() => null);
      if (!mine?.has_result) return null;      // no run is not a failed read
      const result = await get(`/brands/${mine.id}/result`);
      if (!isValidPayload(result?.data)) {
        console.warn("[atelier] engine payload failed shape check — falling back to demo data");
        return null;
      }
      return { brand: mine, result };
    }

    const brands = await get("/brands");
    const completed = brands.filter((b) => b.has_result);
    // Prefer the user-selected brand (the scenario selector), then the
    // configured pilot brand.
    const want = preferred || readBrandPref() || TARGET_BRAND;
    const target = matchBrand(completed, want);
    // A named brand that exists but has no completed run must NOT silently
    // resolve to a different tenant's run — the shell would then show another
    // brand's DNA and trends under the selected name. Report "no run" instead.
    // The newest-completed fallback applies only when nothing was asked for.
    const withResult = target
      || (matchBrand(brands, want) ? null : completed
        .sort((a, b) => new Date(b.latest_job?.finished_at || 0) - new Date(a.latest_job?.finished_at || 0))[0]);
    if (!withResult) return null;
    const result = await get(`/brands/${withResult.id}/result`);
    if (!isValidPayload(result?.data)) {
      console.warn("[atelier] engine payload failed shape check — falling back to demo data");
      return null;
    }
    return { brand: withResult, result };
  } catch {
    return null;
  }
}

export async function createRun(brandId, mode = "offline") {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (res.status === 409) throw new Error("a run is already queued or running");
  if (!res.ok) throw new Error(`run request failed: ${res.status}`);
  return res.json();
}

export async function getRun(runId) {
  return get(`/runs/${runId}`);
}

// Persistent trends with real cross-run lifecycle. [] when unavailable.
export async function getTrendHistory(brandId) {
  try {
    const rows = await get(`/brands/${brandId}/trends`);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// Engine health + brands, for the Integrations status card. Never throws.
//
// ⚠ THE BUILD WAS FETCHED AND THROWN AWAY (owner review 2026-08-11, P2).
// `/healthz` has carried the commit the running process actually loaded since
// the stale-server fix — the whole point of which was that a server could not
// say it was stale — and this function awaited that payload only to discard it.
// So the app still could not tell anyone it was talking to an old API build,
// which is the exact failure the endpoint was added to make impossible.
//
// ⚠ AND THEN IT MADE THE WHOLE APP FALL BACK TO DEMO DATA IN PRODUCTION
// (second owner security review, 2026-08-12). `GET /brands` lists every tenant,
// so it became platform-admin-only — and nobody holds platform-admin, so it
// 403s. This function caught that, reported `healthy: false`, and
// `EngineProvider` did the one thing it reserves for a dead engine: served
// synthetic data. A correctly-authenticated user would have seen an app full of
// invented numbers, with the engine perfectly healthy behind it.
//
// Startup does not need the tenant LIST; it needs THIS caller's brand. `/me` is
// public and answers exactly that, so the sequence is now health -> identity ->
// that one brand. The all-tenant list stays admin-only, which was the point.
// ⚠ AND `/healthz` IS LIVENESS, NOT READINESS (owner review, 2026-08-14). The
// engine defines it as "the process is up" with no dependencies — deliberately,
// because that is what a liveness probe is for. So Postgres could be down or
// the migrations behind head and this function still reported `healthy: true`,
// after which every screen asked for data the engine could not serve and got
// errors it read as emptiness.
//
// `/readyz` is the question this app actually has: it checks the database AND
// whether the applied migration matches the code, and returns 503 when not.
// Three states, because they need three different answers on screen:
//
//   unavailable — nothing responds. Demo data is the honest fallback.
//   alive       — the process answers, the database or migrations do not. NOT a
//                 licence for demo data: this brand's real data exists and is
//                 temporarily unreachable, and inventing numbers over the top of
//                 it is the worst available answer.
//   ready       — serve normally.
export async function getEngineStatus() {
  try {
    const health = await get("/healthz");

    // ⚠ ONLY A 503 MEANS NOT READY. The engine documents 503 as its
    // not-ready answer; anything else — a 404 from a build that predates the
    // endpoint, a proxy swallowing it — is an absence of information, and
    // treating absence as failure would declare healthy engines broken. (My
    // first version did exactly that and turned 13 green tests red, because
    // their stubs answer 404 for anything they do not model.)
    let ready = true;
    let readiness = null;
    const rr = await engineFetch(`${API_BASE}/readyz`, { cache: "no-store" })
      .catch(() => null);
    if (rr && rr.status === 503) {
      ready = false;
      readiness = await rr.json().catch(() => null);
    } else if (rr?.ok) {
      readiness = await rr.json().catch(() => null);
    }

    // Who am I? Answers `{authenticated:false, brand:null}` when nobody is
    // signed in, which is a real answer rather than a failure.
    const me = await get("/me").catch(() => null);
    const brandId = me?.brand?.id || null;

    let brands = [];
    if (brandId) {
      const mine = await get(`/brands/${brandId}`).catch(() => null);
      brands = mine ? [mine] : [me.brand];
    } else {
      // Demo/pilot: no identity, and `/brands` is open in demo mode. In
      // production this 403s and we simply have no brand list — which is
      // correct, not a health problem, so it must not flip `healthy`.
      brands = await get("/brands").catch(() => []);
    }

    return { healthy: true, ready, readiness, brands,
             build: health?.build || null, mode: health?.mode || null };
  } catch {
    // Nothing answered at all.
    return { healthy: false, ready: false, readiness: null,
             brands: [], build: null, mode: null };
  }
}

// ---- Weekly plan (sales/stock CSV in, five actions out) ----

export async function getPlan(brandId) {
  try { return await get(`/brands/${brandId}/plan`); } catch { return null; }
}

export async function getSalesSummary(brandId) {
  try { return await get(`/brands/${brandId}/sales/summary`); } catch { return null; }
}

// Throws with the server's mapping/warnings detail so the uploader can see
// HOW their columns were (mis)read — a silent failure here costs us the brand.
export async function uploadSalesCsv(brandId, kind, content, filename) {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/sales/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, content, filename: filename || null }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail?.warnings?.[0] || `upload failed: ${res.status}`);
  return body;
}

// ---- Taste loop (proposals feed decisions) ----

// Returns the SERVER's row — the stored verdict, which may be a downgrade of
// what was asked for. Callers must use it rather than their own request
// (2026-07-24): the gates live on the server precisely so the browser does not
// get to decide the outcome.
export async function postDecision(brandId, { candidateKey, decision, reason, candidate, idempotencyKey, recommendationId, reasonCode, verdict, supersedesId }) {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidate_key: candidateKey, decision, reason: reason || null, candidate,
      // When present the server judges on its OWN frozen evidence and ignores
      // `candidate` entirely — that is the whole point of the boundary.
      recommendation_id: recommendationId || null,
      // The reason envelope (A17.2). The server derives dimension and
      // learning scope from the CODE — the client never states what may be
      // learned, it only names why the person decided.
      primary_reason_code: reasonCode || null,
      verdict: verdict || null,
      // Append-only correction: this row REPLACES the named one in every
      // learner's eyes while both stay readable in the ledger.
      supersedes_id: supersedesId || null,
      // per-ACTION key: a network retry reuses it and the server returns the
      // original row (DB-unique) — concurrency-safe, unlike read-then-insert
      idempotency_key: idempotencyKey || null,
    }),
  });
  if (!res.ok) {
    // A 409 `recommendation_stale` is not a transport failure — the cited
    // evidence expired, was revoked, or was minted from a crawl row that has
    // since been replaced (engine migration 0030). Retrying replays a verdict
    // nobody stands behind any more, so the error carries enough for the outbox
    // to stop retrying and ask for a fresh decision instead.
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    const err = new Error(detail?.detail || detail?.error ||
                          `decision save failed: ${res.status}`);
    err.status = res.status;
    err.stale = res.status === 409 && detail?.error === "recommendation_stale";
    throw err;
  }
  return res.json();
}

// Never throws: the feed still works read-only when the API is down.
export async function getDecisions(brandId) {
  try {
    return await get(`/brands/${brandId}/decisions`);
  } catch {
    return [];
  }
}

// ---- Product bets (the permanent spine: proposal -> ... -> learning) ----

// Never throws: the Pipeline falls back to its local cache when the API is
// down (and says so), rather than erroring.
export async function getBets(brandId, { includeLegacy = false } = {}) {
  try {
    const body = await get(`/brands/${brandId}/bets${includeLegacy ? "?include_legacy=true" : ""}`);
    return Array.isArray(body?.items) ? body.items : null;
  } catch {
    return null;
  }
}

// How many bets the engine is holding back as pre-policy. The board would
// otherwise just look empty, and "nothing here" and "24 decisions the current
// gates would refuse to make" are very different statements (owner audit).
export async function countLegacyBets(brandId) {
  try {
    const body = await get(`/brands/${brandId}/bets?include_legacy=true`);
    const items = Array.isArray(body?.items) ? body.items : [];
    return items.filter((b) => b.legacy).length;
  } catch {
    return 0;
  }
}

// Distinct products in the live sales feed — the launch picker's source, so
// the bet↔sales link is chosen from REAL keys, never typed from memory.
export async function getSalesProducts(brandId) {
  try {
    const body = await get(`/brands/${brandId}/sales/products`);
    return Array.isArray(body?.items) ? body.items : [];
  } catch {
    return [];
  }
}

export async function postBetEvent(brandId, betId, kind, payload = {}) {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/bets/${betId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  if (!res.ok) throw new Error(`event save failed: ${res.status}`);
  return res.json();
}

// Mint a server-judged recommendation: the engine computes adoption, brand fit
// and freshness from ITS data and freezes them under an immutable id. Returns
// null if unavailable, so the caller can fall back to the legacy path and say so.
export async function mintRecommendation(brandId, { candidateKey, title, category }) {
  if (!brandId || !candidateKey) return null;
  try {
    const res = await engineFetch(`${API_BASE}/brands/${brandId}/recommendations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate_key: candidateKey, title: title || null,
                             category: category || null }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// What the engine WOULD say about a batch of candidates — one request for a
// whole feed, storing nothing. Until this existed the engine's verdict only
// appeared AFTER the click, so a card could invite an accept the server was
// always going to refuse (owner audit 2026-07-24: "the server-calculated stance
// should appear on the card before the user clicks").
//
// Returns a Map keyed by candidate_key, empty when unavailable — the cards then
// show the local reading alone, which is what they did before.
export async function previewStances(brandId, candidates) {
  const list = (candidates || []).filter((c) => c?.candidateKey).slice(0, 60);
  if (!brandId || !list.length) return new Map();
  try {
    const res = await engineFetch(`${API_BASE}/brands/${brandId}/recommendations/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidates: list.map((c) => ({
        candidate_key: c.candidateKey, title: c.title || null, category: c.category || null })) }),
    });
    if (!res.ok) return new Map();
    const body = await res.json();
    return new Map((body?.items || []).map((r) => [r.candidate_key, r]));
  } catch {
    return new Map();
  }
}

// ---- Identity (who is signed in, and who is on the team) ----
// The engine has had users + hashed bearer tokens + a tenancy gate since
// 2026-07-21; nothing here ever called it, so the UI fell back to six fictional
// personas in lib/team.js that anyone could select from (2026-07-24 audit).

// Never throws on absence: pilot mode has no token and must keep working. A
// 401 means the token is bad, which IS worth surfacing.
export async function getMe() {
  try {
    const res = await engineFetch(`${API_BASE}/me`, { cache: "no-store" });
    if (res.status === 401) return { authenticated: false, invalidToken: true };
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getBrandUsers(brandId) {
  if (!brandId) return [];
  try {
    return await get(`/brands/${brandId}/users`);
  } catch {
    return [];
  }
}

// ---- The brand's OWN catalog (brand evidence) ----
// Added 2026-07-24: every "your catalog" surface used to read a 36-product
// Complot list hardcoded in lib/catalog.js. This is the per-brand answer, from
// the same ingested snapshot /catalog-mix reads. A brand with nothing ingested
// gets total_products: 0 and a reason — never another brand's catalog.
export async function getBrandCatalog(brandId, limit = 500) {
  if (!brandId) return null;
  try {
    return await get(`/brands/${brandId}/catalog?limit=${limit}`);
  } catch {
    return null;
  }
}

export function engineAssetUrl(value) {
  if (!value || /^(?:https?:|data:|blob:)/i.test(value)) return value || null;
  return `${API_BASE}${value.startsWith("/") ? "" : "/"}${value}`;
}

// ---- Morning brief (one aggregated call for the Hoy screen) ----

export async function getBrief(brandId) {
  try {
    return await get(`/brands/${brandId}/brief`);
  } catch {
    return null;
  }
}

// ---- Decision cases (the general action entity the Today screen reads) ----

export async function getDecisionCases(brandId) {
  try {
    const body = await get(`/brands/${brandId}/decision-cases`);
    return Array.isArray(body?.items) ? body.items : [];
  } catch {
    return [];
  }
}

export async function postCaseEvent(brandId, caseId, kind, payload = {}) {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/decision-cases/${caseId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  if (!res.ok) throw new Error(`case event failed: ${res.status}`);
  return res.json();
}

// Trigger a synchronous forecast run: forecasts stocked products, mints
// reorder decision cases. Returns {forecasted, reorder_cases_created}.
export async function runForecast(brandId) {
  try {
    const res = await engineFetch(`${API_BASE}/brands/${brandId}/forecast-runs`, { method: "POST" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// ---- Automatic outcomes (the ledger grades itself against sales) ----

// READ-ONLY. A read must not cause a write — grading is a separate, explicit
// operation (gradeOutcomes), ideally a background worker/sales-ingest event. The
// UI reads grading status here; it does not grade by loading the page.
export async function getOutcomes(brandId) {
  try {
    return await get(`/brands/${brandId}/outcomes`);
  } catch {
    return null;
  }
}

// Explicit grade trigger. Returns {ok} so the caller can SURFACE failure instead
// of the old silent catch. Idempotent server-side when nothing changed.
export async function gradeOutcomes(brandId) {
  try {
    const res = await engineFetch(`${API_BASE}/brands/${brandId}/outcomes/grade`, { method: "POST" });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function getSimilarDecisions(brandId, text) {
  try {
    const body = await get(`/brands/${brandId}/outcomes/similar?text=${encodeURIComponent(text)}`);
    return Array.isArray(body?.items) ? body.items : [];
  } catch {
    return [];
  }
}

// ---- Competitor new arrivals (real, DNA-scored) ----

// Returns an array on success (possibly empty = genuine zero), or NULL when the
// request failed — so callers can tell "no arrivals" from "couldn't ask" and
// never render an outage as an empty-market conclusion.
export async function getCompetitorItems(brandId) {
  try {
    const r = await get(`/brands/${brandId}/competitors`);
    return Array.isArray(r) ? r : [];
  } catch {
    return null;
  }
}

export async function refreshCompetitors(brandId) {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/competitors/refresh`, { method: "POST" });
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  return res.json();
}

// ---- Studio covers: the renders a collection has ALREADY produced ----------
//
// The portfolio was showing "sin dirección visual" over collections that had
// concept renders sitting in the engine. That was not honesty, it was a search
// that only looked in one drawer: a collection's own approved concept render is
// the most literal picture of what it IS, and it is the collection's own work —
// nothing is borrowed, matched or guessed here.
//
// Returns { [collectionId]: [{ url, title }] }, newest board order preserved.
export async function getStudioCovers(brandId) {
  if (!brandId) return {};
  try {
    const rows = await get(`/brands/${brandId}/studio/collections`);
    const out = {};
    for (const row of rows || []) {
      const covers = (row.items || [])
        .filter((it) => it.cover)
        .map((it) => ({ url: engineAssetUrl(it.cover), title: it.name || "" }));
      if (covers.length) out[row.id] = covers;
    }
    return out;
  } catch {
    return {};
  }
}

// ---- What a collection LOOKS like -----------------------------------------
//
// One call per collection instead of concepts → versions → image three deep.
// The engine picks the APPROVED version wherever a concept has one, so a card
// never shows an unapproved garment beside an approved tick, and it omits
// concepts with no render rather than substituting another garment.
export async function getConceptCovers(brandId, collectionId, limit = 6) {
  if (!brandId || !collectionId) return null;
  try {
    return await get(`/brands/${brandId}/collections/${collectionId}/concept-covers?limit=${limit}`);
  } catch {
    return null;
  }
}

// --- the registry (engine 0048) --------------------------------------------
// Which providers Atelier can integrate with, and which of them THIS brand
// uses, are rows in the engine's `integration_catalog` / `brand_integrations`.
// They used to be the `INTG` array in lib/data.js — a hardcoded list of five
// logos on the screen a pilot brand sees first.
//
// Three states have to stay distinguishable here, because collapsing any two
// of them is how a roadmap starts reading as a product:
//   · adapter_installed  — this deployment can actually speak that protocol
//   · enabled            — the provider is switched on platform-wide
//   · enabled_for_brand  — THIS brand says it uses it
// A brand may enable something with no adapter; that is a declaration of what
// it runs, not a claim that we can read it, and the engine returns a warning
// saying exactly that.
export async function getBrandIntegrations(brandId) {
  if (!brandId) return null;
  try {
    const data = await get(`/registry/brands/${brandId}/integrations`);
    return Array.isArray(data?.integrations) ? data : null;
  } catch {
    return null;   // engine down: the screen says so, it does not invent cards
  }
}

export async function setBrandIntegration(brandId, integrationId, body) {
  const res = await engineFetch(
    `${API_BASE}/registry/brands/${brandId}/integrations/${encodeURIComponent(integrationId)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || `${res.status} al guardar la integración`);
  }
  return res.json();
}

// ---- Catalogue gaps, computed and evidenced by the ENGINE -------------------
//
// Owner review, 2026-08-10 and again 2026-08-11: the live Oportunidades screen
// ranked "Sweaters" with socks and a tee as its evidence, "Faldas" with two
// tops, "Jeans" with a short and a skirt — and the verdict was that the screen
// "turns bad classification into confident product advice".
//
// The cause was a THIRD category rule table, `lib/whitespace.js`, running in
// the browser: 12 buckets against the engine's 15, and **no underwear rule at
// all**, so a knitted sock tagged `knit` matched `Sweaters` with nothing ranked
// earlier to catch it.
//
// The 08-10 pass added a gate — compute locally, then ask the engine whether
// each category name was coherent. It narrowed the hole and could not close it,
// because the engine judged the rows IT selected (`product_type ILIKE`, 9 rows)
// while the card drew the ones the BROWSER selected (327 items through its own
// rules). Two different sets, so a verdict about one certified nothing about
// the other. That gate is gone; this replaces it.
//
// ⚠ THERE IS NO LOCAL FALLBACK, AND THAT IS THE DESIGN. Every other view
// degrades to something; here degrading means rendering unvetted product advice,
// which is the whole defect. No engine, no cards — the screen says it could not
// ask. Returns NULL on failure so the caller can tell "no gaps" (a real answer
// about a well-covered range) from "could not ask".
export async function getOpportunities(brandId) {
  if (!brandId) return null;
  try {
    return await get(`/brands/${brandId}/opportunities`);
  } catch {
    return null;
  }
}

// ---- May this collection be generated into? Asked BEFORE the run ------------
//
// Owner review 2026-08-11: Studio offered "Explorar 12 conceptos" over a
// collection with no approved brief, no range rows and a Direction holding
// 0 silhouettes / 0 fabrics / 0 colours / 0 usable references.
//
// ⚠ THE ENGINE ALREADY REFUSED THIS — and refused it too late. `POST /concepts`
// has called `require_approved_brief` since 2026-08-10, so the run was always
// going to fail at the end, after twelve images had been generated and paid
// for. A gate whose only expression is a 409 on the last step is a receipt.
//
// Two answers that must not be collapsed: `can_generate` (always true —
// sketching before anything is decided is the work) and `can_attach`. Null on
// failure, and the caller then says "could not check" rather than either
// silently blocking or silently promising.
export async function getGenerationReadiness(brandId, collectionId) {
  if (!brandId || !collectionId) return null;
  try {
    return await get(`/brands/${brandId}/collections/${collectionId}/generation-readiness`);
  } catch {
    return null;
  }
}

// ⚠ NOT THE SAME QUESTION as getGenerationReadiness above, and conflating them
// is a trap the engine sets: that one asks whether this COLLECTION is grounded
// enough to attach a concept, and it hardcodes `can_generate: true` on purpose.
// It never consults the provider chain, so it answers "yes, generate" on a box
// holding no image key at all.
//
// This one asks the other half: is a provider CONFIGURED, which model would
// serve, does it take references, what does an image cost. Both are needed
// before the studio offers a paid button, and neither substitutes for the
// other. Null on failure so the caller says "no pude comprobarlo" rather than
// inventing either answer.
export async function getStudioReadiness() {
  try {
    return await get("/studio/readiness");
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- //
// Tech packs — the desk the release contract has always required
// --------------------------------------------------------------------------- //
// ⚠ THE PACK ID IS AUTHORITATIVE, NOT A STYLE. `slot.style_id` is never
// written by any endpoint, so a Style relationship would be fiction today.
// The chain that DOES exist and is enough for this screen:
//     range slot → POST /tech-packs {slot_id} → pack_id → verify → release
// (owner, 2026-08-14, correcting an earlier sequencing of mine that made the
// desk wait on the Style workspace. It does not have to.)
//
// These seven wrappers call the SEVEN ROUTES THE SCREEN USES — the acceptance
// for §13 must drive these, not fixtures that reproduce them.

// Throws with the engine's own error body when it refuses, because the refusal
// IS the product behaviour here: a blocked release must name what is missing.
async function techPackWrite(path, { method = "POST", body } = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.detail?.error || data?.detail || `${res.status}`);
    err.status = res.status;
    err.payload = data?.detail ?? data;   // release refusals name their fields here
    throw err;
  }
  return data;
}

export async function getTechPacks(brandId) {
  if (!brandId) return null;
  try {
    const d = await get(`/brands/${brandId}/tech-packs`);
    return Array.isArray(d?.tech_packs) ? d.tech_packs : [];
  } catch {
    // null = could not ask. NOT [] — an unreachable engine must never render
    // as "this brand has no tech packs", which is the defect class this
    // codebase has now fixed on four separate screens.
    return null;
  }
}

export async function getTechPack(brandId, packId) {
  if (!brandId || !packId) return null;
  try {
    return await get(`/brands/${brandId}/tech-packs/${packId}`);
  } catch {
    return null;
  }
}

// ---- The Style record (design/atelier-redesign/03-product-tech-pack) -------
// Every one of these returns `null` when the request could not be MADE and
// `[]` when it was made and answered with nothing. `lib/styleRecord.mjs`
// renders those as different sentences; collapsing them is how "sin filas"
// ends up sitting on top of a 500.

// ⚠ `items`, not `styles`. Every shape below was READ OFF THE RUNNING ENGINE
// rather than guessed — I guessed `styles` first and the screen rendered
// "esta marca todavía no tiene estilos" over a brand that had one, which is
// precisely the false-empty this module exists to prevent.
export async function getStyles(brandId) {
  if (!brandId) return null;
  try {
    const d = await get(`/brands/${brandId}/styles`);
    return Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
  } catch {
    return null;
  }
}

// ⚠ THIS IS THE WHOLE HIERARCHY, not a row: the router's own docstring says
// "the whole hierarchy for one style, sizes in wearing order", so the response
// carries `colourways` (with their SKUs) and `plan_reconciliation` nested.
// There is NO GET for colourways — `/styles/{id}/colourways` is POST-only and
// answers 405 — so a separate fetch would be an endpoint that does not exist.
export async function getStyle(brandId, styleId) {
  if (!brandId || !styleId) return null;
  try {
    return await get(`/brands/${brandId}/styles/${styleId}`);
  } catch {
    return null;
  }
}

// The cross-season comparison. A20.5 split this into two indexed reads because
// the OR shape was discarding 7,996 rows to return 4.
export async function getStyleQuotes(brandId, styleId) {
  if (!brandId || !styleId) return null;
  try {
    const d = await get(`/brands/${brandId}/styles/${styleId}/quotes`);
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

// The visual lineage: 0075's parent_asset_id chain and 0080's exploratory vs
// production_directed intent. This is what makes a Style a product record
// rather than a row — it is where an exploratory image became the thing being
// made, and it is the one tab the reference has that nothing else shows.
export async function getStyleAssets(brandId, styleId) {
  if (!brandId || !styleId) return null;
  try {
    const d = await get(`/brands/${brandId}/assets?style_id=${styleId}`);
    return Array.isArray(d?.assets) ? d.assets
         : Array.isArray(d?.items) ? d.items
         : Array.isArray(d) ? d : [];
  } catch {
    return null;
  }
}

// Construction (engine 0082): technical drawings + anchored callouts. A
// callout POINTS at a pack field — `resolved` on each callout is the ENGINE's
// read-time answer against the style's latest pack (null = no pack to check
// against), and this client renders it, never derives it.
export async function getStyleDrawings(brandId, styleId) {
  if (!brandId || !styleId) return null;
  try {
    const d = await get(`/brands/${brandId}/styles/${styleId}/drawings`);
    return Array.isArray(d?.drawings) ? d.drawings : [];
  } catch {
    return null;
  }
}

// 0091 — what each MEASUREMENT anchor on a drawing resolves to, for one size.
// ⚠ The value is NOT on the callout and must not be: the anchor holds a name
// and a position, and the number comes from the style's measurement block at
// read time, with its tolerance. A re-graded chart moves every drawing that
// cites it and nobody edits a drawing to correct a size.
export async function getDrawingMeasurements(brandId, drawingId, size) {
  if (!brandId || !drawingId) return null;
  try {
    const q = size ? `?size=${encodeURIComponent(size)}` : "";
    return await get(`/brands/${brandId}/drawings/${drawingId}/measurements${q}`);
  } catch {
    return null;
  }
}

export const addStyleDrawing = (brandId, styleId, body) =>
  techPackWrite(`/brands/${brandId}/styles/${styleId}/drawings`, { body });

export const deleteStyleDrawing = (brandId, drawingId) =>
  techPackWrite(`/brands/${brandId}/drawings/${drawingId}`, { method: "DELETE" });

export const addDrawingCallout = (brandId, drawingId, body) =>
  techPackWrite(`/brands/${brandId}/drawings/${drawingId}/callouts`, { body });

export const patchDrawingCallout = (brandId, calloutId, body) =>
  techPackWrite(`/brands/${brandId}/callouts/${calloutId}`,
    { method: "PATCH", body });

export const deleteDrawingCallout = (brandId, calloutId) =>
  techPackWrite(`/brands/${brandId}/callouts/${calloutId}`,
    { method: "DELETE" });

// Bill of materials (engine 0083). The read returns the lines WITH the
// roll-up, because a BOM without its cost is half an answer and a cost
// without its lines is unauditable. Prices are read THROUGH each line's
// material link — this client never computes a total.
export async function getStyleBom(brandId, styleId) {
  if (!brandId || !styleId) return null;
  try {
    return await get(`/brands/${brandId}/styles/${styleId}/bom`);
  } catch {
    return null;
  }
}

export const addBomLine = (brandId, styleId, body) =>
  techPackWrite(`/brands/${brandId}/styles/${styleId}/bom`, { body });

// The first transition (engine 0085): the fabrics this collection's Dirección
// picked, offered against THIS garment.
//
// ⚠ THIS ONE DOES NOT SWALLOW ITS ERRORS, unlike the reads above. The engine
// answers four different refusals here — the style is in no collection, the
// collection has no direction, the direction has no version, the pick belongs
// to somebody else — and every one of them is a sentence a designer needs to
// read. Returning null for all four would collapse them into "no candidates",
// which reads as "she picked nothing" and is the one thing that is not true.
export async function getBomCandidates(brandId, styleId) {
  if (!brandId || !styleId) return null;
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/styles/${styleId}/bom/candidates`,
    { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (res.ok) return { ok: true, ...data };
  return {
    ok: false,
    status: res.status,
    // The engine's own words. Anything written here would be a second, worse
    // copy of a sentence that already exists.
    message: typeof data?.detail === "string" ? data.detail
      : data?.detail?.message || `el motor respondió ${res.status}`,
  };
}

// Turn a pick into a line. The material travels; the component, the unit and
// the consumption are the designer's to state, so they are sent from the form
// and NOT defaulted here — a guessed consumption would give the BOM a total
// that nobody measured.
export const addBomLineFromDirection = (brandId, styleId, body) =>
  techPackWrite(`/brands/${brandId}/styles/${styleId}/bom/from-direction`,
    { body });

export const patchBomLine = (brandId, lineId, body) =>
  techPackWrite(`/brands/${brandId}/bom-lines/${lineId}`,
    { method: "PATCH", body });

export const deleteBomLine = (brandId, lineId) =>
  techPackWrite(`/brands/${brandId}/bom-lines/${lineId}`, { method: "DELETE" });

// The third transition (engine 0087): open the tech-pack version that answers
// this round's corrections.
//
// ⚠ IT RESOLVES NOTHING, and the client must not imply otherwise. The comments
// keep `resolved_in_round_id: null` — a document promising a fix is not a
// garment that has one, and only a LATER ROUND can say the garment is right
// (0084). The response carries the engine's own sentence saying so.
export const openSampleRevision = (brandId, roundId, body) =>
  techPackWrite(`/brands/${brandId}/samples/${roundId}/open-revision`,
    { body: body || {} });

// Why a pack version exists: the observations it was opened to answer, each
// saying whether a later round has since resolved it.
export async function getPackCorrections(brandId, packId) {
  if (!brandId || !packId) return null;
  try {
    return await get(`/brands/${brandId}/tech-packs/${packId}/corrections`);
  } catch {
    return null;
  }
}

// The second transition (engine 0086): which colourways a range position
// plans, and what approval evidence stands behind each one's image.
export async function getSlotColourways(brandId, slotId) {
  if (!brandId || !slotId) return null;
  try {
    return await get(`/brands/${brandId}/slots/${slotId}/colourways`);
  } catch {
    // null = could not ask. The three empty ARRAYS inside a successful answer
    // are a different fact and must not be manufactured here.
    return null;
  }
}

// ⚠ `expectedRevision` is the plan aggregate's write clock, not a nicety: two
// merchandisers planning colours on different slots of the same version both
// match on version_number, and without this the second silently wins.
export const planSlotColourway = (brandId, slotId, colourwayId, expectedRevision) =>
  techPackWrite(
    `/brands/${brandId}/slots/${slotId}/colourways`
      + (expectedRevision == null ? "" : `?expected_revision=${expectedRevision}`),
    { body: { colourway_id: colourwayId } });

export const unplanSlotColourway = (brandId, slotId, colourwayId, expectedRevision) =>
  techPackWrite(
    `/brands/${brandId}/slots/${slotId}/colourways/${colourwayId}`
      + (expectedRevision == null ? "" : `?expected_revision=${expectedRevision}`),
    { method: "DELETE" });

// The sample loop (engine 0084). The read returns every round WITH the two
// derived answers — `carried_over` (raised and not yet resolved) and
// `changed_since_previous` — because both are computed per request and would
// be wrong the moment they were cached here.
export async function getStyleSamples(brandId, styleId) {
  if (!brandId || !styleId) return null;
  try {
    return await get(`/brands/${brandId}/styles/${styleId}/samples`);
  } catch {
    return null;
  }
}

export const requestSampleRound = (brandId, styleId, body) =>
  techPackWrite(`/brands/${brandId}/styles/${styleId}/samples`, { body });

export const receiveSampleRound = (brandId, roundId, body = {}) =>
  techPackWrite(`/brands/${brandId}/samples/${roundId}/receive`, { body });

export const decideSampleRound = (brandId, roundId, body) =>
  techPackWrite(`/brands/${brandId}/samples/${roundId}/verdict`, { body });

export const addSamplePhoto = (brandId, roundId, body) =>
  techPackWrite(`/brands/${brandId}/samples/${roundId}/photos`, { body });

export const addFitComment = (brandId, roundId, body) =>
  techPackWrite(`/brands/${brandId}/samples/${roundId}/comments`, { body });

export const resolveFitComment = (brandId, commentId, body) =>
  techPackWrite(`/brands/${brandId}/fit-comments/${commentId}/resolve`, { body });

// 0077 put the block id ON the pack, so a POM chart can name the standard it
// was cut from. A chart that cannot name its block is one a factory has to
// take on faith.
export async function getMeasurementBlock(brandId, blockId) {
  if (!brandId || !blockId) return null;
  try {
    return await get(`/brands/${brandId}/measurement-blocks/${blockId}`);
  } catch {
    return null;
  }
}

export const createTechPack = (brandId, slotId) =>
  techPackWrite(`/brands/${brandId}/tech-packs`, { body: { slot_id: slotId } });

// ⚠ Only `human_verified` and `supplier_confirmed` are writable over HTTP —
// the router 422s `imported` and `calculated` on purpose, so a human cannot
// launder a machine value into a verified one by re-posting it.
export const setTechPackField = (brandId, packId, key, { value, provenance, note }) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/fields/${encodeURIComponent(key)}`,
    { method: "PUT", body: { value, provenance, note: note || null } });

// Re-read the sources a DRAFT was assembled from. Assembly runs once at
// creation, so a pack made before its measurement block existed had no POM
// fields and no way to gain them. Nothing a human attested is touched — the
// response reports `kept_verified` so the screen can say so.
export const refreshTechPack = (brandId, packId) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/refresh`);

export const proposeTechPack = (brandId, packId) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/propose`);

export const releaseTechPack = (brandId, packId, note) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/release`, { body: { note: note || null } });

export const reviseTechPack = (brandId, packId) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/revise`);

export async function getMeasurementBlocks(brandId) {
  if (!brandId) return null;
  try {
    const d = await get(`/brands/${brandId}/measurement-blocks`);
    return Array.isArray(d?.measurement_blocks) ? d.measurement_blocks : [];
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- //
// Suppliers — engine suppliers.py, shipped with ZERO frontend callers
// --------------------------------------------------------------------------- //
// The directory is entered; the performance is NOT. `GET …/performance` is
// derived from the critical-path milestones the team already records, and
// below three attributed deliveries the engine returns `on_time_pct: null`
// with a `why_none` sentence — which the screen renders verbatim instead of
// a number (lib/suppliers.mjs keeps that refusal intact).

export async function getSuppliers(brandId) {
  if (!brandId) return null;
  try {
    const d = await get(`/brands/${brandId}/suppliers`);
    return Array.isArray(d?.items) ? d.items : [];
  } catch {
    // null = could not ask. NOT [] — an unreachable engine must never render
    // as "this brand has no suppliers".
    return null;
  }
}

// Throws with the engine's own sentence (409 names the duplicate) so the form
// can show the refusal rather than swallowing it.
export const createSupplier = (brandId, body) =>
  techPackWrite(`/brands/${brandId}/suppliers`, { body });

export async function getSupplierPerformance(brandId, supplierId) {
  if (!brandId || !supplierId) return null;
  try {
    return await get(`/brands/${brandId}/suppliers/${supplierId}/performance`);
  } catch {
    return null;
  }
}

// ---- Tech-pack delivery loop (engine 0079) --------------------------------
// ⚠ THE ENGINE SENDS NOTHING. There is no mailer. `send` RECORDS a delivery
// the user already made, `acknowledge` records a RELAYED CLAIM ("me
// confirmaron por WhatsApp" — suppliers have no login), `notice` records that
// a holder was told a newer version exists. All three are append-only events;
// everything the screen shows is derived by `GET …/recipients` each time.

export async function getTechPackRecipients(brandId, packId) {
  if (!brandId || !packId) return null;
  try {
    return await get(`/brands/${brandId}/tech-packs/${packId}/recipients`);
  } catch {
    return null;
  }
}

const deliveryBody = ({ supplierId, channel, note }) => ({
  body: { supplier_id: supplierId, channel: channel || null, note: note || null },
});

export const recordTechPackSend = (brandId, packId, args) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/send`, deliveryBody(args));

export const recordTechPackAcknowledgement = (brandId, packId, args) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/acknowledge`, deliveryBody(args));

export const recordTechPackNotice = (brandId, packId, args) =>
  techPackWrite(`/brands/${brandId}/tech-packs/${packId}/notice`, deliveryBody(args));

// --------------------------------------------------------------------------- //
// Ruta crítica — engine milestones.py + critical_path.py, ZERO callers until now
// --------------------------------------------------------------------------- //
// ⚠ THE PATH IS COLLECTION-SCOPED, not brand-scoped. Every route here reads
// `/brands/{brand}/collections/{collection}/…`; there is no brand-wide calendar
// endpoint, because a critical path belongs to one drop.
//
// ⚠ AND THE UPDATE IS A `PUT`, NOT A `PATCH`. It is a keyed upsert over the
// COLLECTION-scoped row (`style_id IS NULL`) and it returns the WHOLE
// re-projected calendar, not the row it wrote — deliberately: entering a proto
// date is interesting because of what it does to ex-factory, and a caller that
// got back one row would have to re-fetch to find out.
//
// The body is read with `exclude_unset`, so an omitted field is untouched and a
// field sent as `null` is cleared. `lib/criticalPath.mjs` builds it.

export async function getCriticalPath(brandId, collectionId) {
  if (!brandId || !collectionId) return null;
  try {
    return await get(`/brands/${brandId}/collections/${collectionId}/critical-path`);
  } catch {
    // null = could not ask. NOT an empty calendar — "esta colección no tiene
    // hitos" is a real, different answer the engine gives in its own words.
    return null;
  }
}

// Creates the twelve standard milestones WITH NO DATES, on purpose: a team gets
// the rows to fill in, not twelve deadlines nobody agreed to. Safe to run twice
// — existing rows are left alone and reported in `already_present`.
export const seedCriticalPath = (brandId, collectionId) =>
  techPackWrite(`/brands/${brandId}/collections/${collectionId}/critical-path/seed`);

// Throws with the engine's own sentence (404 names the milestone, 404 on a
// supplier says it does not exist for this brand) so the screen can show the
// refusal rather than swallow it.
export const putMilestone = (brandId, collectionId, key, body) =>
  techPackWrite(
    `/brands/${brandId}/collections/${collectionId}/milestones/${encodeURIComponent(key)}`,
    { method: "PUT", body });
