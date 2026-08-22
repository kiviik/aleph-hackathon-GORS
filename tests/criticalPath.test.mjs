// Ruta crítica — the engine's calendar, and the four ways a screen could
// quietly break it.
//
// The engine (`api/app/critical_path.py`) computes ARITHMETIC OVER RECORDED
// DATES and says so in every answer. The failures this file guards are the
// ones a frontend introduces for free:
//
//   1. deciding for itself what is late (a `new Date()` comparison that
//      disagrees with the engine the first time a timezone does);
//   2. swallowing `duplicate_milestones` — the engine keeps the FIRST row and
//      names the loser precisely because the old silent collapse could make a
//      style's own ex-factory vanish from the calendar;
//   3. collapsing "we could not ask" into "there is no calendar";
//   4. sending a full body to a `PUT` the engine reads with `exclude_unset`,
//      which would overwrite fields nobody touched.
import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { COLLECTION_AREAS } from "@/lib/collectionAreas";
import { PORTED, TITLES, VIEW_DATA_STATUS, resolveView, sectionForView } from "@/lib/nav";
import {
  MILESTONE_STATES, SUPPLIER_ATTRIBUTION_UNREADABLE, coverageNotes, duplicateWarnings,
  editable, hasEdits, launchRead, milestonePatch, orderRows, pathRead, scopeOf,
  slipText, stateCounts, stateRead,
} from "@/lib/criticalPath.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

// A projection shaped exactly like the live engine's (probed 2026-08-18 against
// the Atelier Demo brand's only seeded calendar).
const ROW = (over = {}) => ({
  key: "ex_factory", style_id: null, label: "Salida de fábrica",
  planned_date: "2026-08-19", actual_date: null, projected_date: "2026-08-19",
  slip_days: 0, state: "at_risk", owner: "Equipo Atelier",
  depends_on: ["inspection"], blocked_by: [], why: "vence en 1 día(s)", ...over,
});

const PAYLOAD = (over = {}) => ({
  milestones: [ROW()], launch: null, missing_milestones: [],
  unplanned_milestones: [], unresolvable: [], duplicate_milestones: [],
  basis: "aritmética sobre fechas cargadas por el equipo", ...over,
});

// --------------------------------------------------------------------------
// Registration
// --------------------------------------------------------------------------

test("the critical-path view is registered, with one canonical owner", () => {
  assert.equal(TITLES.criticalpath, "Ruta crítica");
  // The collection owns it: every engine route is
  // /brands/{b}/collections/{c}/… — there is no brand-wide calendar.
  assert.equal(sectionForView("criticalpath"), "collection");
  assert.equal(VIEW_DATA_STATUS.criticalpath, "live");
  assert.ok(PORTED.has("criticalpath"));
  assert.deepEqual(resolveView("criticalpath"), { view: "criticalpath", tab: null });

  // Exactly one drawer lists it (navOwnership.test.mjs enforces the general
  // rule; this pins the new view specifically).
  const listings = COLLECTION_AREAS
    .flatMap((g) => g.items.filter((i) => i.view === "criticalpath").map(() => g.key));
  assert.deepEqual(listings, ["salida"]);
});

test("the shell routes #/criticalpath to the real view and scopes it to a collection", async () => {
  const src = await readFile(join(ROOT, "components/Shell.jsx"), "utf8");
  assert.match(src, /case "criticalpath":/,
    "a registered view with no switch case renders the migration placeholder");
  assert.match(src, /import CriticalPath from "\.\/views\/CriticalPath"/);
  // Without this the collection switcher disappears and `?collection=` is
  // stripped on navigation — a calendar with no collection to belong to.
  assert.match(src, /"criticalpath",\n\]\);/,
    "criticalpath must be in COLLECTION_LINKED_VIEWS");
});

test("the screen's class namespace belongs to it alone", async () => {
  // ⚠ FOUND IN THE BROWSER, NOT BY A TEST (2026-08-18). This screen first
  // shipped on a `cp-` prefix — which `app/atelier-ui.css` has owned for the
  // competitor panel since long before. `.cp-none`, meant to be four grey
  // characters in a table cell, inherited `display:flex; padding:20px 22px;
  // border-radius:14px; background:var(--surface)` and every empty "Real"
  // cell rendered as a large empty card.
  //
  // `stylesheetCoverage.test.mjs` CANNOT see this: it fails only when a whole
  // namespace has ZERO rules, and a collided namespace has plenty — belonging
  // to somebody else. So the check that matters here is the opposite one.
  const view = await readFile(join(ROOT, "components/views/CriticalPath.jsx"), "utf8");
  const mine = new Set([...view.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`)/g)]
    .flatMap((m) => (m[1] || m[2] || "").replace(/\$\{[^}]*\}/g, " ").split(/\s+/))
    .filter((c) => /^crit(-[a-z0-9-]+)?$/.test(c)));
  assert.ok(mine.size >= 8, "expected the screen's own namespace to be in use");

  const foreign = [];
  for (const rel of ["app/globals.css", "app/atelier-ui.css"]) {
    const css = await readFile(join(ROOT, rel), "utf8");
    for (const cls of mine) {
      // `.alert.crit` is a compound selector on somebody else's element and
      // cannot match this screen's root, which carries `crit` alone.
      const re = new RegExp(`(^|[\\s,{}])\\.${cls}(?![a-z0-9-])`, "m");
      if (re.test(css)) foreign.push(`${rel} styles .${cls}`);
    }
  }
  assert.deepEqual(foreign, [], "another stylesheet already owns these class "
    + "names, so this screen inherits rules written for a different component:\n  "
    + foreign.join("\n  "));
});

// --------------------------------------------------------------------------
// Three states, kept apart
// --------------------------------------------------------------------------

test("not-asked, could-not-ask and no-calendar are three different answers", () => {
  assert.equal(pathRead(undefined).state, "loading");
  assert.equal(pathRead(null).state, "unavailable");
  assert.equal(pathRead("nope").state, "unavailable");
  // A payload without the contract's array is drift, not an empty calendar.
  assert.equal(pathRead({ basis: "x" }).state, "unavailable");

  // The engine's own answer for a collection nobody has seeded: an empty list
  // WITH a sentence naming the seed endpoint. That is not an outage.
  const unseeded = pathRead({
    milestones: [], launch: null, missing_milestones: ["brief_approved"],
    unplanned_milestones: [], unresolvable: [],
    basis: "esta colección todavía no tiene calendario — POST .../critical-path/seed",
  });
  assert.equal(unseeded.state, "unseeded");
  assert.match(unseeded.basis, /todavía no tiene calendario/);
  // ⚠ The empty branch of the engine omits `duplicate_milestones` entirely.
  assert.deepEqual(unseeded.duplicates, []);
});

test("a real projection reads as ready and carries what the engine named", () => {
  const read = pathRead(PAYLOAD({ missing_milestones: ["sales_sample"] }));
  assert.equal(read.state, "ready");
  assert.equal(read.rows.length, 1);
  assert.deepEqual(read.missing, ["sales_sample"]);
});

// --------------------------------------------------------------------------
// The state is the engine's word
// --------------------------------------------------------------------------

test("the five engine states have a word, and a sixth one is shown raw", () => {
  for (const key of ["done", "late", "at_risk", "on_track", "unplanned"]) {
    assert.ok(MILESTONE_STATES[key]?.label, `${key} has no label`);
    assert.equal(stateRead(key).label, MILESTONE_STATES[key].label);
  }
  // ⚠ NOT COERCED TO A DEFAULT. An engine that grows a sixth state must not
  // render as the fifth — the statusVocabulary rule.
  assert.equal(stateRead("shipped_early"), null);
  assert.equal(stateRead(undefined), null);
  assert.equal(stateRead(""), null);
});

test("counts come from the engine's state field, and an unknown one still counts", () => {
  const counts = stateCounts([
    ROW({ state: "late" }), ROW({ state: "late" }),
    ROW({ state: "done" }), ROW({ state: "shipped_early" }), ROW({ state: null }),
  ]);
  assert.equal(counts.late, 2);
  assert.equal(counts.done, 1);
  assert.equal(counts.shipped_early, 1, "an unknown state must not vanish");
  assert.equal(counts.desconocido, 1, "a missing state is named, not dropped");
});

test("slip is a signed sentence, and no plan means no measurement", () => {
  assert.equal(slipText(11), "11 día(s) más tarde que lo planificado");
  assert.equal(slipText(-3), "3 día(s) antes de lo planificado");
  assert.equal(slipText(0), "en la fecha planificada");
  // No planned date → the engine sends null → there is nothing to measure
  // against, and 0 would read as "hit the plan".
  assert.equal(slipText(null), null);
  assert.equal(slipText(undefined), null);
});

// --------------------------------------------------------------------------
// duplicate_milestones is a warning, never a dedupe
// --------------------------------------------------------------------------

test("same-scope duplicates are surfaced with the fix in them", () => {
  const warnings = duplicateWarnings({
    duplicate_milestones: [
      { key: "ex_factory", style_id: null },
      { key: "proto_sample", style_id: "3f2b1a0c-1111-2222-3333-444455556666" },
      { key: null, style_id: null },   // shape drift: dropped, not rendered blank
    ],
  });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0].text, /calendario de la colección/);
  assert.match(warnings[0].text, /conserva la primera fila/);
  assert.match(warnings[1].text, /estilo 3f2b1a0c/);
  assert.equal(warnings[1].styleId, "3f2b1a0c-1111-2222-3333-444455556666");
});

test("a projection with duplicates keeps them on the read, not filtered away", () => {
  const read = pathRead(PAYLOAD({
    duplicate_milestones: [{ key: "ex_factory", style_id: null }],
  }));
  assert.equal(read.duplicates.length, 1,
    "silently deduping is the bug the engine's report exists to end");
});

test("the view renders the duplicates instead of counting them", async () => {
  const src = await readFile(join(ROOT, "components/views/CriticalPath.jsx"), "utf8");
  assert.match(src, /read\.duplicates\.map/,
    "each duplicate must be named — a count would not say which row to delete");
});

// --------------------------------------------------------------------------
// Nothing is inferred that the engine did not compute
// --------------------------------------------------------------------------

test("no date on this screen is compared against the browser clock", async () => {
  const [view, lib] = await Promise.all([
    readFile(join(ROOT, "components/views/CriticalPath.jsx"), "utf8"),
    readFile(join(ROOT, "lib/criticalPath.mjs"), "utf8"),
  ]);
  // ⚠ COMMENTS ARE STRIPPED FIRST, and the reason is the same one
  // styleHydration.test.mjs records: the first version of this failed on the
  // header comment WARNING against the pattern, quoting it literally. A rule
  // that fails on the file explaining the rule is a rule people learn to
  // silence.
  const code = (src) => src.split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

  for (const [name, src] of [["CriticalPath.jsx", code(view)], ["criticalPath.mjs", code(lib)]]) {
    for (const banned of ["Date.now(", "new Date("]) {
      assert.ok(!src.includes(banned),
        `${name} uses ${banned} — late/at_risk/on_track arrive computed with the `
        + "sentence that justifies them; a second opinion formed here is one "
        + "nobody could trace");
    }
  }
});

test("an empty coverage list produces no sentence, not a reassuring zero", () => {
  assert.deepEqual(coverageNotes(pathRead(PAYLOAD())), []);
  const notes = coverageNotes(pathRead(PAYLOAD({
    missing_milestones: ["inspection"],
    unplanned_milestones: ["quote_due", "sales_sample"],
    unresolvable: ["warehouse"],
  })));
  assert.deepEqual(notes.map((n) => n.kind), ["missing", "unplanned", "unresolvable"]);
  assert.match(notes[1].text, /2 hito\(s\) sin fecha planificada/);
  assert.match(notes[1].text, /no asume una/);
});

test("no launch row is a real answer, not a blank date to fill in", () => {
  const none = launchRead(pathRead(PAYLOAD()));
  assert.equal(none.known, false);
  assert.match(none.why, /no hay fecha de salida/);
  assert.ok(!("projectedDate" in none), "an unknown launch has no date to print");

  const known = launchRead(pathRead(PAYLOAD({
    launch: ROW({ key: "launch", planned_date: "2026-09-13",
                  projected_date: "2026-09-27", slip_days: 14, state: "late",
                  why: "espera a Llegada a depósito" }),
  })));
  assert.equal(known.known, true);
  assert.equal(known.projectedDate, "2026-09-27");
  assert.equal(known.slip, "14 día(s) más tarde que lo planificado");
});

// --------------------------------------------------------------------------
// Ordering is presentation; it never manufactures a date
// --------------------------------------------------------------------------

test("sequence order is the engine's, untouched", () => {
  const rows = [ROW({ key: "b", projected_date: "2026-01-01" }),
                ROW({ key: "a", projected_date: "2025-01-01" })];
  assert.deepEqual(orderRows(rows, "sequence").map((r) => r.key), ["b", "a"]);
  assert.deepEqual(orderRows(rows).map((r) => r.key), ["b", "a"]);
  assert.notEqual(orderRows(rows, "sequence"), rows, "must not hand back the caller's array");
});

test("date order uses the projected date, and an unprojectable row goes last", () => {
  const rows = [
    ROW({ key: "c", projected_date: null }),
    ROW({ key: "b", projected_date: "2026-03-02" }),
    ROW({ key: "a", projected_date: "2026-01-05" }),
    ROW({ key: "b2", projected_date: "2026-03-02" }),
  ];
  assert.deepEqual(orderRows(rows, "date").map((r) => r.key), ["a", "b", "b2", "c"],
    "a cycle the engine could not project must not be given a date to sort by, "
    + "and a tie must keep the engine's order");
});

// --------------------------------------------------------------------------
// The PUT body: only what was touched
// --------------------------------------------------------------------------

test("the patch carries only the fields the user touched", () => {
  // The engine reads the body with `exclude_unset`: an omitted key is left
  // alone. A builder that helpfully filled in the untouched field would wipe it.
  assert.deepEqual(milestonePatch({ plannedDate: "2026-09-01" }),
    { planned_date: "2026-09-01" });
  assert.deepEqual(milestonePatch({}), {});
  assert.deepEqual(milestonePatch({ plannedDate: undefined }), {});
});

test("an emptied field clears the date; an untouched one is not sent", () => {
  // "" from an emptied <input type="date"> is a decision — clear it.
  assert.deepEqual(milestonePatch({ actualDate: "" }), { actual_date: null });
  assert.deepEqual(milestonePatch({ actualDate: null }), { actual_date: null });
  // …and it does not drag the other date along with it.
  assert.ok(!("planned_date" in milestonePatch({ actualDate: "" })));
});

test("an empty patch is never worth a request", () => {
  assert.equal(hasEdits(milestonePatch({})), false);
  assert.equal(hasEdits(null), false);
  assert.equal(hasEdits(milestonePatch({ owner: "" })), true,
    "clearing the owner is a change");
});

test("a style overlay is read-only, and says which engine rule makes it so", () => {
  assert.equal(editable(ROW()).can, true);
  const overlay = editable(ROW({ style_id: "abc" }));
  assert.equal(overlay.can, false);
  assert.match(overlay.why, /style_id IS NULL/);
  assert.equal(editable(null).can, false);
});

test("a row names its scope so an exception is not read as the rule", () => {
  assert.equal(scopeOf(ROW()).scope, "collection");
  const style = scopeOf(ROW({ style_id: "3f2b1a0c-1111-2222-3333-444455556666" }));
  assert.equal(style.scope, "style");
  assert.match(style.label, /3f2b1a0c/);
});

// --------------------------------------------------------------------------
// The absence both screens declare
// --------------------------------------------------------------------------

test("the supplier attribution gap is stated once and shared by both screens", async () => {
  // ⚠ THE FINDING, not a note. `critical_path.project` emits key, style_id,
  // label, dates, slip, state, owner, depends_on, blocked_by, why — and no
  // supplier_id — and there is no other read of the milestone table. So "this
  // factory's milestones" cannot be assembled by any client, and filtering the
  // brand's calendar under one factory's name would re-create the exact defect
  // migration 0071 fixed.
  assert.match(SUPPLIER_ATTRIBUTION_UNREADABLE, /0071/);
  assert.match(SUPPLIER_ATTRIBUTION_UNREADABLE, /no devuelve ese campo/);

  const suppliers = await readFile(join(ROOT, "components/views/Suppliers.jsx"), "utf8");
  assert.match(suppliers, /SUPPLIER_ATTRIBUTION_UNREADABLE/,
    "the suppliers screen must render the declared absence, not a filtered list");
});
