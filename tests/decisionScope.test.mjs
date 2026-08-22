// A17.2, frontend half: the taste log consumes only what it may, and every
// reason states its consequence BEFORE commit.
//
// The engine owns the real policy (atelier/reason_codes.py, tests there +
// api/tests/test_decision_envelope_api.py over HTTP). These tests hold the
// two client-side promises: the picker's display table agrees with the
// engine's, and tasteSummary cannot regress into consuming everything.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { REJECT_REASONS, tasteSummary } from "@/lib/feed";
import { engineFile, skipWithoutEngine } from "./harness/engineTree.mjs";

// Read LAZILY and through the guard: this file used to read the engine at
// module scope, so on a machine without the sibling tree the whole suite died
// on ENOENT before a single assertion ran.
const policy = () => {
  const path = engineFile("atelier/reason_codes.py");
  return path ? readFileSync(path, "utf8") : null;
};

test("every picker reason exists in the engine's taxonomy", () => {
  if (skipWithoutEngine("reason codes")) return;
  const enginePolicy = policy();
  for (const r of REJECT_REASONS) {
    assert.match(enginePolicy, new RegExp(`"${r.code}":`),
      `${r.code} is offered to users but unknown to the engine`);
  }
});

test("the picker's taste flags agree with the engine's scope table", () => {
  if (skipWithoutEngine("reason-code scopes")) return;
  const enginePolicy = policy();
  // The `taste` display flag is a MIRROR of the engine table, and this is the
  // seam where they could drift: a reason shown as "no toca tu gusto" that
  // the engine scopes to taste would be the original lie, inverted.
  for (const r of REJECT_REASONS) {
    const m = enginePolicy.match(
      new RegExp(`"${r.code}":\\s*\\{[^}]*"scope":\\s*\\(([^)]*)\\)`));
    assert.ok(m, `no scope found for ${r.code}`);
    const engineTaste = /"taste"|"brand"/.test(m[1]);
    assert.equal(r.taste, engineTaste,
      `${r.code}: picker says taste=${r.taste}, engine says ${engineTaste}`);
  }
});

test("every reason states its consequence", () => {
  for (const r of REJECT_REASONS) {
    assert.ok(r.learns && r.learns.length > 8, `${r.code} has no consequence`);
    if (!r.taste) assert.match(r.learns, /[Nn]o (toca|enseña)/,
      `${r.code} teaches nothing about taste and must say so`);
  }
});

test("tasteSummary consumes only engine-approved rows", () => {
  // candidate_key on every row: canonicalDecisionRows drops keyless rows,
  // which my first fixtures learned the hard way.
  const decisions = [
    { candidate_key: "a", decision: "reject", reason: "off-brand",
      learns_taste: true, candidate: {} },
    { candidate_key: "b", decision: "reject", reason: "el margen no cierra",
      learns_taste: false, candidate: {} },
    { candidate_key: "c", decision: "reject", reason: "vieja sin scope",
      candidate: {} },                                      // legacy: no flag
    { candidate_key: "d", decision: "accept", candidate: { cat: "Sweaters" } },
  ];
  const t = tasteSummary(decisions);
  assert.deepEqual(t.dislikes.reasons, ["off-brand"],
    "only the taste-scoped rejection may appear as taste");
  assert.equal(t.untasted, 2, "the excluded rejections are counted out loud");
  assert.equal(t.rejects, 3, "…but the total does not hide them");
});

test("a row without the engine flag never teaches", () => {
  // learns_taste is computed server-side; its absence (legacy rows, older
  // engines) must read as NO. The one acceptable direction of failure.
  const t = tasteSummary([{ candidate_key: "x", decision: "reject",
                            reason: "off-brand", candidate: {} }]);
  assert.deepEqual(t.dislikes.reasons, []);
});
