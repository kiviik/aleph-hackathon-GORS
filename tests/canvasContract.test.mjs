// The canvas speaks the engine's vocabulary, or it gets a 422.
//
// ⚠ THESE LISTS ARE READ OFF THE ENGINE, not typed from memory. `role` and
// `lock` are validated by `_validate_vocab` in api/app/generation_intent.py:
// an unknown word is not ignored, it raises IntentRefused and the designer's
// generation fails on a term this repo invented. The failure would arrive as
// a 422 in the middle of her work, days after the frontend "helpfully" added
// "texture" or renamed "print" to "pattern". So the source of truth is the
// engine file, and this test fails the moment the two drift.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { engineFile, skipWithoutEngine } from "./harness/engineTree.mjs";

import {
  BOARD_VERSION, LOCKS, MAX_REFERENCES, REFERENCE_ROLES, boardIntent,
  engineRefusal, exportBoardJson, freshBoard, lockLabel, makeImageCard,
  makeNoteCard, reviveBoard, roleLabel, serializeBoard,
} from "@/lib/canvas.mjs";

function engineTuple(name) {
  const src = readFileSync(engineFile("api/app/generation_intent.py"), "utf8");
  const at = src.indexOf(`${name} = (`);
  assert.ok(at !== -1, `${name} is gone from the engine — this canvas is `
    + "built on a vocabulary that no longer exists");
  const body = src.slice(at, src.indexOf(")", at));
  return [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

test("the reference roles are the engine's, in the engine's order", () => {
  if (skipWithoutEngine("reference roles")) return;
  assert.deepEqual(REFERENCE_ROLES, engineTuple("REFERENCE_ROLES"));
});

test("the locks are the engine's, in the engine's order", () => {
  if (skipWithoutEngine("locks")) return;
  assert.deepEqual(LOCKS, engineTuple("LOCKS"));
});

test("every role and lock has Spanish for the screen", () => {
  // Not for correctness — for the surface. A picker showing `silhouette`
  // beside `tela` reads as an unfinished product, and this is a Spanish-first
  // app. An unknown key still passes through untranslated rather than
  // vanishing, which is what the fallback below checks.
  // `styling` is deliberately not translated: it is the word used in Spanish-
  // speaking studios, exactly like `drop` and `lead time` elsewhere in this
  // app. Translating it would read as worse Spanish, not better.
  const KEPT_IN_ENGLISH = new Set(["styling"]);
  for (const r of REFERENCE_ROLES) {
    if (KEPT_IN_ENGLISH.has(r)) { assert.equal(roleLabel(r), r); continue; }
    assert.notEqual(roleLabel(r), r, `role ${r} is untranslated`);
  }
  for (const l of LOCKS) {
    assert.ok(lockLabel(l), `lock ${l} has no label`);
  }
  assert.equal(roleLabel("invented"), "invented",
    "a word this repo does not know must still be shown, not hidden");
});

test("the reference cap is the engine's max_length", () => {
  if (skipWithoutEngine("reference cap")) return;
  const src = readFileSync(engineFile("api/app/generation_intent.py"), "utf8");
  const m = src.match(/references:\s*list\[Reference\][^\n]*max_length=(\d+)/);
  assert.ok(m, "the references field changed shape in the engine");
  assert.equal(MAX_REFERENCES, Number(m[1]));
});

// ---------------------------------------------------------------------------
// the board as an intent
// ---------------------------------------------------------------------------

const boardWith = (cards, extra = {}) => ({ ...freshBoard(), cards, ...extra });

test("the designer's sentence travels verbatim and alone", () => {
  // The one rule the typed contract exists for. The board's locks, its roles
  // and the collection's name are STRUCTURE; folding any of them into
  // authored_prompt would sign her name to the app's prose.
  const board = boardWith([
    makeImageCard({ assetId: "a1", role: "fabric", strength: 1 }),
  ], { locks: ["silhouette"], exclusions: ["logos"] });
  const { intent } = boardIntent(board, {
    authored: "  hacé la manga más ancha  ", context: "Cápsula Otoño",
  });
  assert.equal(intent.authored_prompt, "hacé la manga más ancha");
  assert.equal(intent.atelier_context, "Cápsula Otoño");
  assert.ok(!intent.authored_prompt.includes("silhouette"));
  assert.ok(!intent.authored_prompt.includes("Otoño"));
  assert.deepEqual(intent.locks, ["silhouette"]);
  assert.deepEqual(intent.exclusions, ["logos"]);
});

test("nothing is generated from an empty prompt", () => {
  const board = boardWith([makeImageCard({ assetId: "a1" })]);
  assert.equal(boardIntent(board, { authored: "   " }).intent, null,
    "a board full of references and no sentence is a form, not a request");
});

test("an untagged reference is sent with no role, never a guessed one", () => {
  // undefined = not asked. Defaulting to "garment" would put a word in the
  // compiled prompt that the receipt would then attribute to the designer.
  const board = boardWith([makeImageCard({ assetId: "a1" })]);
  const { intent } = boardIntent(board, { authored: "x" });
  assert.equal(intent.references[0].role, undefined);
  assert.equal(intent.references[0].asset_id, "a1");
});

test("a browser-only image is reported as skipped, never dropped in silence", () => {
  // A `blob:` address is neither an asset_id nor a url the engine can fetch.
  // Sending fewer references than the board shows, with no word about it, is
  // the failure: she arranged six references and four were considered.
  const board = boardWith([
    makeImageCard({ assetId: "a1", name: "en la biblioteca" }),
    makeImageCard({ local: true, src: "blob:x", name: "recién soltada" }),
  ]);
  const { intent, references, skipped } = boardIntent(board, { authored: "x" });
  assert.equal(intent.references.length, 1);
  assert.equal(references.length, 1);
  assert.deepEqual(skipped.map((c) => c.name), ["recién soltada"]);
});

test("references past the engine's cap are named, not truncated in silence", () => {
  const cards = Array.from({ length: MAX_REFERENCES + 3 },
    (_, i) => makeImageCard({ assetId: `a${i}`, x: i }));
  const { intent, overflow } = boardIntent(boardWith(cards), { authored: "x" });
  assert.equal(intent.references.length, MAX_REFERENCES);
  assert.equal(overflow.length, 3);
});

test("a lock the engine does not know never reaches the engine", () => {
  const board = boardWith([], { locks: ["silhouette", "vibes"] });
  const { intent } = boardIntent(board, { authored: "x" });
  assert.deepEqual(intent.locks, ["silhouette"]);
});

// ---------------------------------------------------------------------------
// refusals
// ---------------------------------------------------------------------------

test("a typed refusal is rendered in the engine's own sentence", () => {
  assert.equal(engineRefusal({ detail: {
    error: "intent_refused", control: "region",
    reason: "gemini-2.5-flash-image does not document an alpha mask",
  } }), "region: gemini-2.5-flash-image does not document an alpha mask");
  assert.equal(engineRefusal({ detail: {
    error: "capability_unavailable", reason: "no configured model edits regions",
  } }), "no configured model edits regions");
});

test("a plain-string 422 is the engine talking too, and is shown", () => {
  // ⚠ THE STATE THIS SHIPS IN. `operation: "edit"` is not yet in the router's
  // OPERATIONS tuple, so the regional edit answers `unknown operation:
  // 'edit'` — a bare string, which `refusalMessage` correctly ignores because
  // it is not one of the two typed codes. Swallowing it would leave the
  // designer with a spinner that stops and nothing said; worse, retrying it
  // as a whole-image generation would edit everything she masked around.
  assert.equal(engineRefusal({ detail: "unknown operation: 'edit'" }),
    "unknown operation: 'edit'");
});

test("FastAPI's validation array is unpacked, field by field", () => {
  assert.equal(engineRefusal({ detail: [
    { loc: ["body", "mask_data_uri"], msg: "field required" },
    { loc: ["body", "edit_asset_id"], msg: "value is not a valid uuid" },
  ] }), "body.mask_data_uri: field required · "
      + "body.edit_asset_id: value is not a valid uuid");
});

test("an unreadable failure yields null so it routes to normal error handling", () => {
  assert.equal(engineRefusal(null), null);
  assert.equal(engineRefusal({}), null);
  assert.equal(engineRefusal({ detail: [] }), null);
});

// ---------------------------------------------------------------------------
// persistence and export
// ---------------------------------------------------------------------------

test("saving a board drops the pixels and says which card lost them", () => {
  // localStorage holds about five megabytes; one dropped photograph as base64
  // is more than one. A board that ate the quota would take the rest of the
  // brand's browser state with it (lib/brandStore.js returns the quota error
  // for exactly this reason), so the geometry is kept and the bytes are not —
  // and the card is marked `missing` rather than coming back blank.
  const saved = serializeBoard(boardWith([
    makeImageCard({ local: true, src: "blob:abc", name: "foto" }),
    makeImageCard({ assetId: "a1", url: "/brands/b/assets/a1/content" }),
  ]));
  assert.equal(saved.cards[0].src, null);
  assert.equal(saved.cards[0].missing, true);
  assert.equal(saved.cards[1].missing, undefined,
    "a ledger-backed card reloads from the engine and lost nothing");
  assert.equal(saved.cards[1].url, "/brands/b/assets/a1/content");
});

test("a board written by another version is refused, not half-read", () => {
  assert.equal(reviveBoard({ version: BOARD_VERSION + 1, cards: [] }), null);
  assert.equal(reviveBoard(null), null);
  const ok = reviveBoard({ version: BOARD_VERSION, cards: [{ id: "x" }],
                           locks: ["color", "nonsense"] });
  assert.deepEqual(ok.locks, ["color"]);
  assert.equal(ok.cards.length, 1);
});

test("the exported JSON names the ledger row, not the bytes", () => {
  const board = boardWith([
    makeImageCard({ assetId: "a1", url: "/brands/b/assets/a1/content",
                    role: "fabric", strength: 0.6, x: 10, y: 20 }),
    makeImageCard({ local: true, src: "blob:x" }),
    makeNoteCard({ text: "más volumen acá", x: 5, y: 5 }),
  ], { locks: ["print"], exclusions: ["texto"] });
  const json = exportBoardJson(board, { brandId: "b", brandName: "Marca" });

  assert.equal(json.kind, "atelier.canvas.board");
  assert.deepEqual(json.locks, ["print"]);
  const [img, local, note] = json.cards;
  assert.equal(img.asset_id, "a1");
  assert.equal(img.role, "fabric");
  assert.equal(img.browser_only, false);
  assert.equal(local.browser_only, true,
    "a reader must be able to tell which cards the engine never saw");
  assert.equal(note.kind, "note");
  assert.equal(note.text, "más volumen acá");
  // No base64 anywhere: the file is a document, not a container.
  assert.ok(!JSON.stringify(json).includes("blob:"));
});
