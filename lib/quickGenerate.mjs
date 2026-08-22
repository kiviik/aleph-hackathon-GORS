// The fast path: type, enter, image — and everything ChatGPT cannot give back.
//
// ⚠ THE COMPETITOR IS A TEXT BOX. A designer with ChatGPT open types a
// sentence and gets a picture. Measured against that, Atelier's studio cost
// three or four navigation clicks and required an active brand AND collection
// before the first character could be typed. Every one of those was a reason
// to use the other tab, and none of them was protecting anything: the engine
// requires only `authored_prompt`.
//
// So this module is the logic behind a prompt box that opens anywhere. What it
// adds over the text box is the part a general model structurally cannot do:
//
//   * the image is KEPT — every generation is a row in the brand's ledger with
//     its prompt, model, cost and parentage, not a picture in a chat log that
//     scrolls away;
//   * FOLLOW-UPS EDIT THE IMAGE, they do not re-roll it. "más ancha" sends the
//     previous asset as the base (`edit_asset_id`), so the second image is a
//     changed version of the first rather than a fresh interpretation of a
//     longer prompt — which is what a chat actually does and why the sleeve
//     comes back different every time;
//   * BRAND CONTEXT the model has no way to know: the real fabrics this brand
//     buys, with the prices and lead times from its own sheet.
//
// ⚠ AND THE CONTEXT IS VISIBLE AND REMOVABLE. It travels as `atelier_context`,
// never merged into her sentence, and the receipt shows it. Help she cannot
// see or switch off is the hidden prompt manipulation this product refuses.

/** The four words that mean "change what I just made" rather than "make
 *  something new". Deliberately small and Spanish-first: guessing wrong sends
 *  a fresh generation when she wanted an edit, which costs her the image she
 *  liked. Anything not on this list starts a new thread. */
const EDIT_HINTS = [
  "más", "mas", "menos", "menor", "mayor", "cambiá", "cambia", "cambiar",
  "sacá", "saca", "sacar", "quitá", "quita", "quitar", "poné", "pone",
  "poner", "hacé", "hace", "hacer", "ajustá", "ajusta", "ajustar",
  "alargá", "alarga", "acortá", "acorta", "subí", "sube", "bajá", "baja",
  "en lino", "en algodón", "de espalda", "de atrás", "otro color",
];

/**
 * Is this a follow-up on the last image, or a new thread?
 *
 * ⚠ WHEN IN DOUBT, NEW. An edit misread as a new generation costs a click; a
 * new idea misread as an edit silently confines it to the previous garment,
 * and she may not notice why everything looks the same.
 */
export function looksLikeFollowUp(text, hasPrevious) {
  if (!hasPrevious) return false;
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  // A long sentence is a fresh description, whatever words it starts with.
  if (t.split(/\s+/).length > 12) return false;
  return EDIT_HINTS.some((h) => t.startsWith(h) || t.includes(` ${h} `));
}

/**
 * What Atelier knows that a general model cannot. Built from REAL rows and
 * returned as text plus the list of what it used, so the box can show it and
 * she can switch it off.
 *
 * Never invents: a brand with no material sheet contributes nothing here
 * rather than a plausible sentence about linen.
 */
export function brandContext({ materials = [], brandName = null } = {}) {
  const used = [];
  const lines = [];
  if (brandName) {
    lines.push(`Marca: ${brandName}.`);
    used.push({ key: "brand", label: brandName });
  }
  const named = (materials || [])
    .filter((m) => m && m.name)
    .slice(0, 6);
  if (named.length) {
    lines.push(
      "Telas que esta marca compra de verdad: "
      + named.map((m) => {
        const bits = [m.name];
        if (m.composition) bits.push(m.composition);
        // ⚠ Price only when the sheet HAS one. `moneyText` returns null for
        // absent money and this must not print "0".
        if (m.price && m.currency) bits.push(`${m.currency} ${m.price}`);
        return bits.join(" · ");
      }).join("; ") + ".");
    used.push({ key: "materials", label: `${named.length} telas de la hoja` });
  }
  return { text: lines.join(" ") || null, used };
}

/**
 * The request body. `authored` is her sentence, verbatim and alone — the
 * server composes everything else, so "volver a mi texto" stays honest.
 */
export function quickIntent({ authored, context = null, previousAssetId = null,
                              followUp = false }) {
  const body = {
    generation_intent: {
      authored_prompt: authored,
      ...(context ? { atelier_context: context } : {}),
    },
    n: 1,
    // Fast by default: iteration must be cheap, and a designer trying an idea
    // is not finalising it. She can raise it when she means to.
    tier: "fast",
    quality: "draft",
  };
  if (followUp && previousAssetId) {
    // ⚠ THE FOLLOW-UP EDITS THE IMAGE. Without this the second prompt is a
    // fresh generation and the garment changes underneath her.
    body.edit_asset_id = previousAssetId;
    body.task = "garment_edit";
  }
  return body;
}

/** What the box says while it works, and after. Never a promised duration —
 *  the engine does not know one and neither do we. */
export function statusText({ busy, followUp, error }) {
  if (error) return error;
  if (busy) return followUp ? "Cambiando la imagen…" : "Generando…";
  return null;
}
