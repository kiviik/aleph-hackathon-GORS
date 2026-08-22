// The board leaves the browser (engine 0088) — and says which copy is safe.
//
// Until 0088 the canvas persisted to localStorage only, so a designer's
// arrangement did not follow her to another machine and clearing site data
// destroyed a day's thinking with no trace. The engine now stores the document
// opaquely; these tests pin the three answers this layer must keep apart,
// because collapsing them is how a canvas lies about whether the work is safe:
//
//   SAVED       — it is on the server, and we hold the new revision
//   CONFLICT    — somebody wrote after we read, so saving would erase their
//                 work; we refuse and say so instead of winning
//   UNREACHABLE — we are local, and the chip must say local
import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_VERSION, fetchBoard, freshBoard, makeImageCard, pushBoard,
  reconcileBoards,
} from "@/lib/canvas.mjs";

const BRAND = "11111111-1111-1111-1111-111111111111";

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("a first load reports the empty state without inventing a board", async () => {
  const restore = stubFetch(async () => jsonResponse(200, {
    exists: false, document: null, revision: 0, updated_at: null,
  }));
  try {
    const got = await fetchBoard(BRAND);
    assert.equal(got.ok, true);
    assert.equal(got.exists, false);
    assert.equal(got.board, null);
    assert.equal(got.revision, 0);
  } finally { restore(); }
});

test("a stored board is revived here, not trusted as sent", async () => {
  const restore = stubFetch(async () => jsonResponse(200, {
    exists: true, revision: 4, updated_at: "2026-08-18T10:00:00Z",
    updated_by: "Isabella",
    document: { version: BOARD_VERSION, cards: [], strokes: [],
                locks: ["silhouette", "invented-lock"], exclusions: [],
                view: { x: 1, y: 2, k: 1.5 } },
  }));
  try {
    const got = await fetchBoard(BRAND);
    assert.equal(got.revision, 4);
    assert.equal(got.updatedBy, "Isabella");
    // reviveBoard's filter still applies: a lock the engine's vocabulary does
    // not contain would 422 the next generation, so it never enters the board.
    assert.deepEqual(got.board.locks, ["silhouette"]);
  } finally { restore(); }
});

test("a board written by another schema version is unreadable, not half-read", async () => {
  const restore = stubFetch(async () => jsonResponse(200, {
    exists: true, revision: 2, document: { version: BOARD_VERSION + 7, cards: [] },
  }));
  try {
    const got = await fetchBoard(BRAND);
    assert.equal(got.unreadable, true);
    assert.equal(got.board, null);
  } finally { restore(); }
});

test("an unreachable engine is a named state, never a thrown effect", async () => {
  const restore = stubFetch(async () => { throw new Error("ECONNREFUSED"); });
  try {
    const got = await fetchBoard(BRAND);
    assert.equal(got.ok, false);
    assert.equal(got.reason, "unreachable");
    const push = await pushBoard(BRAND, freshBoard(), { revision: 1 });
    assert.equal(push.ok, false);
    assert.equal(push.reason, "unreachable");
  } finally { restore(); }
});

test("the push sends the revision it read, and the serialised document", async () => {
  const seen = {};
  const restore = stubFetch(async (url, options) => {
    seen.url = String(url);
    seen.body = JSON.parse(options.body);
    return jsonResponse(200, { revision: 6 });
  });
  try {
    const board = { ...freshBoard(), cards: [makeImageCard({ url: "https://x/y.jpg" })] };
    const res = await pushBoard(BRAND, board, { revision: 5 });
    assert.equal(res.ok, true);
    assert.equal(res.revision, 6);
    assert.match(seen.url, /expected_revision=5$/);
    assert.equal(seen.body.schema_version, BOARD_VERSION);
    // ⚠ Serialised, so no pixels travel: the engine refuses inline image bytes
    // and a card's `src` is a browser object URL that means nothing elsewhere.
    assert.equal(seen.body.document.cards[0].src, null);
  } finally { restore(); }
});

test("a conflict is refused with the current revision, not retried blind", async () => {
  const restore = stubFetch(async () => jsonResponse(409, {
    detail: { error: "revision_conflict", revision: 9,
              message: "otra sesión guardó este lienzo" },
  }));
  try {
    const res = await pushBoard(BRAND, freshBoard(), { revision: 3 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "conflict");
    // The caller needs the number to be able to reload rather than guess.
    assert.equal(res.revision, 9);
    assert.match(res.message, /otra sesión/);
  } finally { restore(); }
});

test("too large carries the engine's sentence about not truncating", async () => {
  const restore = stubFetch(async () => jsonResponse(413, {
    detail: { error: "board_too_large", limit_bytes: 2000000,
              message: "guardarlo recortado perdería justo lo último" },
  }));
  try {
    const res = await pushBoard(BRAND, freshBoard(), { revision: 1 });
    assert.equal(res.reason, "too_large");
    assert.match(res.message, /recortado/);
  } finally { restore(); }
});

test("the server's copy governs, and a newer local copy is SAID not discarded", () => {
  const remote = { ...freshBoard(), updatedAt: "2026-08-18T10:00:00Z" };
  const local = { ...freshBoard(), updatedAt: "2026-08-18T11:30:00Z" };

  const newer = reconcileBoards(remote, local);
  assert.equal(newer.board, remote, "the shared copy is the one that governs");
  // ⚠ The local work is not thrown away silently — choosing for her is exactly
  // the decision a program should not make about somebody's afternoon.
  assert.equal(newer.localIsNewer, true);

  const older = reconcileBoards(remote, { ...local, updatedAt: "2026-08-17T09:00:00Z" });
  assert.equal(older.localIsNewer, false);
});

test("with only one copy there is nothing to reconcile and it says which", () => {
  const board = freshBoard();
  assert.deepEqual(reconcileBoards(null, board), { board, source: "local", localIsNewer: false });
  assert.deepEqual(reconcileBoards(board, null), { board, source: "engine", localIsNewer: false });
  assert.equal(reconcileBoards(null, null).source, "none");
});
