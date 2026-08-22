// Transient is not tenant-safe.
//
// Owner review 2026-08-11: `atelier-design-brief` sits in
// `brandStore.GLOBAL_KEYS` on the reasoning that it is "a one-shot handoff
// between two screens in one session". That describes its LIFETIME and says
// nothing about its TENANT, and the four steps below need no unusual timing:
//
//   1. pick an opportunity under Brand A   (writes the handoff)
//   2. switch the topbar to Brand B
//   3. open Studio                          (reads it)
//   4. design Brand A's opportunity against Brand B's DNA, palette and catalogue
//
// Nothing expires between 1 and 3, so nothing about being transient prevented
// it. These tests pin the rule that does.
import assert from "node:assert/strict";
import test from "node:test";

import { claimHandoff, stampHandoff, HANDOFF_TTL_MS } from "../lib/handoff.mjs";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C1 = "ccccccc1-0000-0000-0000-000000000001";
const C2 = "ccccccc2-0000-0000-0000-000000000002";
const T0 = Date.parse("2026-08-11T10:00:00Z");

test("the exact four-step leak the review described is refused", () => {
  const written = stampHandoff({ trend: "Hueco: Faldas" },
                               { brandId: A, collectionNeutral: true, now: T0 });
  // Same second — nothing has expired, which is the whole point.
  const claim = claimHandoff(written, { brandId: B, now: T0 });

  assert.equal(claim.ok, false);
  assert.equal(claim.code, "wrong_brand");
  assert.equal(claim.payload, null, "the payload must not reach the caller");
  assert.equal(claim.fromBrandId, A, "the reader can say where it came from");
  assert.match(claim.reason, /otra marca/);
});

test("the same handoff under its own brand goes through", () => {
  const written = stampHandoff({ trend: "Hueco: Faldas" },
                               { brandId: A, collectionNeutral: true, now: T0 });
  const claim = claimHandoff(written, { brandId: A, collectionId: C1, now: T0 });
  assert.equal(claim.ok, true);
  assert.equal(claim.payload.trend, "Hueco: Faldas");
});

// ---------------------------------------------------------------------------
// Collection identity — the right brand is not the right place
// ---------------------------------------------------------------------------

test("⚠ a handoff for another collection of the SAME brand is refused", () => {
  // The brand check passes and the destination is still wrong: a garment
  // belongs to the collection whose brief authorised it.
  const written = stampHandoff({ trend: "Hueco: Faldas" },
                               { brandId: A, collectionId: C1, now: T0 });
  const claim = claimHandoff(written, { brandId: A, collectionId: C2, now: T0 });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "wrong_collection");
  assert.equal(claim.payload, null);
});

test("⚠ a handoff that names NEITHER a collection nor neutrality is refused", () => {
  // The first version of this accepted `collection_id` and no producer supplied
  // it, so the field existed and meant nothing while the reader dropped
  // everything into `cs[0]`. Silence is not "anywhere is fine" — it is a
  // producer that never decided, and it fails closed like an unstamped brand.
  const written = stampHandoff({ trend: "Hueco: Faldas" }, { brandId: A, now: T0 });
  const claim = claimHandoff(written, { brandId: A, collectionId: C1, now: T0 });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "no_collection_identity");
});

test("a collection-neutral handoff lands wherever the designer is standing", () => {
  // Market screens say "design this"; WHERE is the designer's call. The reader
  // puts it in the ACTIVE collection — which is the half `cs[0]` got wrong.
  const written = stampHandoff({ trend: "Referencia" },
                               { brandId: A, collectionNeutral: true, now: T0 });
  for (const target of [C1, C2, null]) {
    assert.equal(claimHandoff(written, { brandId: A, collectionId: target, now: T0 }).ok,
                 true, `neutral handoff refused for ${target}`);
  }
});

test("⚠ an unstamped handoff is REFUSED, not trusted", () => {
  // Fails closed on purpose. Six screens write this key and one reads it, so
  // the check lives with the reader — and a payload from an older build, or
  // from a producer somebody adds next month, cannot prove its origin.
  // "Probably this one" is the assumption that caused the bug.
  const legacy = { trend: "Hueco: Faldas", at: new Date(T0).toISOString() };
  const claim = claimHandoff(legacy, { brandId: A, now: T0 });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "unverifiable");
  assert.match(claim.reason, /no dice de qué marca/);
});

test("a stale handoff is refused even under the right brand", () => {
  // Replaying a forgotten intention as if it were fresh is its own small lie:
  // the person went elsewhere and came back, and the evidence has moved.
  const written = stampHandoff({ trend: "Hueco: Faldas" },
                               { brandId: A, collectionNeutral: true, now: T0 });
  const claim = claimHandoff(written, { brandId: A, now: T0 + HANDOFF_TTL_MS + 1 });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "expired");
});

test("nothing at all is not an error worth explaining", () => {
  // No handoff is the normal case — opening Studio directly. It must not
  // produce a refusal message.
  const claim = claimHandoff(null, { brandId: A, now: T0 });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "empty");
  assert.equal(claim.reason, null);
});

test("every producer of the design brief stamps it", async () => {
  // The reader fails closed, so an unstamped producer is a broken path rather
  // than a silent leak — but a broken path is still broken. This enumerates
  // them so adding a seventh producer without stamping fails here.
  const { readFileSync, readdirSync } = await import("node:fs");
  const roots = ["components", "components/views"];
  const offenders = [];
  for (const dir of roots) {
    for (const f of readdirSync(new URL(`../${dir}`, import.meta.url))) {
      if (!f.endsWith(".jsx")) continue;
      const path = `${dir}/${f}`;
      const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      // A write to the handoff key that is not wrapped in stampHandoff.
      const writes = src.match(/setItem\(BRIEF_KEY,\s*JSON\.stringify\(([\s\S]{0,40})/g) || [];
      for (const w of writes) {
        if (!/stampHandoff/.test(w)) offenders.push(path);
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    "these write the Studio handoff without stamping the brand that produced it");
});
