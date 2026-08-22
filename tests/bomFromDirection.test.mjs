// A fabric picked in Dirección becomes a BOM line (engine 0085) — and the
// client refuses to fill in the two things the pick never knew.
//
// The transition exists because a designer picked a jersey in the collection's
// creative direction and then re-found the same row by name in a materials
// sheet. What travels is identity and provenance. What must NOT travel is a
// consumption nobody measured, because bom.py then reports a material cost the
// garment never earned.
import assert from "node:assert/strict";
import test from "node:test";

import { addBomLineFromDirection, getBomCandidates } from "@/lib/api";

const BRAND = "11111111-1111-1111-1111-111111111111";
const STYLE = "22222222-2222-2222-2222-222222222222";
const FABRIC = "33333333-3333-3333-3333-333333333333";

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("every pick comes back labelled, including the ones for other categories", async () => {
  const restore = stubFetch(async (url) => {
    assert.match(String(url), /\/styles\/[^/]+\/bom\/candidates$/);
    return jsonResponse(200, {
      direction_version: { version_number: 2, status: "approved", governs: true },
      candidates: [
        { direction_fabric_id: FABRIC, category_scope: "matches",
          material_name: "Frisa", already_on_bom: false },
        { direction_fabric_id: "x", category_scope: "other_categories",
          material_name: "Popelina", already_on_bom: false },
      ],
    });
  });
  try {
    const got = await getBomCandidates(BRAND, STYLE);
    assert.equal(got.ok, true);
    // ⚠ Both of them. The screen labels the mismatch; it does not hide it,
    // because hiding makes the designer's own direction look narrower than it
    // is and she is the one entitled to decide.
    assert.equal(got.candidates.length, 2);
    assert.equal(got.direction_version.governs, true);
  } finally { restore(); }
});

test("a refusal arrives as the engine's sentence, never as an empty list", async () => {
  // "This style is in no collection" and "this collection has no direction" are
  // different facts. Returning null or [] for either would read as "she picked
  // nothing", which is the one thing that is not true.
  const restore = stubFetch(async () => jsonResponse(422, {
    detail: "este estilo no pertenece a ninguna colección, así que no hay "
      + "dirección creativa de la que heredar telas",
  }));
  try {
    const got = await getBomCandidates(BRAND, STYLE);
    assert.equal(got.ok, false);
    assert.equal(got.status, 422);
    assert.match(got.message, /no pertenece a ninguna colección/);
  } finally { restore(); }
});

test("a 404 refusal keeps its own wording too", async () => {
  const restore = stubFetch(async () => jsonResponse(404, {
    detail: "la colección de este estilo todavía no tiene dirección creativa",
  }));
  try {
    const got = await getBomCandidates(BRAND, STYLE);
    assert.match(got.message, /todavía no tiene dirección creativa/);
  } finally { restore(); }
});

test("the line is created FROM THE PICK, and sends no material of its own", async () => {
  const seen = {};
  const restore = stubFetch(async (url, options) => {
    seen.url = String(url);
    seen.method = options.method;
    seen.body = JSON.parse(options.body);
    return jsonResponse(201, { lines: [], rollup: {} });
  });
  try {
    await addBomLineFromDirection(BRAND, STYLE, {
      direction_fabric_id: FABRIC, component: "shell", uom: "m",
      consumption: "1.4", waste_pct: null, placement: null,
    });
    assert.match(seen.url, /\/styles\/[^/]+\/bom\/from-direction$/);
    assert.equal(seen.method, "POST");
    assert.equal(seen.body.direction_fabric_id, FABRIC);
    // ⚠ THE MATERIAL IS NOT IN THE BODY. It comes from the pick; a material_id
    // typed on this form could disagree with the fabric the Dirección chose,
    // and the line would then cite a decision nobody made.
    assert.equal("material_id" in seen.body, false);
  } finally { restore(); }
});

test("no consumption is invented when the designer has not measured it", async () => {
  const seen = {};
  const restore = stubFetch(async (url, options) => {
    seen.body = JSON.parse(options.body);
    return jsonResponse(201, { lines: [], rollup: { material_cost: null } });
  });
  try {
    await addBomLineFromDirection(BRAND, STYLE, {
      direction_fabric_id: FABRIC, component: "shell", uom: "m",
      consumption: null, waste_pct: null, placement: null,
    });
    // null travels as null. A default of 1 here would give the garment a
    // material cost nobody measured, and it would look exactly like a real one.
    assert.equal(seen.body.consumption, null);
    assert.equal(seen.body.waste_pct, null);
  } finally { restore(); }
});

test("the engine's refusal on create reaches the caller with its own words", async () => {
  const restore = stubFetch(async () => jsonResponse(409, {
    detail: "esta tela ya está en la línea 1 como shell — agregarla de nuevo "
      + "duplicaría el consumo",
  }));
  try {
    await assert.rejects(
      () => addBomLineFromDirection(BRAND, STYLE, {
        direction_fabric_id: FABRIC, component: "shell", uom: "m" }),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(String(err.payload), /ya está en la línea 1/);
        return true;
      });
  } finally { restore(); }
});

// --------------------------------------------------------------------------
// A correction opens the next pack version (engine 0087) — and only that
// --------------------------------------------------------------------------

test("opening a revision posts to the round, and sends no verdict of its own", async () => {
  const seen = {};
  const restore = stubFetch(async (url, options) => {
    seen.url = String(url);
    seen.method = options.method;
    seen.body = JSON.parse(options.body);
    return jsonResponse(201, {
      target_pack: { version: 3 }, opened_new_version: true, already: false,
      corrections: [{ id: "c1", resolved_in_round_id: null }],
      note: "abrir la versión no resuelve nada",
    });
  });
  try {
    const { openSampleRevision } = await import("@/lib/api");
    const out = await openSampleRevision("brand", "round-1");
    assert.match(seen.url, /\/samples\/round-1\/open-revision$/);
    assert.equal(seen.method, "POST");
    // No comment_ids by default: every UNRESOLVED comment in the round, which
    // is what a technical designer means, and the engine decides which those
    // are. Sending a filtered list from here would quietly drop the minors.
    assert.deepEqual(seen.body, {});
    // ⚠ And the corrections come back unresolved. If this ever arrives with a
    // resolution set, the transition has started lying.
    assert.equal(out.corrections[0].resolved_in_round_id, null);
  } finally { restore(); }
});

test("a round with nothing open is refused in the engine's words", async () => {
  const restore = stubFetch(async () => jsonResponse(409, {
    detail: "esta ronda no tiene correcciones abiertas — una versión nueva no "
      + "respondería a nada",
  }));
  try {
    const { openSampleRevision } = await import("@/lib/api");
    await assert.rejects(
      () => openSampleRevision("brand", "round-1"),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(String(err.payload), /no tiene correcciones abiertas/);
        return true;
      });
  } finally { restore(); }
});

test("a round that cites no ficha is refused, not silently pointed at the latest", async () => {
  const restore = stubFetch(async () => jsonResponse(422, {
    detail: "esta ronda no cita el paquete del que se cortó — sin eso, una "
      + "versión nueva no puede decir contra qué especificación se leyó la muestra",
  }));
  try {
    const { openSampleRevision } = await import("@/lib/api");
    await assert.rejects(
      () => openSampleRevision("brand", "round-1"),
      (err) => {
        assert.match(String(err.payload), /no cita el paquete/);
        return true;
      });
  } finally { restore(); }
});

// --------------------------------------------------------------------------
// Colourway → range plan (engine 0086): the write carries the plan's clock
// --------------------------------------------------------------------------

test("planning a colour sends the revision the caller read", async () => {
  const seen = {};
  const restore = stubFetch(async (url, options) => {
    seen.url = String(url);
    seen.method = options.method;
    seen.body = JSON.parse(options.body);
    return jsonResponse(201, { planned: [], candidates: [], reconciliation: {} });
  });
  try {
    const { planSlotColourway } = await import("@/lib/api");
    await planSlotColourway("brand", "slot-1", "cw-1", 7);
    assert.match(seen.url, /\/slots\/slot-1\/colourways\?expected_revision=7$/);
    assert.equal(seen.method, "POST");
    assert.deepEqual(seen.body, { colourway_id: "cw-1" });
  } finally { restore(); }
});

test("a stale plan revision surfaces as the engine's conflict, not a silent win", async () => {
  const restore = stubFetch(async () => jsonResponse(409, {
    detail: { error: "revision_conflict", revision: 9,
              message: "otra persona editó este plan" },
  }));
  try {
    const { planSlotColourway } = await import("@/lib/api");
    await assert.rejects(
      () => planSlotColourway("brand", "slot-1", "cw-1", 3),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.payload.revision, 9);
        return true;
      });
  } finally { restore(); }
});

test("unplanning targets the link and leaves the colourway alone", async () => {
  const seen = {};
  const restore = stubFetch(async (url, options) => {
    seen.url = String(url); seen.method = options.method; seen.body = options.body;
    return jsonResponse(200, { planned: [], candidates: [{ colourway_id: "cw-1" }] });
  });
  try {
    const { unplanSlotColourway } = await import("@/lib/api");
    const out = await unplanSlotColourway("brand", "slot-1", "cw-1", 4);
    assert.match(seen.url, /\/slots\/slot-1\/colourways\/cw-1\?expected_revision=4$/);
    assert.equal(seen.method, "DELETE");
    assert.equal(seen.body, undefined);
    // The colour comes back as a candidate: the link was the plan's opinion,
    // not the product's existence.
    assert.equal(out.candidates[0].colourway_id, "cw-1");
  } finally { restore(); }
});

test("a colour from another style is refused by pairing, and says so", async () => {
  const restore = stubFetch(async () => jsonResponse(409, {
    detail: "ese color pertenece a otro estilo — planificarlo acá diría que "
      + "esta fila produce una prenda que no es la suya",
  }));
  try {
    const { planSlotColourway } = await import("@/lib/api");
    await assert.rejects(
      () => planSlotColourway("brand", "slot-1", "cw-9", 1),
      (err) => {
        assert.match(String(err.payload), /pertenece a otro estilo/);
        return true;
      });
  } finally { restore(); }
});
