// Proveedores — nav registration under its one canonical owner, and the
// performance read that must never turn the engine's refusal into a score.
//
// The engine's rule (suppliers.py): performance is COMPUTED from the
// critical-path milestones, and below three attributed deliveries it answers
// `on_time_pct: null` with a `why_none` sentence. The classic frontend failure
// one field over (lib/money.mjs) is coercing that null into 0 — which here
// would print "0% en fecha", a catastrophic score the engine never gave.
import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CONTEXT_NAV, PORTED, TITLES, VIEW_DATA_STATUS, resolveView, sectionForView,
} from "@/lib/nav";
import { declared, performanceRead, unattributedText, varianceText } from "@/lib/suppliers.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

test("the suppliers view is registered, with one canonical owner", () => {
  assert.equal(TITLES.suppliers, "Proveedores");
  // Marca & datos owns it — a factory is a brand asset, like a fabric.
  assert.equal(sectionForView("suppliers"), "library");
  assert.equal(VIEW_DATA_STATUS.suppliers, "live",
    "everything on the screen is the engine's, including its refusals");
  assert.ok(PORTED.has("suppliers"));
  assert.deepEqual(resolveView("suppliers"), { view: "suppliers", tab: null });

  // Exactly one menu lists it, and it is the menu of the section that owns it
  // — the navOwnership rule, asserted for the new view specifically.
  const listings = Object.entries(CONTEXT_NAV)
    .flatMap(([menu, nav]) => (nav.items || [])
      .filter((i) => i.view === "suppliers").map(() => menu));
  assert.deepEqual(listings, ["data"]);
});

test("the shell routes #/suppliers to the real view, not the placeholder", async () => {
  const src = await readFile(join(ROOT, "components/Shell.jsx"), "utf8");
  assert.match(src, /case "suppliers":/,
    "a registered view with no switch case renders the migration placeholder");
  assert.match(src, /import Suppliers from "\.\/views\/Suppliers"/);
});

test("an engine refusal to score never renders as a number", () => {
  const read = performanceRead({
    on_time_pct: null, mean_variance_days: null, observations: 1,
    unattributed_deliveries: 2,
    why_none: "sólo 1 entrega(s) atribuidas a este proveedor",
  });
  assert.equal(read.state, "insufficient");
  // The engine's own sentence travels through verbatim…
  assert.match(read.reason, /1 entrega/);
  // …the silent exclusion is surfaced…
  assert.equal(read.unattributed, 2);
  // …and nothing in this state carries anything formattable as a score.
  assert.ok(!("onTimeText" in read) && !("varianceText" in read),
    "an insufficient read must have no percentage to accidentally print");
});

test("a measured record keeps the engine's numbers and their basis", () => {
  const read = performanceRead({
    on_time_pct: 66.7, mean_variance_days: 3.2, observations: 3,
    unattributed_deliveries: 0, basis: "salidas de fábrica atribuidas",
  });
  assert.equal(read.state, "measured");
  assert.equal(read.onTimeText, "66.7%");
  assert.equal(read.varianceText, "3.2 días tarde en promedio");
  assert.equal(read.basis, "salidas de fábrica atribuidas");
});

test("variance is a signed sentence — late, early and on-time differ", () => {
  assert.equal(varianceText(-2), "2 días antes de fecha en promedio");
  assert.equal(varianceText(0), "en fecha, en promedio");
  assert.equal(varianceText(4.5), "4.5 días tarde en promedio");
  assert.equal(varianceText(null), null);
});

test("the refusal carries the distance to an answer, as deliveries not a rate", () => {
  // `observations` travels with the refusal so a reader knows how far off an
  // answer is — but it is a COUNT OF DELIVERIES. It must never reach a
  // percentage formatter, which is the same null-becomes-0% trap one field over.
  const read = performanceRead({
    on_time_pct: null, mean_variance_days: null, observations: 2,
    unattributed_deliveries: 0, why_none: "sólo 2 entrega(s) atribuidas",
  });
  assert.equal(read.observations, 2);
  assert.equal(read.unattributed, 0);
  assert.ok(!("onTimeText" in read));
});

test("zero excluded deliveries produces no sentence, not «0 sin atribuir»", () => {
  // The two gaps have different fixes and only one of them is "wait". A zero
  // rendered forever would put a solved problem permanently on screen.
  assert.equal(unattributedText(0), null);
  assert.equal(unattributedText(null), null);
  assert.equal(unattributedText(undefined), null);
  assert.equal(unattributedText("nope"), null);
  const text = unattributedText(4);
  assert.match(text, /^4 salida\(s\)/);
  assert.match(text, /ruta crítica/,
    "the sentence has to name where the fix happens, or it is just a complaint");
});

test("the exclusion is shown in BOTH branches — refused and measured", async () => {
  // ⚠ It used to appear only beside a measured number, which is backwards:
  // when the engine refuses to score, the unattributed deliveries are the
  // fastest route to it existing at all.
  const src = await readFile(join(ROOT, "components/views/Suppliers.jsx"), "utf8");
  const insufficient = src.slice(src.indexOf('read.state === "insufficient"'));
  const measured = insufficient.slice(insufficient.indexOf("sup-perf-n"));
  assert.match(insufficient.slice(0, insufficient.indexOf("sup-perf-n")), /\{excluded\}/);
  assert.match(measured, /\{excluded\}/);
});

test("could-not-ask stays distinguishable from every real answer", () => {
  assert.equal(performanceRead(null).state, "unavailable");
  assert.equal(performanceRead(undefined).state, "unavailable");
});

test("a declared absence stays absent, and zero stays a value", () => {
  // The money.mjs rule, applied to MOQ and lead time: null is "sin declarar",
  // 0 is a declaration somebody made.
  assert.equal(declared(null, "u"), null);
  assert.equal(declared(undefined), null);
  assert.equal(declared("", "d"), null);
  assert.equal(declared(0, "u"), "0 u");
  assert.equal(declared(150, "unidades"), "150 unidades");
});
