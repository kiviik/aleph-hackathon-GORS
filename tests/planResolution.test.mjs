// Two collections, one season, one shared orphan plan — the race, simulated.
//
// The 2026-07-24 audit, finding #4: "if two collections concurrently attempt to
// adopt the same old unlinked plan, one receives a conflict. The frontend then
// returns the now-claimed plan anyway." Exactly right, and the consequence is
// worse than a wrong id: the losing collection loads the WINNER'S season
// targets into an editable screen.
//
// These drive lib/planResolution.mjs with a fake engine that enforces the same
// one-plan-per-(collection, season) rule the real one now has (migration 0030),
// so the conflict is produced rather than asserted.
import test from "node:test";
import assert from "node:assert/strict";

import { resolvePlan } from "../lib/planResolution.mjs";

// A minimal engine: holds plans, refuses a second plan for the same
// (collection, season), and refuses to re-point a plan that is already claimed.
function fakeEngine(seed = []) {
  let n = 0;
  const plans = seed.map((p) => ({ ...p }));
  const conflict = () => Object.assign(new Error("conflict"), { status: 409 });
  const taken = (collectionId, season, exceptId) => plans.some(
    (p) => p.collection_id === collectionId && p.season === season && p.id !== exceptId);

  return {
    plans,
    api: {
      list: async () => ({ items: plans.map((p) => ({ ...p })) }),
      get: async (_b, id) => ({ ...plans.find((p) => p.id === id) }),
      create: async (_b, { season, collectionId, targets }) => {
        if (collectionId && taken(collectionId, season)) throw conflict();
        const plan = { id: `plan-${++n}`, season, collection_id: collectionId || null,
                       targets: targets || {} };
        plans.push(plan);
        return { ...plan };
      },
      attach: async (_b, planId, collectionId) => {
        const plan = plans.find((p) => p.id === planId);
        if (plan.collection_id && plan.collection_id !== collectionId) throw conflict();
        if (taken(collectionId, plan.season, planId)) throw conflict();
        plan.collection_id = collectionId;
        return { ...plan };
      },
    },
  };
}

const ask = (api, collectionId, targets = {}) =>
  resolvePlan({ brandId: "b1", season: "AW26", collectionId, targets }, api);

test("two collections racing for one orphan plan do not end up sharing it", async () => {
  const { api, plans } = fakeEngine([
    { id: "orphan", season: "AW26", collection_id: null, targets: { targetStyles: 40 } },
  ]);

  // Both listed before either claimed — the real interleaving.
  const [a, b] = await Promise.all([ask(api, "coll-A"), ask(api, "coll-B")]);

  assert.notEqual(a.id, b.id, "the loser must not be handed the winner's plan");
  assert.equal(a.collection_id, "coll-A");
  assert.equal(b.collection_id, "coll-B");
  assert.equal(plans.length, 2);
});

test("the loser of the race gets its OWN empty plan, not the winner's targets", async () => {
  // The consequence that made this a P1: the loser's screen would have shown —
  // and let someone edit — another collection's season numbers.
  const { api } = fakeEngine([
    { id: "orphan", season: "AW26", collection_id: null, targets: { targetStyles: 40 } },
  ]);
  const winner = await ask(api, "coll-A");
  const loser = await ask(api, "coll-B");

  assert.equal(winner.targets.targetStyles, 40);
  assert.notDeepEqual(loser.targets, winner.targets);
  assert.equal(loser.collection_id, "coll-B");
});

test("a create that loses to a twin converges on the same plan, not a duplicate", async () => {
  // Two tabs on the same collection: both see no plan, both create. The second
  // gets a 409 from the 0030 index and must re-read, not fork the season.
  const { api, plans } = fakeEngine();
  const [one, two] = await Promise.all([ask(api, "coll-A"), ask(api, "coll-A")]);
  assert.equal(plans.length, 1);
  assert.equal(one.id, two.id);
});

test("an existing plan for this collection is reused, never re-created", async () => {
  const { api, plans } = fakeEngine([
    { id: "mine", season: "AW26", collection_id: "coll-A", targets: { targetStyles: 12 } },
  ]);
  const got = await ask(api, "coll-A");
  assert.equal(got.id, "mine");
  assert.equal(plans.length, 1);
});

test("a pre-0028 orphan is still adopted when nobody is competing for it", async () => {
  const { api, plans } = fakeEngine([
    { id: "orphan", season: "AW26", collection_id: null, targets: {} },
  ]);
  const got = await ask(api, "coll-A");
  assert.equal(got.id, "orphan", "adopted, not orphaned");
  assert.equal(got.collection_id, "coll-A");
  assert.equal(plans.length, 1);
});

test("a plan already owned by another collection is never adopted", async () => {
  const { api } = fakeEngine([
    { id: "theirs", season: "AW26", collection_id: "coll-A", targets: { targetStyles: 40 } },
  ]);
  const got = await ask(api, "coll-B");
  assert.notEqual(got.id, "theirs");
  assert.equal(got.collection_id, "coll-B");
});

test("a non-conflict failure is not swallowed as a race", async () => {
  // A 500 must not quietly mint a second plan — the caller decides what to say.
  const api = {
    list: async () => ({ items: [] }),
    get: async () => { throw new Error("unused"); },
    create: async () => { throw Object.assign(new Error("boom"), { status: 500 }); },
    attach: async () => { throw new Error("unused"); },
  };
  await assert.rejects(() => ask(api, "coll-A"), /boom/);
});

test("no brand and no season resolve to nothing rather than guessing", async () => {
  const { api } = fakeEngine();
  assert.equal(await resolvePlan({ brandId: null, season: "AW26" }, api), null);
  assert.equal(await resolvePlan({ brandId: "b1", season: "" }, api), null);
});
