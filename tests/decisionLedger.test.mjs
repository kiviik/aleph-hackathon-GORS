import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalDecisionRows,
  decisionCounts,
} from "../lib/decisionLedger.mjs";

test("double accepts count as one current decision", () => {
  const rows = [
    { candidate_key: "dress-1", decision: "accept", created_at: "2026-07-20T10:00:00Z" },
    { candidate_key: "dress-1", decision: "accept", created_at: "2026-07-20T10:00:01Z" },
  ];

  assert.equal(canonicalDecisionRows(rows).length, 1);
  assert.deepEqual(decisionCounts(rows), { total: 1, accepts: 1, rejects: 0 });
});

test("the latest change of mind is the canonical decision", () => {
  const rows = [
    { candidate_key: "dress-1", decision: "accept", created_at: "2026-07-20T10:00:00Z" },
    { candidate_key: "dress-1", decision: "reject", created_at: "2026-07-20T10:01:00Z" },
    { candidate_key: "dress-1", decision: "accept", created_at: "2026-07-20T10:02:00Z" },
  ];

  const canonical = canonicalDecisionRows(rows);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].decision, "accept");
  assert.deepEqual(decisionCounts(rows), { total: 1, accepts: 1, rejects: 0 });
});

test("outcomes are not counted as taste decisions", () => {
  const rows = [
    { candidate_key: "dress-1", decision: "accept", created_at: "2026-07-20T10:00:00Z" },
    {
      candidate_key: "dress-1",
      decision: "accept",
      created_at: "2026-07-20T10:03:00Z",
      candidate: { kind: "outcome" },
    },
  ];

  assert.deepEqual(decisionCounts(rows), { total: 1, accepts: 1, rejects: 0 });
});
