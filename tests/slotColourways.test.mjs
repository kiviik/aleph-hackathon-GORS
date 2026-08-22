// Which colours a range position plans (engine 0086), on screen.
//
// The plan used to hold `colorway` as a String somebody retyped, while the
// colourway that pins the exact approved concept version sat one table away.
// These tests defend the two things the screen must not do with that link:
// claim an image is signed off when it is not, and quietly reconcile the
// planner's own SKU declaration against a count.
import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalDetail, canPlanColours, imageState, nextPlanRevision,
  reconciliationSentences, whyLocked,
} from "@/lib/slotColourways.mjs";

test("the dangerous state is the one worded as a warning", () => {
  // ⚠ The colourway pins a version that is NOT the approved one, so the plan is
  // about to commit money against an image nobody signed off.
  const wrong = imageState({ state: "another_version_approved" });
  assert.equal(wrong.tone, "warn");
  assert.match(wrong.text, /no es la aprobada/);

  assert.equal(imageState({ state: "approved" }).tone, "ok");
  // "Nobody approved the concept" and "no image at all" are quiet facts, not
  // warnings: planning before approval is normal work.
  assert.equal(imageState({ state: "concept_not_approved" }).tone, "quiet");
  assert.equal(imageState({ state: "no_image_pinned" }).tone, "quiet");
});

test("an unknown state renders nothing rather than the nearest known one", () => {
  assert.equal(imageState({ state: "signed_off_by_vibes" }), null);
  assert.equal(imageState({}), null);
  assert.equal(imageState(null), null);
});

test("an approval the server could not attribute is not presented as proven", () => {
  assert.match(approvalDetail({ state: "approved", verified: true }),
    /identidad verificada/);
  assert.match(approvalDetail({ state: "approved", verified: false }),
    /no pudo nombrar/);
  // Only an approval has a detail; the other states say enough on their own.
  assert.equal(approvalDetail({ state: "another_version_approved" }), null);
});

test("the declaration is printed beside the count, and never replaced by it", () => {
  const lines = reconciliationSentences({
    declared_planned_skus: 1, planned_colourways: 2, registered_sizes: 0,
    colourways_times_registered_sizes: null,
    contradiction: "el plan declara 1 SKU(s) y esta fila ya planifica 2 color(es)",
    note: null,
  });
  assert.match(lines[0].text, /2 color\(es\) planificado\(s\)/);
  assert.match(lines[0].text, /el plan declara 1 SKU\(s\)/);
  assert.equal(lines[1].tone, "warn");
  assert.match(lines[1].text, /el plan declara 1 SKU/);
});

test("no declaration reads as not said, which is not the same as one", () => {
  const lines = reconciliationSentences({
    declared_planned_skus: null, planned_colourways: 3, registered_sizes: null,
    colourways_times_registered_sizes: null, contradiction: null,
    note: "el plan no declaró SKUs — eso es distinto de declarar uno",
  });
  assert.match(lines[0].text, /SKUs sin declarar/);
  assert.ok(!lines.some((l) => l.tone === "warn"));
  assert.match(lines[1].text, /distinto de declarar uno/);
});

test("the size multiplication is offered as evidence, labelled as such", () => {
  const lines = reconciliationSentences({
    declared_planned_skus: null, planned_colourways: 2, registered_sizes: 4,
    colourways_times_registered_sizes: 8, contradiction: null, note: null,
  });
  const last = lines[lines.length - 1];
  assert.match(last.text, /8 SKU\(s\) en el maestro/);
  // ⚠ Never a correction to the plan — that distinction is the whole point of
  // planned_skus staying the planner's declaration.
  assert.match(last.text, /no una corrección al plan/);
});

test("nothing to reconcile is not an error", () => {
  assert.deepEqual(reconciliationSentences(null), []);
});

test("an approved plan hides the action instead of offering a refusal", () => {
  assert.equal(canPlanColours("draft"), true);
  assert.equal(canPlanColours("in_review"), true);
  assert.equal(canPlanColours("approved"), false);
  assert.equal(canPlanColours("superseded"), false);
  assert.equal(canPlanColours(undefined), false);

  // A button that always 409s teaches a merchandiser to ignore the ones that
  // work, so the reason is shown where the button would have been.
  assert.match(whyLocked("approved"), /deja de moverse/);
  assert.match(whyLocked("approved"), /próxima versión/);
  assert.match(whyLocked("superseded"), /superseded/);
  assert.equal(whyLocked("draft"), null);
});

test("with nothing planned yet, the multiplication says nothing and is omitted", () => {
  // "0 × 1 talles cargados = 0 SKU(s)" is true and useless, and a useless line
  // in an evidence panel trains the eye to skip the ones that matter. Caught by
  // reading the rendered screen, not the diff.
  const lines = reconciliationSentences({
    declared_planned_skus: null, planned_colourways: 0, registered_sizes: 1,
    colourways_times_registered_sizes: 0, contradiction: null,
    note: "el plan no declaró SKUs — eso es distinto de declarar uno",
  });
  assert.ok(!lines.some((l) => /talles cargados/.test(l.text)),
    JSON.stringify(lines));
  // The count line and the engine's note still print.
  assert.match(lines[0].text, /0 color\(es\) planificado\(s\)/);
});

test("her own write moves the clock, and the next request must carry it", () => {
  // The bug this encodes: the panel kept sending the revision the PAGE loaded
  // with, so planning a second colour was refused as a conflict with "another
  // session" — which was her own click a second earlier. Caught by planning two
  // colours in a row in the running app.
  assert.equal(nextPlanRevision(4, { plan_revision: 5 }), 5);
  assert.equal(nextPlanRevision(5, { plan_revision: 6 }), 6);

  // A response that says nothing about the clock leaves it where it was —
  // guessing +1 here would invent a precondition the server never confirmed.
  assert.equal(nextPlanRevision(5, {}), 5);
  assert.equal(nextPlanRevision(5, null), 5);
  assert.equal(nextPlanRevision(null, {}), null);
});
