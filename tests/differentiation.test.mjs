// "Differentiation: 51" — from what, measured how?
//
// Owner test as a designer, 2026-08-10. A generated product carried that score
// while its concept had no approved brief, no direction and no selected
// fabric, and he asked the only question that matters about it: differentiation
// FROM what? The score itself is a real thing — a worst-case colour+surface
// collision against the brand's own catalogue and the trend cone — but the old
// floor was ONE reference, so a single item produced a two-digit number with a
// band label attached, and nothing on screen said what it had compared.
//
// Same rule as the engine's category-coherence and panel-comparability gates:
// "we could not measure this" must never render as a number.
import assert from "node:assert/strict";
import test from "node:test";

import { MIN_REFERENCES, scoreVariation } from "../lib/differentiation.js";

const VARIATION = { color: "#1c2a3a", texture: "twill" };

// A reference is `{hex, fabric}` — the shape `ownRefsFromDna` produces from
// the brand's own palette and materials. The VARIATION being scored uses
// `{color, texture}`; the two vocabularies are not the same and mixing them up
// throws rather than scoring, which is at least loud.
function refs(n) {
  return Array.from({ length: n }, (_, i) => ({
    owner: "tu línea",
    name: `Ref ${i}`,
    hex: i % 2 ? "#efe7db" : "#2b2b2b",
    fabric: "Linen",
  }));
}

test("a score needs enough to be different FROM, and says how much it had", () => {
  const thin = scoreVariation(VARIATION, { ownRefs: refs(1) });

  assert.equal(thin.score, null);
  assert.equal(thin.band, null, "a band is a verdict and needs the same floor");
  assert.equal(thin.basis.total, 1);
  assert.match(thin.why, /hacen falta/);
  // The reasoning is stated, not just the refusal: a worst case over one item
  // is a fact about that item.
  assert.match(thin.why, /1/);
});

test("with a real reference set the number exists and never travels alone", () => {
  const measured = scoreVariation(VARIATION, { ownRefs: refs(MIN_REFERENCES) });

  assert.equal(typeof measured.score, "number");
  assert.ok(measured.band, "a measured score gets its band");
  assert.equal(measured.basis.own, MIN_REFERENCES);
  assert.equal(measured.basis.market, 0);
  // The answer to "from what": always present beside the score, so the bare
  // number cannot reappear on a card.
  assert.match(measured.why, /referencia/);
  assert.match(measured.why, /catálogo/);
});

test("no references at all is null, never a confident 100", () => {
  const empty = scoreVariation(VARIATION, {});

  assert.equal(empty.score, null);
  assert.equal(empty.basis.total, 0);
  assert.match(empty.why, /no hay ninguna referencia/);
});

test("the floor counts the brand's catalogue and the trend cone together", () => {
  // Neither source alone reaches the floor; together they do. The score is
  // about the space the design lands in, and both halves are that space.
  const own = refs(4);
  const belowAlone = scoreVariation(VARIATION, { ownRefs: own });
  assert.equal(belowAlone.score, null);

  // A trend contributes one reference per known swatch — `{name, col, fabric}`
  // is the shape `marketRefs` reads.
  const combined = scoreVariation(VARIATION, {
    ownRefs: own,
    trends: [
      { name: "Quiet luxury", col: "#efe7db", fabric: "Linen" },
      { name: "Utility", col: "#5a5f4d", fabric: "Twill" },
      { name: "Monochrome", col: "#2b2b2b", fabric: "Wool" },
      { name: "Washed indigo", col: "#39506b", fabric: "Denim" },
    ],
  });
  assert.equal(combined.basis.own, 4);
  assert.ok(combined.basis.market >= 4, "each trend swatch is a reference");
  assert.ok(combined.basis.total >= MIN_REFERENCES);
  assert.equal(typeof combined.score, "number",
               "neither source reached the floor alone; together they do");
});
