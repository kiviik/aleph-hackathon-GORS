// "Colección real" is the engine's word, not a deduction from reachability.
//
// ⚠ WHAT SHIPPED (owner review, 2026-08-13): *"The brand named 'Marca Piloto
// (datos inventados)' displays 'Colección real · sin corrida de mercado.' The
// application has no typed distinction between real, synthetic and mixed
// tenants; `connected` is incorrectly treated as proof that the data is real."*
//
// The chip's job is to say how much to trust what is on screen. `connected`
// proves the engine answered — nothing more. The brands table now carries
// `data_classification: real | synthetic | mixed` (engine migration 0063), and
// the chip only says "real" when the engine says so. Unknown gets the neutral
// label, never the strong one.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

function brandStub(classification) {
  // Named "Complot" because brand RESOLUTION is not under test here and the
  // provider only selects a brand matching its configured default — any other
  // name resolves nothing and the chip shows the no-brand state instead.
  const brand = { id: "b-1", name: "Complot", slug: "complot", has_result: false,
                  ...(classification === undefined ? {}
                     : { data_classification: classification }) };
  stubFetch(async (path) => {
    if (path === "/healthz") return { status: "ok", mode: "demo", build: { commit: "t" } };
    if (path === "/brands") return [brand];
    if (path === "/me") return { authenticated: false };
    if (path.endsWith("/users")) return [];
    return {};
  });
}

async function chipText(classification) {
  installDom();
  brandStub(classification);
  const { default: React, act } = await import("react");
  const { default: Shell } = await import("@/components/Shell");
  const view = await mount(React.createElement(Shell));
  for (let i = 0; i < 4; i++) await act(async () => {});
  const text = view.text() || "";
  await view.unmount();
  return text;
}

test("a synthetic tenant is never introduced as a real collection", async () => {
  const text = await chipText("synthetic");
  assert.ok(!/Colección real/.test(text),
    "the chip said 'Colección real' for a brand the engine marks synthetic — " +
    "connected proves reachability, not provenance");
  assert.match(text, /sintética/,
    "the synthetic state should be stated, not hidden");
});

test("a real tenant keeps the strong label", async () => {
  const text = await chipText("real");
  assert.match(text, /Colección real/,
    "the engine says these rows are real; the chip may say so");
});

test("an unclassified tenant gets the neutral label, not the strong one", async () => {
  // An engine predating migration 0063 sends no field at all. Unknown is not
  // license: the strong claim needs the typed answer.
  const text = await chipText(undefined);
  assert.ok(!/Colección real/.test(text),
    "with no classification the chip claimed 'real' — unknown must stay unknown");
});
