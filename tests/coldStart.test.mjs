// The screen a brand meets before it has any evidence (reference 06).
//
// The defect this prevents is the one that reads as competence: collapsing
// "we asked and there is nothing", "nobody has been asked because there is no
// connector" and "we could not ask" into one grey sentence. They have three
// different next actions and one of them is not the brand's fault.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ASKED_NONE, MANUAL_FIRST, NOT_CONNECTED, REFUSALS, UNKNOWN, absences,
  isColdStart,
} from "@/lib/coldStart.mjs";

const empty = { catalog: { products: [] }, sales: { sales_rows: 0 },
                integrations: { integrations: [] } };

test("no connector makes sales NOT CONNECTED, never an empty answer", () => {
  const sales = absences(empty).find((a) => a.key === "sales");
  assert.equal(sales.state, NOT_CONNECTED);
  // ⚠ The sentence has to say why a zero would be a lie, because a zero here
  // is exactly what a lesser product would render.
  assert.match(sales.text, /un cero acá sería inventado/);
  assert.match(sales.action.label, /Conectar/);
});

test("a live connector that returned nothing is a different sentence", () => {
  const sales = absences({
    ...empty,
    integrations: { integrations: [{ id: "shopify", enabled_for_brand: true }] },
  }).find((a) => a.key === "sales");
  assert.equal(sales.state, ASKED_NONE);
  assert.match(sales.text, /todavía no trajo filas/);
});

test("a failed request is unknown — never reported as an empty brand", () => {
  const out = absences({ catalog: null, sales: null });
  assert.deepEqual(out.map((a) => a.state), [UNKNOWN, UNKNOWN]);
  for (const a of out) {
    assert.match(a.text, /no respondió/);
    // Nothing to click: the brand cannot fix an engine that is down, and an
    // action here would blame her for it.
    assert.equal(a.action, null);
  }
});

test("what exists is not listed as missing", () => {
  const out = absences({
    catalog: { products: [{ id: "p1" }] },
    sales: { sales_rows: 12 },
    integrations: { integrations: [{ id: "shopify", enabled_for_brand: true }] },
  });
  assert.deepEqual(out, []);
});

test("cold start is strict: one decision, one product or one sale disqualifies", () => {
  assert.equal(isColdStart({ ...empty, cases: [] }), true);
  assert.equal(isColdStart({ ...empty, cases: [{ id: "c1" }] }), false);
  assert.equal(isColdStart({ ...empty, catalog: { products: [{}] } }), false);
  assert.equal(isColdStart({ ...empty, sales: { sales_rows: 3 } }), false);
});

test("an engine that did not answer is NOT a cold start", () => {
  // Otherwise a working brand meets a first-run panel the moment the network
  // hiccups — the product telling somebody mid-season that she has not begun.
  assert.equal(isColdStart({ catalog: null, sales: { sales_rows: 0 }, cases: [] }), false);
  assert.equal(isColdStart({ catalog: { products: [] }, sales: null, cases: [] }), false);
  assert.equal(isColdStart({}), false);
});

test("manual work is listed first, and every item goes somewhere", () => {
  // "Manual work is not a degraded mode. It is the base product." If this list
  // ever shrinks to a single "connect your store", the screen has changed sides.
  assert.ok(MANUAL_FIRST.length >= 4);
  for (const item of MANUAL_FIRST) {
    assert.ok(item.view, `${item.key} has nowhere to go`);
    assert.ok(item.text.length > 30, `${item.key} needs a real sentence`);
  }
});

test("the refusals are specific, and none of them is a hedge", () => {
  assert.equal(REFUSALS.length, 5);
  for (const r of REFUSALS) {
    assert.ok(r.length > 20, r);
    // Each names a THING it will not produce, not a mood about accuracy.
    assert.ok(!/quizás|puede que|aproximad/i.test(r), r);
  }
  assert.ok(REFUSALS.some((r) => /pronóstico/.test(r)));
  assert.ok(REFUSALS.some((r) => /cero/.test(r)));
});
