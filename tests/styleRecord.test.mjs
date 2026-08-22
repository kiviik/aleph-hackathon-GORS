// The Style record must not turn a failed request into "there is nothing".
//
// The reference (`design/atelier-redesign/03-product-tech-pack.png`) draws
// eleven discipline tabs. Six have an engine contract; five do not. These tests
// pin both halves — that the six are declared REAL and the five are declared
// rather than quietly dropped — plus the three-state rule, which is the one a
// data screen gets wrong in a way that looks like an answer.
import assert from "node:assert/strict";
import test from "node:test";

import {
  PROPOSED,
  REAL,
  REAL_TABS,
  TABS,
  blocksRelease,
  directionOrigin,
  openedVersionsText,
  provenanceLabel,
  releaseSummary,
  resolve,
  revisionOutcomeText,
  scopeLabel,
  stateText,
} from "../lib/styleRecord.mjs";

test("every tab declares a status, and REAL tabs name their endpoint", () => {
  for (const tab of TABS) {
    assert.ok([REAL, PROPOSED].includes(tab.status), `${tab.key}: ${tab.status}`);
    if (tab.status === REAL) {
      assert.ok(tab.source, `${tab.key} claims REAL and names no endpoint`);
    } else {
      // A proposed tab must say what it is waiting for. "Coming soon" is how a
      // gap stops being tracked.
      assert.ok(tab.needs, `${tab.key} is PROPOSED and does not say what it needs`);
    }
  }
});

test("the nine backed disciplines are the ones with contracts", () => {
  // Construction (0082), BOM (0083) and the sample loop (0084) — three of the
  // reference's five declared absences have earned contracts.
  assert.deepEqual(REAL_TABS.map((t) => t.key), [
    "overview", "lineage", "techpack", "colourways", "measurements", "quotes",
    "construction", "bom", "samples",
  ]);
});

test("the unbacked disciplines from the reference are declared, not deleted", () => {
  const proposed = TABS.filter((t) => t.status === PROPOSED).map((t) => t.key);
  // Each of these is drawn in the owner's image and would have to invent data.
  for (const key of ["grading", "artwork"]) {
    assert.ok(proposed.includes(key), `${key} vanished instead of being declared`);
  }
});

/* ---- the three states, which are the point ------------------------------ */

test("undefined is loading — we have not asked yet", () => {
  assert.equal(resolve(undefined).state, "loading");
});

test("null is unavailable — WE could not ask", () => {
  assert.equal(resolve(null).state, "unavailable");
});

test("an empty array is empty — we asked and there are none", () => {
  assert.equal(resolve([]).state, "empty");
});

test("the three states never share a sentence", () => {
  const said = ["loading", "unavailable", "empty"].map((s) => stateText(s, "cotizaciones"));
  assert.equal(new Set(said).size, 3, said.join(" | "));
});

test("«unavailable» must not claim the brand has nothing", () => {
  const text = stateText("unavailable", "cotizaciones");
  assert.ok(/no pudimos consultar/i.test(text), text);
  // The load-bearing clause: it explicitly refuses the inference.
  assert.ok(/no dice que no existan/i.test(text), text);
});

test("«empty» says it asked, so absence is a real answer", () => {
  assert.ok(/Consultado/i.test(stateText("empty", "cotizaciones")));
});

test("a resolved list comes through untouched", () => {
  const r = resolve([{ id: "q1" }, { id: "q2" }]);
  assert.equal(r.state, "ready");
  assert.equal(r.items.length, 2);
});

/* ---- provenance, per field ---------------------------------------------- */

test("every provenance the engine can emit has wording", () => {
  for (const p of ["ai_proposed", "imported", "calculated", "human_verified",
                   "supplier_confirmed"]) {
    assert.ok(provenanceLabel(p) && !/desconocida/.test(provenanceLabel(p)), p);
  }
});

test("an unknown provenance is shown as unknown, not defaulted to something calm", () => {
  assert.match(provenanceLabel("something_new"), /desconocida/i);
  assert.match(provenanceLabel(null), /Sin procedencia/i);
});

test("only an AI proposal blocks release; a human-verified field does not", () => {
  assert.equal(blocksRelease({ provenance: "ai_proposed" }), true);
  assert.equal(blocksRelease({ provenance: "human_verified" }), false);
  assert.equal(blocksRelease({ provenance: "supplier_confirmed" }), false);
  assert.equal(blocksRelease(null), false);
});

/* ---- the commitment footer ---------------------------------------------- */

test("the footer counts, and does not invent a verdict the engine owns", () => {
  const s = releaseSummary({
    fields: {
      fabric: { value: "Lino 240g", provenance: "imported" },
      seam: { value: "Pespunte", provenance: "ai_proposed" },
      hem: { value: null, provenance: "imported" },
    },
    can_be_quoted: false,
  });
  assert.equal(s.total, 3);
  assert.equal(s.unverified, 1);
  assert.deepEqual(s.unverifiedKeys, ["seam"]);
  assert.equal(s.missing, 1);
  assert.equal(s.canBeQuoted, false);
});

test("a pack that did not say whether it is quotable reads null, never false", () => {
  // ⚠ "we were not told" and "the engine says no" are different answers to a
  // factory, and collapsing them is how a screen invents a refusal.
  const s = releaseSummary({ fields: {} });
  assert.equal(s.canBeQuoted, null);
});

test("no pack at all is still countable without throwing", () => {
  const s = releaseSummary(null);
  assert.equal(s.total, 0);
  assert.equal(s.canBeQuoted, null);
});

// --------------------------------------------------------------------------
// The first transition on screen: a fabric picked in Dirección (engine 0085)
// --------------------------------------------------------------------------

test("the four scopes stay four, and an unknown fifth says nothing", () => {
  // Three of these are not "no". `unscoped` means the Dirección named no
  // categories — it stayed silent, which is not the same as ruling the fabric
  // out of this garment, and a screen that collapsed them would put words in
  // the designer's own direction.
  assert.equal(scopeLabel("matches"), "elegida para esta categoría");
  assert.equal(scopeLabel("unscoped"), "sin categoría declarada");
  assert.equal(scopeLabel("other_categories"), "elegida para otra categoría");
  assert.equal(scopeLabel("style_has_no_category"), "este estilo no tiene categoría");
  // ⚠ If the engine grows a fifth answer, the screen must say NOTHING rather
  // than guessing which of these four it resembles.
  assert.equal(scopeLabel("something_new"), null);
  assert.equal(scopeLabel(undefined), null);
});

test("a line says which pick proposed it, and reads the permission live", () => {
  const chip = directionOrigin({
    from_direction: {
      version_number: 2, version_status: "approved",
      substitution_allowed: true, substitution_note: "cualquier jersey 300g",
    },
  });
  assert.equal(chip.text, "de Dirección · v2");
  assert.equal(chip.substitution, "cualquier jersey 300g");

  // The direction withdraws permission; nobody touches the BOM. A copied flag
  // would still be telling a factory it may substitute.
  const after = directionOrigin({
    from_direction: { version_number: 2, version_status: "approved",
                      substitution_allowed: false, substitution_note: null },
  });
  assert.equal(after.substitution, null);
});

test("an unapproved direction is named on the line, not hidden", () => {
  const chip = directionOrigin({
    from_direction: { version_number: 3, version_status: "draft",
                      substitution_allowed: false },
  });
  assert.equal(chip.text, "de Dirección · v3 · (draft)");
});

test("no chip at all when there is no pick, because null means two things", () => {
  // Never proposed by a pick, OR proposed by a pick that was deleted with its
  // direction version (0085's accepted loss). The column cannot tell them
  // apart, so the screen must not claim either one.
  assert.equal(directionOrigin({}), null);
  assert.equal(directionOrigin({ from_direction: null }), null);
  assert.equal(directionOrigin(null), null);
});

// --------------------------------------------------------------------------
// The third transition on screen: a correction opens a version (engine 0087)
// --------------------------------------------------------------------------

/** Every word this screen must never use about an unresolved correction. */
const CLAIMS_A_FIX = /arreglad|corregid|solucionad|resuelt|listo|fixed/i;

test("a comment says which versions were opened for it, and claims no fix", () => {
  const one = openedVersionsText({ opened_pack_versions: [{ version: 3 }] });
  assert.equal(one, "ficha v3 abierta por esta corrección");
  assert.ok(!CLAIMS_A_FIX.test(one), one);

  const many = openedVersionsText({
    opened_pack_versions: [{ version: 3 }, { version: 4 }],
  });
  assert.equal(many, "fichas v3, v4 abiertas por esta corrección");
  assert.ok(!CLAIMS_A_FIX.test(many), many);
});

test("no versions opened means no chip, not a reassuring absence", () => {
  assert.equal(openedVersionsText({ opened_pack_versions: [] }), null);
  assert.equal(openedVersionsText({}), null);
  assert.equal(openedVersionsText(null), null);
});

test("minting a version and joining an open draft are said differently", () => {
  const minted = revisionOutcomeText({
    target_pack: { version: 3 }, opened_new_version: true, already: false,
    corrections: [{}, {}],
  });
  assert.equal(minted.head, "Se abrió la ficha v3 para responder 2 correcciones.");

  // ⚠ The draft case must NOT say "se abrió la v3": no such document exists,
  // and a designer would go looking for it.
  const joined = revisionOutcomeText({
    target_pack: { version: 2 }, opened_new_version: false, already: false,
    corrections: [{}],
  });
  assert.equal(joined.head,
    "Se sumaron 1 corrección a la ficha v2, que ya estaba abierta.");

  const repeat = revisionOutcomeText({
    target_pack: { version: 3 }, opened_new_version: false, already: true,
    corrections: [{}],
  });
  assert.match(repeat.head, /ya estaban citadas/);
});

test("the caveat travels with the good news, always", () => {
  // The engine sends its own sentence; the client keeps it verbatim rather
  // than writing a softer one.
  const withNote = revisionOutcomeText({
    target_pack: { version: 3 }, opened_new_version: true, corrections: [{}],
    note: "abrir la versión no resuelve nada — sólo una ronda posterior puede "
      + "decir que la prenda quedó bien",
  });
  assert.match(withNote.caveat, /no resuelve nada/);

  // And if the engine ever stopped sending it, the screen still refuses to
  // present an opened version as a fix.
  const without = revisionOutcomeText({
    target_pack: { version: 3 }, opened_new_version: true, corrections: [{}],
  });
  assert.match(without.caveat, /no resuelve nada/);
});

test("nothing to report when no version was opened", () => {
  assert.equal(revisionOutcomeText(null), null);
  assert.equal(revisionOutcomeText({}), null);
});
