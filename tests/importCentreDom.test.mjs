// The Import Centre, actually mounted.
//
// The pure tests in `imports.test.mjs` prove the RULES; this proves the screen
// puts them on the page. The failure it exists to catch is the one that unit
// tests structurally cannot see: a preview panel that renders a row count and
// a green tick without the sentence that says nothing has been imported yet.
// That screen would pass every rule test in the repo and still undo the
// feature, because the user would click away believing the file was in.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "brand-1", name: "Complot", slug: "complot", has_result: false };

const KINDS = {
  kinds: [
    { kind: "ventas", label: "Ventas", required: [{ field: "qty", label: "Cantidad" }], optional: [] },
    { kind: "catalogo", label: "Catálogo de productos", required: [], optional: [] },
  ],
  not_yet: [
    { kind: "brand_deck", label: "Brand book / deck (PDF)", why: "Todavía no. Leer un PDF de marca…" },
  ],
  formats: ["CSV (, o ;)", "XLSX"],
};

const WAITING = {
  id: "imp-1", kind: "ventas", label: "Ventas", filename: "ventas-junio.csv",
  status: "interpreted", row_count: 137, skipped_rows: 3, blocking: [],
  result: {}, confirmed_at: null, incorporated_at: null,
  steps: [
    { key: "uploaded", label: "Subido", done: true, detail: "ventas-junio.csv · 5755 bytes" },
    { key: "interpreted", label: "Interpretado", done: true, detail: "137 fila(s) legibles" },
    { key: "mapped", label: "Campos mapeados", done: true, detail: "Cantidad ← U vendidas" },
    { key: "confirmed", label: "Confirmado por vos", done: false, detail: null },
    { key: "incorporated", label: "Incorporado", done: false, detail: null },
  ],
};

async function render() {
  installDom();
  stubFetch(async (path) => {
    if (path === "/healthz") return { status: "ok" };
    if (path === "/brands") return [BRAND];
    if (path === "/me") return { authenticated: false, user: null };
    if (path === `/brands/${BRAND.id}/imports/kinds`) return KINDS;
    if (path === `/brands/${BRAND.id}/imports`) {
      return { imports: [WAITING], awaiting_confirmation: 1, kinds_incorporated: [] };
    }
    return undefined;
  });

  const { EngineProvider } = await import("@/components/EngineProvider");
  const ImportCentre = (await import("@/components/ImportCentre")).default;
  const { createElement: h } = await import("react");
  return mount(h(EngineProvider, null, h(ImportCentre, null)));
}

test("the import centre mounts and leads with what is waiting on a person", async () => {
  const view = await render();
  const text = view.text();
  assert.ok(view.container.querySelector(".imp"), "the import centre did not render");
  assert.match(text, /1 archivo esperando tu confirmación/);
  await view.unmount();
});

test("a file that was only read never reads as imported", async () => {
  const view = await render();
  assert.match(view.text(), /nada se incorporó todavía/);
  await view.unmount();
});

test("the file kinds we cannot yet read are on the page, with the reason", async () => {
  const view = await render();
  const text = view.text();
  assert.match(text, /Brand book \/ deck \(PDF\)/);
  assert.match(text, /Todavía no\./);
  await view.unmount();
});

test("the headline promise is on the page, not only in the API", async () => {
  const view = await render();
  assert.match(view.text(), /nada se incorpora hasta que vos confirmás/i);
  await view.unmount();
});
