// "Raw fields such as `velocityBasis: published` should never reach the client
// UI." (owner review, 2026-08-14, on Hoy — the decision screen.)
//
// Hoy renders whatever shape the engine puts in `evidence`, and its recursive
// formatter printed every key verbatim, so the owner's primary decision read:
//   name: Oversized Chic · stage: Emerging · velocity: 0 · velocityBasis: published
// The old code did key.replaceAll("_", " "), which does nothing whatsoever for
// camelCase — so anything the engine names in camelCase leaked intact.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../components/views/Today.jsx", import.meta.url), "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("engine keys are humanised through one function, not inline", () => {
  assert.match(code, /const humanKey\s*=/, "humanKey must exist");
  // The two render paths — nested objects inside fmt(), and the top-level
  // chip headings in rows(). Both leaked; both must go through it.
  const uses = (code.match(/humanKey\(/g) || []).length;
  assert.ok(uses >= 2,
    `humanKey is used ${uses} time(s); both fmt() and rows() must use it`);
});

test("the camelCase-blind replacement is gone", () => {
  assert.ok(!/key\.replaceAll\("_", " "\)(?!\s*\.replace)/.test(code),
    'a bare key.replaceAll("_", " ") is back — it does nothing for camelCase');
  assert.match(code, /\[a-z0-9\]\)\(\[A-Z\]/,
    "humanKey must split camelCase, which is how velocityBasis leaked");
});

test("known engine tokens have Spanish, in a table not scattered literals", () => {
  assert.match(code, /const FIELD_LABELS\s*=/);
  assert.match(code, /const VALUE_LABELS\s*=/);
  // The specific leak the owner reported, and the enum value beside it.
  assert.match(code, /velocityBasis\s*:/, "the reported field needs a label");
  assert.match(code, /published\s*:/, "its enum value needs one too");
});

test("nothing is dropped for lacking a translation", () => {
  // Hiding an untranslated field would be worse than showing it awkwardly:
  // the evidence IS the card. humanKey must always return a string.
  assert.match(code, /FIELD_LABELS\[key\]\s*\|\|/,
    "humanKey must fall back rather than return undefined for unknown keys");
});
