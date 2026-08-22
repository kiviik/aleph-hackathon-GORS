// The sample loop's two sentences, and the one word neither may contain.
//
// The engine reports areas the previous round raised and the newest does not
// mention. That is NOT a fix list — nobody said those were resolved — and the
// screen putting "arreglado" there would invent a claim a technical designer
// never made. These tests pin that, plus the four round states, because
// "received but unjudged" is the only one somebody can act on and collapsing
// it into "pending" hides the work.
import assert from "node:assert/strict";
import test from "node:test";

import { changeSentences, roundState } from "../lib/styleRecord.mjs";

test("a round that has not arrived is awaiting, not pending-as-a-verdict", () => {
  const r = roundState({ verdict: "pending", received_at: null });
  assert.equal(r.state, "awaiting");
  assert.match(r.text, /todavía no llegó/);
});

test("received-but-unjudged is its own state", () => {
  const r = roundState({ verdict: "pending", received_at: "2026-08-18T10:00:00Z" });
  assert.equal(r.state, "received");
  assert.match(r.text, /falta decidir/);
});

test("each verdict keeps its own word", () => {
  const said = ["approved", "rejected", "resample"].map(
    (v) => roundState({ verdict: v, received_at: "x" }).text);
  assert.equal(new Set(said).size, 3, said.join(" | "));
});

test("no round at all does not throw", () => {
  assert.equal(roundState(null).state, "none");
  assert.equal(roundState(undefined).state, "none");
});

test("the unmentioned list says nobody claimed it was fixed", () => {
  const [s] = changeSentences({
    from_round: 1, to_round: 2,
    still_raised: [], no_longer_mentioned: ["length"], new_in_latest: [],
  });
  assert.equal(s.tone, "unmentioned");
  assert.match(s.text, /no menciona/);
  assert.match(s.text, /nadie dijo que esté resuelto/);
});

test("NO sentence anywhere in this module claims a fix", () => {
  // ⚠ The load-bearing test. The engine deliberately has no key containing
  // "fix" or "resolv" in changed_since_previous; the screen must not add the
  // word either.
  const all = changeSentences({
    from_round: 1, to_round: 2,
    still_raised: ["sleeve"], no_longer_mentioned: ["length"],
    new_in_latest: ["collar"],
  }).map((s) => s.text).join(" ");
  assert.ok(!/arreglad|corregid|resuelto[^s]|solucionad/i.test(
    all.replace("nadie dijo que esté resuelto", "")), all);
});

test("nothing to compare produces no sentences at all", () => {
  // A first round has no previous one; the engine sends null and the screen
  // must say nothing rather than "sin cambios", which is a claim.
  assert.deepEqual(changeSentences(null), []);
  assert.deepEqual(changeSentences({ from_round: 1, to_round: 2 }), []);
});
