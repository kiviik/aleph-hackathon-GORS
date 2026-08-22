// Sections derived from the engine's vocabulary — never a taxonomy on top of it.
//
// The reference image draws eight construction sections with anchored callouts
// (Neckline · Shoulder · Sleeve · Drape & knot · …) and the engine has no table
// behind any of them; `design/atelier-redesign/README.md` lists them under
// PROPOSED itself. So these tests hold the line that made the restructure
// legitimate: every section is a group of REAL engine keys, no section renders
// without content in the pack in front of you, and no key silently vanishes.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { engineTree, skipWithoutEngine } from "./harness/engineTree.mjs";

import {
  CHECK_KEYS, OTHER_SECTION, SECTIONS, canInsertDraft, checkForField,
  deriveSections, draftSeed, linkedMaterial, railSummary, sectionOf, stateLabel,
} from "@/lib/techPackSections.mjs";

// ⚠ READ OFF THE ENGINE, not typed from memory. If preflight grows a check or
// the assembler grows a field, this list moves and the coverage test below
// fails until the new key is placed — which is the whole point.
const ENGINE = engineTree() + "api/app/";

function engineCheckKeys() {
  const src = readFileSync(`${ENGINE}preflight.py`, "utf8");
  const table = src.slice(src.indexOf("CHECKS: tuple[Check, ...] = ("),
                          src.indexOf("CHECK_BY_KEY"));
  const keys = [...table.matchAll(/Check\("([a-z_]+)"/g)].map((m) => m[1]);
  const reads = [...table.matchAll(/reads=\(([^)]*)\)/g)]
    .flatMap((m) => [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
  return [...new Set([...keys, ...reads])];
}

function engineFieldKeys() {
  const pack = readFileSync(`${ENGINE}tech_pack.py`, "utf8");
  const blocks = readFileSync(`${ENGINE}measurement_blocks.py`, "utf8");
  // `put("key", …)` and `fields["key"] = field(…)` are the two spellings the
  // assembler uses; `pom_field_values` returns the measurement keys.
  const keys = [
    ...[...pack.matchAll(/\bput\("([a-z_]+)"/g)].map((m) => m[1]),
    ...[...pack.matchAll(/fields\["([a-z_]+)"\]\s*=\s*field\(/g)].map((m) => m[1]),
    ...[...blocks.slice(blocks.indexOf("def pom_field_values"),
                        blocks.indexOf("def as_record"))
        .matchAll(/^\s{8}"([a-z_]+)":/gm)].map((m) => m[1]),
    ...[...blocks.matchAll(/values\["([a-z_]+)"\]\s*=/g)].map((m) => m[1]),
  ];
  return [...new Set(keys)];
}

test("the check list is preflight's, not a copy that drifted", () => {
  if (skipWithoutEngine("preflight check list")) return;
  // A flag is keyed on a CHECK and a value on a FIELD. If this set goes stale
  // the inspector starts inventing supplier questions for fields nobody audits.
  const src = readFileSync(`${ENGINE}preflight.py`, "utf8");
  const table = src.slice(src.indexOf("CHECKS: tuple[Check, ...] = ("),
                          src.indexOf("CHECK_BY_KEY"));
  const engine = [...table.matchAll(/Check\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(CHECK_KEYS, engine);
});

test("every engine key this pack can hold lands in a named section", () => {
  if (skipWithoutEngine("engine field keys")) return;
  const unplaced = [...engineCheckKeys(), ...engineFieldKeys()]
    .filter((k) => sectionOf(k) === null);
  assert.deepEqual(unplaced, [],
    "these keys the engine really writes have no section, so the desk would "
    + "file them under «otros» — place them or say why they belong there: "
    + unplaced.join(", "));
});

test("no section is invented: every listed key is one the engine uses", () => {
  if (skipWithoutEngine("section keys")) return;
  const engine = new Set([...engineCheckKeys(), ...engineFieldKeys()]);
  const invented = SECTIONS.flatMap((s) => s.keys).filter((k) => !engine.has(k));
  assert.deepEqual(invented, [],
    "these section members exist nowhere in the engine — a section list that "
    + "names fields the engine cannot produce is the drawn-not-built failure "
    + "the reference set warns about: " + invented.join(", "));
});

test("a section with nothing in it does not render", () => {
  // The left rail lists what THIS pack has. A fixed taxonomy with eight empty
  // rows is a promise the document has not made.
  const { sections } = deriveSections({
    fields: { category: { value: "pantalón", provenance: "imported" } },
    audit: { flags: [], passed: [] },
  });
  assert.deepEqual(sections.map((s) => s.id), ["identidad"]);
});

test("an unknown key is filed and labelled, never dropped", () => {
  const { sections, totals } = deriveSections({
    fields: { some_future_field: { value: "x", provenance: "imported" } },
    audit: { flags: [], passed: [] },
  });
  assert.deepEqual(sections.map((s) => s.id), [OTHER_SECTION.id]);
  assert.equal(totals.fieldCount, 1, "the field must still be counted");
});

test("completion counts come from the audit's own tier and provenance", () => {
  const pack = {
    fields: {
      fabric_composition: { value: "95% algodón / 5% elastano",
                            provenance: "human_verified" },
      fabric_weight: { value: "180 gsm", provenance: "imported" },
      seam_types: { value: "overlock 4 hilos", provenance: "ai_proposed" },
    },
    audit: {
      flags: [
        { key: "fabric_construction", tier: "blocking", status: "missing" },
        { key: "stitch_density", tier: "sample_round", status: "missing" },
      ],
      passed: [{ key: "fabric_composition", tier: "blocking", status: "present" },
               { key: "fabric_weight", tier: "blocking", status: "present" }],
    },
  };
  const { sections, totals } = deriveSections(pack);
  const tela = sections.find((s) => s.id === "tela");
  const constr = sections.find((s) => s.id === "construccion");

  assert.equal(tela.fieldCount, 2);
  assert.equal(tela.verifiedCount, 1, "imported is not verification");
  assert.equal(tela.blockingFlags, 1);
  assert.equal(tela.passedChecks, 2);
  assert.equal(tela.state, "blocking");

  assert.equal(constr.proposedCount, 1);
  assert.equal(constr.blockingFlags, 0);
  assert.equal(constr.state, "open", "a sample-round flag is open, not blocking");

  assert.equal(totals.fieldCount, 3);
  assert.equal(totals.verifiedCount, 1);
  assert.equal(totals.blockingFlags, 1);
  assert.equal(totals.settled, 0);
});

test("populated with nothing open is 'clean', never 'verified'", () => {
  // The trap the whole desk exists to avoid: a green mark on a pack the
  // release gate will refuse because nobody signed anything.
  const { sections } = deriveSections({
    fields: { category: { value: "pantalón", provenance: "imported" },
              subcategory: { value: "wide leg", provenance: "imported" } },
    audit: { flags: [], passed: [] },
  });
  assert.equal(sections[0].state, "clean");
  assert.equal(stateLabel("clean"), "sin verificar");
  assert.notEqual(stateLabel("clean"), stateLabel("verified"));
});

test("verified needs every field in the section, not a majority", () => {
  const half = deriveSections({
    fields: { category: { value: "a", provenance: "human_verified" },
              subcategory: { value: "b", provenance: "imported" } },
    audit: { flags: [], passed: [] },
  });
  assert.equal(half.sections[0].state, "clean");

  const whole = deriveSections({
    fields: { category: { value: "a", provenance: "human_verified" },
              subcategory: { value: "b", provenance: "supplier_confirmed" } },
    audit: { flags: [], passed: [] },
  });
  assert.equal(whole.sections[0].state, "verified");
});

test("a flag keyed on a check reaches the section holding its read fields", () => {
  if (skipWithoutEngine("check reads")) return;
  // `pom` is the check; `pom_list` and `base_size` are the fields. Without the
  // read-key relation the supplier's measurement question would land in a
  // different section than the chart it asks about.
  assert.equal(sectionOf("pom"), "medidas");
  assert.equal(sectionOf("pom_list"), "medidas");
  assert.equal(sectionOf("base_size"), "medidas");
  assert.equal(checkForField("pom_list"), "pom");
  assert.equal(checkForField("label_care"), "labels");
  assert.equal(checkForField("document_date"), "version");
  assert.equal(checkForField("seam_types"), "seam_types");
  assert.equal(checkForField("category"), null,
    "preflight runs no check on the category — saying it does would be a lie");
});

test("the rail summary counts, and never scores", () => {
  const { totals } = deriveSections({
    fields: { category: { value: "a", provenance: "human_verified" },
              seam_types: { value: "b", provenance: "ai_proposed" } },
    audit: { flags: [{ key: "stitch_density", tier: "sample_round" }], passed: [] },
  });
  const line = railSummary(totals);
  assert.match(line, /1 de 2 secciones sin puntos abiertos/);
  assert.match(line, /1 de 2 campos verificados/);
  assert.ok(!/%/.test(line),
    "preflight refuses to score a pack out of 100 and this rail must not "
    + "reintroduce the score under a progress bar");
});

test("an empty or missing pack does not throw or invent a section", () => {
  for (const empty of [null, undefined, {}, { fields: {}, audit: {} }]) {
    const { sections, totals } = deriveSections(empty);
    assert.deepEqual(sections, []);
    assert.equal(totals.sections, 0);
    assert.match(railSummary(totals), /todavía no tiene campos/);
  }
});

// --------------------------------------------------------------------------- //
// the governance rule the reference states outright
// --------------------------------------------------------------------------- //

test("only an ai_proposed field offers an insert, and only on a live pack", () => {
  const draft = { value: "overlock 4 hilos", provenance: "ai_proposed" };
  assert.equal(canInsertDraft(draft, "draft"), true);
  assert.equal(canInsertDraft(draft, "in_review"), true);

  // A released pack is immutable — a factory may be quoting against it — and
  // the engine 409s the write. A button that can only fail is its own lie.
  assert.equal(canInsertDraft(draft, "released"), false);
  assert.equal(canInsertDraft(draft, "superseded"), false);

  for (const prov of ["imported", "calculated", "human_verified",
                      "supplier_confirmed", undefined]) {
    assert.equal(canInsertDraft({ value: "x", provenance: prov }, "draft"), false,
      `${prov} is not a draft awaiting insertion`);
  }
  assert.equal(canInsertDraft(null, "draft"), false);
});

test("inserting a draft seeds the editor — it never produces a write", () => {
  // The whole governance rule: "AI cannot … release a factory pack … without
  // authorized human action", and the reference's own Insert draft affordance.
  // `draftSeed` returns a STRING. If it ever returned an object with a
  // `provenance`, one click would be enough to sign a model's sentence as a
  // person's attestation.
  const seed = draftSeed({ value: "overlock 4 hilos", provenance: "ai_proposed" });
  assert.equal(typeof seed, "string");
  assert.equal(seed, "overlock 4 hilos");

  assert.equal(draftSeed({ value: "x", provenance: "imported" }), null);
  assert.equal(draftSeed({ value: null, provenance: "ai_proposed" }), null);
  assert.equal(draftSeed(null), null);

  // An object value still arrives as text a person can read and edit.
  assert.equal(draftSeed({ value: { a: 1 }, provenance: "ai_proposed" }),
               '{"a":1}');
});

test("the desk's insert path cannot bypass the two-click rule", () => {
  // Source rule, because the risk is a future edit that wires the insert
  // button straight to `setTechPackField`. The one payload builder lives in
  // lib/techPackFields.js and must be reached only from the save button.
  const view = readFileSync(
    new URL("../components/views/TechPack.jsx", import.meta.url), "utf8");
  const insert = view.match(/draftSeed\([^)]*\)[\s\S]{0,400}/)?.[0] || "";
  assert.ok(insert, "the desk must use draftSeed to offer a draft");
  assert.ok(!/setTechPackField/.test(insert),
    "the insert action writes to the engine — a model's proposal would become "
    + "a person's signed attestation in one click, which is exactly the silent "
    + "AI edit the reference forbids");
});

// --------------------------------------------------------------------------- //
// linked components: the real link, and the labelled absence
// --------------------------------------------------------------------------- //

test("the linked material is the resolved row, not an invented BOM", () => {
  const linked = linkedMaterial({
    material_reference: { value: "TEX-114", provenance: "imported",
                          source: "assortment_slots.material_id" },
    fabric_composition: { value: "70% lana", provenance: "imported",
                          source: "brand_materials.TEX-114" },
    fabric_weight: { value: "260 gsm", provenance: "imported",
                     source: "brand_materials.TEX-114" },
    quantity: { value: 300, provenance: "imported",
                source: "assortment_slots.planned_units" },
  });
  assert.equal(linked.reference.value, "TEX-114");
  assert.deepEqual(linked.contributed.map(([k]) => k),
                   ["fabric_composition", "fabric_weight"]);
  assert.equal(linked.sourceRow, "brand_materials.TEX-114");
});

test("a pack whose material never resolved reports nothing linked", () => {
  const linked = linkedMaterial({
    material_reference: { value: "TEX-999", provenance: "imported",
                          source: "assortment_slots.material_id" },
  });
  assert.equal(linked.contributed.length, 0);
  assert.equal(linked.sourceRow, null,
    "an unresolved reference contributes no fields, and the screen has to say "
    + "so rather than draw a component with a code and no row behind it");
  assert.equal(linkedMaterial(null).reference, null);
});
