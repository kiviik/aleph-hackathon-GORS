// The owner walked a collection and got: "El mercado sobre-representa Footwear
// … Diseñá tu versión de marca" on a workspace that simultaneously reported
// brand fit NOT SCORED, taste NOT CALIBRATED, comparisons 0 of 20.
//
// ⚠ Nothing gated it, and the reason is structural. api/app/gates.py exists to
// downgrade an unsupported accept, but gates.apply_to_decision is called from
// exactly ONE place — api/app/routers/brands.py:330, the decisions path. An
// opportunity card never reaches it, and this brief is composed in the browser
// and written to localStorage, so it passes no server gate at all.
//
// ROADMAP A16.2: with no measured brand fit, the recommendation verb is not
// available. The verb is part of the claim.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../components/TeamBrief.jsx", import.meta.url), "utf8");

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const code = stripComments(src);

test("no unconditional imperative is written into the handoff", () => {
  // The literal that travelled into the Studio. It may not come back as a
  // fixed string: any instruction to make a garment has to be conditional on
  // brand fit, which a template can express and a constant cannot.
  assert.ok(!/Diseñá tu versión de marca/.test(code),
    "the seeded brief still commands a garment unconditionally");
});

test("the brief carries its own brand-fit standing", () => {
  // The hedge used to live only in tb-why, on the screen being navigated AWAY
  // from. Whatever the Studio reads must be able to state the same thing.
  assert.match(code, /brandFit\s*:/,
    "the handoff must carry brandFit so the Studio can state it");
  assert.match(code, /measured:\s*false/,
    "an unmeasured fit must be representable, not merely absent");
});

test("the stance is explicit and distinguishes exploration", () => {
  assert.match(code, /stance\s*:/, "the handoff must declare a stance");
  assert.match(code, /["']exploration["']/,
    "exploration must be a first-class stance, not an unlabelled default");
});

test("both entry points choose their verb from brand fit", () => {
  // There are two buttons — the hero card and the board rows. The first fix
  // only covered the hero, which left the second list issuing exactly the
  // imperative the first had stopped issuing.
  const calls = [...code.matchAll(/designCategory\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((args) => !args.startsWith("cat, band, fit")); // skip the definition
  assert.ok(calls.length >= 2, `expected both call sites, found ${calls.length}`);
  for (const args of calls) {
    assert.equal(args.split(",").length, 3,
      `designCategory(${args}) must pass brand fit as its third argument`);
  }
  // And each button's label must be chosen, not fixed.
  const explorar = (code.match(/Explorar /g) || []).length;
  assert.ok(explorar >= 2,
    "each entry point needs an exploration label for the unmeasured case");
});
