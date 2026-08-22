import test from "node:test";
import assert from "node:assert/strict";

import {
  directionAxes, directionLineage, directionPrompt, directionReferences,
  directionRunCount, directionSelection, directionSummary,
} from "../lib/directionGeneration.mjs";

const payload = {
  id: "dir-1",
  working_version: {
    id: "dv-2", version_number: 2, status: "approved",
    headline: "Noche mineral", mood_note: "tenso, limpio, nocturno",
  },
  basis: { plan_slots: 10 },
  items: {
    colours: [
      { id: "c-1", name: "Óxido", hex_value: "#A34A32", role: "hero" },
    ],
    silhouettes: [
      { id: "s-1", category: "Tops", name: "Remera amplia", fit: "relajado" },
    ],
    fabrics: [
      {
        id: "f-1", material_id: "m-1",
        material: { name: "Jersey pesado", composition: "100% algodón" },
        sourceability: { verdict: "ok" },
      },
      {
        id: "f-2", material_id: "m-2",
        material: { name: "Satén importado" },
        sourceability: { verdict: "blocked", reasons: [{ code: "below_moq" }] },
      },
    ],
    references: [
      { id: "r-1", image_url: "/own.jpg", rights: "own_archive", purpose: "mood" },
      { id: "r-2", image_url: "/public.jpg", rights: "public_reference", purpose: "styling" },
    ],
    rules: [
      { id: "rule-1", kind: "must_include", scope: "detail", value: "costura expuesta" },
      { id: "rule-2", kind: "must_avoid", scope: "styling", value: "romántico" },
    ],
  },
};

test("turns the exact Direction records into Studio axes", () => {
  const axes = directionAxes(payload);
  assert.equal(axes.siluetas[0].directionItemId, "s-1");
  assert.equal(axes.tejidos[0].materialId, "m-1");
  assert.equal(axes.colores[0].directionItemId, "c-1");
});

test("keeps blocked fabrics visible but never selects them by default", () => {
  assert.equal(directionAxes(payload).tejidos.length, 2);
  assert.deepEqual(directionSelection(payload).tejidos.map((f) => f.id), ["m-1"]);
});

test("only rights-cleared references condition image generation", () => {
  const refs = directionReferences(payload);
  assert.deepEqual(refs.eligible.map((r) => r.id), ["r-1"]);
  assert.deepEqual(refs.excluded.map((r) => r.id), ["r-2"]);
});

test("prompt carries the team's mood and hard rules without claiming production readiness", () => {
  const prompt = directionPrompt(payload);
  assert.match(prompt, /Noche mineral/);
  assert.match(prompt, /costura expuesta/);
  assert.match(prompt, /romántico/);
  assert.match(prompt, /no una ficha lista para producir/);
});

test("promoted concepts preserve exact Direction lineage", () => {
  const axes = directionAxes(payload);
  const lineage = directionLineage(payload, {
    silueta: axes.siluetas[0], tejido: axes.tejidos[0], color: axes.colores[0],
  }, ["r-1"]);
  assert.equal(lineage.direction_version_id, "dv-2");
  assert.equal(lineage.fabric_pick_id, "f-1");
  assert.deepEqual(lineage.constraint_rule_ids, ["rule-1", "rule-2"]);
  assert.equal("checked_rule_ids" in lineage, false);
});

test("range slots set the proposed run size without exceeding the controlled limit", () => {
  assert.equal(directionRunCount(payload, 24), 10);
  assert.equal(directionRunCount({ ...payload, basis: { plan_slots: 80 } }, 100), 30);
});

test("summary distinguishes a usable direction from a merely populated one", () => {
  assert.deepEqual(directionSummary(payload), {
    version: 2, status: "approved", silhouettes: 1, fabrics: 2,
    blockedFabrics: 1, colours: 1, references: 1, referencesExcluded: 1,
    rules: 2, planSlots: 10, ready: true,
  });
});
