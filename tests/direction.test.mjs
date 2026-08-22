// The direction screen's reading rules (ROADMAP §3b).
//
// Every value here uses the ENGINE's real vocabularies — `hero`/`support`/
// `neutral`/`accent`, `ok`/`blocked`/`unknown`, `outside_band`/`agrees`/
// `currency_mismatch`/`not_planned`/`not_directed`, `own_archive`/`licensed`/
// `supplier_provided`/`public_reference`/`unknown`, `must_include`/`must_avoid`.
// They are copied from `api/app/routers/direction.py` and the 0046 CHECK
// constraints, not invented here.
//
// That is not pedantry. A test that supplies its own strings for a vocabulary the
// server owns tests the test: `walkthrough.mjs` filtered for a status the engine
// had never emitted, its test asserted the same invented string, and the step
// could not complete for any brand while ten tests stayed green (`828290a`).

import assert from "node:assert/strict";
import test from "node:test";

import {
  affordances, fabricGroups, palette, reasonText, reconcileText, reconciliation,
  references, rules, unknownFieldsText,
} from "../lib/direction.mjs";

// --------------------------------------------------------------------------- //
// affordances come from the server's status
// --------------------------------------------------------------------------- //

test("a collection with no direction offers nothing but opening one", () => {
  const a = affordances({ exists: false, status: "empty", working_version: null });
  assert.equal(a.editable, false);
  assert.equal(a.approvable, false);
  assert.equal(a.canOpenNextVersion, false);
});

test("a draft is editable and submittable, not approvable", () => {
  const a = affordances({
    exists: true, status: "draft",
    working_version: { status: "draft", editable: true, immutable: false },
  });
  assert.equal(a.editable, true);
  assert.equal(a.submittable, true);
  assert.equal(a.approvable, false);
  // The engine 409s a second draft, so the control must not be offered.
  assert.equal(a.canOpenNextVersion, false);
});

test("an in-review version is approvable but no longer submittable", () => {
  const a = affordances({
    exists: true, status: "in_review",
    working_version: { status: "in_review", editable: true, immutable: false },
  });
  assert.equal(a.submittable, false);
  assert.equal(a.approvable, true);
});

test("an approved version is frozen and the only move is the next version", () => {
  const a = affordances({
    exists: true, status: "approved",
    working_version: { status: "approved", editable: false, immutable: true },
  });
  assert.equal(a.editable, false);
  assert.equal(a.frozen, true);
  assert.equal(a.canOpenNextVersion, true);
});

// --------------------------------------------------------------------------- //
// palette
// --------------------------------------------------------------------------- //

test("the palette groups by role in a fixed order", () => {
  const p = palette([
    { role: "accent", name: "Fucsia" },
    { role: "hero", name: "Ocre" },
    { role: "neutral", name: "Crudo" },
  ]);
  assert.deepEqual(p.byRole.map((g) => g.role), ["hero", "neutral", "accent"]);
  assert.equal(p.heroes, 1);
});

test("shares over 100 are reported, NEVER normalised", () => {
  // Rescaling to 100 would hide a real mistake and invent intent nobody
  // expressed.
  const p = palette([
    { role: "hero", share_pct: "80.00" },
    { role: "support", share_pct: "60.00" },
  ]);
  assert.equal(p.shareState, "over");
  assert.equal(p.shareTotal, 140);
});

test("a partly declared palette is 'partial', not summed as if complete", () => {
  const p = palette([
    { role: "hero", share_pct: "40.00" },
    { role: "support", share_pct: null },
  ]);
  assert.equal(p.shareState, "partial");
  assert.equal(p.shareDeclared, 1);
});

test("shares that sum to 100 read complete", () => {
  const p = palette([
    { role: "hero", share_pct: "60.00" },
    { role: "support", share_pct: "40.00" },
  ]);
  assert.equal(p.shareState, "complete");
});

test("a palette with no declared shares says so rather than reporting zero", () => {
  const p = palette([{ role: "hero" }, { role: "support" }]);
  assert.equal(p.shareState, "none");
  assert.equal(p.shareTotal, null);
});

// --------------------------------------------------------------------------- //
// fabrics — the group that must not be folded in
// --------------------------------------------------------------------------- //

test("UNKNOWN sourceability is its own group, never folded in with ok", () => {
  // A material sheet with an empty MOQ column is the normal case. Showing those
  // as fine would make exactly the promise the engine refused to make.
  const g = fabricGroups([
    { material: {}, sourceability: { verdict: "ok" } },
    { material: {}, sourceability: { verdict: "unknown" } },
    { material: {}, sourceability: { verdict: "blocked" } },
  ]);
  assert.equal(g.ok.length, 1);
  assert.equal(g.unknown.length, 1);
  assert.equal(g.blocked.length, 1);
  assert.equal(g.total, 3);
});

test("a pick whose material could not be read is 'unresolved', not 'unknown'", () => {
  const g = fabricGroups([{ material: null, sourceability: null }]);
  assert.equal(g.unresolved.length, 1);
  assert.equal(g.unknown.length, 0);
});

test("a blocked reason renders the engine's own two numbers", () => {
  assert.match(reasonText({ code: "below_moq", need: 500, have: 30 }),
               /500.*30/);
  assert.match(reasonText({ code: "lead_time_exceeds_window", need: 120, have: 37 }),
               /120.*37/);
});

test("OUR Spanish wins over the engine's sentence for a code we know", () => {
  // Precedence matters and this test used to assert it backwards. The engine
  // sends English; a known code must be worded here, or English reaches a
  // client-facing screen — which is exactly what happened to the
  // reconciliation strings before anyone loaded the page.
  const text = reasonText({ code: "below_moq", need: 500, have: 30,
                            message: "the supplier minimum is 500" });
  assert.match(text, /mínimo del proveedor/);
  assert.ok(!text.includes("supplier"));
});

test("an UNKNOWN code falls back to the engine's own sentence", () => {
  const text = reasonText({ code: "some_future_reason",
                            message: "algo que este build no conoce" });
  assert.equal(text, "algo que este build no conoce");
});

test("a reason with neither a known code nor a sentence still says something", () => {
  // Never blank: a gate that blocked something and will not say why reads as
  // "no reason", the one thing this product refuses to say.
  const text = reasonText({ code: "mystery" });
  assert.match(text, /mystery/);
});

test("a known code with unusable params falls back rather than printing NaN", () => {
  const text = reasonText({ code: "below_moq", need: null, have: 30,
                            message: "fallback del motor" });
  assert.equal(text, "fallback del motor");
});

test("reconciliation states are worded in Spanish from their codes", () => {
  const text = reconcileText({
    state: "outside_band",
    message: "2 planned row(s) are priced outside the band",
    message_code: { code: "plan_outside_band",
                    params: { rows: 2, category: "Vestidos" } },
  });
  assert.match(text, /2 fila\(s\) del plan quedan fuera de la banda de Vestidos/);
  assert.ok(!text.includes("planned row"));
});

test("a currency mismatch says WHY it cannot be compared, in Spanish", () => {
  const text = reconcileText({
    state: "currency_mismatch",
    message_code: { code: "band_currency_mismatch",
                    params: { currency: "USD", rows: 1 } },
  });
  assert.match(text, /USD/);
  assert.match(text, /tipo de cambio/);
});

test("an unknown reconciliation code falls back to the engine's sentence", () => {
  const text = reconcileText({
    state: "outside_band", message: "something new",
    message_code: { code: "not_yet_known", params: {} },
  });
  assert.equal(text, "something new");
});

test("missing material fields are named, not counted", () => {
  // "2 campos faltan" sends someone hunting; this says which column to fill in.
  const text = unknownFieldsText(["moq_units", "lead_time_days"]);
  assert.match(text, /MOQ/);
  assert.match(text, /tiempo de producción/);
});

test("no missing fields produces no sentence at all", () => {
  assert.equal(unknownFieldsText([]), null);
});

// --------------------------------------------------------------------------- //
// reconciliation
// --------------------------------------------------------------------------- //

test("a plan beyond the direction is informational, NOT a disagreement", () => {
  // Calling it an error would push someone to delete a real commercial row to
  // silence a warning.
  const r = reconciliation({
    categories: [{ category: "Accesorios", state: "not_directed" }],
    contradictions: 0, reconciled: true,
  });
  assert.equal(r.disagreeing.length, 0);
  assert.equal(r.informational.length, 1);
  assert.equal(r.reconciled, true);
});

test("outside_band and currency_mismatch both count as disagreement", () => {
  const r = reconciliation({
    categories: [
      { category: "Vestidos", state: "outside_band" },
      { category: "Remeras", state: "currency_mismatch" },
      { category: "Buzos", state: "agrees" },
    ],
    contradictions: 2, reconciled: false,
  });
  assert.deepEqual(r.disagreeing.map((c) => c.category), ["Vestidos", "Remeras"]);
  assert.equal(r.agreeing.length, 1);
  assert.equal(r.contradictions, 2);
});

test("an absent reconciliation payload does not throw", () => {
  const r = reconciliation(undefined);
  assert.deepEqual(r.categories, []);
  assert.equal(r.reconciled, false);
});

// --------------------------------------------------------------------------- //
// references
// --------------------------------------------------------------------------- //

test("references group by what they teach and name the missing kinds", () => {
  const r = references([
    { purpose: "mood", rights: "own_archive" },
    { purpose: "mood", rights: "unknown" },
    { purpose: "colour", rights: "licensed" },
  ]);
  assert.deepEqual(r.byPurpose.map((g) => g.purpose), ["colour", "mood"]);
  // A board that is all mood and no silhouette is a specific gap.
  assert.ok(r.missingPurposes.includes("silhouette"));
  assert.equal(r.total, 3);
});

test("unknown and public_reference are counted together as unclear rights", () => {
  // For "can we generate from this and show a client" they carry the same risk,
  // and separating them would suggest one is settled when it is not.
  const r = references([
    { purpose: "mood", rights: "unknown" },
    { purpose: "styling", rights: "public_reference" },
    { purpose: "colour", rights: "own_archive" },
  ]);
  assert.equal(r.rightsUnclear, 2);
  assert.equal(r.ownArchive, 1);
});

test("no references reports every purpose as missing, without throwing", () => {
  const r = references();
  assert.equal(r.total, 0);
  assert.equal(r.missingPurposes.length, 6);
});

// --------------------------------------------------------------------------- //
// rules
// --------------------------------------------------------------------------- //

test("must-include and must-avoid stay separate", () => {
  const r = rules([
    { kind: "must_avoid", value: "cuero", reason: "no usamos cuero animal" },
    { kind: "must_include", value: "estampa propia" },
  ]);
  assert.equal(r.mustAvoid.length, 1);
  assert.equal(r.mustInclude.length, 1);
});

test("rules with no reason are counted, because those are the ones overridden", () => {
  const r = rules([
    { kind: "must_avoid", value: "cuero", reason: "no usamos cuero animal" },
    { kind: "must_avoid", value: "poliéster" },
  ]);
  assert.equal(r.withoutReason, 1);
});

test("nothing in this module invents a score", () => {
  const blobs = [
    JSON.stringify(palette([{ role: "hero", share_pct: "50.00" }])),
    JSON.stringify(fabricGroups([{ material: {}, sourceability: { verdict: "ok" } }])),
    JSON.stringify(references([{ purpose: "mood", rights: "unknown" }])),
    JSON.stringify(rules([{ kind: "must_avoid", value: "cuero" }])),
  ];
  for (const blob of blobs) {
    for (const banned of ["score", "rating", "grade", "confidence"]) {
      assert.ok(!blob.includes(banned), `${banned} leaked into ${blob}`);
    }
  }
});
