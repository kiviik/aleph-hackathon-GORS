// Which fields a machine proposed, kept permanently separable from the rest.
//
// The owner's reference set labels this "Sugerencias IA · no verificadas", and
// it is the single best detail in those mockups: it is exactly the split the
// engine ALREADY enforces at the router. `set_field` refuses `imported` and
// `calculated` over HTTP, and `release()` refuses a pack holding `ai_proposed`
// — so a suggestion cannot reach a factory until a person marks it
// `human_verified`. What was missing was a permanent NAME for that set on
// screen, rather than a chip in a column you have to read row by row.
//
// ⚠ THE POINT IS THE LABEL, NOT THE FILTER. A machine's proposal sitting
// unannounced among verified facts is the product's defining failure mode; a
// count that never disappears is what stops it. The filter is only how you
// look at the set.

/** The engine's provenance vocabulary, as `api/app/tech_pack.py` writes it. */
export const AI_PROPOSED = "ai_proposed";

/** Provenances that mean a PERSON stood behind the value. `human_edited` is
 *  deliberately absent: editing a value is not certifying it, and the desk
 *  keeps those two acts on separate buttons for the same reason. */
export const STOOD_BEHIND = ["human_verified", "supplier_confirmed"];

/**
 * Split a tech pack's `fields` map into what a machine proposed and what did
 * not come from one.
 *
 * @param {object|null} fields the pack's `fields` object
 * @returns {{all: Array, proposed: Array, rest: Array,
 *            proposedCount: number, verifiedCount: number, total: number}}
 *   entries as `[key, value]` pairs, in the order the engine sent them.
 */
export function splitProposals(fields) {
  const all = Object.entries(fields || {});
  const proposed = all.filter(([, v]) => v?.provenance === AI_PROPOSED);
  const rest = all.filter(([, v]) => v?.provenance !== AI_PROPOSED);
  const verified = all.filter(([, v]) => STOOD_BEHIND.includes(v?.provenance));

  return {
    all,
    proposed,
    rest,
    proposedCount: proposed.length,
    verifiedCount: verified.length,
    total: all.length,
  };
}

/**
 * The one payload a manual edit at any screen may PUT.
 *
 * ⚠ THE ENGINE HAS NO `human_edited` PROVENANCE. Its vocabulary is
 * ai_proposed · imported · calculated · human_verified · supplier_confirmed
 * (`api/app/tech_pack.py`), and the router 422s everything except the last
 * two — `imported` and `calculated` are claims about ORIGIN that only the
 * assembler can make truthfully. So an edit over HTTP is necessarily also an
 * attestation: the person who typed the value signs it as theirs
 * (`human_verified`), which is why the button says "corregir y verificar"
 * and never just "guardar". Inventing a client-side `human_edited` the
 * engine never emitted would put a word on screen that no row backs.
 */
export function editedFieldPayload(value, who) {
  return {
    value,
    provenance: "human_verified",
    note: `corregido y verificado por ${who || "el equipo"}`,
  };
}

/** Whether a pack's fields accept edits at all. A released pack is immutable
 *  — a factory may be quoting against it; revision is a new version — and a
 *  superseded one is history. The engine refuses both with a 409; this only
 *  lets the screen say so before the round trip. */
export function fieldsEditable(packStatus) {
  return packStatus !== "released" && packStatus !== "superseded";
}

/**
 * What the count means, said as a sentence.
 *
 * ⚠ ZERO IS NOT AN ACHIEVEMENT AND IS NOT A GAP. A pack with no AI suggestions
 * is simply one nobody asked a model about, and saying "todo verificado" there
 * would be a claim about the OTHER fields that this function has no basis for
 * — plenty of them are `imported` or `calculated`, which are origin claims, not
 * checks. So the empty case states the absence and stops.
 */
export function proposalSentence(split) {
  if (!split || split.total === 0) return "Esta ficha todavía no tiene campos.";
  if (split.proposedCount === 0) {
    return "Ningún campo de esta ficha fue propuesto por un modelo.";
  }
  const n = split.proposedCount;
  return `${n} ${n === 1 ? "campo fue propuesto" : "campos fueron propuestos"}`
    + " por un modelo y nadie los verificó todavía. El motor no libera la ficha"
    + " mientras sigan así.";
}
