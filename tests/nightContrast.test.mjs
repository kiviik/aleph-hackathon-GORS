// Dim text on the dark sidebar was below WCAG AA, at the smallest size in the
// product. Reported 2026-08-14 with measurements, and both reproduced exactly:
// sublabels #6F7480 → 3.87:1, sidebar footer #6C717D → 3.70:1, against
// --ax-night #14161B. AA for normal text is 4.5:1.
//
// This test COMPUTES the ratio instead of asserting a hex, so the guard still
// holds when someone picks a different grey for a good reason — and fails when
// they pick one by eye.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/atelier-ui.css", import.meta.url), "utf8");

const channel = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255)
       + 0.7152 * channel((n >> 8) & 255)
       + 0.0722 * channel(n & 255);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const varValue = (name) => {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} must be defined as a 6-digit hex`);
  return m[1];
};

test("the contrast maths agrees with the reported measurements", () => {
  // Anchor the calculator against the two numbers from the review. If this
  // drifts, every other assertion here is worthless.
  assert.equal(contrast("#6F7480", "#14161B").toFixed(2), "3.87");
  assert.equal(contrast("#6C717D", "#14161B").toFixed(2), "3.70");
});

test("dim text on the night surface clears WCAG AA", () => {
  const ratio = contrast(varValue("ax-dim"), varValue("ax-night"));
  assert.ok(ratio >= 4.5,
    `--ax-dim on --ax-night is ${ratio.toFixed(2)}:1, below the 4.5:1 AA floor`);
});

test("the greys that failed have not come back", () => {
  // Comments may name them — that is how the reason survives. Declarations
  // may not.
  const declarations = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .match(/color\s*:\s*#[0-9A-Fa-f]{6}/g) || [];
  for (const decl of declarations) {
    const hex = decl.match(/#[0-9A-Fa-f]{6}/)[0];
    assert.ok(!/^#(6F7480|6C717D)$/i.test(hex),
      `${decl} is one of the sub-AA greys this test exists to remove`);
  }
});
