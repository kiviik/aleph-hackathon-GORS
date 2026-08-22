// "Biblioteca reports zero garments for 90 days while Observatorio shows 48
// products from the last 60." (owner review, 2026-08-14 — scored 4/10, the
// lowest score in the product.)
//
// The engine was never wrong. /observatory/library?days=90 returns
// total: 32673. The 90-day window is ~32k rows and the first page takes ~2.3s,
// and for those seconds the screen printed a hard 0 beside "90 días" over an
// empty grid — which reads exactly like an answer, on the screen whose entire
// job is evidence.
//
// A screen that reads market evidence has THREE states it may never collapse:
//   no pudimos preguntar · preguntamos y no hay · todavía estamos preguntando
// The third had no branch. This test is for the third one.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const lib = stripComments(read("components/views/Library.jsx"));

test("the outage state is distinct and says we could not ask", () => {
  assert.match(lib, /No pudimos consultar el motor/,
    "an outage must say the query failed, not that the market is empty");
});

test("the genuinely-empty state requires that we are NOT still asking", () => {
  // `items.length === 0 && !busy` — the !busy is the whole point. Without it,
  // "nothing found" and "not finished looking" are the same branch.
  assert.match(lib, /items\.length === 0 && !busy/,
    "the empty state must exclude the in-flight case");
});

test("there is a branch for still-asking", () => {
  assert.match(lib, /Consultando el Observatorio/,
    "a slow first page must announce itself rather than render an empty grid");
});

test("neither headline count prints a number before anything has answered", () => {
  // Two cells sit side by side under the same heading. The first was fixed for
  // this and the second was not, which is the entire bug: one honest cell
  // beside one that reads "0".
  //
  // ⚠ SCOPED TO .lb2-counts DELIBERATELY. A first draft of this test checked
  // every <b>{fmtN(...)}</b> in the file and flagged "Novedades por semana",
  // which is already inside a `{data && (...)}` block and therefore cannot
  // paint before the answer. A rule that flags correct code gets deleted, so
  // this one only reads the header cells, which have no such wrapper.
  const block = lib.match(/<div className="lb2-counts">[\s\S]*?\n      <\/div>/);
  assert.ok(block, "could not find the .lb2-counts block");
  const cells = block[0].match(/<b[^>]*>[\s\S]*?<\/b>/g) || [];
  assert.ok(cells.length >= 2, `expected both count cells, got ${cells.length}`);
  // The third cell is the window ("90 días"), a constant — only the two that
  // render a COUNT must prove they can withhold it.
  const counts = cells.filter((c) => /fmtN\(/.test(c));
  assert.equal(counts.length, 2, "expected exactly two counted cells");
  for (const cell of counts) {
    const flat = cell.replace(/\s+/g, " ").slice(0, 90);
    assert.match(cell, /data|error/, `count renders unconditionally: ${flat}`);
    assert.match(cell, /"—"|'—'/, `count has no not-yet-known form: ${flat}`);
  }
});
