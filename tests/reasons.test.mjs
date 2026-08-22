// The engine states policy; this app states it in Spanish.
//
// The bug that produced `lib/reasons.mjs`: the Bradley-Terry gate returned an
// English sentence, Calibration.jsx rendered it verbatim, and English reached a
// client-facing screen. These tests pin the two properties that keep it from
// coming back — a known code is said in our own words, and an unknown one
// degrades to something visible rather than to nothing.
import test from "node:test";

import { engineFile, skipWithoutEngine } from "./harness/engineTree.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  KNOWN_CODES,
  NO_REASON_TEXT,
  reasonCode,
  reasonText,
} from "../lib/reasons.mjs";

const ENGLISH = "not enough judgments to calibrate";

test("a known code is rendered from its params, not from the server string", () => {
  const text = reasonText(
    { code: "needs_more_judgments", params: { have: 7, need: 20 } },
    ENGLISH,
  );
  assert.match(text, /^Faltan comparaciones: 7 de 20/);
  assert.ok(!text.includes(ENGLISH));
});

test("an unknown code falls back to the server string, never to blank", () => {
  // The case that WILL happen: the engine ships a new code before this catalog
  // learns it, or a stored row predates codes entirely.
  const text = reasonText(
    { code: "some_code_shipped_after_this_file", params: { n: 3 } },
    "motivo del servidor",
  );
  assert.equal(text, "motivo del servidor");
});

test("an unknown code with no server string still says something, and names itself", () => {
  const text = reasonText({ code: "brand_new_policy", params: {} }, "");
  assert.notEqual(text.trim(), "");
  // Naming the code makes an untranslated reason findable from a screenshot.
  assert.ok(text.includes("brand_new_policy"), text);
});

test("nothing at all is still not blank", () => {
  assert.equal(reasonText(null, null), NO_REASON_TEXT);
  assert.equal(reasonText(undefined, undefined), NO_REASON_TEXT);
  assert.equal(reasonText({}, ""), NO_REASON_TEXT);
});

test("a known code with unusable params falls back rather than printing undefined", () => {
  const text = reasonText(
    { code: "needs_more_judgments", params: {} },
    "faltan comparaciones",
  );
  assert.equal(text, "faltan comparaciones");
  assert.ok(!/undefined|NaN|null/.test(text));
});

test("every catalog entry survives empty params without throwing or blanking", () => {
  for (const code of KNOWN_CODES) {
    const text = reasonText({ code, params: {} }, "");
    assert.notEqual(text.trim(), "", code);
    assert.ok(!/undefined|NaN/.test(text), `${code}: ${text}`);
  }
});

test("no rendered reason leaks a raw code when the catalog knows it", () => {
  const cases = [
    [{ code: "brand_fit_low", params: { fit: 12.4 } }, /Fit de marca bajo \(12\/100\)/],
    [{ code: "brand_fit_unvalidated", params: {} }, /sin validar/],
    [{ code: "confidence_level", params: { level: "alta" } }, /Evidencia alta/],
    [{ code: "rec_expired", params: {} }, /Vencida/],
    [{ code: "pool_images_missing", params: { excluded: 4 } }, /4 sin imagen/],
  ];
  for (const [coded, pattern] of cases) {
    const text = reasonText(coded, "IGNORAR");
    assert.match(text, pattern);
    assert.ok(!text.includes(coded.code), text);
    assert.ok(!text.includes("IGNORAR"), text);
  }
});

test("counts are pluralised, so no screen says '1 competidores'", () => {
  assert.match(reasonText({ code: "market_adopters_observed", params: { adopters: 1 } }),
    /^1 competidor lo/);
  assert.match(reasonText({ code: "market_adopters_observed", params: { adopters: 3 } }),
    /^3 competidores lo/);
});

test("an unknown freshness level is printed, not swallowed", () => {
  // A new enum value from the engine is still more informative than silence.
  assert.match(reasonText({ code: "confidence_level", params: { level: "parcial" } }),
    /Evidencia parcial/);
});

test("a bare code string is accepted as well as the {code, params} payload", () => {
  assert.equal(reasonCode("rec_revoked"), "rec_revoked");
  assert.equal(reasonCode({ code: "rec_revoked" }), "rec_revoked");
  assert.equal(reasonCode({ params: {} }), null);
  assert.equal(reasonText("rec_revoked", "revocada"), "Revocada.");
});

test("a malformed payload is a fallback, not a crash", () => {
  assert.equal(reasonText({ code: "needs_more_judgments", params: null }, "servidor"),
    "servidor");
  assert.equal(reasonText(42, "servidor"), "servidor");
  assert.equal(reasonText([], "servidor"), "servidor");
});

test("the catalog covers every code the engine can emit", () => {
  // Cross-repo on purpose: a code added to the engine without wording here is
  // the exact failure this whole change exists to prevent, and it is only
  // detectable by looking at both sides. Skipped when the engine tree is not
  // checked out beside this one — a missing sibling is not a product bug.
  // Was a silent `return` — the skip is now announced, so a CI log says which
  // cross-repo contract went unchecked instead of reporting a shorter green.
  if (skipWithoutEngine("reason-code taxonomy")) return;
  const enginePath = engineFile("atelier/reason_codes.py");

  const source = readFileSync(enginePath, "utf8");
  const declared = [...source.matchAll(/^[A-Z][A-Z0-9_]* = "([a-z0-9_]+)"$/gm)]
    .map((m) => m[1]);

  assert.ok(declared.length > 0, "could not parse the engine vocabulary");
  const missing = declared.filter((c) => !KNOWN_CODES.includes(c));
  assert.deepEqual(missing, [], `engine codes with no Spanish wording: ${missing}`);
});
