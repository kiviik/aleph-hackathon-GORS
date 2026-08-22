// The range row is where the product decision originates, so it is where the
// tech pack has to be reachable (owner, 2026-08-14, priority 1).
//
// One function decides the label so the row and the desk cannot drift into
// describing the same pack differently.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { packStateForSlot } from "@/lib/techPackState";

const SLOT = "slot-1";
const draft = (over = {}) => ({
  id: "p1", slot_id: SLOT, version: 1, status: "draft",
  audit: { summary: { by_tier: { blocking: 7 }, can_be_quoted: false } }, ...over,
});

test("a failed lookup never offers to create a second pack", () => {
  // The dangerous state: rendering "could not ask" as "no pack exists" shows a
  // create button, and the engine has no idempotency key on that route — so a
  // click would mint a SECOND root pack for one slot with nothing downstream
  // able to say which is canonical.
  const unknown = packStateForSlot(null, SLOT);
  assert.equal(unknown.kind, "unknown");
  assert.notEqual(unknown.kind, "none");
  assert.match(unknown.label, /sin confirmar/);

  assert.equal(packStateForSlot(undefined, SLOT).kind, "loading");
  assert.equal(packStateForSlot([], SLOT).kind, "none");   // the engine ANSWERED none
});

test("the label counts BLOCKERS, not verified fields", () => {
  // Verifying a field can move 0→1 verified and leave every blocker standing,
  // because a blocker is a MISSING field. A row promising "lista" while the
  // engine would refuse is worse than a row saying nothing.
  const st = packStateForSlot([draft()], SLOT);
  assert.equal(st.kind, "draft");
  assert.match(st.label, /7 bloqueantes/);
  assert.ok(!/verificad/.test(st.label));
});

test("ready, released and revision are distinct", () => {
  assert.match(packStateForSlot([draft({
    audit: { summary: { by_tier: { blocking: 0 }, can_be_quoted: true } },
  })], SLOT).label, /Lista para liberar/);

  assert.match(packStateForSlot([draft({ status: "released" })], SLOT).label,
    /Liberada v1/);

  assert.match(packStateForSlot([draft({ version: 2 })], SLOT).label,
    /Revisión v2/);
});

test("a superseded version never speaks for the slot", () => {
  // Revise mints v+1 and supersedes the prior row, so a slot accumulates
  // versions. The row must describe the CURRENT one.
  const packs = [
    draft({ id: "old", version: 1, status: "superseded" }),
    draft({ id: "new", version: 2, status: "draft" }),
  ];
  const st = packStateForSlot(packs, SLOT);
  assert.equal(st.packId, "new");
  assert.match(st.label, /v2/);
});

test("another slot's pack is never borrowed", () => {
  assert.equal(packStateForSlot([draft({ slot_id: "other" })], SLOT).kind, "none");
});

test("creation is guarded against a double click", () => {
  // The engine has no idempotency key on POST /tech-packs, so the guard is the
  // client's: one in-flight create at a time, and the list is re-read before
  // navigating so returning to the range shows the new state.
  const src = readFileSync(new URL("../components/RangeSlots.jsx", import.meta.url), "utf8");
  assert.match(src, /if \(creatingFor\) return;/);
  assert.match(src, /disabled=\{!!creatingFor\}/);
  assert.match(src, /await loadPacks\(\);\s*\n\s*onNavigate\?\.\(`techpack:/);
});

test("the row opens ITS pack, never the first one", () => {
  const src = readFileSync(new URL("../components/RangeSlots.jsx", import.meta.url), "utf8");
  assert.match(src, /techpack:\$\{st\.packId\}/,
    "the row must navigate to its own pack id");
});
