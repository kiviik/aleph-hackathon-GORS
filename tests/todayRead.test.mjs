// The rail may not restate the card, and may not narrate the plumbing.
//
// Owner assessment 2026-08-17, point 3: *"it mistakes interpretation for
// intelligence — «Lectura de Atelier» often restates status and missing data"*,
// verified live that day on the Today screen. The rail opened with
//
//   "Atelier registró una recomendación para esta propuesta: test qty 25.
//    La decisión sigue siendo tuya."
//
// while the card two columns to its left already read "Recomendación
// registrada · test qty: 25"; beside it sat "Tipo · Producto nuevo" under a
// header reading "Decisión 1 de 3 · Producto nuevo", and "Origen · caso
// guardado en el motor", which was true of every case ever shown.
//
// ⚠ The restatement survived a full design pass that restyled all 20 screens,
// because the rail's content was an object literal inside a 600-line component
// and nothing mounted it. That is the reason this file exists at all, and the
// reason the policy was moved to `lib/todayRead.mjs`: a rule that cannot be
// asserted is a rule that comes back.
import assert from "node:assert/strict";
import test from "node:test";

import { readForCase } from "../lib/todayRead.mjs";

const CASE = {
  id: "c-1",
  type: "new_product",
  created_at: "2026-08-06T10:00:00Z",
  recommendation: { "test qty": "25" },
  uncertainty: { revision: "todavía sin aprobar en Revisión" },
  events: [{ id: "e-1" }],
  owner: null,
  expected_impact: null,
};

const CTX = { hasSales: false, engineMode: "demo", whenText: () => "6 de ago de 2026" };

test("no case means no rail, rather than an empty one", () => {
  assert.equal(readForCase(null, CTX), null);
  assert.equal(readForCase(undefined, CTX), null);
});

test("the rail never restates the recommendation the card already shows", () => {
  const read = readForCase(CASE, CTX);
  assert.equal(read.interpretation, null);

  // Belt and braces: the recommendation's own text must not appear anywhere in
  // the rail, whatever section someone is tempted to put it in next.
  const flat = JSON.stringify(read);
  assert.ok(!flat.includes("test qty"), flat);
  assert.ok(!flat.includes("registró una recomendación"), flat);
});

test("the rail does not repeat the case type, which the card header carries", () => {
  const flat = JSON.stringify(readForCase(CASE, CTX));
  assert.ok(!/Tipo/.test(flat), flat);
  assert.ok(!/Producto nuevo|new_product/.test(flat), flat);
});

test("«caso guardado en el motor» is gone — it was true of every case", () => {
  const flat = JSON.stringify(readForCase(CASE, CTX));
  assert.ok(!flat.includes("guardado en el motor"), flat);
});

test("what the rail DOES add is what the card does not show", () => {
  const read = readForCase(CASE, CTX);
  const labels = read.signals.map((s) => s.label);
  assert.deepEqual(labels, ["Abierta desde"]);

  const withDue = readForCase({ ...CASE, due_at: "2026-09-01T00:00:00Z" }, CTX);
  assert.deepEqual(withDue.signals.map((s) => s.label), ["Abierta desde", "Vence"]);
});

test("traceability keeps the ledger depth and the run mode, and nothing else", () => {
  const read = readForCase(CASE, CTX);
  assert.deepEqual(read.trace.map((t) => t.label), ["Eventos", "Corrida"]);
  assert.equal(read.trace[0].text, "1 en el ledger");
  assert.equal(read.trace[1].text, "demo");
});

test("a run with no mode does not invent one", () => {
  const read = readForCase(CASE, { ...CTX, engineMode: null });
  assert.deepEqual(read.trace.map((t) => t.label), ["Eventos"]);
});

test("contradicting evidence still comes through — it is the honest half", () => {
  const read = readForCase(CASE, CTX);
  assert.deepEqual(read.against, ["todavía sin aprobar en Revisión"]);
});

test("the unknowns name what would change the answer, not what is missing from the UI", () => {
  const read = readForCase(CASE, CTX);
  assert.deepEqual(read.unknowns, [
    "Impacto económico de avanzar",
    "Quién es responsable de ejecutarla",
    "Demanda propia — sin ventas conectadas no hay margen ni reposición",
  ]);
});

test("each unknown disappears when its gap is actually closed", () => {
  const complete = readForCase(
    {
      ...CASE,
      expected_impact: { margen: "+12%" },
      owner: { name: "María", role: "Producto" },
    },
    { ...CTX, hasSales: true },
  );
  assert.deepEqual(complete.unknowns, []);
  assert.deepEqual(complete.owner, { name: "María", role: "Producto" });
});

test("a case with nothing to say produces a short rail, not a padded one", () => {
  const bare = readForCase(
    { id: "c-2", type: "reorder", created_at: null, events: [] },
    { hasSales: true, engineMode: null, whenText: () => null },
  );
  assert.equal(bare.interpretation, null);
  assert.deepEqual(bare.against, []);
  assert.deepEqual(bare.unknowns, ["Impacto económico de avanzar",
                                   "Quién es responsable de ejecutarla"]);
  // The one signal left says it does not know, rather than guessing a date.
  assert.deepEqual(bare.signals, [{ icon: "clock", label: "Abierta desde", text: "—" }]);
});
