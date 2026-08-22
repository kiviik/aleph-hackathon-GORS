// Explorar, actually mounted, in both calibration states.
//
// `tests/tasteRanking.test.mjs` pins the pure half — the ordering, the wording,
// the refusals. This mounts the screen that renders them, because the property
// the reviewer will check is a property of the SCREEN: with zero judgments
// recorded, the grid is in matrix order and the page says, in words, that taste
// is not calibrated yet and how many comparisons are missing.
//
// Both states run against the real component and the real EngineProvider; only
// the network is stubbed. Run with `npm test`.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "brand-1", name: "Complot", slug: "complot", has_result: false };

const combo = (silueta, color, tejido) => ({
  silueta: { name: silueta }, color: { name: color, hex: "#2846D8" },
  tejido: { name: tejido, comp: "80% CO" }, detalle: "", fit: "",
});

// Three finished concepts, stored in the order the matrix produced them.
const CONCEPTS = [
  { id: "c1", code: "V1", combo: combo("vestido", "negro", "Viscosa"),
    status: "done", url: "/static/v1.png", idb: false, score: 40, band: "adjacent",
    dnaScore: null, dnaBand: null, selected: false },
  { id: "c2", code: "H1", combo: combo("hoodie", "azul", "Frisa"),
    status: "done", url: "/static/h1.png", idb: false, score: 55, band: "open",
    dnaScore: null, dnaBand: null, selected: false },
  { id: "c3", code: "R1", combo: combo("remera", "crudo", "Jersey"),
    status: "done", url: "/static/r1.png", idb: false, score: 70, band: "open",
    dnaScore: null, dnaBand: null, selected: false },
];

const STORED = {
  sel: { siluetas: [], tejidos: [], colores: [], detalles: [], fits: [] },
  weights: { silueta: 0.3, tejido: 0.3, color: 0.2, detalle: 0.1, fit: 0.1 },
  adnFiel: 0.82, count: 3, brief: "", refCodes: "", concepts: CONCEPTS,
};

const UNCALIBRATED = {
  dimension: "creative", calibrated: false, n_judgments: 0, need_judgments: 20,
  missing_judgments: 20, accuracy: null, ranker_accuracy: null, terms: [],
  garments: 0,
  reason: "faltan comparaciones: 0 de 20 necesarias para calibrar",
  reason_code: { code: "needs_more_judgments", params: { have: 0, need: 20 } },
};

const CALIBRATED = {
  dimension: "creative", calibrated: true, n_judgments: 48, need_judgments: 20,
  missing_judgments: 0, accuracy: 0.7143, ranker_accuracy: 0.83, n_test: 7,
  garments: 9, components: 1, reason: null, reason_code: null,
  terms: [
    { term: "tipo:hoodie", label: "Hoodies", kind: "tipo", weight: 0.61, garments: 4, above_average: true },
    { term: "tipo:remera", label: "Remeras", kind: "tipo", weight: 0.12, garments: 3, above_average: true },
    { term: "tipo:vestido", label: "Vestidos", kind: "tipo", weight: -0.5, garments: 2, above_average: false },
  ],
};

// Hoodie first, dress last — the reverse of the stored matrix order, so a
// changed order cannot be a coincidence of insertion.
const SCORES = [
  { id: "c1", score: -0.5, matched: [{ term: "tipo:vestido", label: "Vestidos" }] },
  { id: "c2", score: 0.61, matched: [{ term: "tipo:hoodie", label: "Hoodies" }] },
  { id: "c3", score: 0.12, matched: [{ term: "tipo:remera", label: "Remeras" }] },
];

async function renderExplore({ profile, scores = [] }) {
  installDom();
  localStorage.setItem("atelier-explore-v1", JSON.stringify(STORED));
  const calls = [];
  stubFetch(async (path, init) => {
    calls.push([path, init?.method || "GET"]);
    if (path === "/healthz") return { status: "ok" };
    if (path === "/brands") return [BRAND];
    if (path === "/me") return { authenticated: false, user: null };
    if (path === `/brands/${BRAND.id}/catalog`) return { products: [], total_products: 0 };
    if (path === `/brands/${BRAND.id}/fit/taste-profile`) return profile;
    if (path === `/brands/${BRAND.id}/fit/taste-rank`) return { ...profile, scores };
    return undefined;
  });

  const { EngineProvider } = await import("@/components/EngineProvider");
  const StudioExplore = (await import("@/components/StudioExplore")).default;
  const { createElement: h } = await import("react");

  const view = await mount(h(EngineProvider, null, h(StudioExplore, {
    engine: { status: "demo", trends: [], dna: null, brandId: BRAND.id },
    fabrics: [], quality: "draft", collName: "Otoño 26",
    callGenerate: async () => "data:image/png;base64,iVBORw0KGgo=",
    flash: () => {}, onSendToCollection: () => {},
    brandId: BRAND.id, onNavigate: () => {},
  })));
  return { ...view, calls };
}

/** The concept titles, top to bottom, as a designer would read them. */
const gridOrder = (container) =>
  [...container.querySelectorAll(".xc .bd .t")].map((n) => n.textContent.trim());

// ---- zero judgments: the state the product is actually in --------------------

test("with nothing calibrated the grid stays in matrix order", async () => {
  const view = await renderExplore({ profile: UNCALIBRATED });
  assert.deepEqual(gridOrder(view.container),
    ["vestido · Viscosa", "hoodie · Frisa", "remera · Jersey"]);
  await view.unmount();
});

test("and the screen says so, with the comparisons still missing", async () => {
  const view = await renderExplore({ profile: UNCALIBRATED });
  const text = view.text();
  assert.match(text, /El gusto aprendido todavía no ordena esta pantalla/);
  assert.match(text, /Faltan comparaciones: 0 de 20/);
  assert.match(text, /orden de siempre, sin criterio de gusto/);
  // The route out is on screen, and it carries the number.
  assert.match(text, /Calibrar — faltan 20 comparaciones/);
  await view.unmount();
});

test("nothing on an uncalibrated screen claims a taste judgement", async () => {
  const view = await renderExplore({ profile: UNCALIBRATED });
  const text = view.text();
  assert.ok(!/Ordenado por el gusto aprendido/.test(text), text.slice(0, 400));
  // No taste sort option to pick, and no rank badges on the cards.
  assert.ok(![...view.container.querySelectorAll("option")]
    .some((o) => o.value === "gusto"), "an unearned sort option was offered");
  assert.equal(view.container.querySelectorAll(".xc .rank").length, 0);
  await view.unmount();
});

test("an uncalibrated brand is never asked to score anything", async () => {
  const view = await renderExplore({ profile: UNCALIBRATED });
  assert.ok(!view.calls.some(([p]) => p.endsWith("/fit/taste-rank")),
    "the studio asked for scores the engine cannot have earned");
  await view.unmount();
});

test("an engine that never answers is not mistaken for an uncalibrated brand", async () => {
  const view = await renderExplore({ profile: undefined }); // 404 -> null
  assert.match(view.text(), /sin respuesta del motor/);
  assert.deepEqual(gridOrder(view.container),
    ["vestido · Viscosa", "hoodie · Frisa", "remera · Jersey"]);
  await view.unmount();
});

// ---- calibrated: the same screen, steered ------------------------------------

test("a calibrated brand reorders the grid by its own taste", async () => {
  const view = await renderExplore({ profile: CALIBRATED, scores: SCORES });
  assert.deepEqual(gridOrder(view.container),
    ["hoodie · Frisa", "remera · Jersey", "vestido · Viscosa"]);
  await view.unmount();
});

test("the calibrated screen names its evidence instead of a bare score", async () => {
  const view = await renderExplore({ profile: CALIBRATED, scores: SCORES });
  const text = view.text();
  assert.match(text, /Ordenado por el gusto aprendido de tu equipo/);
  assert.match(text, /48 comparaciones del equipo/);
  assert.match(text, /71% de acierto sobre 7 pares retenidos/);
  assert.match(text, /3 rasgos medidos en 9 prendas juzgadas/);
  // And what the team actually preferred, with how many garments back it.
  assert.match(text, /Hoodies \(4 prendas\)/);
  await view.unmount();
});

test("a concept with no measured trait is marked, not ranked", async () => {
  const view = await renderExplore({
    profile: CALIBRATED,
    scores: [SCORES[1], { id: "c1", score: null, matched: [] },
             { id: "c3", score: null, matched: [] }],
  });
  assert.deepEqual(gridOrder(view.container),
    ["hoodie · Frisa", "vestido · Viscosa", "remera · Jersey"]);
  const badges = [...view.container.querySelectorAll(".xc .rank")]
    .map((n) => n.textContent.trim());
  assert.deepEqual(badges, ["#1", "sin medir", "sin medir"]);
  assert.match(view.text(), /2 sin rasgos que el equipo haya comparado/);
  await view.unmount();
});
