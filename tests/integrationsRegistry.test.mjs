// The Integraciones screen, actually mounted, against the engine's registry.
//
// This screen used to render five hardcoded logos from `lib/data.js`. It is the
// first surface a pilot brand opens, so what it claims matters more here than
// almost anywhere else, and the failure it can produce is specific: a roadmap
// that reads as a product.
//
// The registry (engine 0048) can now tell apart three things that a single
// "connected / not connected" toggle could not, and the tests below exist to
// keep them apart:
//
//   · we have an adapter and this brand turned it on        -> activada
//   · we have an adapter and this brand has not             -> disponible
//   · we have NO adapter and the brand says it uses it      -> declarada,
//     which is a fact about the brand and NOT a capability of ours
//
// The fourth case is the engine being unreachable, where the honest screen
// shows nothing rather than a familiar-looking list of logos.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "brand-1", name: "Complot", slug: "complot", has_result: false };

const REGISTRY = {
  integrations: [
    { id: "shopify", name: "Shopify", provider: "Shopify", category: "commerce",
      capabilities: ["catalog", "sales", "stock"], access_method: "api",
      available_to_enable: true, adapter_installed: true,
      enabled_for_brand: true, credentials_ref: null, configuration: {} },
    { id: "csv-sftp", name: "Archivos (Centro de importación)", provider: "atelier", category: "file",
      capabilities: ["range_plan", "costs"], access_method: "sftp",
      available_to_enable: true, adapter_installed: true,
      enabled_for_brand: false, credentials_ref: null, configuration: {} },
    { id: "centric-plm", name: "Centric PLM", provider: "Centric", category: "plm",
      capabilities: ["range_plan", "materials"], access_method: "api",
      available_to_enable: false, adapter_installed: false,
      enabled_for_brand: true, credentials_ref: "vault://centric", configuration: {} },
    { id: "raspberry-ai", name: "Raspberry AI", provider: "Raspberry AI", category: "creative",
      capabilities: ["image_generation"], access_method: "api",
      available_to_enable: false, adapter_installed: false,
      enabled_for_brand: false, credentials_ref: null, configuration: {} },
  ],
  note: "Registrado no es lo mismo que disponible.",
};

async function render({ registry = REGISTRY } = {}) {
  installDom();
  stubFetch(async (path) => {
    if (path === "/healthz") return { status: "ok" };
    if (path === "/brands") return [BRAND];
    if (path === "/me") return { authenticated: false, user: null };
    if (path === `/brands/${BRAND.id}/imports/kinds`) return { kinds: [], not_yet: [], formats: [] };
    if (path === `/brands/${BRAND.id}/imports`) {
      return { imports: [], awaiting_confirmation: 0, kinds_incorporated: [] };
    }
    if (path === `/registry/brands/${BRAND.id}/integrations`) {
      if (registry === null) throw new Error("500 registry");
      return registry;
    }
    return undefined;
  });

  const { EngineProvider } = await import("@/components/EngineProvider");
  const Integrations = (await import("@/components/views/Integrations")).default;
  const { createElement: h } = await import("react");
  return mount(h(EngineProvider, null, h(Integrations, null)));
}

test("the connector list comes from the registry, not from a bundled array", async () => {
  const view = await render();
  const text = view.text();
  for (const name of ["Shopify", "Centric PLM", "Raspberry AI"]) {
    assert.match(text, new RegExp(name), `${name} is registered and not on the page`);
  }
  // The old hardcoded list had these and the registry does not. If they come
  // back, something is reading lib/data.js again.
  assert.doesNotMatch(text, /Klaviyo/);
  assert.doesNotMatch(text, /Pinterest/);
  await view.unmount();
});

test("an integration the brand enabled with no adapter says what it is and is not", async () => {
  const view = await render();
  const text = view.text();
  // The claim is about the BRAND ("it runs Centric"), never about us.
  assert.match(text, /Declarada por la marca/);
  assert.match(text, /No podemos leerlo\s+todavía/);
  await view.unmount();
});

test("having an adapter and being switched on are different states on the page", async () => {
  const view = await render();
  const text = view.text();
  assert.match(text, /Activada para esta marca/);   // shopify: adapter + on
  assert.match(text, /Disponible, sin activar/);    // csv-sftp: adapter, off
  assert.match(text, /Sin adaptador en este despliegue/);  // raspberry: neither
  await view.unmount();
});

test("the count separates registered, activated and actually speakable", async () => {
  const view = await render();
  assert.match(view.text(), /2 activada\(s\) de 4 registrada\(s\); 2 con adaptador acá/);
  await view.unmount();
});

test("with the registry unreadable the screen says so instead of inventing cards", async () => {
  const view = await render({ registry: null });
  const text = view.text();
  assert.match(text, /Registro no disponible/);
  assert.match(text, /una lista de ejemplo diría algo que nadie afirmó/);
  assert.doesNotMatch(text, /Shopify/);
  await view.unmount();
});

test("nothing on the screen reports a connection that was not established", async () => {
  const view = await render();
  const text = view.text();
  // "Conectado" is the word the 07-21 audit removed. The engine card owns its
  // own live state; no connector card may claim one.
  const cards = [...view.container.querySelectorAll(".intg-card")]
    .filter((el) => !el.classList.contains("engine-card"));
  assert.ok(cards.length >= 4);
  for (const card of cards) {
    assert.doesNotMatch(card.textContent, /\bConectado\b/);
  }
  assert.doesNotMatch(text, /sample/i);   // the sample badges are gone with the array
  await view.unmount();
});


test("the product name is the title, not the company that makes it", async () => {
  // The catalogue rendered "atelier · ARCHIVOS" before `name` existed (engine
  // 0049). Nobody looks for the import centre under "atelier".
  const view = await render();
  assert.match(view.text(), /Archivos \(Centro de importación\)/);
  await view.unmount();
});
