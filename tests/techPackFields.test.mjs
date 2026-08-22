// "Sugerencias IA · no verificadas" — the split the engine already enforces,
// given a permanent name on screen.
import assert from "node:assert/strict";
import test from "node:test";

import { proposalSentence, splitProposals } from "@/lib/techPackFields";

const f = (provenance, value = "x") => ({ provenance, value });

const PACK = {
  composition: f("human_verified"),
  gsm: f("imported"),
  seam: f("ai_proposed"),
  hem: f("ai_proposed"),
  cost: f("calculated"),
  labels: f("supplier_confirmed"),
};

test("a machine's proposals are separable from everything else", () => {
  const s = splitProposals(PACK);
  assert.deepEqual(s.proposed.map(([k]) => k), ["seam", "hem"]);
  assert.equal(s.proposedCount, 2);
  assert.equal(s.total, 6);
  // Every field lands on exactly one side.
  assert.equal(s.proposed.length + s.rest.length, s.total);
});

test("editing a value is not certifying it", () => {
  // `human_edited` is deliberately NOT counted as somebody standing behind the
  // value — the desk keeps "this is wrong" and "I certify this" on separate
  // buttons for the same reason.
  const s = splitProposals({ a: f("human_edited"), b: f("human_verified") });
  assert.equal(s.verifiedCount, 1);
});

test("supplier_confirmed counts as somebody standing behind it", () => {
  const s = splitProposals({ a: f("supplier_confirmed") });
  assert.equal(s.verifiedCount, 1);
});

test("zero proposals is stated as an absence, never as everything verified", () => {
  // The trap: "todo verificado" would be a claim about the OTHER fields, and
  // imported/calculated are origin claims, not checks.
  const s = splitProposals({ a: f("imported"), b: f("calculated") });
  assert.equal(s.proposedCount, 0);
  const sentence = proposalSentence(s);
  assert.match(sentence, /Ningún campo/);
  assert.ok(!/verificad[oa]s?\b.*tod/i.test(sentence),
    "must not imply the rest of the pack is verified");
});

test("the sentence says the release consequence, and gets the plural right", () => {
  assert.match(proposalSentence(splitProposals({ a: f("ai_proposed") })),
               /1 campo fue propuesto/);
  assert.match(proposalSentence(splitProposals(PACK)), /2 campos fueron propuestos/);
  assert.match(proposalSentence(splitProposals(PACK)), /no libera/);
});

test("an empty or missing pack does not throw or invent a count", () => {
  for (const empty of [null, undefined, {}]) {
    const s = splitProposals(empty);
    assert.equal(s.total, 0);
    assert.equal(s.proposedCount, 0);
    assert.deepEqual(s.all, []);
  }
  assert.match(proposalSentence(splitProposals({})), /todavía no tiene campos/);
});

test("a field with no provenance is not silently treated as proposed", () => {
  const s = splitProposals({ a: {}, b: { value: 1 } });
  assert.equal(s.proposedCount, 0);
  assert.equal(s.rest.length, 2);
});
