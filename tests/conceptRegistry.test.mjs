// The invariant that reconciles the stage rail with the Concept Studio.
//
// The bug (owner, 2026-07-25): the rail read "0 conceptos" for Colección 4
// while Studio read "1/1 con concepto". Two stores answering one question —
// engine `Concept` rows vs the `studio_collections` items document — and the
// frontend only ever wrote a Concept row at approval, without a collection_id.
//
// The rule now: the board is authoritative, and the engine's rows are a
// COMPLETE projection of it. So for an engine-backed collection,
//
//     number of engine Concept rows for the collection
//       === the numerator Studio prints in "N/M con concepto"
//
// These tests assert that equality and the two ways it used to break.
import test from "node:test";
import assert from "node:assert/strict";

import {
  boardConceptCount, hasConcept, reconciles, registrableVersions, unregistered,
  versionKey, versionRecords,
} from "../lib/conceptRegistry.mjs";

const version = (over = {}) => ({
  id: "v-1", kind: "concepto", url: "/static/studio/a.png",
  ts: "2026-07-24T17:31:44.633Z", note: "tela · negro", prompt: "p",
  references: [], provider: "engine", quality: "draft", cost_cents: 1,
  by: "Diseñadora 01", ...over,
});

const board = (over = {}) => ({
  id: "coll-1", name: "Colección 4",
  items: [
    { id: "it-1", name: "Calzado", silhouette: "Calzado", cover: "/static/studio/a.png", images: [version()] },
    { id: "it-2", name: "Sin concepto", silhouette: "Remera", cover: null, images: [] },
  ],
  ...over,
});

test("an item is a concept exactly when it has a cover", () => {
  assert.equal(hasConcept({ cover: "/x.png" }), true);
  assert.equal(hasConcept({ cover: null, images: [version()] }), false);
  assert.equal(hasConcept(null), false);
  // The number Studio prints counts only those.
  assert.equal(boardConceptCount(board()), 1);
});

test("the engine's rows for the collection equal the number Studio prints", () => {
  const b = board();
  // The state that shipped the bug: the board has a concept, the engine has
  // nothing, and both screens were confidently reporting their own store.
  assert.equal(reconciles(b, []), false);
  assert.deepEqual(unregistered(b, []).map((i) => i.id), ["it-1"]);

  // After the projection lands there is one row, and it reconciles.
  const projected = [{ client_key: "it-1", collection_id: "coll-1" }];
  assert.equal(reconciles(b, projected), true);
  assert.deepEqual(unregistered(b, projected), []);
});

test("a Concept row with no collection link does not count and is repaired", () => {
  // The quieter half of the bug: `approveConceptVersion` upserts with
  // `collection_name` only, so the row it creates is invisible to every
  // collection-scoped query (Concept.collection_id IS NULL).
  const orphan = [{ client_key: "it-1", collection_id: null, collection_name: "Colección 4" }];
  assert.equal(reconciles(board(), orphan), false);
  assert.deepEqual(unregistered(board(), orphan).map((i) => i.id), ["it-1"]);

  // Another collection's row must not be counted here either.
  const elsewhere = [{ client_key: "it-1", collection_id: "coll-2" }];
  assert.equal(reconciles(board(), elsewhere), false);
});

test("rows belonging to other collections never inflate this one", () => {
  const mixed = [
    { client_key: "it-1", collection_id: "coll-1" },
    { client_key: "other-a", collection_id: "coll-9" },
    { client_key: "other-b", collection_id: "coll-9" },
  ];
  assert.equal(reconciles(board(), mixed), true);
});

test("a legacy version with no id still gets a stable, content-derived key", () => {
  // Versions written before lib/version.js existed carry no id. We do not mint
  // one into stored work to make a count come out — the key is derived from the
  // version's own url + timestamp, so it is the same on every pass and the
  // append stays idempotent.
  const legacy = { kind: "concepto", url: "/static/studio/b.png", ts: "2026-07-22T01:02:27.949Z" };
  const key = versionKey(legacy);
  assert.match(key, /^v-legacy-/);
  assert.equal(versionKey({ ...legacy }), key);
  assert.notEqual(versionKey({ ...legacy, url: "/static/studio/c.png" }), key);
  // An id, when present, always wins — that is the real client_key.
  assert.equal(versionKey(version({ id: "v-abc" })), "v-abc");
  // Nothing immutable to key on: not registrable, and never invented.
  assert.equal(versionKey({ kind: "concepto" }), null);
  assert.deepEqual(registrableVersions({ images: [{ kind: "concepto" }] }), []);
});

test("version bodies carry real provenance, oldest first, and nothing invented", () => {
  const item = {
    id: "it-1",
    images: [version({ id: "v-2", kind: "modelo", url: "/b.png" }), version({ id: "v-1" })],
  };
  const rows = versionRecords(item);
  // The board prepends the newest; an append-only ledger reads oldest first.
  assert.deepEqual(rows.map((r) => r.client_key), ["v-1", "v-2"]);
  assert.equal(rows[0].provider, "engine");
  // Provenance the client CAN attest (which model, what it cost) travels.
  // Authorship does not: `v.by` is a local label, and the engine takes the
  // author from the authenticated session instead (2026-08-14).
  assert.ok(!("created_by" in rows[0]), "the body must not assert an author");
  // Absent provenance stays null rather than being filled with a plausible value.
  const bare = versionRecords({ images: [{ id: "v-9", url: "/c.png" }] })[0];
  assert.equal(bare.prompt, null);
  assert.equal(bare.provider, null);
  assert.equal(bare.cost_cents, null);
  assert.equal(bare.kind, "concepto");
});

test("an empty board reconciles with an empty engine — not a special case", () => {
  const empty = { id: "coll-3", name: "Con token", items: [] };
  assert.equal(boardConceptCount(empty), 0);
  assert.equal(reconciles(empty, []), true);
  assert.deepEqual(unregistered(empty, []), []);
});
