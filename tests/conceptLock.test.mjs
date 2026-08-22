// The two rules that make an approval mean something (2026-07-24 audit).
//
// Before: approval was `approved: true` on the item JSON — it named no version,
// nothing was locked, and the cover could be replaced afterwards while the badge
// still read "Aprobada". These pin the replacement behaviour.
import assert from "node:assert/strict";
import test from "node:test";

import { coverVersion, shouldIngestImage, touchesDesign } from "../lib/conceptLock.mjs";

test("approval targets the version actually on screen, not just the newest", () => {
  const item = {
    cover: "/img/v2.png",
    images: [
      { id: "v-3", url: "/img/v3.png" }, // newest, generated after the cover was set
      { id: "v-2", url: "/img/v2.png" },
      { id: "v-1", url: "/img/v1.png" },
    ],
  };
  assert.equal(coverVersion(item).id, "v-2");
});

test("with no version there is nothing to approve", () => {
  assert.equal(coverVersion({ cover: null, images: [] }), null);
  assert.equal(coverVersion(undefined), null);
});

test("a cover with no matching version falls back to the newest, never invents one", () => {
  const item = { cover: "/img/uploaded.png", images: [{ id: "v-9", url: "/img/v9.png" }] };
  assert.equal(coverVersion(item).id, "v-9");
});

test("changing the design of an approved concept reopens it", () => {
  // Each of these makes it a different garment.
  for (const patch of [
    { cover: "/img/new.png" },
    { images: [] },
    { colorway: "#000000" },
    { fabricName: "Denim" },
    { precio: "42000" },
    { silhouette: "coat" },
    { name: "Otro nombre" },
  ]) {
    assert.equal(touchesDesign(patch), true, `${Object.keys(patch)[0]} must reopen review`);
  }
});

test("review bookkeeping does not reopen an approved concept", () => {
  // Comments, annotations and ownership are not the garment.
  for (const patch of [
    { reviewComments: [{ id: "c1" }] },
    { annotations: [{ id: "a1", resolved: true }] },
    { ownerId: "mora" },
    { approverId: "lucia" },
    { dueAt: "2026-09-01" },
    { rating: 8 },
  ]) {
    assert.equal(touchesDesign(patch), false, `${Object.keys(patch)[0]} must not reopen review`);
  }
});

test("an empty or missing patch changes nothing", () => {
  assert.equal(touchesDesign({}), false);
  assert.equal(touchesDesign(null), false);
});


test("only browser-trapped pixels get ingested to the ledger", () => {
  // data: URIs exist nowhere but this browser — the orphaned case. An http(s)
  // URL already names bytes living elsewhere; re-uploading would duplicate
  // them under a second identity.
  assert.equal(shouldIngestImage("data:image/png;base64,iVBOR"), true);
  assert.equal(shouldIngestImage("data:image/webp;base64,AAAA"), true);
  assert.equal(shouldIngestImage("http://127.0.0.1:8000/static/x.png"), false);
  assert.equal(shouldIngestImage("https://cdn.example.com/y.jpg"), false);
  assert.equal(shouldIngestImage("data:text/html;base64,PGh0bWw+"), false,
    "a data URI that is not an image is not an image");
  for (const notIt of [null, undefined, 42, {}]) {
    assert.equal(shouldIngestImage(notIt), false);
  }
});
