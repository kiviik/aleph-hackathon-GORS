// Learned taste steering the Studio — and, mostly, refusing to.
//
// The reviewer's case is a brand with ZERO judgments, which is the live state:
// 36 real garments in the fit pool and nobody has compared any of them. So the
// uncalibrated path is the one with the most tests here. The property that must
// never break: with nothing calibrated, the list a screen renders is the list it
// would have rendered anyway, and the screen says so.
import test from "node:test";
import assert from "node:assert/strict";

import {
  conceptCandidate, coverageLine, fetchTasteProfile, fetchTasteScores,
  itemCandidate, matchedSummary, orderByTaste, scoreIndex, tasteReason,
  tasteStatus, topByTaste, topTerms,
} from "../lib/tasteRanking.mjs";

const concept = (id, silueta, color, tejido = "Frisa de algodón") => ({
  id, code: id.toUpperCase(),
  combo: {
    silueta: { name: silueta }, color: { name: color, hex: "#2846D8" },
    tejido: { name: tejido, comp: "80% CO / 20% PES" },
    detalle: "capucha doble", fit: "oversize",
  },
});

const LIST = [concept("a", "hoodie", "azul"), concept("b", "vestido", "negro"),
               concept("c", "remera", "crudo")];

const CALIBRATED = {
  dimension: "creative", calibrated: true, n_judgments: 48, need_judgments: 20,
  missing_judgments: 0, accuracy: 0.7143, ranker_accuracy: 0.83, n_test: 7,
  garments: 9, reason: null, reason_code: null,
  terms: [
    { term: "tipo:hoodie", label: "Hoodies", kind: "tipo", weight: 0.61, garments: 4, above_average: true },
    { term: "rasgo:fleece", label: "fleece", kind: "rasgo", weight: 0.22, garments: 3, above_average: true },
    { term: "tipo:dress", label: "Dresses", kind: "tipo", weight: -0.4, garments: 3, above_average: false },
  ],
};

const UNCALIBRATED = {
  dimension: "creative", calibrated: false, n_judgments: 0, need_judgments: 20,
  missing_judgments: 20, accuracy: null, ranker_accuracy: null, terms: [],
  garments: 0,
  reason: "faltan comparaciones: 0 de 20 necesarias para calibrar",
  reason_code: { code: "needs_more_judgments", params: { have: 0, need: 20 } },
};

const rankResponse = (profile, scores) => ({ ...profile, scores });

// ---- the uncalibrated state, which is the live one --------------------------

test("with nothing calibrated the engine sends no scores and none are invented", () => {
  const scores = scoreIndex(rankResponse(UNCALIBRATED, []));
  assert.equal(scores.size, 0);
});

test("a calibrated=false payload carrying scores is still ignored", () => {
  // Defence in depth: the engine refuses to send scores it has not earned, and
  // this refuses to use them even if some future version regresses.
  const scores = scoreIndex(rankResponse(UNCALIBRATED, [{ id: "a", score: 9 }]));
  assert.equal(scores.size, 0);
});

test("an uncalibrated screen shows the SAME array it would have shown", () => {
  const out = orderByTaste(LIST, scoreIndex(rankResponse(UNCALIBRATED, [])));
  assert.equal(out.applied, false);
  assert.equal(out.ordered, LIST, "the original array, not a re-sorted copy");
  assert.equal(out.ranked, 0);
});

test("the uncalibrated banner names the gap and offers the route out", () => {
  const s = tasteStatus(UNCALIBRATED);
  assert.equal(s.applied, false);
  assert.equal(s.tone, "off");
  assert.match(s.headline, /todavía no ordena/);
  assert.match(s.detail, /Faltan comparaciones: 0 de 20/);
  assert.match(s.detail, /orden de siempre/);
  assert.equal(s.cta.view, "calibration");
  assert.match(s.cta.label, /faltan 20 comparaciones/);
  assert.equal(s.missing, 20);
});

test("no uncalibrated wording ever reads as a taste judgement", () => {
  const s = tasteStatus(UNCALIBRATED);
  const said = `${s.headline} ${s.detail} ${s.cta.label}`.toLowerCase();
  // No score, no percentage, no claim about what the brand prefers.
  assert.ok(!/\d+\s*\/\s*100/.test(said), said);
  assert.ok(!/%/.test(said.replace(/faltan[^.]*/g, "")), said);
  assert.ok(!/gusto aprendido de tu equipo/.test(said), said);
});

test("one comparison short of the floor is still not calibrated, and says how short", () => {
  const nearly = {
    ...UNCALIBRATED, n_judgments: 19, missing_judgments: 1,
    reason_code: { code: "needs_more_judgments", params: { have: 19, need: 20 } },
  };
  const s = tasteStatus(nearly);
  assert.equal(s.applied, false);
  assert.match(s.cta.label, /falta 1 comparación$/, s.cta.label);
});

test("each engine refusal gets its own words, never a generic 'judge more'", () => {
  const cases = [
    [{ code: "taste_graph_disconnected", params: { components: 3 } }, /3 grupos/],
    [{ code: "taste_traits_untestable", params: { decided: 1, need: 4 } }, /decidir 1/],
    [{ code: "taste_traits_below_baseline", params: { accuracy_pct: 41.7 } }, /42% .*azar es 50%/],
    [{ code: "taste_no_shared_traits", params: { need: 2 } }, /Ningún rasgo/],
    // The one the ranker itself emits when answers contradict each other.
    [{ code: "accuracy_below_baseline", params: { have: 30, accuracy_pct: 44 } }, /se contradicen/],
  ];
  for (const [reason_code, pattern] of cases) {
    const text = tasteReason({ ...UNCALIBRATED, reason_code, reason: "SERVIDOR" });
    assert.match(text, pattern);
    assert.ok(!text.includes("SERVIDOR"), text);
  }
});

test("a code nobody has taught us falls back to the engine's sentence, never blank", () => {
  const text = tasteReason({
    ...UNCALIBRATED, reason_code: { code: "invented_next_week", params: {} },
    reason: "motivo del motor",
  });
  assert.equal(text, "motivo del motor");
  assert.notEqual(tasteReason(null).trim(), "");
});

test("no engine answer at all is a stated failure, not a silent default order", () => {
  const s = tasteStatus(null);
  assert.equal(s.applied, false);
  assert.match(s.detail, /orden de siempre/);
  assert.equal(orderByTaste(LIST, scoreIndex(null)).ordered, LIST);
});

// ---- the calibrated state ----------------------------------------------------

test("scores reorder the list, best first", () => {
  const scores = scoreIndex(rankResponse(CALIBRATED, [
    { id: "a", score: 0.61, matched: [{ term: "tipo:hoodie", label: "Hoodies" }] },
    { id: "b", score: -0.4, matched: [{ term: "tipo:dress", label: "Dresses" }] },
    { id: "c", score: 0.1, matched: [{ term: "rasgo:fleece", label: "fleece" }] },
  ]));
  const out = orderByTaste(LIST, scores);
  assert.deepEqual(out.ordered.map((c) => c.id), ["a", "c", "b"]);
  assert.equal(out.applied, true);
  assert.equal(out.ranked, 3);
  assert.equal(out.unranked, 0);
});

test("a concept the team never measured goes last WITHOUT being ranked last", () => {
  const scores = scoreIndex(rankResponse(CALIBRATED, [
    { id: "a", score: 0.61, matched: [{ term: "tipo:hoodie" }] },
    { id: "b", score: null, matched: [] },
    { id: "c", score: -0.9, matched: [{ term: "tipo:dress" }] },
  ]));
  const out = orderByTaste(LIST, scores);
  // `b` sits after the worst SCORED concept, and is counted separately so the
  // screen can say "no measurement" rather than implying it lost.
  assert.deepEqual(out.ordered.map((c) => c.id), ["a", "c", "b"]);
  assert.equal(out.ranked, 2);
  assert.equal(out.unranked, 1);
  assert.match(coverageLine(out), /2 de 3 ordenados/);
  assert.match(coverageLine(out), /1 sin rasgos .* sin puntaje/);
});

test("ties keep matrix order, so a run never shuffles between renders", () => {
  const scores = scoreIndex(rankResponse(CALIBRATED, [
    { id: "a", score: 0.5 }, { id: "b", score: 0.5 }, { id: "c", score: 0.5 },
  ]));
  assert.deepEqual(orderByTaste(LIST, scores).ordered.map((c) => c.id),
    ["a", "b", "c"]);
  assert.deepEqual(orderByTaste([...LIST].reverse(), scores).ordered.map((c) => c.id),
    ["c", "b", "a"]);
});

test("the calibrated banner names the evidence instead of printing a score", () => {
  const s = tasteStatus(CALIBRATED);
  assert.equal(s.applied, true);
  assert.equal(s.tone, "on");
  assert.match(s.detail, /48 comparaciones/);
  assert.match(s.detail, /71% de acierto sobre 7 pares retenidos/);
  assert.match(s.detail, /3 rasgos medidos en 9 prendas juzgadas/);
});

test("the preselection takes only scored concepts, best first", () => {
  const scores = scoreIndex(rankResponse(CALIBRATED, [
    { id: "a", score: 0.61 }, { id: "b", score: null }, { id: "c", score: 0.2 },
  ]));
  assert.deepEqual(topByTaste(LIST, scores, 6).map((c) => c.id), ["a", "c"],
    "an unmeasured concept is never auto-selected as if the team liked it");
  assert.deepEqual(topByTaste(LIST, scores, 1).map((c) => c.id), ["a"]);
  assert.deepEqual(topByTaste(LIST, scoreIndex(rankResponse(UNCALIBRATED, [])), 6), []);
});

test("only traits the team rates above its own average are shown as liked", () => {
  assert.deepEqual(topTerms(CALIBRATED).map((t) => t.term),
    ["tipo:hoodie", "rasgo:fleece"]);
  assert.deepEqual(topTerms(UNCALIBRATED), []);
});

test("a concept's tooltip names the traits that carried it", () => {
  assert.match(matchedSummary([{ label: "Hoodies" }, { term: "rasgo:fleece" }]),
    /Hoodies, rasgo:fleece/);
  assert.match(matchedSummary([]), /sin rasgos medidos/);
});

// ---- talking to the engine ---------------------------------------------------

test("the creative dimension is asked for by name, never defaulted server-side", async () => {
  const seen = [];
  await fetchTasteProfile(async (path) => { seen.push(path); return UNCALIBRATED; });
  assert.deepEqual(seen, ["/fit/taste-profile?dimension=creative"]);
});

test("an engine that is down is null, which is NOT an empty profile", async () => {
  const down = await fetchTasteProfile(async () => { throw new Error("ECONNREFUSED"); });
  assert.equal(down, null);
  // and the banner then says the engine did not answer, rather than "judge more"
  assert.match(tasteStatus(down).headline, /sin respuesta del motor/);
});

test("scoring sends what concepts declare and nothing else", async () => {
  let body = null;
  await fetchTasteScores(async (path, init) => { body = JSON.parse(init.body); return null; },
    LIST.map(conceptCandidate));
  assert.equal(body.dimension, "creative");
  assert.equal(body.candidates.length, 3);
  assert.ok(!JSON.stringify(body).includes("score"), JSON.stringify(body));
});

test("an empty run does not ask the engine anything", async () => {
  let called = false;
  assert.equal(await fetchTasteScores(async () => { called = true; }, []), null);
  assert.equal(called, false);
});

// ---- describing candidates ---------------------------------------------------

test("a concept declares what it is and never how good it is", () => {
  const c = conceptCandidate(concept("a", "hoodie", "azul"));
  assert.equal(c.id, "a");
  assert.equal(c.kind, "hoodie");
  assert.ok(c.traits.includes("Frisa de algodón"));
  assert.ok(c.traits.includes("capucha doble"));
  // No score, no band, no affinity — the engine owns all of that.
  assert.deepEqual(Object.keys(c).sort(), ["id", "kind", "label", "traits"]);
});

test("a board garment maps to the same shape as an exploration concept", () => {
  const c = itemCandidate(
    { id: "it-1", name: "Buzo boxy", silhouette: "hoodie", nota: "puño ancho" },
    { name: "Frisa", comp: "80% CO" });
  assert.deepEqual(c, {
    id: "it-1", kind: "hoodie", label: "Buzo boxy",
    traits: ["Frisa", "80% CO", "puño ancho"],
  });
});

test("a half-filled garment describes itself without inventing anything", () => {
  const c = itemCandidate({ id: "it-2" }, null);
  assert.deepEqual(c, { id: "it-2", kind: null, label: null, traits: [] });
});
