// The tech pack, arranged into the sections it actually has.
//
// WHY THIS EXISTS. The desk was right and shaped wrong: six provenance states,
// a release gate, approval lanes, a delivery ledger and 31 supplier questions,
// all of it stacked as tables you scroll past. The approved reference
// (`design/atelier-redesign/03-product-tech-pack.png`) is a three-region
// working surface — a section list with completion state, a working canvas,
// and one contextual inspector — and the thing that makes that shape possible
// is a SECTION. This module is that, and nothing else.
//
// ⚠ WHERE THE SECTIONS COME FROM, AND WHERE THEY DO NOT.
//
// The reference draws "Neckline · Shoulder · Sleeve · Drape & knot · Seams ·
// Hem · Closures · Finishing" — anchored construction callouts on a technical
// flat. THE ENGINE HAS NO SUCH TABLE. `design/atelier-redesign/README.md` says
// so itself, under PROPOSED: "construction sections with anchored callouts …
// Each is drawn here and has no engine table." Building that list would be
// inventing eight rows of a schema that does not exist, which is the exact
// failure the reference set argues against.
//
// So a section here is a GROUP OF ENGINE KEYS, and every member is a real one:
//
//   · the field keys `api/app/tech_pack.py` writes when it assembles a pack
//     (`category`, `fabric_composition`, `landed_cost_decomposition`, …), and
//   · the check keys `api/app/preflight.py` audits, with the read keys each
//     check declares (`pom` reads `pom_list` and `base_size`; `labels` reads
//     `label_brand`, `label_care`, `label_size`).
//
// The GROUPING is this file's editorial act and it is the only one. It is
// held honest by three rules, each with a test:
//
//   1. A section that has neither a field nor a check IN THIS PACK does not
//      render. The left rail lists what the pack has, never a taxonomy.
//   2. A key this file does not know lands in a labelled "otros" section
//      rather than being dropped. A field that disappears off a screen is
//      worse than one filed untidily.
//   3. Completion is counted, never scored. `blocking` comes from the audit's
//      own tier, `verified` from the two provenances a person stands behind.
//      No percentage that mixes them, for preflight's own stated reason: a
//      number invites optimising the number.

/** The two provenances that mean a PERSON stood behind the value. Same list as
 *  `lib/techPackFields.js` STOOD_BEHIND — and the only two the router accepts
 *  over HTTP, because `imported` and `calculated` are origin claims that only
 *  the assembler can make truthfully. */
const STOOD_BEHIND = ["human_verified", "supplier_confirmed"];

const AI_PROPOSED = "ai_proposed";

/**
 * Which field keys each preflight check reads.
 *
 * ⚠ TRANSCRIBED FROM `api/app/preflight.py` CHECKS, `reads=` arguments only.
 * Every other check reads the key of its own name, so it is absent here. A
 * flag arrives keyed on the CHECK (`pom`), while the pack's field map is keyed
 * on the FIELD (`pom_list`) — without this relation the inspector cannot put
 * the supplier's question next to the value it is asking about.
 */
const CHECK_READS = {
  size_range: ["size_range", "size_ratio"],
  flat_sketch: ["flat_sketch_front", "flat_sketch_back"],
  pom: ["pom_list", "base_size"],
  labels: ["label_brand", "label_care", "label_size"],
  sample_cost: ["sample_cost", "sample_cost_payer"],
  version: ["document_version", "document_date"],
};

/**
 * The 31 checks preflight runs, by key.
 *
 * ⚠ THIS IS NOT DECORATION AND IT IS NOT THE SAME LIST AS THE FIELDS. A flag
 * is keyed on a CHECK; a value is keyed on a FIELD; `category` is a field with
 * no check and `pom` is a check with no field of its own. Without this set the
 * inspector would offer "the supplier's question" for `category` by echoing
 * the field name back, which is a question nobody asked.
 *
 * A test asserts this equals `preflight.CHECKS` read off the engine, so it
 * cannot quietly go stale.
 */
export const CHECK_KEYS = [
  "quantity", "colorways", "size_range", "fabric_composition", "fabric_weight",
  "fabric_construction", "flat_sketch", "pom", "delivery_window",
  "tolerances", "grading", "seam_types", "stitch_density", "hem_cuff_finish",
  "neckline", "closure", "interlining", "thread", "wash_finish",
  "colour_reference", "print_embroidery", "labels", "packing",
  "target_price", "incoterm", "sample_lead_time", "sample_cost",
  "fabric_sourcing", "trim_sourcing", "moq_expectation", "version",
];

/**
 * The sections, in the order a pack is worked through: what it is, what it
 * looks like, what it is made of, how big, how built, what colour, how
 * finished, what it costs, when, and which document this is.
 *
 * `keys` mixes check keys and field keys deliberately — both are engine
 * vocabulary and a section needs to catch either. `SECTION_KEYS` below expands
 * every check key into the fields it reads, so nothing has to be listed twice.
 */
export const SECTIONS = [
  {
    id: "identidad",
    label: "Identidad",
    // Assembler-only: preflight runs no check on these. The engine says why —
    // "factories do not bounce a pack for naming its category".
    keys: ["category", "subcategory", "style_intent"],
  },
  {
    id: "diseno",
    label: "Diseño",
    keys: ["design_name", "design_silhouette", "design_reference", "flat_sketch"],
  },
  {
    id: "tela",
    label: "Tela",
    keys: ["material_reference", "fabric_composition", "fabric_weight",
           "fabric_construction", "fabric_supplier", "fabric_sourcing"],
  },
  {
    id: "medidas",
    label: "Medidas y talles",
    keys: ["pom", "size_range", "grading", "tolerances"],
  },
  {
    id: "construccion",
    label: "Construcción",
    // ⚠ EXACTLY `tech_pack_generator.PROPOSABLE` minus its label and packing
    // keys — the engine's own words for this set are "las especificaciones de
    // CONSTRUCCIÓN que faltan". It is the one section a model may write into.
    keys: ["seam_types", "stitch_density", "hem_cuff_finish", "neckline",
           "closure", "interlining", "thread", "wash_finish"],
  },
  {
    id: "color",
    label: "Color y gráfica",
    keys: ["colorways", "colour_reference", "print_embroidery"],
  },
  {
    id: "terminacion",
    label: "Etiquetas y empaque",
    keys: ["labels", "packing", "trim_sourcing"],
  },
  {
    id: "comercial",
    label: "Comercial",
    keys: ["quantity", "target_price", "incoterm", "moq_expectation",
           "sample_cost", "landed_cost_decomposition", "supplier"],
  },
  {
    id: "calendario",
    label: "Calendario",
    keys: ["delivery_window", "sample_lead_time"],
  },
  {
    id: "documento",
    label: "Documento",
    keys: ["version"],
  },
];

/** The catch-all. Named on screen, never silent: a key the engine grew and
 *  this file has not learned yet must still be workable. */
export const OTHER_SECTION = { id: "otros", label: "Otros campos del motor" };

/** section id → every key it owns, check keys expanded into their read keys. */
const SECTION_KEYS = new Map(SECTIONS.map((s) => [
  s.id,
  [...new Set(s.keys.flatMap((k) => [k, ...(CHECK_READS[k] || [])]))],
]));

/** key (check or field) → section id. */
const KEY_SECTION = new Map();
for (const [id, keys] of SECTION_KEYS) {
  for (const k of keys) KEY_SECTION.set(k, id);
}

/** Which section a key belongs to, or `null` when this file has never heard
 *  of it — the caller files those under `otros` rather than dropping them. */
export function sectionOf(key) {
  return KEY_SECTION.get(key) || null;
}

/** The check whose question covers a field key, so the inspector can put the
 *  supplier's own sentence beside the value. `null` when preflight runs no
 *  check on that field, which is a real and common answer. */
export function checkForField(key) {
  for (const [check, reads] of Object.entries(CHECK_READS)) {
    if (reads.includes(key)) return check;
  }
  // Every other check reads the key of its own name. A field that is not a
  // check key gets `null` — preflight audits 31 things, not every field the
  // pack carries, and pretending otherwise invents a question.
  return CHECK_KEYS.includes(key) ? key : null;
}

/**
 * A section's completion, counted from what the engine reported.
 *
 * ⚠ FOUR STATES, AND THEY ARE NOT A SCALE. `blocking` is the audit's own tier
 * (a factory cannot quote), `open` is any other unresolved check, `verified`
 * means every field a person stood behind and no check is open, and `clean`
 * is the honest middle: nothing is open, and nobody has signed. Collapsing
 * `clean` into `verified` would put a green mark on a pack the release gate
 * will refuse.
 */
function stateOf({ fieldCount, verifiedCount, openFlags, blockingFlags }) {
  if (blockingFlags > 0) return "blocking";
  if (openFlags > 0) return "open";
  if (fieldCount > 0 && verifiedCount === fieldCount) return "verified";
  return "clean";
}

const STATE_LABEL = {
  blocking: "no se puede cotizar",
  open: "puntos abiertos",
  verified: "verificada",
  clean: "sin verificar",
};

/** The state's word, for a screen that must never show a bare colour. */
export function stateLabel(state) {
  return STATE_LABEL[state] || state;
}

/**
 * Split one pack into its sections.
 *
 * @param {object|null} pack a record from `GET /brands/{id}/tech-packs/{id}`
 * @returns {{sections: Array, totals: object}}
 *   `sections` holds only those with something in them, in SECTIONS order,
 *   with `otros` last when it has anything.
 */
export function deriveSections(pack) {
  const fields = pack?.fields || {};
  const audit = pack?.audit || {};
  // `flags` is the OPEN list and `passed` the resolved one — preflight splits
  // them at the source (`evaluate`), and both are needed: a section whose
  // checks all passed is complete, and a section with no checks at all is a
  // different thing again.
  const openFlags = Array.isArray(audit.flags) ? audit.flags : [];
  const passedFlags = Array.isArray(audit.passed) ? audit.passed : [];

  const bucket = new Map();
  const take = (id) => {
    if (!bucket.has(id)) {
      bucket.set(id, { fields: [], open: [], passed: [] });
    }
    return bucket.get(id);
  };

  for (const [key, value] of Object.entries(fields)) {
    take(sectionOf(key) || OTHER_SECTION.id).fields.push([key, value]);
  }
  for (const flag of openFlags) {
    if (!flag || !flag.key) continue;
    take(sectionOf(flag.key) || OTHER_SECTION.id).open.push(flag);
  }
  for (const flag of passedFlags) {
    if (!flag || !flag.key) continue;
    take(sectionOf(flag.key) || OTHER_SECTION.id).passed.push(flag);
  }

  const order = [...SECTIONS, OTHER_SECTION];
  const sections = order
    .filter((def) => bucket.has(def.id))
    .map((def) => {
      const b = bucket.get(def.id);
      const verifiedCount = b.fields.filter(
        ([, v]) => STOOD_BEHIND.includes(v?.provenance)).length;
      const proposedCount = b.fields.filter(
        ([, v]) => v?.provenance === AI_PROPOSED).length;
      const blockingFlags = b.open.filter((f) => f.tier === "blocking").length;

      const counts = {
        fieldCount: b.fields.length,
        verifiedCount,
        proposedCount,
        openFlags: b.open.length,
        blockingFlags,
        passedChecks: b.passed.length,
        checkCount: b.open.length + b.passed.length,
      };
      return {
        id: def.id,
        label: def.label,
        fields: b.fields,
        flags: b.open,
        passed: b.passed,
        ...counts,
        state: stateOf(counts),
      };
    });

  const totals = sections.reduce((acc, s) => ({
    fieldCount: acc.fieldCount + s.fieldCount,
    verifiedCount: acc.verifiedCount + s.verifiedCount,
    proposedCount: acc.proposedCount + s.proposedCount,
    openFlags: acc.openFlags + s.openFlags,
    blockingFlags: acc.blockingFlags + s.blockingFlags,
    sections: acc.sections + 1,
    settled: acc.settled + (s.openFlags === 0 ? 1 : 0),
  }), { fieldCount: 0, verifiedCount: 0, proposedCount: 0, openFlags: 0,
        blockingFlags: 0, sections: 0, settled: 0 });

  return { sections, totals };
}

/**
 * The rail's summary line. Two plain counts, never a composite.
 *
 * ⚠ NO PERCENTAGE THAT MIXES THEM. The reference image shows "62%" beside a
 * progress bar, and preflight refuses to score a pack out of 100 for a stated
 * reason: "a number invites optimising the number, and 82/100 does not tell
 * anyone which two lines to write tonight." A fraction of verified fields is
 * a fact and is shown as one; the sections figure stays a separate sentence.
 */
export function railSummary(totals) {
  if (!totals || totals.sections === 0) {
    return "Esta ficha todavía no tiene campos ni chequeos.";
  }
  return `${totals.settled} de ${totals.sections} secciones sin puntos abiertos`
    + ` · ${totals.verifiedCount} de ${totals.fieldCount} campos verificados`;
}

// --------------------------------------------------------------------------- //
// the AI draft, and the human act that inserts it
// --------------------------------------------------------------------------- //

/**
 * Whether a field carries a model's proposal that a person may insert.
 *
 * ⚠ INSERTION IS A HUMAN ACT AND STAYS ONE — the governance rule the reference
 * states outright ("no silent AI edits"; AI "never inserts: a person clicks
 * Insert draft"). This returns a boolean about ELIGIBILITY. It does not write,
 * it does not produce a request payload, and the thing it unlocks on screen
 * only seeds the editor: the value is still not the pack's until the person
 * presses save, which is a second, separate click.
 *
 * A released or superseded pack is never eligible. The engine refuses the
 * write with a 409 — a factory may be quoting against it — and offering a
 * button that can only fail is its own small lie.
 */
export function canInsertDraft(entry, packStatus) {
  if (!entry || entry.provenance !== AI_PROPOSED) return false;
  return packStatus !== "released" && packStatus !== "superseded";
}

/**
 * The draft text a person is offered, as a string for the editor.
 *
 * Returns `null` when there is nothing to insert. It never returns a write
 * payload: `lib/techPackFields.js#editedFieldPayload` is the only thing that
 * builds one, and it is reached only from the save button — so a draft cannot
 * take a shortcut into the pack.
 */
export function draftSeed(entry) {
  if (!entry || entry.provenance !== AI_PROPOSED) return null;
  const value = entry.value;
  if (value == null) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/**
 * What a flag's `suggest` string is, said plainly.
 *
 * ⚠ IT IS AN EXAMPLE, NOT A VALUE, and this is why there is no button beside
 * it. preflight writes things like `e.g. "300 units per colourway, 900 total"`
 * — inserting that verbatim would put an invented quantity on a document a
 * factory quotes from, which is the "invented 74 cm" `tech_pack.py` names as
 * the module's defining failure. So it is labelled as the shape of an answer
 * and a person types their own.
 */
export const SUGGEST_LABEL = "Forma de una respuesta — un ejemplo del motor, "
  + "no un valor de esta prenda. Nadie lo inserta: se escribe el real.";

// --------------------------------------------------------------------------- //
// linked components
// --------------------------------------------------------------------------- //

/**
 * What the reference calls "Linked components (2)" — and what this product
 * actually has instead.
 *
 * ⚠ THERE IS NO BOM TABLE. The reference draws a component list with codes
 * (`CMP-101` shell, `TRM-203` reinforcement) and its own README files that
 * under PROPOSED: "BOM lines with consumption and waste … has no engine
 * table." What DOES exist is one resolved link: `assortment_slots.material_id`
 * points at a `brand_materials` row, and every field the sheet contributed
 * carries that row in its `source` string. So this reports the real link and
 * says the rest is absent, rather than drawing an empty component list that
 * reads as "this garment is made of nothing".
 *
 * @returns {{reference: object|null, contributed: Array, sourceRow: string|null}}
 */
export function linkedMaterial(fields) {
  const all = Object.entries(fields || {});
  const reference = fields?.material_reference || null;
  const contributed = all.filter(
    ([, v]) => typeof v?.source === "string" && v.source.startsWith("brand_materials."));
  const sourceRow = contributed.length ? contributed[0][1].source : null;
  return { reference, contributed, sourceRow };
}

/** The sentence for a pack with no material row resolved behind it. */
export const NO_MATERIAL_ROW = "El plan no referencia un material, o la "
  + "referencia no resolvió contra la ficha de materiales. No hay lista de "
  + "componentes: el motor no tiene tabla de BOM, y dibujar una vacía sería "
  + "peor que decirlo.";

/** The sentence for a section whose tolerances cannot exist. */
export const NO_TOLERANCES = "Las tolerancias existen por punto de medida y "
  + "salen del bloque aprobado de la marca. Esta sección no tiene ninguno, así "
  + "que no hay tolerancia que mostrar — ni una por defecto.";
