// The tech-pack desk, actually mounted.
//
// `techPackSections.test.mjs` proves the RULES; this proves the screen puts
// them on the page. The restructure into three regions (reference
// `design/atelier-redesign/03-product-tech-pack.png`) is exactly the kind of
// change a pure test cannot see: every derivation could be right and the desk
// still render one column of nothing, or — the failure that matters — put a
// model's sentence into the pack on a single click.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "brand-1", name: "Complot", slug: "complot", has_result: false };
const PACK_ID = "pack-1";

// Shaped like `tech_pack.as_record` — imported values from the slot and the
// material sheet, one calculated cost, one model proposal, and the audit as
// `preflight.evaluate` returns it (open flags in `flags`, resolved in `passed`).
const PACK = {
  id: PACK_ID, style_number: "COM-PANT-01", name: "Pantalón ancho", version: 2,
  status: "draft", slot_code: "T-04",
  fields: {
    category: { value: "pantalón", provenance: "imported",
                source: "assortment_slots.category" },
    quantity: { value: 300, provenance: "imported",
                source: "assortment_slots.planned_units" },
    material_reference: { value: "TEX-114", provenance: "imported",
                          source: "assortment_slots.material_id" },
    fabric_composition: { value: "70% lana / 30% poliéster", provenance: "imported",
                          source: "brand_materials.TEX-114" },
    fabric_weight: { value: "260 gsm", provenance: "imported",
                     source: "brand_materials.TEX-114" },
    landed_cost_decomposition: { value: { first_cost: 12.5 }, provenance: "calculated",
                                 source: "costing.landed_cost(assortment_slots.*_cost)" },
    seam_types: { value: "costados con overlock de 4 hilos", provenance: "ai_proposed",
                  source: "tech_pack_generator" },
  },
  audit: {
    summary: { checks_run: 31, open: 2, can_be_quoted: false,
               by_tier: { blocking: 1, sample_round: 1, cost_variance: 0 } },
    flags: [
      { key: "fabric_construction", tier: "blocking", status: "missing",
        field: "Fabric construction",
        why: "Jersey, interlock, poplin, twill — different mills.",
        they_will_ask: { en: "What construction — single jersey or interlock?",
                         zh: "针织组织是什么? 单面还是双面?" },
        suggest: 'e.g. "single jersey, combed cotton"', note: "", found: {} },
      { key: "stitch_density", tier: "sample_round", status: "missing",
        field: "Stitch density (SPI)",
        why: "Affects durability, appearance and machine time.",
        they_will_ask: { en: "What's the stitch density?", zh: "针距是多少?" },
        suggest: 'e.g. "12 SPI"', note: "", found: {} },
    ],
    passed: [
      { key: "fabric_composition", tier: "blocking", status: "present",
        field: "Fabric composition (exact %)", why: "", they_will_ask: {},
        suggest: "", note: "", found: {} },
      { key: "fabric_weight", tier: "blocking", status: "present",
        field: "Fabric weight (GSM or oz)", why: "", they_will_ask: {},
        suggest: "", note: "", found: {} },
      { key: "quantity", tier: "blocking", status: "present",
        field: "Quantity or quantity range", why: "", they_will_ask: {},
        suggest: "", note: "", found: {} },
    ],
  },
};

// Every write is recorded rather than performed, so a test can assert that a
// click did NOT reach the engine — which is the whole governance question.
const writes = [];

async function render() {
  installDom();
  writes.length = 0;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    if (init?.method && init.method !== "GET") {
      writes.push({ path, method: init.method, body: init.body });
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const body = await (async () => {
      if (path === "/healthz") return { status: "ok" };
      if (path === "/readyz") return { status: "ok" };
      if (path === "/brands") return [BRAND];
      if (path === "/me") return { authenticated: false, user: null };
      if (path === `/brands/${BRAND.id}/tech-packs/${PACK_ID}`) return PACK;
      if (path === `/brands/${BRAND.id}/tech-packs`) return { tech_packs: [PACK] };
      if (path === `/brands/${BRAND.id}/measurement-blocks`) {
        return { measurement_blocks: [] };
      }
      if (path === `/brands/${BRAND.id}/suppliers`) return { items: [] };
      if (path === `/brands/${BRAND.id}/tech-packs/${PACK_ID}/recipients`) {
        return { recipients: [] };
      }
      return undefined;
    })();
    if (body === undefined) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => body };
  };

  const { EngineProvider } = await import("@/components/EngineProvider");
  const TechPack = (await import("@/components/views/TechPack")).default;
  const { createElement: h } = await import("react");
  return mount(h(EngineProvider, null, h(TechPack, { packId: PACK_ID })));
}

const click = async (view, el) => {
  const { act } = await import("react");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};

test("the desk mounts and commits without a console error", async () => {
  // ⚠ THE SUBSTITUTE FOR OPENING THE BROWSER, and it is a real one: React
  // reports duplicate keys, invalid nesting, unknown DOM props and effect
  // faults through console.error, and a jsdom commit takes the same path a
  // browser does. It cannot see paint; it can see everything that would fill
  // the console on load.
  const seen = [];
  const real = console.error;
  console.error = (...args) => { seen.push(args.map(String).join(" ")); };
  try {
    const view = await render();
    // Exercise the interactive seams too — a key warning on a list only
    // appears once its branch has rendered.
    for (const sec of [...view.container.querySelectorAll(".tp-sec")]) {
      await click(view, sec);
    }
    for (const tab of [...view.container.querySelectorAll(".tp-tab")]) {
      await click(view, tab);
    }
    await view.unmount();
  } finally {
    console.error = real;
  }
  assert.deepEqual(seen, [], "the desk logged errors on mount:\n" + seen.join("\n"));
});

test("the desk renders three regions, not one column of tables", async () => {
  const view = await render();
  assert.ok(view.container.querySelector(".tp-desk"), "the desk grid is missing");
  assert.ok(view.container.querySelector(".tp-rail"), "the section rail is missing");
  assert.ok(view.container.querySelector(".tp-canvas"), "the working area is missing");
  assert.ok(view.container.querySelector(".tp-insp"), "the inspector is missing");
  await view.unmount();
});

test("the rail lists only the sections this pack actually has", async () => {
  const view = await render();
  const labels = [...view.container.querySelectorAll(".tp-sec-l")]
    .map((el) => el.textContent);
  // Six sections have content in the fixture; the other four in the taxonomy
  // have neither a field nor a check here and must not be drawn.
  assert.deepEqual(labels, ["Identidad", "Tela", "Construcción", "Comercial"]);
  for (const absent of ["Medidas y talles", "Diseño", "Documento",
                        "Etiquetas y empaque", "Color y gráfica", "Calendario"]) {
    assert.ok(!labels.includes(absent),
      `${absent} has nothing in this pack and must not appear as an empty row`);
  }
  await view.unmount();
});

test("completion in the rail is counted, not scored", async () => {
  const view = await render();
  const rail = view.container.querySelector(".tp-rail").textContent;
  assert.match(rail, /2 de 4 secciones sin puntos abiertos/);
  assert.match(rail, /0 de 7 campos verificados/);
  assert.ok(!/%/.test(rail), "no percentage may appear in the rail");
  // The dot never speaks alone: every state carries its word.
  for (const dot of view.container.querySelectorAll(".tp-dot")) {
    assert.ok(dot.getAttribute("aria-label"), "a state dot with no label");
  }
  await view.unmount();
});

test("selecting a section changes the working area and the inspector", async () => {
  const view = await render();
  const secs = [...view.container.querySelectorAll(".tp-sec")];
  const tela = secs.find((b) => b.textContent.includes("Tela"));
  await click(view, tela);

  const canvas = view.container.querySelector(".tp-canvas").textContent;
  assert.match(canvas, /fabric composition/);
  assert.match(canvas, /70% lana/);
  assert.match(canvas, /Fabric construction/, "the section's open point is missing");
  // And the inspector follows the first field of the new section.
  const insp = view.container.querySelector(".tp-insp").textContent;
  assert.match(insp, /Componentes vinculados/);
  assert.match(insp, /brand_materials.TEX-114/,
    "the resolved material row is the only real link this engine has");
  await view.unmount();
});

test("the inspector carries the engine's own supplier question, in both languages", async () => {
  const view = await render();
  const tela = [...view.container.querySelectorAll(".tp-sec")]
    .find((b) => b.textContent.includes("Tela"));
  await click(view, tela);
  const flagBtn = [...view.container.querySelectorAll(".tp-f-k")]
    .find((b) => b.textContent === "Fabric construction");
  await click(view, flagBtn);

  const insp = view.container.querySelector(".tp-insp").textContent;
  assert.match(insp, /What construction — single jersey or interlock\?/);
  assert.match(insp, /针织组织是什么/);
  // ⚠ The engine's `suggest` is an EXAMPLE. Presenting it as insertable would
  // put an invented value on a document a factory quotes from.
  assert.match(insp, /single jersey, combed cotton/);
  assert.match(insp, /no un valor de esta prenda/);
  await view.unmount();
});

test("a field preflight does not audit says so rather than echoing itself", async () => {
  const view = await render();
  // `identidad` is the default section and `category` its first field; the
  // engine runs no check on it — "factories do not bounce a pack for naming
  // its category".
  const insp = view.container.querySelector(".tp-insp").textContent;
  assert.match(insp, /El motor no corre ningún chequeo sobre este campo/);
  await view.unmount();
});

// --------------------------------------------------------------------------- //
// the governance rule, at the seam where it can actually break
// --------------------------------------------------------------------------- //

test("Insertar borrador opens the editor and writes NOTHING", async () => {
  const view = await render();
  const constr = [...view.container.querySelectorAll(".tp-sec")]
    .find((b) => b.textContent.includes("Construcción"));
  await click(view, constr);

  const insert = [...view.container.querySelectorAll(".tp-act")]
    .find((b) => b.textContent.includes("Insertar borrador"));
  assert.ok(insert, "an ai_proposed field must offer an explicit insert");

  await click(view, insert);

  assert.deepEqual(writes, [],
    "inserting a draft reached the engine — one click would have turned a "
    + "model's sentence into a person's signed attestation, which is the "
    + "silent AI edit the reference forbids");

  const input = view.container.querySelector(".tp-input");
  assert.ok(input, "the draft must land in an editable field, not in the pack");
  assert.equal(input.value, "costados con overlock de 4 hilos");

  // And the second act is a separate, named button.
  const save = [...view.container.querySelectorAll(".tp-act")]
    .find((b) => b.textContent === "Guardar y verificar");
  assert.ok(save, "the human's signing act must be its own button");
  await view.unmount();
});

test("the proposal count is stated even before you look for it", async () => {
  const view = await render();
  const rail = view.container.querySelector(".tp-rail").textContent;
  assert.match(rail, /1 campo fue propuesto/);
  assert.match(rail, /no libera/, "the release consequence must travel with it");
  await view.unmount();
});

test("nothing on the desk can push the page sideways", async () => {
  // ⚠ A CSS RULE, because jsdom does no layout and this is the one defect a
  // three-column grid reliably ships with: a `1fr` track floors at min-content,
  // so one long field value (a landed-cost JSON, a 40-word note) widens the
  // whole document and the app scrolls horizontally at every width.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../components/views/TechPack.jsx", import.meta.url), "utf8");
  const desk = src.match(/\.tp-desk\{([^}]*)\}/)?.[1] || "";
  assert.match(desk, /grid-template-columns:[^;]*minmax\(0,\s*1fr\)/,
    "the centre track must be minmax(0,1fr), never a bare 1fr");
  assert.match(src, /@media \(max-width:1140px\)\{\.tp-desk\{grid-template-columns:1fr\}\}/,
    "the three regions must collapse rather than squeeze");
  assert.match(src, /\.tp-scroll\{overflow-x:auto;max-width:100%\}/,
    "wide content scrolls inside its own container, not the page");
  // Every table on the screen sits inside that container.
  const view = await render();
  for (const t of view.container.querySelectorAll("table")) {
    assert.ok(t.closest(".tp-scroll"),
      `a <table> outside .tp-scroll can widen the page: ${t.className}`);
  }
  await view.unmount();
});

test("the release gate, the reading and the named absences all survive", async () => {
  const view = await render();
  const text = view.text();
  assert.match(text, /Esta ficha no puede liberarse/);
  assert.match(text, /Poblada no es verificada/);
  assert.match(text, /Intentar liberar/);
  // TechPack.jsx:8-14's deliberate absences, still labelled on the surface.
  assert.match(text, /no muestra ruta crítica/);
  assert.match(text, /desempeño del proveedor/);
  assert.match(text, /comparación de cotizaciones entre temporadas/);
  await view.unmount();
});
