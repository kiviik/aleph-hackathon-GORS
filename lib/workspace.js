// The collection workspace projection — one read for the whole stage rail.
//
// Before this, a screen wanting to know "what stage is this collection in"
// fetched briefs, plans, concepts and launches separately and formed its own
// opinion. Five round-trips and five chances to disagree with each other.
//
// Readiness is derived by the ENGINE from the same rows the stages read, so it
// cannot go stale: approving a brief changes what the rail says about Range
// without anything being written anywhere.
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export async function getWorkspace(brandId, collectionId) {
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/collections/${collectionId}/workspace`,
    { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`workspace ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
