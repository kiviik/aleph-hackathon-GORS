// What "this collection has N concepts" means — ONE definition, dependency-free
// so it can be unit-tested, and used by BOTH surfaces that print the number.
//
// THE BUG THIS EXISTS TO KILL (owner, 2026-07-25): the stage rail said
// "0 conceptos" for a collection while the Studio board said "1/1 con concepto".
// Neither was lying about its own store — they were counting different stores:
//
//   · the rail / command centre / portfolio count engine `Concept` rows
//     (GET /collections/{id}/workspace, filtered by `Concept.collection_id`)
//   · Studio counts items on the `studio_collections` items document that have
//     a generated cover
//
// and the frontend only ever wrote a `Concept` row at APPROVAL time
// (lib/concepts.js `approveConceptVersion`) — and even then without
// `collection_id`, so the row it created was invisible to the very query the
// rail runs. Every concept between "generated" and "approved" — which is most
// of design's working life — existed in exactly one of the two stores.
//
// THE RECONCILIATION (same shape as the Range Plan "two answers" fix and the
// accepted-items fix before it): the board stays the ONE authoritative object —
// it is where designers actually work, and DECISIONS 0031 already names
// `studio_collections` the aggregate root. The engine's Concept/ConceptVersion
// rows become a COMPLETE PROJECTION of it rather than a partial one, written
// the moment an item gains a version instead of only at approval. The rail is
// then counting the same set Studio is, because there is only one set.
//
// NOT chosen, deliberately: summing the two, or having Studio read the engine's
// count. Summing is how this bug class survives. Having Studio print the
// engine's number would make the board say "0 con concepto" while showing you
// the concept — true to the store, false to the user.

// A version needs a stable client_key so the append is idempotent (retry-safe)
// and so a re-sync does not duplicate rows. Versions minted by lib/version.js
// carry an `id`; versions written before that module existed do not, and we do
// NOT mint one into the board to fix that — rewriting stored work to make a
// count come out is the failure mode this file is against. Instead the key is
// derived from the version's own immutable content (url + timestamp), so the
// same legacy version always resolves to the same key.
function djb2(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function versionKey(version) {
  if (!version) return null;
  if (version.id) return String(version.id);
  if (!version.url) return null; // nothing immutable to key on — not registrable
  return `v-legacy-${djb2(`${version.url}|${version.ts || ""}`)}`;
}

// An item IS a concept once it has a generated cover. This is the predicate the
// Studio header has always used; making the engine projection use the SAME one
// is the whole fix — a second predicate is a second answer.
export const hasConcept = (item) => Boolean(item?.cover);

const versionsOf = (item) => (Array.isArray(item?.images) ? item.images : []);

// The versions of an item that can be recorded as auditable rows. A version
// with no url is a placeholder, not a generation.
export const registrableVersions = (item) =>
  versionsOf(item).filter((v) => v?.url && versionKey(v));

export const boardConcepts = (coll) =>
  (Array.isArray(coll?.items) ? coll.items : []).filter(hasConcept);

// The number Studio prints as the numerator of "N/M con concepto", and the
// number the engine must be able to answer with for the same collection.
export const boardConceptCount = (coll) => boardConcepts(coll).length;

// POST /brands/{id}/concepts body for one board item.
//
// `collection_id` is the field whose absence made the approval path's own rows
// uncountable: the engine keeps `collection_name` as a historical label, but
// every collection-scoped query joins on the id (migration 0028).
// ⚠ AND `recommendation_id` IS THE SECOND SUCH FIELD (owner review, fourth pass
// 2026-08-12). Opportunities mints an immutable recommendation before handing
// off, the handoff carried the id intact, and then the Studio item constructor
// copied name/silhouette/fabric/colour/note/image and dropped it — so the
// design became an orphan at the moment it came into existence, and the chain
// the tech pack cites (recommendation -> concept -> approved version -> pack)
// had no first link. Same shape as the `collection_id` bug above: a field that
// travelled the whole way and died in one object literal.
export function conceptRecord(coll, item) {
  return {
    client_key: item.id,
    name: item.name || null,
    silhouette: item.silhouette || null,
    collection_id: coll?.id || null,
    collection_name: coll?.name || null,
    // ⚠ `created_by` IS NOT SENT (2026-08-14). The engine takes authorship from
    // the authenticated session and ignores the body, because a browser naming
    // its own author makes the record unfalsifiable — the same reason
    // `approved_by` stopped being believed in 2026-07-24. In pilot mode the
    // server records no author at all, which is the honest answer: `item.ownerId`
    // is a local board label, not a verified identity.
    // Null for a concept sketched without an opportunity — legitimate work,
    // and different from one that HAD a cause and lost it.
    //
    // ⚠ THE ID ONLY. `opportunity_key` is DERIVED server-side from the cited
    // recommendation's own `candidate_key` (owner review, sixth pass): sending
    // both would be two independently trusted descriptions of one cause, and a
    // client that could pair `rec-Faldas` with `ws-Jeans` is a client that can
    // be wrong about a record whose whole purpose is being trustworthy later.
    recommendation_id: item.recommendationId || null,
  };
}

// POST .../versions bodies, oldest first, so the append-only history reads in
// the order the work actually happened.
export function versionRecords(item) {
  return registrableVersions(item)
    .slice()
    .reverse() // the board prepends the newest; the ledger appends
    .map((v) => ({
      client_key: versionKey(v),
      kind: v.kind || "concepto",
      note: v.note || null,
      prompt: v.prompt || null,
      reference_urls: (Array.isArray(v.references) ? v.references : [])
        .filter((u) => typeof u === "string").slice(0, 8),
      provider: v.provider || null,
      quality: v.quality || null,
      cost_cents: v.cost_cents ?? null,
      // `created_by` omitted for the same reason as in `conceptRecord` above.
    }));
}

// The diff: which of this board's concepts the engine cannot currently see.
//
// Two ways an item is unseen, and the second is the quiet one: a Concept row
// exists (approval created it) but carries no `collection_id` or another
// collection's, so the rail's `WHERE collection_id = ...` skips it. That row is
// repaired by re-posting it with the link, not by creating a duplicate — the
// upsert is keyed on client_key.
export function unregistered(coll, serverConcepts = []) {
  const byKey = new Map(
    (Array.isArray(serverConcepts) ? serverConcepts : [])
      .filter((c) => c?.client_key)
      .map((c) => [String(c.client_key), c]),
  );
  return boardConcepts(coll).filter((item) => {
    const row = byKey.get(String(item.id));
    return !row || String(row.collection_id || "") !== String(coll?.id || "");
  });
}

// The invariant, stated once so a caller (and a test) can assert it rather than
// re-derive it: for an engine-backed collection, the number of Concept rows the
// engine holds for it must equal the number the board prints.
export function reconciles(coll, serverConcepts = []) {
  const mine = (Array.isArray(serverConcepts) ? serverConcepts : [])
    .filter((c) => String(c?.collection_id || "") === String(coll?.id || ""));
  return mine.length === boardConceptCount(coll);
}
