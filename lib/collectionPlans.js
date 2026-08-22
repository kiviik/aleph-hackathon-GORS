// Range Plan persistence — the brand's commercial targets and the engine's
// assembled line plan.
//
// 2026-07-24 audit: the plan's targets (season, drop, market, channel, target
// styles / colourways / newness % / margin %) lived in localStorage under
// "atelier-line-plans-v2" while the screen showed a "compartido con el equipo"
// chip — that chip described the COLLECTION's scope, not the plan's. Meanwhile
// the engine had collection_plans + 3 endpoints and the frontend called none of
// them (ROADMAP §4).
//
// The engine assembles the LINES itself from real sales and stock: carryover
// lines proven by their own sales, new directions carrying a labelled test band
// and never a forecast a net-new product cannot have. This client exposes both
// halves; the caller decides what to show.
import { engineFetch } from "@/lib/auth";
import { resolvePlan } from "@/lib/planResolution.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function req(path, options = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    // Carry the engine's own detail. Several distinct 409s share this path —
    // a duplicate slot code, an immutable version, a stale revision — and a
    // caller that cannot tell them apart has to guess which one to explain.
    let detail = null;
    try { detail = (await res.json()).detail; } catch { /* non-JSON body */ }
    const err = new Error(typeof detail === "string" ? detail : `engine ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

// The engine's name for "you decided against a plan that has since changed".
export const isStale = (e) => e?.detail?.error === "revision_conflict";

export const listPlans = (brandId) => req(`/brands/${brandId}/collection-plans`);

export const getPlan = (brandId, planId) =>
  req(`/brands/${brandId}/collection-plans/${planId}`);

export const createPlan = (brandId, { season, brief, collectionId, targets = {}, newDirections = [] }) =>
  req(`/brands/${brandId}/collection-plans`, {
    method: "POST",
    body: JSON.stringify({ season, brief: brief || null, targets,
                           // Without this a plan floats free of the collection it
                           // plans (engine migration 0028 added the FK; nothing
                           // was sending it), so "the plan for this collection"
                           // stayed unanswerable.
                           collection_id: collectionId || null,
                           new_directions: newDirections }),
  });

// Attach a plan to a collection. One-way: 409 if it already belongs to another,
// because re-pointing would move a season's numbers to a different collection.
export const setPlanCollection = (brandId, planId, collectionId) =>
  req(`/brands/${brandId}/collection-plans/${planId}/collection`, {
    method: "PUT",
    body: JSON.stringify({ collection_id: collectionId }),
  });

// Replace the plan's targets. 409 means the plan is approved and must be
// reopened rather than edited in place (A4.5) — the caller surfaces that
// instead of pretending the edit landed.
export const setTargets = (brandId, planId, targets) =>
  req(`/brands/${brandId}/collection-plans/${planId}/targets`, {
    method: "PUT",
    body: JSON.stringify({ targets }),
  });

// The plan for a (collection, season), created on first use. Returns null with
// no brand — the caller then works locally and must SAY so.
//
// Season alone was ambiguous: two collections in the same season shared one
// plan, and the first one to load claimed it. Matching on the collection FIRST
// keeps them separate, while still adopting a pre-0028 plan that has no
// collection yet rather than orphaning it.
//
// THE RACE (owner audit 2026-07-24, third pass): list-then-claim is not atomic,
// and the loser's `catch` used to return the WINNER'S plan — one collection
// silently loading another's season numbers, with an edit path attached. The
// policy now lives in lib/planResolution.mjs, where a test can control what the
// second caller sees; engine migration 0030 adds the unique index that makes
// the conflict real rather than a convention this file politely honours.
export async function planForSeason(brandId, season, targets = {}, collectionId = null) {
  try {
    return await resolvePlan({ brandId, season, targets, collectionId }, {
      list: listPlans, get: getPlan, create: createPlan, attach: setPlanCollection,
    });
  } catch {
    return null;
  }
}

// ---- Assortment slots: the per-style commercial rows (engine 0032) ---------
//
// The plan's TARGETS are top-down (above). These are the bottom-up rows the
// targets are supposed to reconcile against: price, cost, units, MOQ, lead
// time. Until 0032 they lived in the studio collection's JSON and the browser,
// so the screen could count styles and average a price but could not answer
// whether the collection makes money or can be delivered.
//
// Every financial number here comes back COMPUTED by the engine. Nothing in
// this file re-derives a total, a margin or an open-to-buy: a second
// implementation in React is a second answer, and the one the buyer commits
// cash against has to be the server's.

// Open the next version as a draft. Copies the approved version's slots forward,
// so a revision starts from what was approved rather than an empty grid.
export const createPlanVersion = (brandId, planId, body = {}) =>
  req(`/brands/${brandId}/plans/${planId}/versions`, {
    method: "POST", body: JSON.stringify(body),
  });

// The version WITH its slots, server-computed totals, and the blockers and
// warnings standing between it and an approval.
export const getPlanVersion = (brandId, versionId) =>
  req(`/brands/${brandId}/plan-versions/${versionId}`);

// A plan's versions, plus which one is OPEN (editable) and which one GOVERNS.
// They are often different — a draft revision does not supersede what was
// approved — so the caller is told both rather than inferring from a 409.
export const listPlanVersions = (brandId, planId) =>
  req(`/brands/${brandId}/plans/${planId}/versions`);

// THE PRECONDITION EVERY WRITE BELOW CARRIES (engine 0036).
//
// `version.revision` is the plan aggregate's write clock: it moves whenever
// ANYTHING under the version moves — a slot added, a cell edited, a row
// deleted, a submit, an approval. Sending it as `If-Match` is what makes the
// engine refuse a write decided against a plan that has since changed.
//
// It replaces `version_number` for this purpose, which only moved when a whole
// version did. Two merchandisers editing two different rows of version 3 both
// matched on it, both writes landed, and neither was told — so the plan each of
// them approved was a plan neither had read. The number a buyer commits cash
// against cannot be reached that way.
//
// A write sent WITHOUT the header still succeeds. That is deliberate on the
// engine side and it is not a safe default; every caller here sends one.
const ifMatch = (revision) =>
  (revision == null ? {} : { "If-Match": `"${revision}"` });

export const addSlot = (brandId, versionId, slot, revision) =>
  req(`/brands/${brandId}/plan-versions/${versionId}/slots`, {
    method: "POST", body: JSON.stringify(slot), headers: ifMatch(revision),
  });

// A TRUE partial update: send ONLY the changed fields. Resending the whole row
// is how two quick edits race — the second request carries the first's stale
// values and silently reverses it (2026-07-24 review, P1).
//
// The response carries the recomputed totals, readiness AND the plan's new
// revision, so the client stays server-authoritative without refetching and the
// next cell edit cites the state this one produced.
export const patchSlot = (brandId, slotId, patch, revision) =>
  req(`/brands/${brandId}/slots/${slotId}`, {
    method: "PATCH", body: JSON.stringify(patch), headers: ifMatch(revision),
  });

// Throws on refusal like every other write here. It used to hand back the raw
// response, so a 409 read as success and the row stayed on screen looking
// deleted — the most destructive write was the one that reported failure least.
export const deleteSlot = async (brandId, slotId, revision) => {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/slots/${slotId}`,
                                { method: "DELETE", headers: ifMatch(revision) });
  if (!res.ok) {
    let detail = null;
    try { detail = (await res.json()).detail; } catch { /* non-JSON body */ }
    const err = new Error(typeof detail === "string" ? detail : `engine ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return null;
};

export const submitPlanVersion = (brandId, versionId, revision) =>
  req(`/brands/${brandId}/plan-versions/${versionId}/submit`,
      { method: "POST", headers: ifMatch(revision) });

// 409 carries {error, blockers, warnings} — the reason IS the product here, so
// the caller surfaces it verbatim rather than a generic failure.
export async function approvePlanVersion(brandId, versionId, revision) {
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/plan-versions/${versionId}/approve`,
    { method: "POST",
      // The precondition matters most here. The blockers on screen were
      // computed against the plan as the approver read it; a row added since
      // could have moved the open-to-buy they are about to sign off.
      headers: { "content-type": "application/json", ...ifMatch(revision) } });
  if (!res.ok) {
    let detail = null;
    try { detail = (await res.json()).detail; } catch { /* non-JSON */ }
    const err = new Error(typeof detail === "string" ? detail : "plan_not_approvable");
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}
