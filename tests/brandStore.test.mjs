// The scoping rule (2026-07-24 audit).
//
// 21 localStorage keys, exactly one of them brand-scoped, meant switching
// tenants showed one brand's operational state under another brand's name.
// These pin which keys are exempt and that two brands can never collide.
import assert from "node:assert/strict";
import test from "node:test";

import { GLOBAL_KEYS, scopedKey } from "../lib/brandStore.mjs";

const A = "317dcac9-4315-4e85-9033-09325ff42f91";
const B = "7ec005fb-bb61-49fa-b283-28894b9c34fb";

test("operational keys are namespaced per brand", () => {
  for (const key of ["atelier-decisions", "atelier-accepted", "atelier-pipeline",
                     "atelier-fabrics-v1", "atelier-personas-v1", "atelier-brand-model",
                     "atelier-line-plans-v2", "atelier-watchlist"]) {
    assert.notEqual(scopedKey(key, A), scopedKey(key, B), `${key} must not collide`);
    assert.ok(scopedKey(key, A).includes(A));
  }
});

test("an unresolved brand gets its own bucket, not the last brand's", () => {
  assert.notEqual(scopedKey("atelier-decisions", null), scopedKey("atelier-decisions", A));
  assert.ok(scopedKey("atelier-decisions", null).endsWith("brand:none"));
});

test("genuinely global preferences are left alone", () => {
  for (const key of GLOBAL_KEYS) {
    assert.equal(scopedKey(key, A), key, `${key} is user-level, not brand-level`);
    assert.equal(scopedKey(key, A), scopedKey(key, B));
  }
});

test("the active-brand pointer can never itself be brand-scoped", () => {
  // Scoping it would make the selection unreadable before a brand is known.
  assert.ok(GLOBAL_KEYS.has("atelier-active-brand"));
  assert.equal(scopedKey("atelier-active-brand", A), "atelier-active-brand");
});

test("an unlisted key is scoped by default", () => {
  // The safe direction: a new key someone adds is per-brand until proven global.
  assert.ok(scopedKey("atelier-something-new", A).includes("brand:"));
});
