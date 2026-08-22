// Absent stays absent, all the way to the pixel.
//
// ⚠ THE LIVE DEFECT, 2026-08-17. The Range screen showed a buyer:
//
//     Presupuesto   ARS 0
//     Open-to-buy   ARS 0
//
// for a plan that had NO budget — while the collection overview beside it
// correctly said the budget was missing and open-to-buy could not be
// calculated. `Number(null)` is 0, `Number("")` is 0, and both pass
// `Number.isFinite`, so a six-line formatter undid what the engine defends
// with Decimal columns, refused cross-currency totals and a test literally
// named `test_a_missing_price_is_not_zero`.
//
// A buyer can commit cash against a fabricated zero. That is the whole reason
// these assertions are absolute rather than approximate.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { absent, moneyText, num, pctText } from "../lib/money.mjs";

test("nothing is not zero", () => {
  for (const nothing of [null, undefined, "", "   "]) {
    assert.equal(moneyText(nothing, "ARS"), null, `moneyText(${JSON.stringify(nothing)})`);
    assert.equal(pctText(nothing), null, `pctText(${JSON.stringify(nothing)})`);
    assert.equal(num(nothing), null, `num(${JSON.stringify(nothing)})`);
    assert.equal(absent(nothing), true);
  }
});

test("zero IS a value and must not be hidden", () => {
  // A brand that sets its budget to zero has said something, and swallowing it
  // would be the opposite lie to the one above.
  assert.equal(moneyText(0, "ARS"), "ARS 0");
  assert.equal(moneyText("0", "ARS"), "ARS 0");
  assert.equal(pctText(0), "0.0%");
  assert.equal(num(0), 0);
  assert.equal(absent(0), false);
});

test("real money reads as money, from the engine's exact string", () => {
  // The engine sends decimals as STRINGS so a float never touches them; the
  // screen rounds for display only.
  assert.equal(moneyText("12000.40", "ARS"), "ARS 12.000");
  assert.equal(moneyText(12000.6, "ARS"), "ARS 12.001");
  assert.equal(moneyText("500", null, { symbol: "$" }), "$ 500");
  assert.equal(pctText("60.04"), "60.0%");
});

test("garbage is refused rather than rendered as a number", () => {
  for (const junk of ["n/a", "sin datos", {}, []]) {
    assert.equal(moneyText(junk, "ARS"), null, `moneyText(${JSON.stringify(junk)})`);
  }
  // ⚠ `[]` coerces to 0 through Number() — the same family of JavaScript
  // surprise as null, and just as unacceptable on a money line.
  assert.equal(num([]), null);
});

test("the Range board does not format money on its own any more", () => {
  // ⚠ THIS SCREEN WAS THE THIRD INDEPENDENT COPY OF THE FORMATTER, and the one
  // that got it wrong: `lib/reasons.mjs` and `lib/direction.mjs` already
  // guarded absence, and reasons.mjs even carries a comment saying it was
  // fixed there once before. Six screens each grew their own; the rule now has
  // one home, and this assertion is what stops a seventh.
  const src = readFileSync(
    new URL("../components/RangeBoard.jsx", import.meta.url), "utf8");
  assert.match(src, /from "@\/lib\/money\.mjs"/,
    "RangeBoard must use the shared formatter");
  assert.ok(!/const n = Number\(value\)/.test(src),
    "RangeBoard is coercing values itself again — Number(null) is 0");
});
