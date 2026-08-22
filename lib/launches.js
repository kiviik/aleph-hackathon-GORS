// Launches — the stage where a decision becomes something that can be measured.
//
// Approved is not launched. A concept can be approved and never made, a plan
// approved and cut; until something reaches a channel on a date there is no
// outcome, and attributing sales to an approval is how a decision ledger turns
// into a story (engine migration 0033).
//
// The engine enforces the invariants — the concept version must be the APPROVED
// one, the slot must belong to an approved plan, the SKU must join the brand's
// own sales keys. This client's job is to carry the refusals back intact,
// because WHY a launch was refused is the useful part.
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function call(path, { method = "GET", body } = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    method,
    cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" },
                 body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail;
    } catch { /* non-JSON body */ }
    const err = new Error(
      typeof detail === "string" ? detail : (detail?.message || "error"));
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

export const listLaunches = (brandId) => call(`/brands/${brandId}/launches`);

export const getLaunch = (brandId, launchId) =>
  call(`/brands/${brandId}/launches/${launchId}`);

export const createLaunch = (brandId, launch) =>
  call(`/brands/${brandId}/launches`, { method: "POST", body: launch });

// Throws with `detail.error === "sku_not_in_sales_data"` when the SKU joins to
// nothing. That is not a validation nicety: a launch whose SKU matches no sales
// row can never be graded, so the team is told now rather than at grading time.
export const addLaunchProduct = (brandId, launchId, product) =>
  call(`/brands/${brandId}/launches/${launchId}/products`,
       { method: "POST", body: product });

// Results, starting from what LAUNCHED rather than from loosely related bets.
// Returns three distinct states — measured / no_sales_yet / not_measurable —
// because a product nobody can measure and a product that sold nothing are
// completely different facts, and "0" would collapse them.
export const getLaunchResults = (brandId, collectionId) =>
  call(`/brands/${brandId}/launch-results`
       + (collectionId ? `?collection_id=${collectionId}` : ""));

// The whole chain behind a launched SKU: the approved image, the slot and plan
// that authorized the spend, the brief that governed it, and the evidence it
// was argued from. One call, because a team asking six months later should not
// need to know the schema.
export const getLineage = (brandId, productId) =>
  call(`/brands/${brandId}/launch-products/${productId}/lineage`);
