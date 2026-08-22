// The collection's creative direction — server-owned (engine migration 0046,
// ROADMAP §3b).
//
// What a designer picks for a collection: colours, silhouettes, fabrics, price
// bands, inspiration, must-include/must-avoid. Until this existed, the fabric
// and inspiration halves lived in `localStorage` — so a designer's choices were
// invisible to their colleagues, to the engine, and to any generation. That was
// a live §12 violation and this module is what closes it.
//
// Like `collectionBrief.js`, and for the same reason: NO local mirror. A
// direction is one of the objects §12 says may never be authoritative in a
// browser. An unreachable engine makes the screen read-only and say so; it does
// not invent a draft that will later disagree with the server.
//
// The pure rules — what a fabric pick means, how a palette reads — live in
// `direction.mjs` so they can be unit-tested without a network.

import { engineFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export * from "./direction.mjs";

async function call(path, { method = "GET", body } = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    method,
    cache: "no-store",
    ...(body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) {
    // The engine's refusals ARE the product here — "this fabric's minimum is 500
    // and the range plans 30" is the answer, not a failure to report. Surface it
    // verbatim rather than collapsing it into "something went wrong".
    let detail = `el motor respondió ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail?.message) detail = j.detail.message;
      else if (j.detail) detail = JSON.stringify(j.detail);
    } catch {
      /* non-JSON error body — keep the status line */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? true : res.json();
}

// --------------------------------------------------------------------------- //
// the direction and its versions
// --------------------------------------------------------------------------- //

/** Everything a screen needs in one read: versions, the working version's picks
 *  with each fabric's sourceability, the reconciliation against the range plan,
 *  and what is still missing. Returns `{exists: false}` for a collection that
 *  has no direction yet — "there is none" said plainly. */
export const getDirection = (brandId, collectionId) =>
  call(`/brands/${brandId}/collections/${collectionId}/direction`);

export const openDirection = (brandId, collectionId, content = {}) =>
  call(`/brands/${brandId}/collections/${collectionId}/direction`,
       { method: "POST", body: content });

/** Mint the next version. The engine deep-copies the current picks, so this is
 *  "open a revision", not "start over". */
export const nextVersion = (brandId, directionId, content = {}) =>
  call(`/brands/${brandId}/directions/${directionId}/versions`,
       { method: "POST", body: content });

export const editVersion = (brandId, versionId, content) =>
  call(`/brands/${brandId}/direction-versions/${versionId}`,
       { method: "PATCH", body: content });

export const submitVersion = (brandId, versionId) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/submit`,
       { method: "POST", body: {} });

export const approveVersion = (brandId, versionId, comment = null) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/approve`,
       { method: "POST", body: { comment } });

export const requestChanges = (brandId, versionId, comment = null) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/request-changes`,
       { method: "POST", body: { comment } });

// --------------------------------------------------------------------------- //
// the picks
// --------------------------------------------------------------------------- //

export const addColour = (brandId, versionId, colour) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/colours`,
       { method: "POST", body: colour });

export const addSilhouette = (brandId, versionId, silhouette) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/silhouettes`,
       { method: "POST", body: silhouette });

/** Pick a fabric from the brand's own material sheet. `materialId` is a real
 *  row id, never a name — which is why the response carries the supplier, MOQ,
 *  lead time and a sourceability verdict. */
export const addFabric = (brandId, versionId, { materialId, intendedCategories = [],
                                                substitutionAllowed = false,
                                                substitutionNote = null,
                                                note = null } = {}) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/fabrics`, {
    method: "POST",
    body: {
      material_id: materialId,
      intended_categories: intendedCategories,
      substitution_allowed: substitutionAllowed,
      substitution_note: substitutionNote,
      note,
    },
  });

export const addPriceBand = (brandId, versionId, band) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/price-bands`,
       { method: "POST", body: band });

export const addRule = (brandId, versionId, rule) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/rules`,
       { method: "POST", body: rule });

/**
 * Upload or link a reference.
 *
 * `purpose` and `rights` are REQUIRED with no client-side default, deliberately
 * mirroring the engine. A default purpose would be a guess about what the
 * designer meant and a default rights value a claim about provenance nobody
 * made — and the engine refuses both twice over (payload pattern + CHECK
 * constraint), so inventing one here would only produce a confusing 422.
 */
export const addReference = (brandId, versionId, reference) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/references`,
       { method: "POST", body: reference });

export const removeItem = (brandId, versionId, group, itemId) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/${group}/${itemId}`,
       { method: "DELETE" });

/** Check a garment or generated concept against this direction's rules. */
export const checkAgainstRules = (brandId, versionId, subject) =>
  call(`/brands/${brandId}/direction-versions/${versionId}/check`,
       { method: "POST", body: { subject } });

// --------------------------------------------------------------------------- //
// the brand's material sheet — the only source of fabric picks
// --------------------------------------------------------------------------- //

/**
 * The brand's own materials, as imported through the Import Centre.
 *
 * This is the ONLY place a fabric pick can come from. `Materials.jsx` used to
 * keep its own list in localStorage, which meant two fabric stores that could
 * not agree; a second store beside `brand_materials` is explicitly forbidden by
 * §3b.
 */
export const listMaterials = (brandId) => call(`/brands/${brandId}/materials`);

/**
 * Add ONE fabric by hand.
 *
 * The Import Centre remains the path for a whole sheet, and stays the default.
 * This exists so removing the browser-local fabric library is not a lost
 * feature: a designer adding a single fabric mid-collection is a real need, and
 * the alternative was a second material store that could disagree with
 * `brand_materials`.
 *
 * The row lands with `provenance: "team-entered"` — a typed row and a file
 * somebody confirmed a mapping for are different kinds of fact.
 */
export const createMaterial = (brandId, material) =>
  call(`/brands/${brandId}/materials`, { method: "POST", body: material });

/** Read a data URI out of a File for a reference upload. */
export async function fileToDataUri(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const type = file.type && /^image\/(png|jpeg|webp)$/.test(file.type)
    ? file.type : "image/png";
  return `data:${type};base64,${btoa(binary)}`;
}
