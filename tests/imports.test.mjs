// The Import Centre's rules, on the screen's side.
//
// The engine already refuses to import an unconfirmed mapping. These tests
// pin the OTHER half of the same promise: that the screen cannot describe a
// file as further along than it is. A preview panel that says "listo" over an
// interpreted file undoes the whole feature without touching the server.
import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAIN,
  HOW,
  awaitingConfirmation,
  confirmBlockers,
  mappingRows,
  reached,
  resultLine,
  statusLine,
} from "../lib/imports.mjs";

const interpreted = {
  id: "1", kind: "ventas", status: "interpreted", row_count: 12,
  missing_required: [], questions: [], blocking: [],
  mapping: {
    date: { column: "Fecha", label: "Fecha", how: "exacta", required: true },
    qty: { column: "U vendidas", label: "Cantidad", how: "parecido", required: true },
    unit_price: { column: "Importe", label: "Precio unitario", how: "modelo", required: false },
  },
  steps: [
    { key: "uploaded", label: "Subido", done: true },
    { key: "interpreted", label: "Interpretado", done: true },
    { key: "mapped", label: "Campos mapeados", done: true },
    { key: "confirmed", label: "Confirmado por vos", done: false },
    { key: "incorporated", label: "Incorporado", done: false },
  ],
};

test("an interpreted file never reads as imported", () => {
  const line = statusLine(interpreted);
  assert.match(line, /nada se incorporó todavía/);
  assert.ok(!/listo|importado|incorporado\b/i.test(line.replace("incorporó", "")));
  assert.equal(reached(interpreted.steps), "mapped");
});

test("the chain stops at the first gap rather than skipping to a later done step", () => {
  // A `done` after a gap is a server bug; rendering past it would hide one.
  const broken = interpreted.steps.map((s) =>
    s.key === "incorporated" ? { ...s, done: true } : s);
  assert.equal(reached(broken), "mapped");
  assert.deepEqual(CHAIN[CHAIN.length - 1], "incorporated");
});

test("a blocking question stops confirmation and says which one", () => {
  const imp = {
    ...interpreted,
    questions: [{ id: "currency", blocking: true, question: "¿En qué moneda están los importes?" }],
  };
  const blockers = confirmBlockers(imp, {});
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /moneda/);
  assert.equal(confirmBlockers(imp, { currency: "ARS" }).length, 0);
});

test("a required field left unmapped blocks confirmation by name", () => {
  const imp = { ...interpreted, missing_required: [{ field: "qty", label: "Cantidad" }] };
  assert.match(confirmBlockers(imp, {})[0], /Cantidad/);
});

test("zero readable rows blocks — except for returns, where zero is a fact", () => {
  assert.match(confirmBlockers({ ...interpreted, row_count: 0 }, {})[0], /ninguna fila/);
  assert.equal(
    confirmBlockers({ ...interpreted, kind: "devoluciones", row_count: 0 }, {}).length, 0);
});

test("an already-incorporated file cannot be confirmed again from the screen", () => {
  assert.match(confirmBlockers({ ...interpreted, status: "incorporated" }, {})[0],
    /ya no se puede confirmar/);
});

test("every mapping says HOW it was matched, and never as a percentage", () => {
  const rows = mappingRows(interpreted.mapping);
  assert.deepEqual(rows.map((r) => r.field).slice(0, 2).sort(), ["date", "qty"]);
  for (const r of rows) {
    assert.ok(HOW[r.how], `unknown how: ${r.how}`);
    assert.ok(!/\d/.test(r.howLabel), "a confidence must not be rendered as a number");
  }
  // The resemblance match is toned differently from the exact one: it is the
  // one that is wrong sometimes.
  assert.equal(rows.find((r) => r.field === "date").tone, "ok");
  assert.equal(rows.find((r) => r.field === "qty").tone, "warn");
});

test("required fields sort above the ones that only need a look", () => {
  const rows = mappingRows(interpreted.mapping);
  assert.ok(rows.findIndex((r) => r.required)
    < rows.findIndex((r) => !r.required));
});

test("the result line drops zero counts but says so when everything is zero", () => {
  assert.equal(
    resultLine({ styles_created: 2, styles_existing: 0, skus_created: 4 }),
    "2 estilos nuevos · 4 SKUs nuevos");
  assert.equal(resultLine({ styles_created: 0, skus_created: 0 }),
    "No se creó ningún registro nuevo.");
});

test("an unreadable file reports the engine's reason instead of a generic error", () => {
  assert.match(statusLine({ status: "unreadable", error: "la primera fila parece datos" }),
    /la primera fila parece datos/);
  assert.match(statusLine({ status: "unreadable" }), /motivo no informado/);
});

test("the count the screen leads with is files waiting on a person", () => {
  assert.equal(awaitingConfirmation([
    { status: "interpreted" }, { status: "incorporated" },
    { status: "interpreted" }, { status: "discarded" },
  ]), 2);
});

test("a discarded file says nothing was incorporated", () => {
  assert.match(statusLine({ status: "discarded" }), /no se incorporó nada/);
});
