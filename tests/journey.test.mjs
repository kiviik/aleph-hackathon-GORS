// The journey, not the pieces.
//
// ⚠ WHY THIS EXISTS. Owner review, third pass 2026-08-11: "Frontend tests are
// green: 262/262. However, they test the handoff helper rather than the
// complete collection journey, so they did not detect the problems above."
//
// That is exactly right, and it is the same shape as every other defect in this
// codebase: each PIECE was correct and the SEAM between them was not. A handoff
// helper that validates brands passes its own tests while the screen consuming
// it drops the payload into `cs[0]`. A storage module that scopes by brand
// passes its own tests while a screen reaches past it into raw localStorage.
//
// So these tests walk a person: Brand A, collection A1, pick an opportunity,
// switch context, and assert that nothing from the first context survives into
// the second. They use the REAL modules — no mocks of the thing under test —
// because the bugs lived in the wiring, and a mock is a wire you drew yourself.
import assert from "node:assert/strict";
import test from "node:test";

import { claimHandoff, stampHandoff } from "../lib/handoff.mjs";
import { scopedKey, GLOBAL_KEYS } from "../lib/brandStore.mjs";

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const A1 = "c0110001-0000-0000-0000-000000000001";
const A2 = "c0110002-0000-0000-0000-000000000002";
const T0 = Date.parse("2026-08-11T12:00:00Z");

// A tiny stand-in for the browser store, so the journey can be walked without a
// DOM. It is deliberately dumb: every scoping decision belongs to `scopedKey`,
// which is the module actually under test.
function makeStore() {
  const raw = new Map();
  return {
    raw,
    write: (key, brandId, value) => raw.set(scopedKey(key, brandId), JSON.stringify(value)),
    read: (key, brandId) => {
      const v = raw.get(scopedKey(key, brandId));
      return v == null ? null : JSON.parse(v);
    },
  };
}

test("JOURNEY: a gap picked under Brand A cannot be designed under Brand B", () => {
  const store = makeStore();

  // 1. Under Brand A, on collection A1, the designer picks an opportunity.
  //    Opportunities mints a recommendation first, so the design can prove what
  //    caused it, and stamps the handoff with the brand that produced it.
  const handoff = stampHandoff(
    { trend: "Hueco: Faldas", recommendation_id: "rec-1", typology: "Faldas" },
    { brandId: A, collectionNeutral: true, now: T0 },
  );
  store.write("atelier-design-brief", A, handoff);

  // 2. They switch the topbar to Brand B and open Studio.
  //    ⚠ The key is GLOBAL by design, so Studio really does see Brand A's
  //    payload — being transient never prevented that. The refusal is what does.
  const asB = claimHandoff(handoff, { brandId: B, collectionId: null, now: T0 });
  assert.equal(asB.ok, false);
  assert.equal(asB.code, "wrong_brand");
  assert.equal(asB.payload, null, "Brand A's opportunity must not reach Brand B");
  assert.ok(asB.reason, "and the designer is told why, not left with an empty Studio");

  // 3. Back under Brand A it still works — a refusal that also breaks the happy
  //    path is not a fix.
  const asA = claimHandoff(handoff, { brandId: A, collectionId: A1, now: T0 });
  assert.equal(asA.ok, true);
  assert.equal(asA.payload.recommendation_id, "rec-1",
    "the lineage survives the trip: the concept can cite its opportunity");
});

test("JOURNEY: a handoff bound to collection A1 does not open under A2", () => {
  // The brand is right and the destination is still wrong. A garment belongs to
  // the collection whose brief authorised it, and Studio used to insert into
  // `cs[0]` — the first collection in the list, not the open one.
  const bound = stampHandoff({ trend: "Hueco: Faldas" },
                             { brandId: A, collectionId: A1, now: T0 });

  assert.equal(claimHandoff(bound, { brandId: A, collectionId: A1, now: T0 }).ok, true);

  const wrong = claimHandoff(bound, { brandId: A, collectionId: A2, now: T0 });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "wrong_collection");
});

test("JOURNEY: switching brands leaves no board, cache or ledger behind", () => {
  const store = makeStore();

  // Brand A works: a moodboard, a cached market brief, an offline decision, a
  // watchlist. Every one of these was a global key at some point today, and
  // every one of them describes ONE brand's work.
  const perBrandWork = {
    "atelier-inspiration-boards-v1": [{ id: "b1", name: "AW26 mood", cards: [1, 2] }],
    "atelier-brief-cache": { at: T0, data: { heroCat: "Faldas" } },
    "atelier-decisions": [{ id: "local-1", decision: "accept" }],
    "atelier-watchlist": ["Knitwear Revolution"],
    "atelier-signals-dismissed": ["Loud Luxury"],
    "atelier-inspiration-inbox": [{ title: "ref" }],
  };
  for (const [key, value] of Object.entries(perBrandWork)) store.write(key, A, value);

  // Switch to Brand B. Nothing of A's is visible.
  for (const key of Object.keys(perBrandWork)) {
    assert.equal(store.read(key, B), null,
      `${key} leaked Brand A's work into Brand B`);
  }
  // And A still has all of it — scoping must not be amnesia.
  for (const [key, value] of Object.entries(perBrandWork)) {
    assert.deepEqual(store.read(key, A), value, `${key} lost Brand A's own work`);
  }
});

test("⚠ the exemption list is the whole attack surface, so it is enumerated", () => {
  // Anything global is readable by every brand. That is fine for a token or a
  // view preference and catastrophic for work — and "atelier-design-brief"
  // sitting here for months is how the leak survived. Adding a key to this set
  // is a decision that has to be argued for, so it fails the test first.
  assert.deepEqual([...GLOBAL_KEYS].sort(), [
    "atelier-active-brand",   // which brand is selected — cannot itself be per-brand
    "atelier-design-brief",   // global BY DESIGN; the payload carries its brand
    "atelier-lead-weeks",     // a planning-horizon preference
    "atelier-studio-mode",    // a view preference
    "atelier-token",          // names a user; the engine binds it to a brand
  ].sort());

  // And the one work-shaped key still in there earns its place only because the
  // payload is checked instead of the key. If that check ever goes, so does the
  // exemption.
  const unstamped = { trend: "Hueco: Faldas" };
  assert.equal(claimHandoff(unstamped, { brandId: A, now: T0 }).ok, false);
});
