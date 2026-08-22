// Construction callouts: three resolution states, deliberately kept apart.
//
// A callout POINTS at a pack field (engine 0082) and `resolved` is the
// ENGINE's read-time answer. The client's one job is to not collapse the
// states: `null` (no pack to check against — unknown) must never read like
// `false` (the key is wrong), because telling a designer their key is broken
// when there is simply no ficha yet is the "sin filas over a 500" lie with a
// different noun.
import assert from "node:assert/strict";
import test from "node:test";

import { calloutResolutionText } from "../lib/styleRecord.mjs";

test("a callout naming no field has nothing to resolve — no sentence at all", () => {
  assert.equal(calloutResolutionText({ field_key: null, resolved: null }), null);
  assert.equal(calloutResolutionText(null), null);
});

test("resolved=true says the ficha holds the key", () => {
  const t = calloutResolutionText({ field_key: "spi", resolved: true });
  assert.match(t, /«spi»/);
  assert.match(t, /en la ficha/);
});

test("resolved=false says the key is not there — a checkable claim", () => {
  const t = calloutResolutionText({ field_key: "spii", resolved: false });
  assert.match(t, /no está en la ficha/);
});

test("resolved=null is UNKNOWN, and its sentence must differ from false's", () => {
  const unknown = calloutResolutionText({ field_key: "spi", resolved: null });
  const wrong = calloutResolutionText({ field_key: "spi", resolved: false });
  // The unknown sentence blames the missing ficha, never the key.
  assert.match(unknown, /no hay ficha/);
  assert.ok(!unknown.includes("no está en la ficha"));
  assert.notEqual(unknown, wrong);
});
