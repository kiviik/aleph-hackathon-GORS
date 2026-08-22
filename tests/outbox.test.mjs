// The outbox, driven against two brands at once.
//
// The 2026-07-24 P0: the outbox read the GLOBAL storage keys while the writes
// were brand-scoped, so `appendLocalDecision` wrote to one store and
// `setDecisionStatus` patched another — a failed decision was never found
// again and the retry loop retried nothing. It was fixed by threading brandId
// through every function; these tests are what makes that a behaviour rather
// than a claim, by running the real loop over an in-memory store holding two
// brands and asserting nothing crosses.
import test from "node:test";
import assert from "node:assert/strict";

import { STALE, UNJUDGED, isPending, runOutbox } from "../lib/outbox.mjs";

// A brand-keyed store with the same shape lib/ledger.js gives the real loop.
function memStore(byBrand) {
  const rows = new Map(Object.entries(byBrand).map(([b, r]) => [b, r.map((x) => ({ ...x }))]));
  return {
    rows,
    pending: (brandId) => (rows.get(brandId) || []).filter(isPending),
    patch: (id, patch, brandId) => {
      const list = rows.get(brandId) || [];
      const row = list.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    get: (brandId, id) => (rows.get(brandId) || []).find((r) => r.id === id),
  };
}

const queued = (over = {}) => ({
  id: "d1", candidate_key: "prod-1", decision: "accept", status: "pending",
  candidate: { item: { title: "Vestido", product_type: "Vestidos" } },
  ...over,
});

const ok = (decision) => async () => ({ decision });

// ---- brand scoping ---------------------------------------------------------- //

test("the retry reads and patches the brand it was given, and only that one", async () => {
  const store = memStore({
    "brand-a": [queued({ id: "a1" })],
    "brand-b": [queued({ id: "b1" })],
  });
  const posted = [];
  await runOutbox("brand-a", store, {
    post: async (b, payload) => (posted.push([b, payload.candidateKey]), { decision: "accept" }),
    mint: async () => ({ id: "rec-a" }),
  });

  assert.deepEqual(posted, [["brand-a", "prod-1"]], "brand-b was not touched");
  assert.equal(store.get("brand-a", "a1").status, "synced");
  assert.equal(store.get("brand-b", "b1").status, "pending",
               "the other tenant's queue is untouched");
});

test("a failed decision is found again on the next pass", async () => {
  // The exact shape of the P0: patch one store, read another, and the row is
  // invisible forever. Here the second pass must see it.
  const store = memStore({ "brand-a": [queued()] });
  let attempt = 0;
  const post = async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("network down");
    return { decision: "accept" };
  };
  const mint = async () => ({ id: "rec-1" });

  const first = await runOutbox("brand-a", store, { post, mint });
  assert.equal(first.failed, 1);
  assert.equal(store.get("brand-a", "d1").status, "failed");

  const second = await runOutbox("brand-a", store, { post, mint });
  assert.equal(second.synced, 1);
  assert.equal(store.get("brand-a", "d1").attempts, 1);
});

// ---- the evidence boundary survives the queue ------------------------------- //

test("a queued accept is judged before it is sent, not after", async () => {
  const store = memStore({ "brand-a": [queued()] });   // offline: no recommendation_id
  const posted = [];
  await runOutbox("brand-a", store, {
    post: async (_b, payload) => (posted.push(payload), { decision: "accept" }),
    mint: async () => ({ id: "rec-late" }),
  });
  assert.equal(posted[0].recommendationId, "rec-late",
               "never posted on client evidence just because it was offline");
  assert.equal(store.get("brand-a", "d1").recommendation_id, "rec-late");
});

test("a recommendation id already on the row survives the retry unchanged", async () => {
  const store = memStore({ "brand-a": [queued({ recommendation_id: "rec-original" })] });
  const posted = [];
  await runOutbox("brand-a", store, {
    post: async (_b, payload) => (posted.push(payload), { decision: "accept" }),
    mint: async () => ({ id: "rec-SHOULD-NOT-BE-USED" }),
  });
  assert.equal(posted[0].recommendationId, "rec-original",
               "the decision reaches the server on the evidence it was made on");
});

test("an accept the engine cannot judge waits instead of being sent", async () => {
  const store = memStore({ "brand-a": [queued()] });
  const posted = [];
  const out = await runOutbox("brand-a", store, {
    post: async (_b, p) => (posted.push(p), { decision: "accept" }),
    mint: async () => null,                       // minting is down
  });
  assert.equal(posted.length, 0, "fail closed on the retry path too");
  assert.equal(out.failed, 1);
  const row = store.get("brand-a", "d1");
  assert.equal(row.status, "pending", "still queued — it has not been given up on");
  assert.equal(row.last_error, UNJUDGED);
});

test("a reject syncs without needing a recommendation", async () => {
  const store = memStore({ "brand-a": [queued({ decision: "reject" })] });
  const posted = [];
  await runOutbox("brand-a", store, {
    post: async (_b, p) => (posted.push(p), { decision: "reject" }),
    mint: async () => { throw new Error("must not be called"); },
  });
  assert.equal(posted.length, 1);
});

// ---- the pipeline card, exactly once ---------------------------------------- //

test("a confirmed offline accept earns its pipeline card on sync", async () => {
  const store = memStore({ "brand-a": [queued()] });
  const cards = [];
  await runOutbox("brand-a", store, {
    post: ok("accept"), mint: async () => ({ id: "r" }),
    promote: (row, brandId) => cards.push([row.candidate_key, brandId]),
  });
  assert.deepEqual(cards, [["prod-1", "brand-a"]]);
  assert.equal(store.get("brand-a", "d1").promoted, true);
});

test("a retry after a promoted accept does not create a second card", async () => {
  const store = memStore({ "brand-a": [queued({ promoted: true, status: "failed" })] });
  const cards = [];
  await runOutbox("brand-a", store, {
    post: ok("accept"), mint: async () => ({ id: "r" }),
    promote: () => cards.push(1),
  });
  assert.equal(cards.length, 0);
});

test("a server downgrade on retry creates no card", async () => {
  const store = memStore({ "brand-a": [queued()] });
  const cards = [];
  await runOutbox("brand-a", store, {
    post: ok("watch"), mint: async () => ({ id: "r" }),
    promote: () => cards.push(1),
  });
  assert.equal(cards.length, 0);
  assert.equal(store.get("brand-a", "d1").decision, "watch",
               "the row records what the server stored, not what was queued");
});

// ---- stale evidence leaves the loop ------------------------------------------ //

test("a 409 stops the row being retried forever", async () => {
  const store = memStore({ "brand-a": [queued({ recommendation_id: "rec-expired" })] });
  const stale = Object.assign(new Error("vencida"), { status: 409, stale: true });
  const out = await runOutbox("brand-a", store, { post: async () => { throw stale; } });

  assert.equal(out.stale, 1);
  const row = store.get("brand-a", "d1");
  assert.equal(row.status, "stale");
  assert.equal(row.last_error, STALE);
  assert.equal(store.pending("brand-a").length, 0, "it has left the retry queue");
});
