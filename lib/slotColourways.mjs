// Which colours a range position plans (engine 0086), said in Spanish.
//
// `assortment_slots.colorway` is a String somebody retyped. One table away sits
// the colourway that pins the exact approved concept version, and until 0086
// nothing joined them — so "which colourways does this range actually plan"
// had no answer in either direction.
//
// Everything here is pure and formats what the engine decided. It computes no
// counts of its own: `planned_skus` is the planner's declaration and the
// reconciliation is the engine's, for the same reason the BOM total is.

/**
 * What approval evidence stands behind a colourway's image — four states, and
 * the fourth is why this read exists.
 *
 * ⚠ `another_version_approved` means the colourway pins a concept version that
 * is NOT the one the brand approved. A plan carrying it is about to commit
 * money against an image nobody signed off, and that is the sentence a
 * merchandiser has to see. It is deliberately the only one worded as a warning.
 */
export const IMAGE_STATE = {
  approved: { text: "imagen aprobada", tone: "ok" },
  another_version_approved: {
    text: "apunta a una versión que no es la aprobada", tone: "warn" },
  concept_not_approved: { text: "el concepto no está aprobado", tone: "quiet" },
  no_image_pinned: { text: "sin imagen fijada", tone: "quiet" },
  unresolved: { text: "la imagen fijada no se pudo resolver", tone: "quiet" },
};

/** null for an answer this screen does not know — a fifth state must not be
 *  dressed as one of the five it does. */
export function imageState(approval) {
  return IMAGE_STATE[approval?.state] || null;
}

/**
 * Whether the evidence is a signed-off image, and whether the SERVER knew who
 * signed it (0068). Two different facts: an unverified approval is kept and
 * never presented as proven.
 */
export function approvalDetail(approval) {
  if (!approval || approval.state !== "approved") return null;
  return approval.verified
    ? "aprobada por una identidad verificada"
    : "aprobada, pero el servidor no pudo nombrar a quién la aprobó";
}

/**
 * The plan's declaration beside the colours actually planned.
 *
 * ⚠ THIS FIXES NOTHING, and neither does the screen. `planned_skus` is what the
 * planner declared; NULL means the plan did not say, which is a different fact
 * from "one". The engine names the one arithmetic that cannot be true and this
 * prints it.
 */
export function reconciliationSentences(rec) {
  if (!rec) return [];
  const out = [];
  const declared = rec.declared_planned_skus;
  out.push({
    tone: "count",
    text: `${rec.planned_colourways} color(es) planificado(s) · el plan declara `
      + (declared == null ? "SKUs sin declarar" : `${declared} SKU(s)`),
  });
  if (rec.contradiction) out.push({ tone: "warn", text: rec.contradiction });
  if (rec.note) out.push({ tone: "quiet", text: rec.note });
  // ⚠ Only once something is actually planned. "0 × 1 talles = 0 SKU(s)" is
  // arithmetically true and tells a merchandiser nothing, and a line that says
  // nothing in a panel about evidence is worse than no line: it trains the eye
  // to skip the ones that matter. Found by reading the rendered screen.
  if (rec.colourways_times_registered_sizes != null && rec.planned_colourways > 0) {
    out.push({
      tone: "quiet",
      text: `${rec.planned_colourways} × ${rec.registered_sizes} talles `
        + `cargados = ${rec.colourways_times_registered_sizes} SKU(s) en el `
        + "maestro — es evidencia sobre el maestro, no una corrección al plan",
    });
  }
  return out;
}

/**
 * Whether this plan version can still be changed.
 *
 * The action is HIDDEN rather than shown-and-refused on an approved version.
 * The engine would answer 409 with a good sentence, but a button that always
 * fails teaches a merchandiser to ignore the ones that work — the same rule the
 * sample loop's "abrir versión" follows.
 */
export const EDITABLE_PLAN = ["draft", "in_review"];

export function canPlanColours(versionStatus) {
  return EDITABLE_PLAN.includes(versionStatus);
}

export function whyLocked(versionStatus) {
  if (canPlanColours(versionStatus)) return null;
  return versionStatus === "approved"
    ? "Este plan está aprobado y deja de moverse. Abrí la próxima versión para "
      + "planificar colores sobre su copia de esta fila."
    : `Esta versión está ${versionStatus} — sus filas ya no se editan.`;
}

/**
 * The precondition for the NEXT write, after this one landed.
 *
 * ⚠ THE WRITE CLOCK MOVES ON HER OWN WRITES. Planning a colour bumps the plan
 * version's `revision`, so a second colour sent with the revision the screen
 * LOADED with is stale and the engine refuses it — correctly, with a message
 * about another session that would be a lie to show her, because the other
 * session was her own click a second earlier. Found by planning two colours in
 * a row in the running app, not by reading the diff.
 *
 * Every mutating response carries `plan_revision`; this is the one place that
 * decides what to carry forward, so a caller cannot forget.
 */
export function nextPlanRevision(previous, response) {
  const fresh = response?.plan_revision;
  return fresh == null ? previous ?? null : fresh;
}
