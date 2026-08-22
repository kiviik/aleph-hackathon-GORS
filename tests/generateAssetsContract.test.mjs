// lib/assets.js is a WIRE, not a translator: the typed generation fields
// (generation_intent, task, tier, model — 2026-08-17 reversal) must reach the
// engine exactly as given, the legacy body must stay byte-identical to what it
// always sent, and the envelope's `model` + `control_mapping` must come back
// untouched — the screen renders the ENGINE's honesty record, so any renaming
// or defaulting in between would re-open the hidden layer.
import assert from "node:assert/strict";
import test from "node:test";

import { generateAssets } from "@/lib/assets";
import { refusalMessage } from "@/lib/generationIntent.mjs";

function mockFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => body };
  };
  return calls;
}

const BRAND = "7ec005fb-bb61-49fa-b283-28894b9c34fb";

test("the legacy prompt path sends exactly what it always sent", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = mockFetch(200, { assets: [], error: "no_key", budget: null });

  const body = { prompt: "blazer", n: 1, quality: "draft",
    reference_image_urls: ["http://x/a.png"] };
  await generateAssets(BRAND, body);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(`/brands/${BRAND}/assets/generate$`));
  assert.deepEqual(calls[0].body, body,
    "no typed field may be injected into a request that did not carry one");
});

test("intent, task, tier and model pass through unrenamed; the envelope returns unchanged", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const envelope = {
    assets: [{ id: "a1", url: "/brands/x/assets/a1", provider: "openai",
      model: "gpt-image-2" }],
    error: null, provider: "openai", model: "gpt-image-2",
    control_mapping: [
      { control: "authored_prompt", treatment: "prompt_guidance",
        detail: "verbatim, first" },
      { control: "output.size", treatment: "provider_native", detail: "1024x1024" },
    ],
    budget: { used: 1 },
  };
  const calls = mockFetch(200, envelope);

  const body = {
    generation_intent: {
      authored_prompt: "blazer cropped",
      atelier_context: "ADN minimalista.",
      materials: { tela: "sarga" },
      references: [{ url: "http://x/base.png", role: "garment" }],
      locks: ["fabric"],
    },
    n: 1, quality: "draft", task: "garment_edit", tier: "balanced",
    model: "gpt-image-2",
  };
  const out = await generateAssets(BRAND, body, { idempotencyKey: "v1" });

  assert.deepEqual(calls[0].body, body, "the engine owns the vocabulary — "
    + "this module must not rename, wrap or default a single field");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "v1");
  assert.deepEqual(out, envelope,
    "model and control_mapping must reach callers exactly as the engine said them");
});

test("a 422 refusal throws with the body attached, so the verbatim reason survives", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const refusal = { detail: { error: "intent_refused",
    control: "output.transparent_background",
    reason: "gpt-image-2 cannot produce transparent output; the request is refused rather than silently flattened" } };
  mockFetch(422, refusal);

  await assert.rejects(
    () => generateAssets(BRAND, { generation_intent: { authored_prompt: "x",
      output: { transparent_background: true } } }),
    (err) => {
      assert.equal(err.status, 422);
      assert.deepEqual(err.body, refusal);
      // The screen's error slot shows the ENGINE's sentence, not a paraphrase.
      assert.match(refusalMessage(err.body), /cannot produce transparent output/);
      return true;
    });
});
