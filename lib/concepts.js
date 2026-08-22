// Server-owned concepts + append-only versions — the auditable record beside
// the mutable studio_collections JSONB that Studio edits live.
//
// 2026-07-24 audit: approval used to be `approved: true` on the item JSON. It
// referenced no particular version, so `item.images` could keep growing after
// approval and "approved" pointed at nothing in particular; nothing was locked;
// and the whole record lived in a blob that any later edit rewrote. The engine
// already had the right shape (api/app/routers/concepts.py) and the frontend
// had zero callers.
//
// Approval now means: this EXACT immutable version row was approved, by this
// person, at this time — acknowledged by the server before the UI says so.
//
// Idempotency: the frontend's own ids are the client_keys, so every call here
// can be retried safely (an upsert returns the existing row, an appended
// version returns the original rather than a mutated copy).
import { engineFetch } from "@/lib/auth";
import { conceptRecord } from "@/lib/conceptRegistry.mjs";
import { coverVersion, DESIGN_FIELDS, shouldIngestImage, touchesDesign } from "@/lib/conceptLock";

// Re-exported so components import one module; the rules themselves live in
// conceptLock.mjs, dependency-free, so they can be unit-tested.
export { coverVersion, DESIGN_FIELDS, touchesDesign };

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function req(path, options = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    err.body = await res.json().catch(() => null);
    throw err;
  }
  return res.json();
}

// `?collection_id=` is the query that was impossible before migration 0028,
// when the link between a concept and its collection was a NAME. The review
// room needs it: reviewing "the brand's concepts" instead of "this
// collection's" is how Review and Line Plan ended up on different collections.
export const listConcepts = (brandId, collectionId = null) =>
  req(`/brands/${brandId}/concepts`
      + (collectionId ? `?collection_id=${encodeURIComponent(collectionId)}` : ""));

// The image lives on the version, and is asked for one version at a time so
// lists stay light — the same split the engine makes.
export const versionImage = (brandId, conceptId, versionId) =>
  req(`/brands/${brandId}/concepts/${conceptId}/versions/${versionId}/image`);

export const upsertConcept = (brandId, body) =>
  req(`/brands/${brandId}/concepts`, { method: "POST", body: JSON.stringify(body) });

export const listVersions = (brandId, conceptId) =>
  req(`/brands/${brandId}/concepts/${conceptId}/versions`);

export const appendVersion = (brandId, conceptId, body) =>
  req(`/brands/${brandId}/concepts/${conceptId}/versions`, {
    method: "POST", body: JSON.stringify(body),
  });

// The ledger door for pixels the browser holds (engine 0073). Idempotent by
// client_key; the engine marks the provider line as the CLIENT'S CLAIM.
/** Tell the ledger which concept version an ENGINE-MADE asset became.
 *
 *  Filling a null link is a discovery; the engine refuses to overwrite a
 *  different one with a 409, because repointing an asset would re-attribute an
 *  image somebody already looked at.
 */
export const attachAsset = (brandId, assetId, body) =>
  req(`/brands/${brandId}/assets/${assetId}/attach`, {
    method: "POST", body: JSON.stringify(body),
  });

export const ingestAsset = (brandId, body) =>
  req(`/brands/${brandId}/assets/ingest`, {
    method: "POST", body: JSON.stringify(body),
  });

export const approveVersion = (brandId, conceptId, body) =>
  req(`/brands/${brandId}/concepts/${conceptId}/approve`, {
    method: "POST", body: JSON.stringify(body),
  });

// Push the concept + the exact version, then approve that version. Returns the
// server's record. Throws if the engine will not acknowledge it — the caller
// must NOT show "approved" on a failure, which is the whole point of moving
// approval off the client.
export async function approveConceptVersion(brandId, { coll, item, approvedBy }) {
  if (!brandId) throw new Error("sin marca activa");
  const version = coverVersion(item);
  if (!version) throw new Error("no hay una versión concreta para aprobar");

  // ONE body builder, not two. `conceptRecord` already knows the shape and
  // already carries `collection_id` — the field whose absence here made the
  // approval path's own rows uncountable, because every collection-scoped
  // query joins on the id (engine 0028) while `collection_name` is only a
  // historical label. This function was hand-rolling the body and omitting it,
  // so a concept approved from the Review Room landed with a label and no
  // link: visible in Studio, missing from the command centre, the portfolio,
  // the stage rail and the approvals count.
  //
  // DesignStudio hid the bug by calling `registerBoardConcept` first (the
  // engine preserves an existing link when a later body omits it).
  // `Review.jsx:141` calls this directly and had no such cover.
  //
  // This used to override `created_by` with the approver's name, on the
  // reasoning that the registry records who OWNS an item while this path cares
  // who APPROVED it. Both halves are now server-owned and separate: authorship
  // comes from the session on `upsertConcept`, and who approved is set by
  // `approveVersion` below. Conflating them wrote the approver into the author
  // column, so the person who signed a design was recorded as having drawn it.
  const concept = await upsertConcept(brandId, conceptRecord(coll, item));

  // Append the version being approved. Idempotent by client_key, so a retry (or
  // a version already pushed at generation time) returns the original row.
  const pushed = await appendVersion(brandId, concept.id, {
    client_key: version.id,
    kind: version.kind || "concepto",
    note: version.note || null,
    prompt: version.prompt || null,
    reference_urls: (version.references || []).filter((u) => typeof u === "string").slice(0, 8),
    provider: version.provider || null,
    quality: version.quality || null,
    cost_cents: version.cost_cents ?? null,
    // `created_by` omitted — the engine takes it from the session.
  });

  const approved = await approveVersion(brandId, concept.id, {
    version_client_key: version.id,
    approved_by: approvedBy || null,
  });

  // THE PIXELS, not only their audit trail. The projection above carries
  // prompt, provider and cost; the image of the fallback path lived ONLY in
  // this browser (GAP-MAP defect 1), so an approved design could be lost to a
  // cleared profile while the record of approving it survived. Ingest is
  // idempotent by the version's client_key and DOES NOT gate the approval —
  // the engine acknowledged that above, and un-approving over a failed upload
  // would be the tail wagging the dog. The outcome is REPORTED instead.
  let imagePersisted = null; // null = nothing to persist (not a failure)

  // ⚠ AN ENGINE-MADE IMAGE IS ALREADY A ROW — it needs LINKING, not uploading.
  // Since Phase 2b the studio generates through `/brands/{id}/assets/generate`,
  // so the pixels are brand-owned, budgeted and durable before anybody
  // approves them. What is missing at that moment is the other direction: the
  // asset cannot know which concept version it became, because the version did
  // not exist when the image was made. This is where both halves are finally
  // in the same place, which is why the link is made here and not at
  // generation time.
  //
  // Same discipline as the ingest below: it does NOT gate the approval. The
  // engine already acknowledged the approval, and un-approving over a failed
  // bookkeeping call would be the tail wagging the dog.
  if (version.asset_id && pushed?.id) {
    try {
      await attachAsset(brandId, version.asset_id, {
        concept_id: concept.id,
        concept_version_id: pushed.id,
      });
      imagePersisted = true;
    } catch (error) {
      // 409 `already_attached` means this asset belongs to another version —
      // a real conflict worth surfacing, not a transport failure. Either way
      // the approval stands and the outcome is reported, never swallowed.
      imagePersisted = false;
    }
  } else if (shouldIngestImage(version.url)) {
    try {
      await ingestAsset(brandId, {
        data_uri: version.url,
        client_key: version.id,
        prompt: version.prompt || null,
        provider: version.provider || null,
        quality: version.quality || null,
        concept_id: concept.id,
        concept_version_id: pushed?.id || null,
      });
      imagePersisted = true;
    } catch {
      imagePersisted = false;
    }
  }

  return {
    imagePersisted,
    conceptId: approved.id,
    approvedVersionId: approved.approved_version_id,
    approvedVersionKey: version.id,
    approvedBy: approved.approved_by,
    approvedAt: approved.approved_at,
  };
}
