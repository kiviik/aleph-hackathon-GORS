// The range board's grouping — the layout the reference mockups ask for,
// built only from what the engine actually stores.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { buildBoard, deliveryWindow, NO_DELIVERY, CARRYOVER_ES, TIER_ES }
  from "@/lib/rangeBoard";

const slot = (o) => ({ category: "Trousers", planned_units: 100,
  currency: "ARS", financials: { gross_sales: 1000 }, ...o });

test("columns are real delivery months, in calendar order", () => {
  const b = buildBoard([
    slot({ delivery_date: "2026-12-02" }),
    slot({ delivery_date: "2026-09-15" }),
  ]);
  assert.deepEqual(b.columns.map((c) => c.label), ["Sep 26", "Dic 26"]);
});

test("a slot with no delivery date gets its own LAST column", () => {
  // A planning hole, stated. Not silently bucketed into a real month.
  const b = buildBoard([
    slot({ delivery_date: null }),
    slot({ delivery_date: "2026-09-15" }),
  ]);
  assert.equal(b.columns.at(-1).key, NO_DELIVERY);
  assert.equal(b.columns.at(-1).label, "Sin entrega");
  assert.equal(deliveryWindow(undefined).key, NO_DELIVERY);
});

test("category rows sum units and sales from server figures", () => {
  const b = buildBoard([
    slot({ delivery_date: "2026-09-01", planned_units: 100, financials: { gross_sales: 1000 } }),
    slot({ delivery_date: "2026-10-01", planned_units: 250, financials: { gross_sales: 4000 } }),
  ]);
  assert.equal(b.rows[0].units, 350);
  assert.equal(b.rows[0].sales, 5000);
  assert.equal(b.rows[0].currency, "ARS");
});

test("mixed currencies refuse to total", () => {
  // §4's rule: a cross-currency total is not a number a buyer can act on.
  const b = buildBoard([
    slot({ delivery_date: "2026-09-01", currency: "ARS" }),
    slot({ delivery_date: "2026-09-01", currency: "USD" }),
  ]);
  assert.equal(b.rows[0].sales, null);
  assert.equal(b.rows[0].mixedCurrencies, true);
});

test("a slot with no price contributes units but no sales", () => {
  // gross_sales is null when the engine cannot compute it; null must not
  // become zero in a sum a merchandiser reads as revenue.
  const b = buildBoard([
    slot({ delivery_date: "2026-09-01", planned_units: 40, financials: { gross_sales: null } }),
  ]);
  assert.equal(b.rows[0].units, 40);
  assert.equal(b.rows[0].sales, null);
});

test("every slot lands in exactly one cell", () => {
  const slots = [
    slot({ delivery_date: "2026-09-01" }),
    slot({ delivery_date: "2026-09-20" }),
    slot({ category: "Vestidos", delivery_date: "2026-11-01" }),
    slot({ category: "Vestidos", delivery_date: null }),
  ];
  const b = buildBoard(slots);
  const placed = b.rows.flatMap((r) => r.cells.flatMap((c) => c.slots)).length;
  assert.equal(placed, slots.length);
  assert.equal(b.rows.every((r) => r.cells.length === b.columns.length), true);
});

test("the board invents no merchandising verdict", () => {
  // The mock shows "HUECO DETECTADO — falta: vestido de ocasión". Assortment
  // gap analysis is a real discipline, but it needs a comparison set (last
  // season, the plan, or a peer group) and we have none of the three — so this
  // module must not manufacture the finding: an empty cell is an absence, not
  // a recommendation. Retire this guard when the comparison set exists.
  //
  // "HERO" was on this list and has been REMOVED (0065). It did not belong:
  // the ban is about inventing an INFERENCE, and a tier is a planner-DECLARED
  // field, not something this module derives. Keeping it would have meant a
  // merchandiser could not state a hero style because a mock once drew one.
  const src = readFileSync(new URL("../lib/rangeBoard.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const banned of ["hueco", "HUECO", "falta", "gap", "recomend"]) {
    assert.ok(!src.includes(banned), `board must not assert "${banned}"`);
  }
});

test("the two slot vocabularies do not bleed into each other", () => {
  // The bug this pins: CARRYOVER_ES used to carry a `core` key — not a legal
  // carryover_type — while MISSING `variation`, which is legal and which three
  // golden-collection rows use (COM-BUZO-02, COM-CAMPERA-01, COM-PANT-01).
  // Those rows rendered raw English in a Spanish UI, and the Tabla editor had
  // offered `variation` as a choice the whole time.
  //
  // `carryover_type` = where a slot came from. `tier` = what job it does.
  // A carryover CAN be a hero, so no value may appear in both maps.
  assert.deepEqual(Object.keys(CARRYOVER_ES).sort(),
                   ["carryover", "new", "variation"],
                   "must match the engine's carryover_type vocabulary exactly");
  assert.deepEqual(Object.keys(TIER_ES).sort(),
                   ["core", "entry", "fashion", "hero"],
                   "must match the engine's tier CHECK (migration 0065)");

  const overlap = Object.keys(TIER_ES).filter((k) => k in CARRYOVER_ES);
  assert.deepEqual(overlap, [], "a value cannot belong to both axes");

  // Every legal value translates. A missing key is exactly how the original
  // bug reached the screen: the render falls back to the raw English word.
  for (const [map, name] of [[CARRYOVER_ES, "CARRYOVER_ES"], [TIER_ES, "TIER_ES"]]) {
    for (const [k, v] of Object.entries(map)) {
      assert.ok(v && typeof v === "string", `${name}.${k} has no label`);
    }
  }
});
