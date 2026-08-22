// The product workspace, actually mounted.
//
// On 2026-07-25 opening any product threw
//
//     ReferenceError: Cannot access 'personaBrandId' before initialization
//
// and took the creative half of the product with it. 59/59 tests passed while
// it shipped, because nothing in this repo had ever rendered a component —
// `tests/componentInitOrder.test.mjs` says so in its own header and asks to be
// replaced by a mount. This is that mount. It keeps the static check honest
// company: the source rule catches the shape across every .jsx, this catches
// anything that only fails when React actually runs the function.
//
// The component is mounted in BOTH engine states, because they are different
// code paths through the same body: with no engine the persona bucket is null,
// with a connected brand it is that brand's id. A test that only covered the
// offline path would not notice a crash reachable only once a brand resolves.
//
// Run with `npm run test:dom` (or `npm test`, which includes it). The JSX and
// `@/` handling lives in tests/harness/.
import assert from "node:assert/strict";
import test from "node:test";

// Self-registering, so `node --test tests/studioWorkspace.test.mjs` works on
// its own. `npm test` also installs the hooks via `--import`; the second
// registration is a no-op. The `@/` imports below are dynamic, so they resolve
// after this line has run.
import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "brand-1", name: "Complot", slug: "complot", has_result: false };

const TEAM = [
  { id: "u1", name: "Ana Diseño", email: "ana@example.test", can_approve: false },
  { id: "u2", name: "Rita Dirección", email: "rita@example.test", can_approve: true },
];

// A product mid-flight: it has a base concept, one variant, an owner and an
// approver. The empty-item case renders less code, so this is the one worth
// mounting.
const item = () => ({
  id: "it-1",
  name: "Buzo boxy",
  silhouette: "hoodie",
  fabricId: "fab-1",
  colorway: "#2846D8",
  nota: "capucha doble, puño ancho",
  refImage: null,
  cover: "/media/concepts/it-1-base.png",
  modelShot: null,
  detailShot: null,
  rating: 4,
  approved: false,
  ownerId: "u1",
  approverId: "u2",
  approvalStatus: "in_progress",
  dueAt: "2026-08-12",
  images: [
    { id: "v2", kind: "concepto", url: "/media/concepts/it-1-v2.png", note: "puño ancho",
      at: "2026-07-24T10:00:00.000Z", quality: "final", costCents: 6 },
    { id: "v1", kind: "concepto", url: "/media/concepts/it-1-base.png", note: "base",
      at: "2026-07-23T10:00:00.000Z", quality: "draft", costCents: 1 },
  ],
});

const coll = () => {
  const it = item();
  return { id: "coll-1", name: "Otoño 26", season: "AW26", updatedAt: "2026-07-24T10:00:00.000Z", items: [it] };
};

// Mirrors the call site in components/views/DesignStudio.jsx.
function props(overrides = {}) {
  const c = coll();
  const noop = () => {};
  return {
    item: c.items[0],
    coll: c,
    itemIndex: 0,
    fabric: { id: "fab-1", name: "Frisa de algodón", comp: "80% algodón / 20% poliéster",
      weight: "320 g/m²", origin: "Buenos Aires", swatch: "/media/fabrics/fab-1.jpg" },
    palette: ["#2846D8", "#17181C", "#E7E4DC"],
    trends: [
      { trend_name: "Oversize urbano", score: 0.71, keywords: ["boxy", "hoodie"] },
      { trend_name: "Neutros crudos", score: 0.44, keywords: ["crudo", "arena"] },
    ],
    dna: { silhouettes: ["boxy", "cargo"], materials: ["frisa", "jersey"],
      tone: ["urbano"], colors: ["#2846D8"], priceArchitecture: [] },
    quality: "draft",
    cost: 1,
    abs: (url) => (url?.startsWith("/") ? `http://127.0.0.1:8000${url}` : url),
    patchItem: noop,
    callGenerate: async () => "data:image/png;base64,iVBORw0KGgo=",
    approve: noop,
    exportPng: noop,
    onClose: noop,
    onCommit: noop,
    flash: noop,
    ...overrides,
  };
}

// The providers are the real ones — a hand-rolled fake context would not have
// caught this bug's cousin (the run-gate confusion EngineProvider documents),
// because the fake would encode whatever the test author already believed.
async function renderWorkspace({ engineUp }) {
  installDom();
  stubFetch(async (path) => {
    if (!engineUp) throw new Error("engine unreachable");
    if (path === "/healthz") return { status: "ok" };
    if (path === "/brands") return [BRAND];
    if (path === "/me") return { authenticated: true, user: TEAM[0] };
    if (path === `/brands/${BRAND.id}/users`) return TEAM;
    return undefined;
  });

  const { EngineProvider } = await import("@/components/EngineProvider");
  const { IdentityProvider } = await import("@/components/IdentityProvider");
  const StudioItemEditor = (await import("@/components/StudioItemEditor")).default;
  const { createElement: h } = await import("react");

  return mount(
    h(EngineProvider, null,
      h(IdentityProvider, null,
        h(StudioItemEditor, props()))),
  );
}

test("the product workspace mounts with no engine (pilot mode)", async () => {
  const view = await renderWorkspace({ engineUp: false });
  assert.ok(view.container.querySelector(".ie"), "workspace root did not render");
  await view.unmount();
});

test("the product workspace mounts against a connected brand", async () => {
  const view = await renderWorkspace({ engineUp: true });
  assert.ok(view.container.querySelector(".ie"), "workspace root did not render");
  // The item's own spec has to be on screen — a root that renders but shows
  // none of the product would satisfy a bare "did not throw" assertion.
  assert.match(view.text(), /Frisa de algodón/,
    "the fabric spec is missing, so the workspace rendered empty");
  await view.unmount();
});
