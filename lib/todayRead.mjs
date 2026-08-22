// What "Lectura de Atelier" is allowed to say on the Today screen.
//
// ⚠ WHY THIS IS A MODULE AND NOT A LITERAL INSIDE `Today.jsx` (owner assessment
// point 3, 2026-08-17: *"it mistakes interpretation for intelligence — «Lectura
// de Atelier» often restates status and missing data"*). The rail used to open
// with:
//
//   "Atelier registró una recomendación para esta propuesta: test qty 25.
//    La decisión sigue siendo tuya."
//
// which is a wordier paraphrase of the card two columns to its left — `Hero`
// renders "Recomendación registrada · test qty: 25" — wrapped in narration
// about the engine having stored a row. Beside it sat "Tipo · Producto nuevo",
// while the card header already read "Decisión 1 de 3 · Producto nuevo", and
// "Origen · caso guardado en el motor", which was true of every case ever
// shown and therefore distinguished nothing.
//
// None of that was a bug in `AtelierRead`; that component renders what it is
// handed and its docstring already says a thin screen must produce a SHORT
// rail rather than a padded one. It was a bug in what this screen chose to
// hand it, and it was invisible to the suite because the choice lived inline.
//
// THE TWO RULES, which are the whole content of this file:
//
//   1. The rail may not repeat what the card already says.
//   2. The rail may not narrate the engine's plumbing.
//
// ⚠ AND `interpretation` IS NULL RATHER THAN REWORDED. The honest replacement
// is not a better sentence: this layer has nothing to interpret WITH. A real
// reading names root cause, alternatives, contradictory evidence, comparable
// products, portfolio consequence, what can be tested and what would falsify
// the call — none of which exist as data. Composing one in the client would be
// inventing it, which is the single thing this product refuses, and it would
// be the same class as the "client recomputes a figure the engine owns" sweep
// of 2026-08-14. It belongs to the engine, beside the gates that already know
// what the evidence supports.

/** Rows the engine sent for a field, as `[{key, text}]`. Tolerant of nulls. */
function rows(record) {
  if (!record) return [];
  if (Array.isArray(record)) return record.filter(Boolean);
  if (typeof record === "object") {
    return Object.entries(record).map(([key, text]) => ({ key, text }));
  }
  return [];
}

/**
 * Build the "Lectura de Atelier" props for one decision case.
 *
 * @param current  the case, or null/undefined when nothing is selected
 * @param ctx      {hasSales, engineMode, whenText} — `whenText` is injected so
 *                 this module stays free of the app's date formatting and can
 *                 be tested without it.
 * @returns the AtelierRead props, or null when there is no case.
 */
export function readForCase(current, ctx = {}) {
  if (!current) return null;
  const { hasSales = false, engineMode = null, whenText = (v) => v } = ctx;

  const unknowns = [];
  if (!rows(current.expected_impact).length) unknowns.push("Impacto económico de avanzar");
  if (!current.owner) unknowns.push("Quién es responsable de ejecutarla");
  if (!hasSales) {
    unknowns.push("Demanda propia — sin ventas conectadas no hay margen ni reposición");
  }

  return {
    // Rule 2, and the reason this file exists. See the header.
    interpretation: null,
    // Age and due date are the only two things the rail adds that the card does
    // not already show. `Tipo` lived here and duplicated the card header.
    signals: [
      { icon: "clock", label: "Abierta desde", text: whenText(current.created_at) || "—" },
      ...(current.due_at
        ? [{ icon: "clock", label: "Vence", text: whenText(current.due_at) }]
        : []),
    ],
    against: rows(current.uncertainty).map((l) => l.text),
    unknowns,
    // Traceability someone can act on: how deep the audit trail is, and
    // whether the run behind it was real data. "Origen · caso guardado en el
    // motor" was here and said nothing about this case in particular.
    trace: [
      { icon: "shield", label: "Eventos", text: `${current.events?.length || 0} en el ledger` },
      ...(engineMode ? [{ icon: "globe", label: "Corrida", text: engineMode }] : []),
    ],
    owner: current.owner ? { name: current.owner.name, role: current.owner.role } : null,
  };
}

export { rows as _rows };
