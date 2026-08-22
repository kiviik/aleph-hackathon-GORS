// The decision path, driven end to end with fake transports.
//
// The 2026-07-24 audit's finding #5: "the critical frontend changes have no
// dedicated tests… these should be component/integration tests, not source-text
// assertions." It was right, and the reason was structural — the whole flow
// lived inside Feed.jsx, in a repo whose only test runner is `node --test` over
// pure modules. Extracting lib/decisionFlow.mjs is what makes these possible;
// they drive the REAL code and assert on what it did, not on how it reads.
//
// Every test below is one of the five the audit asked for, or the rule that
// makes it matter: an operational bet is the SERVER'S to grant.
import test from "node:test";
import assert from "node:assert/strict";

import {
  NO_SERVER_EVIDENCE, pipelineCardFrom, planDecision, recordDecision,
} from "../lib/decisionFlow.mjs";

// ---- harness --------------------------------------------------------------- //

const RECOMMENDABLE = {
  key: "prod-abc", qty: { range: "40–60" },
  trust: { stance: "recommend" },
  item: { title: "Vestido midi", product_type: "Vestidos", image_url: "x.jpg" },
};

function harness({ mint, post, live = true, brandId = "brand-1" } = {}) {
  const calls = { mint: [], post: [], appended: [], patches: [], promoted: [] };
  const deps = {
    live, brandId,
    mint: mint || (async (b, subject) => (calls.mint.push([b, subject]), { id: "rec-1" })),
    post: post || (async (b, payload) => (calls.post.push([b, payload]), { decision: payload.decision })),
    appendLocal: (rec, b) => calls.appended.push([rec, b]),
    patchStatus: (id, patch, b) => calls.patches.push([id, patch, b]),
    onOptimistic: () => {},
    promote: (rec) => calls.promoted.push(rec),
    uuid: () => "id-1",
    now: () => "2026-07-24T10:00:00.000Z",
  };
  return { deps, calls };
}

// ---- fail closed: the audit's finding #1 ----------------------------------- //

test("an accept with no server recommendation never becomes an operational bet", async () => {
  // mintRecommendation() returns null on ANY failure — a 500, a migration
  // mid-flight, a network blip. That used to fall through to the legacy
  // client-evidence path, restoring the exact hole the boundary closed.
  const { deps, calls } = harness({ mint: async () => null });

  const { recorded } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);

  assert.equal(recorded, "watch");
  assert.equal(calls.promoted.length, 0, "no pipeline card");
  const [, payload] = calls.post[0];
  assert.equal(payload.decision, "watch", "the server is asked for research, not a bet");
  assert.equal(payload.recommendationId, null);
  assert.equal(payload.candidate.testQty, null, "no quantity implies no commitment");
});

test("the downgrade reason says nobody judged it, not that the garment is weak", async () => {
  const { deps } = harness({ mint: async () => null });
  const { record, notice } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);
  assert.equal(record.reason, NO_SERVER_EVIDENCE);
  assert.match(notice, /no pudo evaluarlo/);
});

test("a candidate that clears the gates and IS judged becomes a bet", async () => {
  const { deps, calls } = harness();
  const { recorded } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);
  assert.equal(recorded, "accept");
  assert.equal(calls.promoted.length, 1);
  assert.equal(calls.post[0][1].recommendationId, "rec-1");
  assert.equal(calls.post[0][1].candidate.testQty, 40, "the low bound of the test band");
});

// ---- the server's verdict controls the pipeline ---------------------------- //

test("a server downgrade keeps the card out of the pipeline", async () => {
  // The client asked for accept and cleared its own gates; the engine, judging
  // its own evidence, says watch. The engine wins.
  const { deps, calls } = harness({ post: async () => ({ decision: "watch" }) });

  const { recorded, notice } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);

  assert.equal(recorded, "watch");
  assert.equal(calls.promoted.length, 0);
  assert.match(notice, /El motor registró "watch"/);
  assert.equal(calls.patches.at(-1)[1].decision, "watch",
               "the stored row records the server's verdict, not the request");
});

test("a failed POST records nothing operational and returns no verdict", async () => {
  const { deps, calls } = harness({
    post: async () => { throw new Error("decision save failed: 500"); } });

  const { recorded } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);

  assert.equal(recorded, null, "undecided — no server ever agreed to this");
  assert.equal(calls.promoted.length, 0);
  assert.equal(calls.patches.at(-1)[1].status, "failed");
});

test("a 409 on stale evidence leaves the retry loop instead of replaying forever", async () => {
  const stale = Object.assign(new Error("vencida"), { status: 409, stale: true });
  const { deps, calls } = harness({ post: async () => { throw stale; } });

  const { recorded } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);

  assert.equal(recorded, null);
  assert.equal(calls.patches.at(-1)[1].status, "stale",
               "not 'failed': retrying replays a verdict nobody stands behind");
});

// ---- offline: the ask is kept, the commitment is not ------------------------ //

test("an offline accept is queued verbatim and grants nothing yet", async () => {
  const { deps, calls } = harness({ live: false });

  const { recorded, record, notice } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "accept" }, deps);

  assert.equal(recorded, null, "nothing was confirmed, so nothing was recorded");
  assert.equal(calls.promoted.length, 0, "no card on a verdict no server has seen");
  assert.equal(calls.post.length, 0);
  assert.equal(record.decision, "accept", "the ask survives for the outbox to send");
  assert.equal(record.status, "local");
  assert.match(notice, /en cola/);
});

test("offline, the local gate still refuses an unrecommendable accept", async () => {
  const { deps } = harness({ live: false });
  const weak = { ...RECOMMENDABLE, trust: { stance: "directional" } };
  const { record } = await recordDecision({ candidate: weak, decision: "accept" }, deps);
  assert.equal(record.decision, "watch");
  assert.match(record.reason, /research-only: directional/);
});

// ---- the local gate, unchanged ---------------------------------------------- //

test("planDecision separates the three reasons an accept is refused", () => {
  const weak = { ...RECOMMENDABLE, trust: { stance: "insufficient" } };
  assert.equal(planDecision({ candidate: weak, decision: "accept", live: true,
                              recommendation: { id: "r" } }).downgraded, "gates");
  assert.equal(planDecision({ candidate: RECOMMENDABLE, decision: "accept", live: true,
                              recommendation: null }).downgraded, "no-server");
  assert.equal(planDecision({ candidate: RECOMMENDABLE, decision: "accept", live: false,
                              recommendation: null }).downgraded, null);
});

test("a reject is never blocked by the evidence gates", async () => {
  const { deps, calls } = harness({ mint: async () => null });
  const { recorded } = await recordDecision(
    { candidate: RECOMMENDABLE, decision: "reject", reason: "no es la marca" }, deps);
  assert.equal(recorded, "reject");
  assert.equal(calls.promoted.length, 0);
});

// ---- the pipeline card ------------------------------------------------------ //

test("one card shape covers both candidate kinds", () => {
  const product = pipelineCardFrom(RECOMMENDABLE, "t");
  assert.equal(product.title, "Vestido midi");
  assert.equal(product.cat, "Vestidos");
  assert.equal(product.gd, "women", "the product path used to drop this");

  const trendCard = pipelineCardFrom({
    key: "t-1", trend: "Crochet", qty: { range: "20–30" },
    suggestion: { cat: "Tops", gd: "men", fabric: "algodón" },
    colorways: [{ hex: "#abc" }], item: { competitor: "Rival" },
  }, "t");
  assert.equal(trendCard.title, "Crochet");
  assert.equal(trendCard.gd, "men");
  assert.equal(trendCard.color, "#abc");
});
