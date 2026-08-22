// One-shot handoffs between screens — and why "transient" was never "safe".
//
// WHY THIS EXISTS. Owner review 2026-08-11: `atelier-design-brief` and
// `atelier-inspiration-inbox` sit in `brandStore.GLOBAL_KEYS` on the reasoning
// that they are "a one-shot handoff between two screens in one session". That
// reasoning describes their LIFETIME and says nothing about their TENANT, and
// the two are not the same question:
//
//   1. pick an opportunity under Brand A   (writes the handoff)
//   2. switch the topbar to Brand B
//   3. open Studio                          (reads it)
//   4. design Brand A's opportunity, under Brand B's name, against Brand B's
//      DNA and palette
//
// Nothing expires between steps 1 and 3, so nothing about being transient
// prevented it. This is the same cross-tenant defect `brandStore` was written
// for, surviving inside the exemption list that module publishes.
//
// ⚠ THE CHECK LIVES WITH THE READER, AND IT FAILS CLOSED. Six screens write
// this key and one reads it; putting the rule at the write side means six
// chances to forget. An unstamped payload — written by an older build, or by a
// producer somebody adds next month — cannot be verified, and unverifiable is
// refused rather than trusted. That is deliberately breaking: a handoff that
// silently loses its tenant is exactly what this exists to stop.
//
// ⚠ SCOPING THE KEY WOULD NOT HAVE FIXED IT. `brand:<id>` in the key name makes
// Brand B read an EMPTY handoff, which is safe but silent — the designer clicks
// "Diseñar", lands in Studio and finds nothing there, with no explanation. The
// payload carries its origin so the reader can say what happened and offer to
// switch back.

//: A handoff is a click away from being consumed. Beyond this it is stale
//: intent — the person went somewhere else and came back later, and replaying
//: a forgotten intention as if it were fresh is its own small lie.
export const HANDOFF_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Stamp a handoff payload with the context that produced it.
 * `brandId` is required; a handoff that cannot name its tenant is refused on
 * read, so producing one is a bug worth failing on rather than hiding.
 */
export function stampHandoff(payload, {
  brandId, collectionId = null, collectionNeutral = false, now = Date.now(),
} = {}) {
  return {
    ...payload,
    handoff: {
      brand_id: brandId || null,
      // ⚠ COLLECTION IDENTITY IS A DECISION, NOT A DEFAULT (owner review, third
      // pass 2026-08-11). The first version of this accepted `collection_id`
      // and no producer supplied it, so the field existed and meant nothing —
      // and the reader ignored it, dropping every handoff into `cs[0]`
      // regardless of which collection was open. A handoff could therefore
      // enter the WRONG COLLECTION inside the right brand.
      //
      // A producer must now say which it is. Every current one is genuinely
      // collection-neutral — they are market screens saying "design this", and
      // WHERE it goes is the designer's call — so they declare that, and the
      // reader puts them in the ACTIVE collection rather than the first one.
      // A handoff that names a collection is checked against the open one.
      collection_id: collectionId,
      collection_neutral: Boolean(collectionNeutral),
      at: new Date(now).toISOString(),
      expires_at: new Date(now + HANDOFF_TTL_MS).toISOString(),
    },
    // The legacy field several screens already write. Kept so nothing that
    // merely displays "guardado hace X" has to change.
    at: new Date(now).toISOString(),
  };
}

/**
 * Decide whether the active context may consume this handoff.
 *
 * Returns `{ ok, payload, reason, code, fromBrandId }`. `reason` is written for
 * the designer, because every refusal in this product owes an explanation.
 */
export function claimHandoff(payload, { brandId, collectionId = null, now = Date.now() } = {}) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "empty", reason: null, payload: null, fromBrandId: null };
  }

  const stamp = payload.handoff;
  if (!stamp || !stamp.brand_id) {
    // ⚠ FAIL CLOSED. An unstamped handoff cannot prove which brand it came
    // from, and "probably this one" is the assumption that produced the bug.
    return {
      ok: false, code: "unverifiable", payload: null, fromBrandId: null,
      reason: "Este traspaso no dice de qué marca salió, así que no lo abrimos "
        + "acá: no podemos comprobar que sea de la marca activa.",
    };
  }

  if (stamp.brand_id !== brandId) {
    return {
      ok: false, code: "wrong_brand", payload: null, fromBrandId: stamp.brand_id,
      reason: "Este traspaso se creó desde otra marca. No lo abrimos bajo la "
        + "marca activa: sería diseñar la oportunidad de una marca con el ADN, "
        + "la paleta y el catálogo de otra.",
    };
  }

  if (stamp.expires_at && Date.parse(stamp.expires_at) < now) {
    return {
      ok: false, code: "expired", payload: null, fromBrandId: stamp.brand_id,
      reason: "Este traspaso quedó viejo. Volvé a elegir el hueco o la "
        + "referencia para arrancar con la evidencia de ahora.",
    };
  }

  // Collection identity: named ones must match the open collection, and a
  // handoff that declared NEITHER cannot say where it belongs — refused for the
  // same reason an unstamped brand is.
  if (!stamp.collection_neutral && !stamp.collection_id) {
    return {
      ok: false, code: "no_collection_identity", payload: null,
      fromBrandId: stamp.brand_id,
      reason: "Este traspaso no dice a qué colección va ni que sea "
        + "independiente de la colección, así que no sabemos dónde ponerlo.",
    };
  }
  if (stamp.collection_id && collectionId && stamp.collection_id !== collectionId) {
    return {
      ok: false, code: "wrong_collection", payload: null,
      fromBrandId: stamp.brand_id,
      reason: "Este traspaso se creó para otra colección de esta misma marca. "
        + "No lo abrimos acá: una prenda pertenece a la colección cuyo brief la "
        + "autoriza, y no es la que tenés abierta.",
    };
  }

  return { ok: true, code: "ok", payload, reason: null, fromBrandId: stamp.brand_id };
}
