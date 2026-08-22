// The guard that stops one tenant's brand id being paired with another
// tenant's collection id.
import assert from "node:assert/strict";
import test from "node:test";

import { canQueryCollection } from "@/lib/collectionScope";

const A = "brand-a", B = "brand-b", COLL_A = "coll-a", COLL_B = "coll-b";
const listA = [{ id: COLL_A, name: "AW26" }];

// Shorthand: a coherent scope for brand A, overridable per test.
const scope = (o = {}) => ({
  brandId: A, activeId: COLL_A, collections: listA,
  collectionsBrandId: A, loading: false, ...o,
});

test("the exact brand-switch race is refused", () => {
  // The render that produced the live 404s: the NEW brand's id paired with the
  // PREVIOUS brand's collection, because activeId is cleared an effect later.
  assert.equal(canQueryCollection({
    brandId: A, activeId: COLL_B, collections: listA,
    collectionsBrandId: A, loading: false,
  }), false);
});

test("a coherent pair is allowed", () => {
  assert.equal(canQueryCollection({
    brandId: A, activeId: COLL_A, collections: listA,
    collectionsBrandId: A, loading: false,
  }), true);
});

test("nothing is asked while the list is still loading", () => {
  // Mid-load the list is the previous brand's or empty, so it cannot vouch for
  // any id — including one that will turn out to be valid.
  assert.equal(canQueryCollection({
    brandId: A, activeId: COLL_A, collections: listA,
    collectionsBrandId: A, loading: true,
  }), false);
});

test("a non-empty list does not make an outside id valid", () => {
  // The failure a count-based check would let through.
  assert.equal(canQueryCollection({
    brandId: A, activeId: "ghost",
    collections: [{ id: "x" }, { id: "y" }], collectionsBrandId: A, loading: false,
  }), false);
});

test("a list that could not be loaded refuses rather than guesses", () => {
  // null is "could not ask", and it is not evidence that the id is good.
  for (const collections of [null, undefined, "nope"]) {
    assert.equal(canQueryCollection({
      brandId: A, activeId: COLL_A, collections, collectionsBrandId: A, loading: false,
    }), false);
  }
});

test("a brand with genuinely no collections asks nothing", () => {
  assert.equal(canQueryCollection({
    brandId: A, activeId: COLL_A, collections: [], collectionsBrandId: A, loading: false,
  }), false);
});

test("missing halves are refused, and the call never throws", () => {
  assert.equal(canQueryCollection(scope({ brandId: null })), false);
  assert.equal(canQueryCollection(scope({ activeId: null })), false);
  assert.equal(canQueryCollection({}), false);
  assert.equal(canQueryCollection(), false);
});

test("a malformed row in the list does not throw", () => {
  assert.equal(canQueryCollection({
    brandId: A, activeId: COLL_A,
    collections: [null, undefined, { id: COLL_A }], collectionsBrandId: A, loading: false,
  }), true);
});


test("a stale LIST cannot vouch for a stale id — the case a first fix missed", () => {
  // The render the network tab actually showed: the new brand, the previous
  // brand's collection, AND the previous brand's list, which contains that id.
  // Checking membership alone passes here and the request goes out.
  assert.equal(canQueryCollection({
    brandId: B, activeId: COLL_A, collections: listA,
    collectionsBrandId: A, loading: false,
  }), false, "the list belongs to brand A and cannot answer for brand B");
});

test("a list with no stated owner is never trusted", () => {
  assert.equal(canQueryCollection(scope({ collectionsBrandId: null })), false);
  assert.equal(canQueryCollection(scope({ collectionsBrandId: undefined })), false);
});
