// The collection brief — server-owned, versioned, approvable.
//
// 2026-07-24: "the brief" used to be a small object the browser serialized into
// localStorage before navigating to Studio (`atelier-design-brief`). Nothing
// recorded which brief governed a concept, what evidence argued for it, who
// approved it, or what it said before someone edited it.
//
// The engine now owns it (migration 0031). This module is the client, and it
// deliberately does NOT keep a local mirror: a brief is one of the objects
// ROADMAP §12 says may never be authoritative in a browser. If the engine is
// unreachable the screen says so — it does not invent a draft that will later
// disagree with the server.
//
// TeamBrief (the Market Direction card) stays exactly what it honestly is: a
// market-discovery surface whose brand gate abstains rather than pitching
// off-brand. This is the separate object it hands off TO.

import { engineFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function call(path, { method = "GET", body } = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    method,
    cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" },
                 body: JSON.stringify(body) } : {}),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    // The engine's refusals carry the reason (409 with what is missing). Surface
    // it verbatim rather than a generic failure — the reason IS the product here.
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch { /* non-JSON error body */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? true : res.json();
}

export const getBrief = (brandId, collectionId) =>
  call(`/brands/${brandId}/collections/${collectionId}/brief`);

// The brief Atelier can already write from the brand's own records.
//
// Owner review, 2026-08-10: the engine grew `/brief/proposal` — season and
// dates from the running plan, markets and channels from the last APPROVED
// brief, margin from the margin actually ACHIEVED, newness and carryover from
// the last range's real mix, constraints from suppliers' declared MOQs — and
// the frontend never called it, so a new collection still opened fifteen empty
// fields saying "Escribilo acá". The claimed reversal, "Atelier answers first",
// was absent from the only place it counts.
//
// ⚠ Returns null rather than throwing. A proposal is an ASSIST: if the engine
// cannot offer one, the composer must still open. Nothing here writes — the
// designer edits and posts through the same create/version/approve path.
export async function getBriefProposal(brandId, collectionId) {
  try {
    return await call(`/brands/${brandId}/collections/${collectionId}/brief/proposal`);
  } catch {
    return null;
  }
}

export const createBrief = (brandId, collectionId, content) =>
  call(`/brands/${brandId}/collections/${collectionId}/brief`,
       { method: "POST", body: content });

export const getVersion = (brandId, versionId) =>
  call(`/brands/${brandId}/brief-versions/${versionId}`);

export const newVersion = (brandId, briefId, content) =>
  call(`/brands/${brandId}/briefs/${briefId}/versions`,
       { method: "POST", body: content });

export const editVersion = (brandId, versionId, content) =>
  call(`/brands/${brandId}/brief-versions/${versionId}`,
       { method: "PATCH", body: content });

export const submitVersion = (brandId, versionId) =>
  call(`/brands/${brandId}/brief-versions/${versionId}/submit`, { method: "POST" });

export const approveVersion = (brandId, versionId, comment) =>
  call(`/brands/${brandId}/brief-versions/${versionId}/approve`,
       { method: "POST", body: { comment: comment || null } });

export const requestChanges = (brandId, versionId, comment) =>
  call(`/brands/${brandId}/brief-versions/${versionId}/request-changes`,
       { method: "POST", body: { comment: comment || null } });

// Ask the SERVER to copy the evidence's CONTENT before citing it. An id names
// a subject and preserves nothing, so a link without a snapshot is only
// "pinned" in name — and the engine now refuses to approve a brief that carries
// one (2026-07-24 review, P1).
export const createSnapshot = (brandId, subject) =>
  call(`/brands/${brandId}/evidence-snapshots`, { method: "POST", body: subject });

export const addEvidence = (brandId, versionId, link) =>
  call(`/brands/${brandId}/brief-versions/${versionId}/evidence`,
       { method: "POST", body: link });

// The pure rules live in collectionBrief.mjs, dependency-free so they are
// unit-testable without a DOM or a network. Re-exported here so callers have
// one import.
export { CONTENT_FIELDS, toForm, toBody, actions } from "@/lib/collectionBrief.mjs";
