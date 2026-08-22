// The release-decision rail (reference 05): the refusal panel exists to show
// THE ENGINE'S verdict and THE ENGINE'S reasons. These tests pin the two ways
// that can silently rot: a missing verdict rendered as a refusal (a verdict
// we invented), and resolved flags rendered as open reasons (stale blockers).
import assert from "node:assert/strict";
import test from "node:test";

import { releaseDecision } from "../lib/styleRecord.mjs";

test("no pack is 'none' — nothing to decide about", () => {
  assert.equal(releaseDecision(null).state, "none");
});

test("every state carries an `open` array — the shape never varies", () => {
  // Regression: "none" once omitted it and the rail's `decision.open.length`
  // threw on any style without a pack, which is most of a real pilot.
  for (const pack of [null, undefined, {}, { audit: {} },
                      { audit: { summary: { can_be_quoted: true }, flags: [] } },
                      { audit: { summary: { can_be_quoted: false },
                                 flags: [{ key: "a", status: "missing" }] } }]) {
    assert.ok(Array.isArray(releaseDecision(pack).open),
      `open missing for ${JSON.stringify(pack)}`);
  }
});

test("false is refused, and only OPEN flags are reasons", () => {
  const d = releaseDecision({
    version: 7,
    audit: {
      summary: { can_be_quoted: false },
      flags: [
        { key: "end_use", field: "End use", status: "missing", why: "req" },
        { key: "name", field: "Product name", status: "present" },
      ],
    },
  });
  assert.equal(d.state, "refused");
  assert.equal(d.version, 7);
  assert.deepEqual(d.open.map((f) => f.key), ["end_use"]);
});

test("true is ready", () => {
  const d = releaseDecision({ version: 3,
    audit: { summary: { can_be_quoted: true }, flags: [] } });
  assert.equal(d.state, "ready");
});

test("an absent verdict is 'unsaid', never a refusal with painted reasons", () => {
  const d = releaseDecision({ version: 1, audit: {} });
  assert.equal(d.state, "unsaid");
  const noAudit = releaseDecision({ version: 1 });
  assert.equal(noAudit.state, "unsaid");
});
