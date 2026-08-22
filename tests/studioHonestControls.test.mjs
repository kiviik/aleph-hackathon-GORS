// No studio control may claim provider-native behaviour it does not have.
//
// The owner's sharpest correction of the 2026-08-17 reversal: "Atelier
// sometimes displays a professional control while merely converting it into
// prompt prose. A world-class tool must either map a control to
// provider-native behavior or label it honestly as prompt guidance."
//
// The enforcement is structural, same pattern as techPackSendLabel: the words
// for each treatment live in lib/generationIntent.mjs where the unit tests can
// pin them, and the components are checked at the SOURCE level so they cannot
// grow claims of their own. A source rule is right here because the lie is
// invisible to behavioural tests — the request works either way; only the
// sentence over the control is false.
import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const STUDIO = [
  "components/StudioItemEditor.jsx",
  "components/StudioExplore.jsx",
  "components/views/DesignStudio.jsx",
  "components/GenerationReceipt.jsx",
];

const read = (rel) => readFile(join(ROOT, rel), "utf8");

// Strip comments so a WARNING about a phrase does not count as the phrase.
const codeLines = (src) => src.split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));

test("no component hardcodes a native-parameter claim — only chipFor may say it", async () => {
  // "parámetro del proveedor" exists in exactly one place: the
  // provider_native chip in lib/generationIntent.mjs. A component that types
  // it beside a control has claimed native behaviour without the mapping.
  for (const rel of STUDIO) {
    const src = await read(rel);
    for (const claim of [/parámetro del proveedor/i, /nativo del proveedor/i]) {
      const hit = codeLines(src).findIndex((l) => claim.test(l));
      assert.equal(hit, -1,
        `${rel} matches ${claim} in code — native claims may only come from ` +
        "TREATMENT_CHIPS via chipFor, driven by the engine's control_mapping");
    }
  }
});

test("no component hardcodes the tier labels — they render from TIERS", async () => {
  // The hedged wording ("Máxima calidad (según el proveedor)") is tested in
  // generationIntent.test.mjs. Here: the components must not retype any tier
  // label, or the hedge could be silently dropped at the screen.
  for (const rel of STUDIO) {
    const src = await read(rel);
    const hit = codeLines(src).findIndex((l) => /Máxima calidad|Equilibrado|Rápido/.test(l));
    assert.equal(hit, -1,
      `${rel} retypes a tier label — render TIERS from @/lib/generationIntent.mjs`);
  }
  const studio = await read("components/views/DesignStudio.jsx");
  assert.match(studio, /TIERS\.map/,
    "the tier selector must iterate the tested TIERS list");
  assert.match(studio, /MODEL_PIN_NOTE/,
    "the expert pin must carry the no-silent-substitute note");
});

test("the controls that are prompt prose say so where they are used", async () => {
  const editor = await read("components/StudioItemEditor.jsx");
  // Fidelity has NO native mapping on any configured model (gpt-image-2's
  // input fidelity is always-high with no parameter) — the control stays, but
  // labelled as the guidance it is.
  assert.match(editor, /Fidelidad <i className="ie-guide">\{GUIDANCE_LABEL\}/,
    "the fidelity select must wear the guía-de-prompt label");
  assert.match(editor, /Alcance de la edición <i className="ie-guide">\{GUIDANCE_LABEL\}/,
    "the alcance chips compile to locks, which are prompt guidance — say so");
  assert.match(editor, /Referencias <i className="ie-guide">\{GUIDANCE_LABEL\}/,
    "reference roles compile into the prompt — say so");
  assert.match(editor, /from "@\/lib\/generationIntent.mjs"/,
    "the labels must be the tested constants, not retyped strings");

  const explore = await read("components/StudioExplore.jsx");
  assert.match(explore, /GUIDANCE_LABEL/,
    "the prompt-box attachments panel must carry the guidance label");
});

test("the receipt renders the engine's mapping and admits when there is none", async () => {
  const receipt = await read("components/GenerationReceipt.jsx");
  assert.match(receipt, /chipFor/,
    "chips must come from the tested classifier");
  assert.match(receipt, /sin mapa de controles/,
    "a legacy/fallback generation has no mapping and the panel must say so " +
    "rather than inventing one");
  assert.match(receipt, /Qué se envió/);
});

test("a refusal is surfaced verbatim and never retried on the fallback", async () => {
  const studio = await read("components/views/DesignStudio.jsx");
  assert.match(studio, /refusalMessage\(error\?\.body\)/,
    "callGenerate must recognise the engine's two refusal codes");
  const refusalIdx = studio.indexOf("refusalMessage(error?.body)");
  // The POST fallback specifically — line ~276 also GETs the same route as a
  // readiness probe, which is not a generation.
  const fallbackIdx = studio.indexOf("appFetch(\"/api/generate\", {");
  assert.ok(refusalIdx > -1 && fallbackIdx > refusalIdx,
    "the refusal check must sit before the fallback call, so a refused " +
    "intent cannot be regenerated as exactly the degraded image the engine " +
    "refused to make");
});
