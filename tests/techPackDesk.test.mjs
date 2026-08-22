// The tech-pack desk. The engine has refused to release an unverified pack
// since 2026-08-09 and there was nowhere to be the person who verifies —
// "a document waiting for a desk" (owner, 2026-08-14).
//
// These lock the honesty rules the screen exists to hold, not its layout.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const view = strip(read("components/views/TechPack.jsx"));
const api = strip(read("lib/api.js"));

test("ai_proposed and human_verified cannot look alike", () => {
  // The whole risk the release gate exists to prevent. They must differ in
  // more than one dimension, so a colourblind or low-contrast render still
  // separates them.
  const css = read("components/views/TechPack.jsx");
  const ai = css.match(/\.tp-prov\.ai_proposed\{([^}]*)\}/)?.[1] || "";
  const hv = css.match(/\.tp-prov\.human_verified\{([^}]*)\}/)?.[1] || "";
  assert.ok(ai && hv, "both provenance styles must exist");
  assert.notEqual(ai, hv);
  // different colour AND different weight — not colour alone
  assert.ok(/color:/.test(ai) && /color:/.test(hv));
  assert.ok(/font-weight/.test(hv), "human_verified must carry its own weight");
  assert.ok(/italic|font-weight/.test(ai), "ai_proposed must be visually distinct");
});

test("the reading says populated-but-unverified, never 'incomplete'", () => {
  // "Incompleta" would be FALSE — every field has a value. Populated and
  // verified are different states and imply different next actions.
  assert.match(view, /Poblada no es verificada/);
  assert.ok(!/ficha (está )?incompleta/i.test(view),
    "the pack is populated, not incomplete — do not say incomplete");
});

test("could-not-ask never renders as none-exist", () => {
  // getTechPacks must return null on failure and [] only when the engine
  // actually answered with none. Asserted on the CODE, not on a comment — the
  // first draft of this test checked for the explanatory comment in a source
  // it had already stripped comments from, which is a test that can only pass
  // by accident.
  const body = api.match(/export async function getTechPacks[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(body, "getTechPacks must exist");
  assert.match(body, /catch\s*\{[\s\S]*?return null;/,
    "a failed lookup must resolve to null, never to an empty list");

  // And the screen must branch on all three, not two.
  assert.match(view, /list === undefined/);   // not asked yet
  assert.match(view, /list === null/);        // could not ask
  assert.match(view, /list\.length === 0/);   // genuinely none
  assert.match(view, /No pudimos consultar el motor/);
});

test("a release refusal is surfaced, not swallowed", () => {
  // Attempting release before verification is product behaviour: the refusal
  // proves the gate exists and names what is unresolved.
  assert.match(api, /err\.payload = data\?\.detail/);
  assert.match(view, /El motor se negó a liberar/);
  assert.match(view, /setRefusal/);
});

test("the desk claims no Style capability the engine cannot represent", () => {
  // No endpoint writes slot.style_id, and the critical path collapses every
  // Style into one. A desk implying otherwise would be lying in the direction
  // that costs money.
  for (const forbidden of ["critical_path", "criticalPath", "supplier_performance",
                           "supplierPerformance", "getSupplierPerformance"]) {
    assert.ok(!view.includes(forbidden),
      `the desk must not surface ${forbidden} — see ROADMAP §13 prerequisites`);
  }
});

test("only the two provenances the router accepts are written", () => {
  // imported and calculated are 422s on purpose: a human must not be able to
  // launder a machine value into a verified one by re-posting it unchanged.
  assert.match(view, /WRITABLE = \["human_verified", "supplier_confirmed"\]/);
  assert.ok(!/provenance: "imported"|provenance: "calculated"/.test(view));
});
