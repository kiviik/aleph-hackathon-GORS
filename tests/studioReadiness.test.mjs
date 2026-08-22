// The studio offered a paid button while knowing nothing about the provider
// that would serve it. These lock the three things that were wrong.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  composeReadiness, costCentsFor, costChip, costLabel, readinessDetail,
  readinessLabel, servingPath,
} from "@/lib/studioReadiness";

const ENGINE_OPENAI = {
  configured: true, provider: "openai", model: "gpt-image-1",
  supports_references: true, max_references: 3, honors_quality: true,
  cost_known: true, unavailable_reason: null,
  quality: [
    { tier: "draft", provider_quality: "low", cost_cents: 1 },
    { tier: "final", provider_quality: "medium", cost_cents: 6 },
  ],
};

const ENGINE_GEMINI = {
  configured: true, provider: "gemini", model: "gemini-3.1-flash-image",
  supports_references: true, max_references: 3, honors_quality: false,
  cost_known: false, unavailable_reason: null,
  quality: [
    { tier: "draft", provider_quality: null, cost_cents: null },
    { tier: "final", provider_quality: null, cost_cents: null },
  ],
};

const NO_KEY = {
  configured: false, provider: null, model: null, supports_references: false,
  max_references: 0, cost_known: false, unavailable_reason: "no_key",
  quality: [],
};

const FALLBACK_GOOGLE = {
  configured: true, provider: "google", model: "gemini-2.5-flash-image",
  supports_references: true, max_references: 3, cost_known: false,
  unavailable_reason: null,
};

test("the engine serves when it holds a key, and the header says so", () => {
  const r = composeReadiness(ENGINE_OPENAI, FALLBACK_GOOGLE);
  assert.equal(r.state, "configured");
  assert.equal(r.path, "engine");
  assert.equal(r.provider, "openai");
  assert.match(readinessLabel(r), /openai · motor/);
});

test("an engine with no key hands over to the fallback — and it is NAMED", () => {
  // This is the silent crossing. callGenerate falls through to /api/generate
  // when the engine has no key, so the request is served by a different
  // provider than the engine would have used. The header must follow the
  // request, not describe the path that did not run.
  const r = composeReadiness(NO_KEY, FALLBACK_GOOGLE);
  assert.equal(r.path, "fallback");
  assert.equal(r.provider, "google");
  assert.match(readinessLabel(r), /google · respaldo/);
});

test("neither configured is the only state that disables the button", () => {
  const r = composeReadiness(NO_KEY, { ...NO_KEY });
  assert.equal(r.state, "unconfigured");
  assert.equal(servingPath(NO_KEY, NO_KEY), null);
  assert.match(readinessLabel(r), /Sin proveedor/);
});

test("ONE silent path is not both paths empty", () => {
  // ⚠ Found in the browser, after the first version of this shipped. The
  // engine 404'd because the running uvicorn predated /studio/readiness, so
  // its lookup returned null; the Next fallback answered honestly with no_key;
  // and the screen printed "Sin clave de imágenes — la generación no está
  // disponible" in red over a box holding an OpenAI key the whole time.
  //
  // Both sides must ANSWER no before we may say no. The earlier test below
  // only covered null+null, which is why this passed review and failed in use.
  const engineSilent = composeReadiness(null, NO_KEY);
  assert.equal(engineSilent.state, "unknown");
  assert.match(readinessLabel(engineSilent), /sin confirmar/i);

  const fallbackSilent = composeReadiness(NO_KEY, null);
  assert.equal(fallbackSilent.state, "unknown");

  // And when both genuinely answered, we are allowed to say it.
  assert.equal(composeReadiness(NO_KEY, { ...NO_KEY }).state, "unconfigured");
});

test("toolbar strings stay short enough for a pill", () => {
  // The honest answer was right; the place to put it was wrong. "costo no
  // declarado" inside a quality pill blew the toolbar row apart in the
  // browser. Chips are a fixed-width surface — detail goes in the tooltip.
  const states = [
    composeReadiness(ENGINE_OPENAI, null),
    composeReadiness(ENGINE_GEMINI, null),
    composeReadiness(NO_KEY, { ...NO_KEY }),
    composeReadiness(null, null),
  ];
  for (const r of states) {
    assert.ok(readinessLabel(r).length <= 32, `chip too long: ${readinessLabel(r)}`);
    for (const q of ["draft", "final"]) {
      assert.ok(costChip(r, q).length <= 10, `cost chip too long: ${costChip(r, q)}`);
    }
    // The full explanation still exists — somewhere it can breathe.
    assert.ok(readinessDetail(r).length > 40);
  }
});

test("a failed lookup is UNKNOWN, never 'no provider'", () => {
  // Both helpers return null when the request fails. Rendering that as
  // "sin proveedor" tells the user their deployment is broken when the truth
  // is that we could not ask — the error-is-not-empty rule, again.
  const r = composeReadiness(null, null);
  assert.equal(r.state, "unknown");
  assert.equal(r.provider, null);
  assert.match(readinessLabel(r), /sin confirmar/i);
});

test("gemini is not priced with gpt-image-1's rates", () => {
  // The defect: the browser carried COST = {draft: 1, final: 6} and charged
  // it to whatever served. Gemini has no quality knob, so both numbers were
  // wrong by construction and got written into concept_versions.cost_cents.
  const r = composeReadiness(ENGINE_GEMINI, null);
  assert.equal(r.costKnown, false);
  assert.equal(costCentsFor(r, "draft"), null);
  assert.equal(costCentsFor(r, "final"), null);
  assert.equal(costLabel(r, "draft"), "costo no declarado");
});

test("the fallback path never claims a price it does not own", () => {
  const r = composeReadiness(NO_KEY, FALLBACK_GOOGLE);
  assert.equal(costCentsFor(r, "draft"), null);
});

test("openai costs come from the engine's table, not a browser constant", () => {
  const r = composeReadiness(ENGINE_OPENAI, null);
  assert.equal(costCentsFor(r, "draft"), 1);
  assert.equal(costCentsFor(r, "final"), 6);
  assert.equal(costLabel(r, "final"), "≈ US$0.06/imagen");
});

test("readiness never grows a field that implies availability", () => {
  // `configured` is a key check. Quota lives at the provider and is only
  // observable by spending a call; no field here may suggest we know more.
  const r = composeReadiness(ENGINE_OPENAI, FALLBACK_GOOGLE);
  for (const banned of ["available", "healthy", "connected", "online",
                        "quotaRemaining", "credits", "willSucceed"]) {
    assert.ok(!(banned in r), `readiness must not claim ${banned}`);
  }
});

test("no screen recomputes the per-image price", () => {
  // The engine owns the price table (api/app/imaging.py:_PRICING). Three
  // browser copies existed — DesignStudio.jsx, lib/explore.js and an inline
  // literal in StudioExplore.jsx — and they are why a Gemini generation could
  // be recorded at gpt-image-1 rates. A copy that reappears fails here.
  const files = [
    "components/views/DesignStudio.jsx",
    "components/StudioExplore.jsx",
    "lib/explore.js",
  ];
  const priceLiteral = /\b(draft|final)\s*:\s*[16]\b|quality\s*===\s*["']final["']\s*\?\s*["']?6["']?\s*:\s*["']?1["']?/;
  // Comments are stripped first: these files EXPLAIN the removed constant, and
  // a guard that forbids naming the bug it prevents deletes its own reason.
  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const f of files) {
    const src = stripComments(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    assert.ok(!priceLiteral.test(src),
      `${f} still carries a hardcoded per-image price — ask the engine instead`);
  }
});

test("the reasoning model is carried, never re-derived", () => {
  // ⚠ atelier/llm.py called itself "Claude wrapper" and named
  // claude-sonnet-4-6 while actually calling gpt-4o-mini, because has_openai
  // is checked first. Brand DNA and trend fit were attributed to a model that
  // never ran. The browser must pass the engine's own answer through.
  const withReasoning = {
    ...ENGINE_OPENAI,
    reasoning: { provider: "openai", model: "gpt-4o-mini", online: true,
                 supports_web_search: false, heuristic: false },
  };
  const r = composeReadiness(withReasoning, null);
  assert.equal(r.reasoning.model, "gpt-4o-mini");
  assert.match(readinessDetail(r), /gpt-4o-mini/);

  // The browser fallback has no reasoning layer at all — it must not borrow
  // the engine's, and it must not invent one.
  const fb = composeReadiness(NO_KEY, FALLBACK_GOOGLE);
  assert.equal(fb.reasoning, null);
});

test("heuristic output is named as heuristic, not as a model", () => {
  // Offline is a different KIND of answer, not a weaker model. Presenting
  // deterministic heuristics as model output misattributes the evidence.
  const offline = {
    ...ENGINE_OPENAI,
    reasoning: { provider: "offline", model: null, online: false,
                 supports_web_search: false, heuristic: true },
  };
  const detail = readinessDetail(composeReadiness(offline, null));
  assert.match(detail, /heurística/);
  assert.ok(!/offline null|null/.test(detail), "a null model must not print");
});
