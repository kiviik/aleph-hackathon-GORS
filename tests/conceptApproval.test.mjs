// The body an approval sends — and the one field whose absence made approved
// concepts uncountable.
//
// THE BUG (flagged 2026-07-25, unassigned): `approveConceptVersion` in
// `lib/concepts.js` built its own POST body and sent `collection_name` without
// `collection_id`. The engine keeps the name as a historical label; every
// collection-scoped query joins on the ID (migration 0028). So a concept
// approved from the Review Room landed with a label and no link — present in
// Studio, absent from the command centre, the portfolio, the stage rail and
// the approvals count, with nothing anywhere reporting an error.
//
// DesignStudio never showed the symptom because it calls `registerBoardConcept`
// first and the engine preserves an existing link when a later body omits the
// field. `Review.jsx:141` calls the approval path directly and had no cover,
// which is why the same action produced different data depending on which
// screen you were standing on.
//
// The fix is one shared builder rather than a second correct one, so these
// tests pin `conceptRecord` — the thing both paths now use.
import assert from "node:assert/strict";
import test from "node:test";

import { conceptRecord } from "../lib/conceptRegistry.mjs";

const coll = { id: "coll-7", name: "AW26 · Volver a la raíz" };
const item = { id: "it-1", name: "Remera banda", silhouette: "Remeras",
               ownerId: "Diseñadora 01" };

test("the concept body carries the collection ID, not only its name", () => {
  const body = conceptRecord(coll, item);
  assert.equal(body.collection_id, "coll-7");
  assert.equal(body.collection_name, "AW26 · Volver a la raíz");
});

test("a name without an id is exactly the state that used to ship", () => {
  // Guards the regression rather than the fix: if someone reintroduces a body
  // with a label and no link, this is the shape it would have.
  const body = conceptRecord(coll, item);
  assert.notEqual(body.collection_id, null,
    "a concept with a collection name and no id is invisible to every " +
    "collection-scoped query");
});

test("no collection at all is null, never undefined or a guess", () => {
  // A loose concept is a real state — Studio can hold work that belongs to no
  // collection yet. It has to be expressible, and it must not be filled in.
  const body = conceptRecord(null, item);
  assert.equal(body.collection_id, null);
  assert.equal(body.collection_name, null);
});

test("the client never claims who authored a concept", () => {
  // This path used to override `created_by` with the APPROVER's name, so the
  // person who signed a design was recorded as having drawn it — and any caller
  // could name anyone at all. Authorship now comes from the authenticated
  // session server-side (engine 2026-08-14), so the body must not carry the
  // field: a value here would be silently ignored, which is worse than absent
  // because the next reader would assume it was sent for a reason.
  const base = conceptRecord(coll, item);
  assert.ok(!("created_by" in base), "the body must not assert an author");
  // `ownerId` is a local board label and stays local — it is not an identity.
  assert.ok(!Object.values(base).includes("Diseñadora 01"));
});
