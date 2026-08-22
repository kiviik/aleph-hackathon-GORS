// The prompt box may add CONTEXT to a designer's sentence. It may not add
// CONTENT she never had.
//
// ⚠ WHY THIS IS THE TEST THAT MATTERS. The whole reason Atelier gets to have a
// free-text box at all — rather than conceding it to a general chat model — is
// that it knows a garment may only be made from fabrics this brand can actually
// buy, at its supplier's minimum, inside its delivery window. That advantage is
// worth exactly as much as the attachment is true. One default palette, one
// "tejido de la casa", one borrowed silhouette, and the box is a worse chat
// model that also lies about the brand.
//
// This repo has shipped that defect three times in the other direction:
// `lib/catalog.js` served a 36-product Complot list to every tenant as "tus
// prendas reales", and the engine's `runner._fixtures_dir` served the default
// fixture set as an uningested brand's own catalogue. Both looked like a
// furnished product and were a lie about whose product it was.
//
// So the property asserted here is deliberately absolute rather than
// approximate: with no Direction, no palette and no material sheet, the
// composed prompt IS her sentence, character for character. A version that
// reaches for any default fails on the first assertion, not on a judgement call
// about which default was reasonable.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";

const load = async () => import("@/components/StudioExplore");

const HER_TEXT =
  "quiero una campera corta, cuello mao, que se pueda usar sobre los vestidos "
  + "de la cápsula y no pese en mayo";

// ---------------------------------------------------------------------------
// the empty tenant

test("with no Direction and no palette, the prompt is her text and nothing else", async () => {
  const { composeFreePrompt } = await load();

  const composed = composeFreePrompt({ text: HER_TEXT });

  assert.equal(composed.prompt, HER_TEXT,
    "the app appended something to a designer's sentence for a collection that "
    + "has no direction, no palette and no material sheet — whatever it added, "
    + "it invented");
  assert.deepEqual(composed.blocks, [],
    "an attachment block was built out of nothing");
  assert.deepEqual(composed.attached,
    { silhouettes: [], colours: [], fabrics: [], directionText: null });
  assert.equal(composed.notice, "sin dirección: se genera sólo con tu texto",
    "the missing context has to be SAID, in one quiet line, before she runs");
});

test("nothing that looks like brand data leaks into the empty-tenant prompt", async () => {
  const { composeFreePrompt } = await load();
  const { prompt } = composeFreePrompt({ text: HER_TEXT });

  // The mutation this is aimed at: a default palette. A hex value in the output
  // that was in no input is a colour this brand never chose.
  assert.equal(/#[0-9a-f]{3,8}/i.test(prompt), false,
    `a colour appears in the prompt that the designer never selected: ${prompt}`);
  // And the shapes the two historical fallbacks took.
  for (const invented of [
    "tejido de la casa", "jersey", "algodón", "proveedor", "MOQ", "paleta",
    "Complot", "silueta",
  ]) {
    assert.equal(prompt.toLowerCase().includes(invented.toLowerCase()), false,
      `"${invented}" reached the model without anyone in this brand asking for it`);
  }
});

test("an empty sentence composes to nothing, rather than to the attachment alone", async () => {
  const { composeFreePrompt } = await load();
  // Guard for the button state: the context is not itself a request. Generating
  // from the attachment with no sentence would spend money on a prompt nobody
  // wrote.
  const composed = composeFreePrompt({
    text: "   ",
    colours: [{ hex: "#17181C", name: "Tinta" }],
  });
  assert.equal(composed.text, "");
});

// ---------------------------------------------------------------------------
// the furnished tenant — every attached fact traceable to an input

test("only the colours she actually has are attached, with their real hex", async () => {
  const { composeFreePrompt } = await load();

  const colours = [{ hex: "#17181C", name: "Tinta" }, { hex: "#E7E4DC", name: "Arena" }];
  const { prompt, attached, missing } = composeFreePrompt({ text: HER_TEXT, colours });

  assert.ok(prompt.startsWith(HER_TEXT),
    "her words must lead: the app's context is an appendix to the request, not a "
    + "frame around it");
  assert.ok(prompt.includes("#17181C") && prompt.includes("#E7E4DC"));

  const hexes = prompt.match(/#[0-9a-f]{3,8}/gi) || [];
  assert.deepEqual([...new Set(hexes)].sort(), ["#17181C", "#E7E4DC"],
    "the composed prompt carries a hex value that came from no input — this is "
    + "exactly the default-palette mutation this file exists to kill");
  assert.deepEqual(attached.colours, colours);
  // The parts that are still absent stay absent, and are still named.
  assert.deepEqual(missing, ["dirección", "telas"]);
});

test("a colour with no valid hex is dropped, not guessed at", async () => {
  const { composeFreePrompt } = await load();
  const { attached } = composeFreePrompt({
    text: HER_TEXT,
    colours: [{ hex: "#17181C", name: "Tinta" }, { name: "verde militar" },
              { hex: "azulado", name: "Azul" }],
  });
  assert.deepEqual(attached.colours.map((c) => c.hex), ["#17181C"],
    "a named colour with no hex was given one");
});

test("a fabric travels with the supplier facts it has, and no others", async () => {
  const { composeFreePrompt } = await load();

  const { prompt } = composeFreePrompt({
    text: HER_TEXT,
    fabrics: [
      { name: "Gabardina 8 oz", comp: "98% CO 2% EA",
        supplier: "Textil Oeste", moq: "300 u", lead: "21 días" },
      // Same sheet, a row nobody has filled in past its name.
      { name: "Rib 1x1", comp: null, supplier: null, moq: null, lead: null },
    ],
  });

  assert.ok(prompt.includes("Gabardina 8 oz (98% CO 2% EA)"));
  assert.ok(prompt.includes("proveedor Textil Oeste"));
  assert.ok(prompt.includes("MOQ 300 u"));
  assert.ok(prompt.includes("entrega 21 días"));
  assert.ok(prompt.includes("Rib 1x1"));
  // The second fabric's absent facts must not borrow the first fabric's.
  assert.equal((prompt.match(/proveedor/g) || []).length, 1,
    "a fabric with no supplier was given one — probably its neighbour's");
  assert.equal((prompt.match(/MOQ/g) || []).length, 1);
});

test("the materials constraint is only asserted when there are materials", async () => {
  const { composeFreePrompt } = await load();

  const withNone = composeFreePrompt({ text: HER_TEXT });
  assert.equal(withNone.blocks.some((b) => b.key === "limite"), false,
    "the prompt told the model to stay inside a list of materials that does not "
    + "exist — an instruction with no referent is still a claim");

  const withSome = composeFreePrompt({
    text: HER_TEXT, fabrics: [{ name: "Gabardina 8 oz" }],
  });
  assert.equal(withSome.blocks.some((b) => b.key === "limite"), true);
});

test("the Direction's own words are attached only when there is a Direction", async () => {
  const { composeFreePrompt } = await load();

  const none = composeFreePrompt({ text: HER_TEXT, directionText: "" });
  assert.equal(none.blocks.some((b) => b.key === "direccion"), false);
  assert.ok(none.missing.includes("dirección"));

  const some = composeFreePrompt({
    text: HER_TEXT, directionText: "Dirección de colección: taller de invierno.",
  });
  assert.equal(some.blocks[0].key, "direccion");
  assert.ok(some.prompt.includes("taller de invierno"));
  assert.equal(some.missing.includes("dirección"), false);
});

// ---------------------------------------------------------------------------
// resolving one fabric's production facts across the three stores

test("supplier, MOQ and lead come from the real row, in the row's own units", async () => {
  const { fabricFacts } = await load();

  // The engine's material sheet, reached through the collection's Direction.
  const direction = {
    items: {
      fabrics: [{
        material_id: "m-1",
        material: {
          name: "Gabardina 8 oz", composition: "98% CO 2% EA",
          supplier_name: "Textil Oeste", moq_units: 300, lead_time_days: 21,
        },
      }],
    },
  };

  const fromSheet = fabricFacts(
    { id: "m-1", materialId: "m-1", name: "Gabardina 8 oz" }, { direction });
  assert.deepEqual(fromSheet, {
    name: "Gabardina 8 oz", comp: "98% CO 2% EA", supplier: "Textil Oeste",
    moq: "300 u", lead: "21 días",
  });

  // A hand-entered library row counts its minimum in METRES. Printing that as
  // units — or the sheet's units as metres — would quote a supplier a number
  // they never gave.
  const fromLibrary = fabricFacts(
    { id: "f-9", name: "Rib 1x1" },
    { library: [{ id: "f-9", name: "Rib 1x1", proveedor: "Hilados Sur", moq_m: 80, lead: 10 }] });
  assert.equal(fromLibrary.moq, "80 m");
  assert.equal(fromLibrary.lead, "10 días");
  assert.equal(fromLibrary.supplier, "Hilados Sur");
});

test("a fabric nobody has costed reports nulls, never blanks dressed as facts", async () => {
  const { fabricFacts } = await load();

  const bare = fabricFacts({ id: "f-1", name: "Jersey 20/1" },
                           { direction: null, library: [] });
  assert.deepEqual(bare,
    { name: "Jersey 20/1", comp: null, supplier: null, moq: null, lead: null });

  // An unrelated sheet row must not be adopted by an unmatched fabric.
  const wrongRow = fabricFacts(
    { id: "f-1", name: "Jersey 20/1" },
    { direction: { items: { fabrics: [{ material_id: "m-2",
        material: { supplier_name: "Textil Oeste", moq_units: 300 } }] } } });
  assert.equal(wrongRow.supplier, null,
    "a fabric took the supplier of a material it is not");

  assert.equal(fabricFacts({ name: "  " }), null,
    "a fabric with no name has nothing to say about itself");
  assert.equal(fabricFacts(null), null);
});

// ---------------------------------------------------------------------------
// the boundary: an image, never a verdict

test("the results surface carries no score, fit or forecast", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../components/StudioExplore.jsx", import.meta.url), "utf8");

  // The free-prompt block, from its marker to the suggestions strip that
  // follows it.
  const start = src.indexOf('<div className="xf">');
  const end = src.indexOf("evidence-grounded suggestions", start);
  assert.ok(start > 0 && end > start, "the prompt box block moved or was renamed");
  const block = src.slice(start, end);

  // A free prompt may produce an IMAGE. A verdict is the gates' answer, on
  // evidence, and never a by-product of generation.
  for (const verdict of ["dnaScore", "dnaBand", "c.score", "r.score",
                         "tasteScores", "scoreCombo", "className=\"nv"]) {
    assert.equal(block.includes(verdict), false,
      `the free-prompt results render "${verdict}" — an evaluation of an image `
      + "the model just made, which no gate has seen");
  }
  assert.ok(block.includes("no un veredicto"),
    "the boundary has to be stated where the results appear, not only in a "
    + "comment nobody reading the screen will see");
});
