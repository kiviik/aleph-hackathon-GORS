// The typed generation contract, frontend half — the honesty machinery.
//
// The engine's compiler (api/app/generation_intent.py) labels every control
// with how it was actually treated: provider_native | prompt_guidance |
// unavailable | refused. The owner's correction that forced the whole reversal
// was a UI that displayed a professional control while merely converting it to
// prompt prose — so the words a screen may use for each treatment live in ONE
// module, and this file pins them down.
import assert from "node:assert/strict";
import test from "node:test";

import {
  GUIDANCE_LABEL, MODELS, MODEL_PIN_NOTE, TIERS, TREATMENT_CHIPS, buildIntent,
  chipFor, controlName, fallbackPrompt, locksFromScopes, refusalMessage,
} from "@/lib/generationIntent.mjs";

// ---- treatments → chips ----------------------------------------------------

test("all four engine treatments map to a chip, and only native claims native", () => {
  assert.deepEqual(Object.keys(TREATMENT_CHIPS).sort(), [
    "prompt_guidance", "provider_native", "refused", "unavailable",
  ], "the engine's vocabulary, exactly — a fifth treatment must fail loudly here");

  assert.equal(chipFor({ control: "output.size", treatment: "provider_native" }).label,
    "parámetro del proveedor");
  assert.equal(chipFor({ control: "output.size", treatment: "provider_native" }).tone,
    "native");
  assert.equal(chipFor({ control: "locks", treatment: "prompt_guidance" }).label,
    GUIDANCE_LABEL);
  assert.equal(chipFor({ control: "locks", treatment: "prompt_guidance" }).tone,
    "guidance");
  assert.equal(chipFor({ control: "output.format", treatment: "unavailable" }).label,
    "no aplicado");
  assert.equal(chipFor({ control: "output.format", treatment: "unavailable" }).tone,
    "off");
  assert.equal(chipFor({ control: "output.transparent_background",
    treatment: "refused" }).label, "rechazado");

  // ⚠ Only ONE treatment may ever claim a real provider parameter.
  const nativeClaims = Object.entries(TREATMENT_CHIPS)
    .filter(([, chip]) => chip.label.includes("parámetro"));
  assert.deepEqual(nativeClaims.map(([k]) => k), ["provider_native"]);
});

test("an unknown treatment is shown as unclassified, never hidden or upgraded", () => {
  const chip = chipFor({ control: "x", treatment: "something_new" });
  assert.equal(chip.tone, "off");
  assert.equal(chip.label, "sin clasificar");
});

test("the engine's detail text rides along verbatim", () => {
  const chip = chipFor({ control: "output.size", treatment: "provider_native",
    detail: "1024x1536" });
  assert.equal(chip.detail, "1024x1536");
  assert.equal(chipFor({ control: "locks", treatment: "prompt_guidance" }).detail,
    null);
});

test("known controls get Spanish names; unknown ones keep the engine's word", () => {
  assert.equal(controlName("authored_prompt"), "tu texto");
  assert.equal(controlName("atelier_context"), "contexto de Atelier");
  assert.equal(controlName("references.strength"), "peso de referencias");
  assert.equal(controlName("some.future_control"), "some.future_control");
});

// ---- tiers and models ------------------------------------------------------

test("tier ids are the engine's vocabulary and no label claims 'mejor'", () => {
  assert.deepEqual(TIERS.map((t) => t.id), ["fast", "balanced", "best"]);
  for (const t of TIERS) {
    // ⚠ The registry's ranking is availability + documented capability. The
    // blind fashion benchmark has not run; until it does, "mejor" would be a
    // measured-quality claim nothing measured.
    assert.ok(!/\bmejor\b/i.test(t.label),
      `"${t.label}" claims a quality ranking the benchmark has not measured`);
  }
  const best = TIERS.find((t) => t.id === "best");
  assert.match(best.label, /según el proveedor/,
    "the top tier must attribute the claim to the provider, not to Atelier");
});

test("the model list is exactly the engine registry's keys", () => {
  // Mirrors api/app/imaging.py CAPABILITIES (read 2026-08-17). If the engine
  // adds or retires a model, this list — and this test — move with it.
  assert.deepEqual(MODELS, [
    "gpt-image-2", "gpt-image-1", "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image", "gemini-3-pro-image",
    "gemini-2.5-flash-image",
  ]);
  assert.match(MODEL_PIN_NOTE, /no hay sustituto silencioso/);
});

// ---- building intents ------------------------------------------------------

test("no authored text means no intent — the app never signs for the designer", () => {
  assert.equal(buildIntent({ authored: "" }), null);
  assert.equal(buildIntent({ authored: "   " }), null);
  assert.equal(buildIntent({}), null);
});

test("the designer's words travel verbatim and the groups stay separate", () => {
  const intent = buildIntent({
    authored: "  blazer cropped en sarga  ",
    context: "ADN de la marca: minimalista.",
    garment: { categoria: "Blazer", vacio: "  " },
    materials: { tela: "Sarga (100% algodón)" },
    palette: { color: "chocolate (#5C4033)" },
    references: [
      { url: "http://x/base.png", role: "garment" },
      { assetId: "abc-123", role: "fabric", strength: 0.5 },
      { role: "styling" }, // ni url ni asset — se descarta
    ],
    locks: ["silhouette"],
    exclusions: ["texto", "marca de agua"],
  });
  assert.equal(intent.authored_prompt, "blazer cropped en sarga");
  assert.equal(intent.atelier_context, "ADN de la marca: minimalista.");
  assert.deepEqual(intent.garment_spec, { categoria: "Blazer" },
    "empty values are pruned, not sent as claims");
  assert.deepEqual(intent.materials, { tela: "Sarga (100% algodón)" });
  assert.deepEqual(intent.references, [
    { url: "http://x/base.png", role: "garment" },
    { asset_id: "abc-123", role: "fabric", strength: 0.5 },
  ]);
  assert.deepEqual(intent.locks, ["silhouette"]);
  assert.deepEqual(intent.exclusions, ["texto", "marca de agua"]);
  assert.ok(!("presentation" in intent), "an empty group is absent, not {}");
  assert.ok(!("output" in intent));
});

test("alcance chips invert into engine locks", () => {
  // Chips say what MAY change; locks say what must not — same fact, inverted.
  assert.deepEqual(locksFromScopes(["detalle"]),
    ["silhouette", "fabric", "color", "print"]);
  assert.deepEqual(locksFromScopes(["tela", "color"]), ["silhouette", "print"]);
  assert.deepEqual(locksFromScopes(["silueta", "tela", "color", "estampa"]), []);
});

// ---- the fallback rendering ------------------------------------------------

test("fallbackPrompt renders every part locally, authored first", () => {
  const intent = buildIntent({
    authored: "campera corta cuello mao",
    context: "Paleta de la casa.",
    materials: { tela: "gabardina" },
    locks: ["color"],
    exclusions: ["texto"],
  });
  const p = fallbackPrompt(intent);
  assert.ok(p.startsWith("campera corta cuello mao"),
    "her words go first, verbatim — same rule as the server's composer");
  assert.match(p, /Paleta de la casa\./);
  assert.match(p, /tela: gabardina/);
  assert.match(p, /No cambies: color\./);
  assert.match(p, /Evitá: texto\./);
  assert.equal(fallbackPrompt(null), "");
});

// ---- refusals --------------------------------------------------------------

test("both refusal shapes surface the engine's sentence verbatim", () => {
  assert.equal(refusalMessage({ detail: {
    error: "capability_unavailable",
    reason: "transparent_background: no configured model supports transparent output; the request was not silently flattened",
  } }), "transparent_background: no configured model supports transparent output; the request was not silently flattened");

  assert.equal(refusalMessage({ detail: {
    error: "intent_refused", control: "output.transparent_background",
    reason: "gpt-image-2 cannot produce transparent output; the request is refused rather than silently flattened",
  } }), "output.transparent_background: gpt-image-2 cannot produce transparent output; the request is refused rather than silently flattened");
});

test("everything that is not a refusal stays on the normal error path", () => {
  assert.equal(refusalMessage(null), null);
  assert.equal(refusalMessage({ detail: "unknown model: 'x'" }), null);
  assert.equal(refusalMessage({ detail: { error: "call_cap_reached" } }), null);
});
