// The design system, asserted rather than intended.
//
// ⚠ WHY THIS IS A TEST AND NOT A STYLE GUIDE. Owner design audit, 2026-08-12,
// measured rather than eyeballed: 39 distinct font sizes across the stylesheet
// including half-pixel steps, 176 rules at 9px, 198 at 10px, and `--ink-3` at
// 2.79:1 on the paper background driving 9-11px text — roughly a third of the
// interface technically illegible under WCAG AA.
//
// A written convention did not stop any of that. Every one of those 39 sizes
// was somebody making a locally reasonable decision. So the two rules that
// actually carry the professional reading — a real ramp, and text you can read
// — are assertions, and they fail the build when they drift.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const token = (name) => {
  const m = root.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};

// WCAG relative luminance, so the contrast claims are computed here rather
// than copied from wherever they were last measured.
function luminance(hex) {
  const h = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("every text colour clears WCAG AA on the paper background", () => {
  const paper = token("paper");
  // ⚠ `--ink-3-quiet` is the OLD #97918A, kept only for >=14px decorative text
  // and deliberately excluded — it is named "quiet" so that using it for a
  // caption is a visible choice rather than an accident.
  const mustPass = ["ink", "ink-2", "ink-3", "interactive", "positive",
                    "warning", "danger", "editorial"];
  const failures = mustPass
    .map((name) => [name, token(name)])
    .filter(([, hex]) => hex && hex.startsWith("#"))
    .map(([name, hex]) => [name, hex, contrast(hex, paper)])
    .filter(([, , ratio]) => ratio < 4.5);

  assert.deepEqual(failures, [],
    "these fail AA on --paper and are used for text: "
    + failures.map(([n, h, r]) => `--${n} ${h} ${r.toFixed(2)}:1`).join(", "));
});

test("⚠ the proposed warning colour was checked, not trusted", () => {
  // The audit proposed #B7791F for --warning on the grounds that the old ochre
  // failed on white. It measures 3.25:1 on paper and fails too — so it is not
  // what shipped. This test exists so nobody "restores" it from the spec.
  const paper = token("paper");
  assert.ok(contrast("#B7791F", paper) < 4.5,
    "if this now passes, the paper colour moved and --warning should be revisited");
  assert.ok(contrast(token("warning"), paper) >= 4.5);
});

test("the type ramp has eight steps and a floor of 11px", () => {
  const steps = ["caption", "label", "body", "body-lg", "h3", "h2", "h1", "display"]
    .map((n) => token(`fs-${n}`));
  assert.equal(steps.filter(Boolean).length, 8, "the ramp must be complete");

  const px = steps.map((s) => parseFloat(s));
  assert.ok(px.every((v) => v >= 11),
    `nothing in the ramp may be below 11px — got ${px.join(", ")}`);
  // Strictly ascending: a ramp with a repeat is two names for one decision.
  assert.deepEqual(px, [...px].sort((a, b) => a - b));
  assert.equal(new Set(px).size, px.length, "no two steps may share a size");
});

test("the ui/ primitives use tokens, never literal sizes or colours", () => {
  // The rule that keeps this from becoming the 39-size stylesheet again: the
  // new components may not hardcode what the ramp already names.
  const files = ["StatusChip", "Field", "ObjectHeader"].map((n) =>
    readFileSync(new URL(`../components/ui/${n}.jsx`, import.meta.url), "utf8"));

  for (const [i, src] of files.entries()) {
    const name = ["StatusChip", "Field", "ObjectHeader"][i];
    // A literal font-size in JSX is the thing being banned.
    assert.ok(!/fontSize:\s*["'`]?\d/.test(src),
      `${name} hardcodes a font size instead of using the ramp`);
    // Hex colours: allowed only in StatusChip's wash pair, which has no token.
    const hexes = (src.match(/#[0-9A-Fa-f]{6}/g) || [])
      .filter((h) => !["#E8F4EE", "#FFFFFF"].includes(h.toUpperCase()));
    assert.deepEqual(hexes, [],
      `${name} hardcodes colours the tokens already name: ${hexes.join(", ")}`);
  }
});

test("an unrecognised status is shown, never silently swallowed", async () => {
  // The RULE lives in a dependency-free .mjs — same pattern as
  // brandStore/handoff/conceptRegistry — so it is testable without a DOM.
  const { statusOf } = await import("../lib/statusVocabulary.mjs");
  assert.equal(statusOf("approved"), "approved");
  assert.equal(statusOf("approved", { frozen: true }), "frozen");
  assert.equal(statusOf("approved", { blocked: true }), "blocked",
    "blocked wins: it is the state that stops you acting");
  // ⚠ Not coerced to a default. A chip that renders "Borrador" for a state it
  // does not understand is a screen claiming something it never checked.
  assert.equal(statusOf("some_new_engine_state"), null);
});
