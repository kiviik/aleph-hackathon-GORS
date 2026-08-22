// Money and percentages for the screen — where ABSENT stays absent.
//
// ⚠ THE BUG THIS EXISTS TO END, found on the live Range screen 2026-08-17.
// `Number(null)` is 0 and `Number("")` is 0, and both pass `Number.isFinite`.
// So a plan with no budget rendered:
//
//     Presupuesto   ARS 0
//     Open-to-buy   ARS 0
//
// beside a collection overview that correctly said the budget was missing and
// open-to-buy could not be calculated. **A buyer can commit cash against a
// fabricated zero**, and the two screens disagreeing is how they find out.
//
// The engine has refused this for months — `test_a_missing_price_is_not_zero`,
// Decimal money, cross-currency totals that refuse to exist — and the lie was
// reintroduced on the last hop, in a six-line formatter, which is the one hop
// the engine cannot defend.
//
// ⚠ AND IT WAS THE THIRD INDEPENDENT COPY. `lib/reasons.mjs` and
// `lib/direction.mjs` already guard absence, and `reasons.mjs` carries a
// comment saying it was fixed there once before. Six screens each grew their
// own formatter; three learned the lesson and three did not. That is why this
// module exists rather than a fourth local patch: the rule needs ONE home that
// a test can point at.
//
// Dependency-free (.mjs, like collectionBrief.mjs / priceFromMargin.mjs) so it
// is unit-tested without a DOM.

/** Absent means nobody said — distinct from zero, which is a decision.
 *
 *  `0` and `"0"` are VALUES and pass through: a budget of zero is a brand
 *  saying "nothing to spend", and hiding that would be the opposite lie. */
export const absent = (value) =>
  value === null
  || value === undefined
  || (typeof value === "string" && value.trim() === "");

/** A number, or null when there is nothing to convert. Never 0-by-coercion.
 *
 *  ⚠ THE TYPE CHECK IS NOT DEFENSIVE PADDING — it is the same bug one layer
 *  down. `Number([])` is **0** and `Number(true)` is **1**, neither of which is
 *  "absent", so a guard that only rejects null/undefined/"" still lets an empty
 *  array render as ARS 0. Only a number or a string can be money; everything
 *  else is a shape nobody meant to put on a money line. Caught by this module's
 *  own test, which is the point of it having one. */
export function num(value) {
  if (absent(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/** Money as a reader sees it, or null so the caller can say «sin definir».
 *
 *  Rounded for display only — the exact decimal stays server-side, which is
 *  why `value` arrives as a STRING from the engine and is never re-derived
 *  here. */
export function moneyText(value, currency, { symbol = "" } = {}) {
  const n = num(value);
  if (n === null) return null;
  const prefix = symbol || currency || "";
  return `${prefix} ${Math.round(n).toLocaleString("es-AR")}`.trim();
}

/** A percentage, or null. One decimal, because a margin of 60.04 and one of
 *  60 are different conversations with a buyer. */
export function pctText(value, { digits = 1 } = {}) {
  const n = num(value);
  return n === null ? null : `${n.toFixed(digits)}%`;
}
