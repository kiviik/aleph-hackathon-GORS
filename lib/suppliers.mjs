// Supplier performance, read honestly.
//
// The engine's rule (suppliers.py): PERFORMANCE IS COMPUTED, NEVER ENTERED.
// On-time rate and lead-time variance are derived from the ex-factory
// milestones the team already records, and below three attributed deliveries
// the engine answers `on_time_pct: null` with a `why_none` sentence instead of
// averaging two data points into a reputation.
//
// This module's whole job is to keep that refusal intact on screen. The trap
// it closes is the money-formatter trap one field over: `null` reaching a
// percentage formatter as 0 would print "0% en fecha" — a terrible score the
// engine never gave — where the truth is "not enough history to say".
//
// Dependency-free (.mjs), unit-tested without a DOM, like lib/money.mjs.

/**
 * Resolve a `GET /suppliers/{id}/performance` payload into one of three
 * renderable states. Never invents a number.
 *
 *   unavailable  — we could not ask, or the shape is not the contract's
 *   insufficient — the engine answered and refused to score (why_none says why)
 *   measured     — real numbers, with the basis they were derived from
 */
export function performanceRead(perf) {
  if (!perf || typeof perf !== "object") return { state: "unavailable" };
  const unattributed = perf.unattributed_deliveries ?? 0;
  if (perf.on_time_pct == null || perf.mean_variance_days == null) {
    return {
      state: "insufficient",
      // ⚠ `observations` TRAVELS WITH THE REFUSAL, and it is not a score. It is
      // the count of attributed deliveries the engine had — 0, 1 or 2 — which
      // is the number that tells a reader how far from an answer they are. The
      // rule this file exists for applies to it too: it is rendered as a count
      // of deliveries, never as a rate, and never beside a "%" sign.
      // The engine's own sentence, verbatim. It already distinguishes "small
      // history" from "deliveries nobody attributed", and the fix for each is
      // different — a paraphrase here would flatten that.
      reason: perf.why_none
        || "el motor no dio un número ni dijo por qué — no lo inventamos acá",
      observations: perf.observations ?? null,
      unattributed,
    };
  }
  return {
    state: "measured",
    onTimeText: `${perf.on_time_pct}%`,
    varianceText: varianceText(perf.mean_variance_days),
    observations: perf.observations ?? null,
    unattributed,
    basis: perf.basis || null,
  };
}

/** Mean delivery variance as a sentence. Sign matters: late and early are
 *  different conversations with a factory. */
export function varianceText(days) {
  if (days == null) return null;
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  if (n > 0) return `${n} días tarde en promedio`;
  if (n < 0) return `${Math.abs(n)} días antes de fecha en promedio`;
  return "en fecha, en promedio";
}

/**
 * The deliveries excluded from the number because nobody said which factory
 * made them — as a sentence, or `null` when there are none.
 *
 * ⚠ NULL WHEN ZERO, NOT "0 salidas sin atribuir". The engine reports this
 * count in BOTH branches (measured and refused) because the fix for "not
 * enough history" and the fix for "history nobody attributed" are different
 * — the second one is a five-second edit on the critical path. Rendering a
 * zero would put a resolved problem on screen forever; rendering nothing when
 * the count is real would hide the only actionable half of a refusal.
 */
export function unattributedText(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n} salida(s) de fábrica con fecha planificada y real no se cuentan `
    + `acá porque no tienen proveedor asignado. El arreglo es atribuirlas en la `
    + `ruta crítica, no esperar más historia.`;
}

/** A declared value or a labelled absence — never a defaulted stand-in.
 *  `0` passes through: an MOQ of zero is a declaration, not a gap. */
export function declared(value, unit = "") {
  if (value === null || value === undefined || value === "") return null;
  return `${value}${unit ? ` ${unit}` : ""}`;
}
