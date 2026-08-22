// "What should I charge?" — answered from her own numbers, or not at all.
//
// ⚠ THE FAILURE THIS GUARDS AGAINST IS A HELPFUL ONE. Retail price is the most
// consequential number a small label picks, and the temptation, in every screen
// that has ever tried to help with it, is to fill the gap: no margin target on
// the brief, so assume 50%, or 2.5x, or "typical for the category". That
// produces a real-looking price with a fabricated premise, and a designer who
// commits cash against it has been given an opinion dressed as arithmetic.
//
// So the rule under test is: WITH a landed cost and NO declared margin
// anywhere, the screen names the missing input and suggests nothing. The
// mutation that breaks it — `briefMarginPct ?? 50` — is one character-cluster
// long and reads as generosity.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

import {
  approvedMarginTarget, bandForCategory, bandsOfDirection, compareDecimal,
  parseDecimal, placeInBand, priceForMargin, priceGuidance,
} from "../lib/priceFromMargin.mjs";

// --------------------------------------------------------------------------- //
// the formula
// --------------------------------------------------------------------------- //

test("price = cost / (1 - margin/100), on the designer's own two numbers", () => {
  assert.equal(priceForMargin("12000", "58").price, "28571.43");
  assert.equal(priceForMargin("12000.00", "58.00").price, "28571.43");
  // A margin of zero is a legitimate declaration, and it means price = cost.
  const flat = priceForMargin("999999999999.99", "0");
  assert.equal(flat.price, "999999999999.99");
  assert.equal(flat.exact, true, "an exact quotient must not be reported as rounded");
});

test("⚠ the arithmetic is exact — a float would round this the other way", () => {
  // 0.01 / 0.4 = 0.025 exactly, which rounds half-up to 0.03.
  // `Number("0.01") / (1 - 60/100)` is 0.024999999999999998, and `.toFixed(2)`
  // on that is "0.02". The engine keeps money in Decimal for this reason; a
  // suggestion computed in floats reintroduces the drift on the way in.
  assert.equal(priceForMargin("0.01", "60").price, "0.03");
  assert.equal((Number("0.01") / (1 - 60 / 100)).toFixed(2), "0.02",
    "if this ever equals 0.03, the float path changed — the exact one still stands");
});

test("a rounded suggestion is labelled as rounded", () => {
  assert.equal(priceForMargin("12000", "58").exact, false);
  assert.equal(priceForMargin("100", "50").exact, true);
  assert.equal(priceForMargin("100", "50").price, "200.00");
});

test("100% margin defines no price, and says so instead of dividing by zero", () => {
  assert.equal(priceForMargin("12000", "100").reason, "margin_100");
  assert.equal(priceForMargin("12000", "140").reason, "margin_100");
  assert.equal(priceForMargin("12000", "-5").reason, "bad_margin");
  assert.equal(priceForMargin("abc", "58").reason, "bad_cost");
  assert.equal(priceForMargin("12000", "58e2").reason, "bad_margin",
    "exponent notation is not a decimal this may compute on");
});

test("decimals compare as integers, never through a float subtraction", () => {
  assert.equal(compareDecimal(parseDecimal("10.00"), parseDecimal("10")), 0);
  assert.equal(compareDecimal(parseDecimal("9.99"), parseDecimal("10")), -1);
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal("1,5"), null);
});

// --------------------------------------------------------------------------- //
// where it falls in her own band
// --------------------------------------------------------------------------- //

const BAND = {
  category: "Camisas", floor_price: "20000.00", core_price: "26000.00",
  ceiling_price: "30000.00", currency: "ARS", target_margin_pct: null,
};

test("the band placement names the useful case: her cost and her band disagree", () => {
  assert.equal(placeInBand("28571.43", BAND, "ARS").state, "inside");
  assert.equal(placeInBand("19999.99", BAND, "ARS").state, "below_floor");
  assert.equal(placeInBand("30000.01", BAND, "ARS").state, "above_ceiling");
  // Boundaries are inside the band, not outside it.
  assert.equal(placeInBand("20000.00", BAND, "ARS").state, "inside");
  assert.equal(placeInBand("30000.00", BAND, "ARS").state, "inside");
});

test("a currency mismatch is refused, not converted", () => {
  assert.equal(placeInBand("28571.43", BAND, "USD").state, "currency_mismatch");
  assert.equal(placeInBand("28571.43", { ...BAND, floor_price: null, ceiling_price: null },
                           "ARS").state, "no_bounds");
  assert.equal(placeInBand("28571.43", null, "ARS").state, "no_band");
});

test("a band answers for its own category only", () => {
  assert.equal(bandForCategory([BAND], "Camisas"), BAND);
  assert.equal(bandForCategory([BAND], " camisas "), BAND);
  assert.equal(bandForCategory([BAND], "Camisetas"), null);
  assert.equal(bandForCategory([BAND], null), null);
});

// --------------------------------------------------------------------------- //
// the verdict for a row — including the refusals
// --------------------------------------------------------------------------- //

const SLOT = {
  slot_code: "COM-CAM-01", category: "Camisas", currency: "ARS",
  landed_cost: "12000.00", retail_price: null, target_margin_pct: null,
};

test("⚠ a landed cost with no declared margin suggests NOTHING", () => {
  const g = priceGuidance({ slot: SLOT, bands: [], briefMarginPct: null });
  assert.equal(g.state, "no_margin");
  assert.equal(g.price, undefined, "no price may be derived from a margin nobody declared");
});

test("no landed cost is its own answer, named", () => {
  const g = priceGuidance({ slot: { ...SLOT, landed_cost: null }, bands: [BAND],
                            briefMarginPct: "58.00" });
  assert.equal(g.state, "no_cost");
  assert.equal(g.price, undefined);
});

test("'could not ask' is not 'she declared nothing'", () => {
  const g = priceGuidance({ slot: SLOT, bands: [], briefMarginPct: null,
                            available: false });
  assert.equal(g.state, "unknown");
});

test("the margin used is the most specific one SHE declared, and is named", () => {
  const brief = priceGuidance({ slot: SLOT, bands: [], briefMarginPct: "58.00" });
  assert.equal(brief.marginSource, "brief");
  assert.equal(brief.price, "28571.43");

  const band = priceGuidance({ slot: SLOT, bands: [{ ...BAND, target_margin_pct: "60" }],
                               briefMarginPct: "58.00" });
  assert.equal(band.marginSource, "band");
  assert.equal(band.price, "30000.00");

  const row = priceGuidance({ slot: { ...SLOT, target_margin_pct: "50" },
                              bands: [{ ...BAND, target_margin_pct: "60" }],
                              briefMarginPct: "58.00" });
  assert.equal(row.marginSource, "slot");
  assert.equal(row.price, "24000.00");
});

test("the verdict places the implied price in the category's band", () => {
  const g = priceGuidance({ slot: SLOT, bands: [BAND], briefMarginPct: "58.00" });
  assert.equal(g.placement.state, "inside");

  const dear = priceGuidance({ slot: { ...SLOT, landed_cost: "18000.00" },
                               bands: [BAND], briefMarginPct: "58.00" });
  assert.equal(dear.price, "42857.14");
  assert.equal(dear.placement.state, "above_ceiling",
    "cost and her own band disagreeing is the moment worth reporting");
});

test("a row whose PVP already equals the implied price says so", () => {
  const g = priceGuidance({ slot: { ...SLOT, retail_price: "28571.43" },
                            bands: [BAND], briefMarginPct: "58.00" });
  assert.equal(g.matchesCurrent, true);
  assert.equal(priceGuidance({ slot: SLOT, bands: [BAND], briefMarginPct: "58.00" })
    .matchesCurrent, null, "an empty PVP is not a mismatch, it is empty");
});

test("only an APPROVED brief version fixes the margin", () => {
  assert.equal(approvedMarginTarget({ versions: [
    { status: "draft", margin_target: "70.00" }] }), null,
    "a draft somebody is still typing into is not a commitment");
  assert.equal(approvedMarginTarget({ versions: [
    { status: "approved", margin_target: "58.00" }] }), "58.00");
  assert.equal(approvedMarginTarget(null), null);
  assert.deepEqual(bandsOfDirection({ exists: false }), []);
});

// --------------------------------------------------------------------------- //
// the screen itself
// --------------------------------------------------------------------------- //

const BRAND = "brand-1";
const COLLECTION = "coll-1";
const PLAN = "plan-1";

function planVersion(slot) {
  return {
    id: "ver-1", plan_id: PLAN, version_number: 1, revision: 4, status: "draft",
    currency: "ARS", slots: [slot],
    totals: { currency: "ARS", gross_sales: null, gross_cost: null,
              margin_pct: null, planned_units: null, newness_pct: null,
              slots_without_financials: 1 },
    readiness: { blockers: [], warnings: [] },
  };
}

/** Every request answered explicitly, so nothing depends on a live engine.
 *  `brief` and `direction` are what the collection has DECLARED. */
function stubPlan({ slot, brief, direction, onPatch }) {
  stubFetch(async (path, init) => {
    if (path === `/brands/${BRAND}/plans/${PLAN}/versions`) {
      return { items: [planVersion(slot)], open_version_id: "ver-1",
               approved_version_id: null };
    }
    if (path === `/brands/${BRAND}/plan-versions/ver-1`) return planVersion(slot);
    if (path === `/brands/${BRAND}/tech-packs`) return { tech_packs: [] };
    if (path === `/brands/${BRAND}/collections/${COLLECTION}/concept-covers`) {
      return { covers: [] };
    }
    if (path === `/brands/${BRAND}/collections/${COLLECTION}/brief`) return brief;
    if (path === `/brands/${BRAND}/collections/${COLLECTION}/direction`) return direction;
    if (path === `/brands/${BRAND}/slots/slot-1` && init?.method === "PATCH") {
      const patch = JSON.parse(init.body);
      onPatch?.(patch);
      return { slot: { ...slot, ...patch }, plan_revision: 5,
               totals: planVersion(slot).totals, readiness: { blockers: [], warnings: [] } };
    }
    return {};
  });
}

async function openTable(props = {}) {
  const { default: React, act } = await import("react");
  const { default: RangeSlots } = await import("@/components/RangeSlots");
  const view = await mount(React.createElement(RangeSlots, {
    brandId: BRAND, planId: PLAN, collectionId: COLLECTION, currency: "ARS",
    ...props,
  }));
  await act(async () => {});
  // The grid opens on the visual board; the editable table is the other tab.
  const tab = [...view.container.querySelectorAll("button")]
    .find((b) => b.textContent === "Tabla");
  await act(async () => { tab.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  await act(async () => {});
  return view;
}

const SERVER_SLOT = {
  id: "slot-1", slot_code: "COM-CAM-01", category: "Camisas", currency: "ARS",
  landed_cost: "12000.00", retail_price: null, target_margin_pct: null,
  carryover_type: "new", tier: null, planned_units: null, moq_units: null,
  lead_time_days: null, delivery_date: null, financials: {},
};

const NO_MARGIN_BRIEF = {
  id: "brief-1",
  versions: [{ id: "bv-1", status: "approved", version_number: 1,
               season: "AW26", margin_target: null, newness_target: "40.00" }],
};

test("⚠ a cost with no margin target: the screen names the missing input and " +
     "suggests no price", async () => {
  installDom();
  let patched = null;
  stubPlan({ slot: SERVER_SLOT, brief: NO_MARGIN_BRIEF,
             direction: { exists: false, items: null },
             onPatch: (p) => { patched = p; } });

  const view = await openTable();
  const text = view.text();

  assert.match(text, /Falta el margen objetivo/,
    "the missing input has to be named — 'no suggestion' with no reason is a blank stare");
  assert.match(text, /no inventamos uno/);
  // THE MUTATION TARGET. Any default margin (50%, 2.5x, "typical") would put a
  // figure on screen here. There must be none.
  assert.ok(!/Para tu margen objetivo/.test(text),
    "a price was suggested from a margin nobody declared");
  assert.equal(view.container.querySelector(".rs-sug-fill"), null,
    "there is nothing to fill the field with");

  // And the field itself is untouched: empty, and no write went out.
  // The PVP column, by position rather than by input index: selects are not
  // inputs and the count between them is a trap.
  const cells = view.container.querySelectorAll(".rs-table tbody tr td");
  const pvp = cells[4].querySelector("input");
  assert.equal(pvp.value, "", "an untouched price must stay empty");
  assert.equal(patched, null, "nothing may be written by merely looking at the row");

  await view.unmount();
});

test("a cost and an approved margin: the figure is stated, labelled, and only " +
     "written when she presses", async () => {
  installDom();
  let patched = null;
  stubPlan({
    slot: SERVER_SLOT,
    brief: { id: "brief-1", versions: [{ id: "bv-1", status: "approved",
                                         version_number: 1, margin_target: "58.00" }] },
    direction: { exists: true, items: { price_bands: [BAND] } },
    onPatch: (p) => { patched = p; },
  });

  const view = await openTable();
  const text = view.text();

  assert.match(text, /Para tu margen objetivo de 58\.00% \(brief aprobado\)/,
    "the number must carry which margin produced it");
  assert.match(text, /ARS 28\.571,43/, "the screen's own money format, not a second one");
  assert.match(text, /Redondeado a 2 decimales solo para mostrar/);
  assert.match(text, /Cae dentro de tu banda de Camisas/);
  assert.ok(!/recomend/i.test(text), "this is arithmetic on her numbers, not a recommendation");

  // Nothing has been written yet — the field is still empty.
  assert.equal(patched, null);
  const { act } = await import("react");
  const fill = view.container.querySelector(".rs-sug-fill");
  assert.equal(fill.textContent, "Completar PVP con este número");
  await act(async () => {
    fill.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {});

  assert.deepEqual(patched, { retail_price: "28571.43" },
    "the exact decimal string goes to the engine — no float on the way in");

  await view.unmount();
});

test("a price outside her own band says so plainly", async () => {
  installDom();
  stubPlan({
    slot: { ...SERVER_SLOT, landed_cost: "18000.00" },
    brief: { id: "brief-1", versions: [{ id: "bv-1", status: "approved",
                                         version_number: 1, margin_target: "58.00" }] },
    direction: { exists: true, items: { price_bands: [BAND] } },
  });

  const view = await openTable();
  assert.match(view.text(), /Cae por encima de tu techo de Camisas/);
  assert.match(view.text(), /tu costo y tu propia banda no coinciden/);

  await view.unmount();
});

test("no band for the category: the price still stands, the placement does not", async () => {
  installDom();
  stubPlan({
    slot: SERVER_SLOT,
    brief: { id: "brief-1", versions: [{ id: "bv-1", status: "approved",
                                         version_number: 1, margin_target: "58.00" }] },
    direction: { exists: true, items: { price_bands: [] } },
  });

  const view = await openTable();
  assert.match(view.text(), /ARS 28\.571,43/);
  assert.match(view.text(), /Todavía no hay banda de precio para Camisas/);

  await view.unmount();
});

test("a row with no cost is told which input is missing", async () => {
  installDom();
  stubPlan({
    slot: { ...SERVER_SLOT, landed_cost: null },
    brief: { id: "brief-1", versions: [{ id: "bv-1", status: "approved",
                                         version_number: 1, margin_target: "58.00" }] },
    direction: { exists: true, items: { price_bands: [BAND] } },
  });

  const view = await openTable();
  assert.match(view.text(), /Falta el costo de esta fila/);
  assert.ok(!/Para tu margen objetivo/.test(view.text()));

  await view.unmount();
});
