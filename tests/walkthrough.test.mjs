// The collection's arc as a sequence — and the state that makes it worth
// having.
//
// The product is made of screens that are each correct alone and none of which
// takes you anywhere. This arranges the engine's own answers into an order.
// The tests below are about the two ways that could go wrong: inventing a
// status the engine did not give, and flattening a bypassed step into a
// pending one.
import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT, DONE, SKIPPED, STEPS, WAITING, progress, walkthrough,
} from "../lib/walkthrough.mjs";

const cc = (over = {}) => ({
  answers: {
    intent: { state: "ok", headline: "Volumen contenido." },
    approvals: { state: "blocked", headline: "4 pendientes." },
    stage: { headline: "review" },
    ...(over.answers || {}),
  },
  counts: { slots: 0, concepts_approved: 0, launches: 0, ...(over.counts || {}) },
  plan: over.plan ?? null,
  measurable: over.measurable ?? 0,
});

test("an empty collection has exactly one current step and it is the first", () => {
  const steps = walkthrough({ cc: cc({ answers: { intent: { state: "unknown" } } }) });
  assert.equal(steps.filter((s) => s.state === CURRENT).length, 1);
  assert.equal(steps[0].state, CURRENT);
  assert.equal(steps[0].key, "import");
});

test("there is never more than one current step", () => {
  // A list where four things are "current" is a list with no order, which is
  // exactly what the product had before this existed.
  for (const counts of [{}, { slots: 3 }, { slots: 3, launches: 1 },
                        { slots: 3, concepts_approved: 3, launches: 1 }]) {
    const steps = walkthrough({ cc: cc({ counts, plan: { version_number: 1 } }),
                                imports: [{ status: "incorporated" }] });
    assert.ok(steps.filter((s) => s.state === CURRENT).length <= 1);
  }
});

test("a step nothing depends on yet WAITS — it has not gone wrong", () => {
  const steps = walkthrough({ cc: cc({ answers: { intent: { state: "unknown" } } }) });
  const later = steps.slice(1);
  assert.ok(later.every((s) => s.state === WAITING));
  assert.ok(!later.some((s) => s.state === SKIPPED));
});

test("a step BYPASSED by a later one is skipped, not pending", () => {
  // The state worth having. A drop went out while the technical signature was
  // still missing; calling that "pending" alongside steps whose turn simply
  // has not come would hide the only alarming thing on the screen.
  const steps = walkthrough({
    cc: cc({ counts: { slots: 10, concepts_approved: 6, launches: 1 },
             plan: { version_number: 1 } }),
    imports: [{ status: "incorporated" }],
  });
  const by = Object.fromEntries(steps.map((s) => [s.key, s.state]));
  assert.equal(by.launch, DONE);
  assert.equal(by.concepts, SKIPPED);
  assert.equal(by.approvals, SKIPPED);
});

test("skipped steps are reported apart from done ones", () => {
  // Eight of eight with three bypassed is not the same collection as eight of
  // eight, and one completion number would make them look identical.
  const steps = walkthrough({
    cc: cc({ counts: { slots: 10, concepts_approved: 6, launches: 1 },
             plan: { version_number: 1 } }),
    imports: [{ status: "incorporated" }],
  });
  const p = progress(steps);
  assert.equal(p.done, 4);
  assert.deepEqual(p.skipped.map((s) => s.key),
                   ["concepts", "taste", "approvals"]);
  assert.notEqual(p.done, p.total);
});

test("only an INCORPORATED import completes the first step", () => {
  // Interpreting is not importing. A file sitting in review has taught the
  // brand nothing yet, and the chain the import centre shows says so.
  //
  // These four strings are the engine's whole vocabulary — `interpreted`,
  // `incorporated`, `discarded`, `unreadable`, from `routers/imports.py`. This
  // test used to assert on "accepted" and "needs_review", which the engine has
  // never emitted: it passed, and the step could not complete for any real
  // brand. Statuses invented by a test are worth nothing, so spell out every
  // one the API can actually send.
  //
  // Isolated on a collection where nothing downstream is done — otherwise the
  // step reads as SKIPPED rather than CURRENT, which is also correct (a brand
  // that approved a brief without importing anything DID bypass this) but
  // tests a different property.
  const empty = cc({ answers: { intent: { state: "unknown" } } });

  for (const status of ["interpreted", "discarded", "unreadable"]) {
    const steps = walkthrough({ cc: empty, imports: [{ status }] });
    assert.equal(steps[0].state, CURRENT, `${status} must not complete the step`);
  }

  const landed = walkthrough({ cc: empty, imports: [{ status: "incorporated" }] });
  assert.equal(landed[0].state, DONE);
});

test("a file uploaded and never confirmed is named as such", () => {
  // The state that looks like progress to whoever uploaded it and is invisible
  // to everyone else. "Nothing imported" would be true and useless here.
  const empty = cc({ answers: { intent: { state: "unknown" } } });
  const steps = walkthrough({ cc: empty, imports: [{ status: "interpreted" }] });
  assert.match(steps[0].evidence, /sin confirmar/);
});

test("an unrecognised imports payload does not throw", () => {
  // The view crashed to a blank screen because it handed this function the
  // response envelope instead of the array inside it. The arranging survives a
  // shape it does not recognise; only the first step loses its evidence.
  const empty = cc({ answers: { intent: { state: "unknown" } } });
  for (const imports of [undefined, null, { imports: [] }, "nope"]) {
    const steps = walkthrough({ cc: empty, imports });
    assert.equal(steps.length, 8);
    assert.equal(steps[0].state, CURRENT);
  }
});


test("approving a brief without importing anything reads as bypassed", () => {
  // The other half of the same rule, and the more common real case: a team
  // that wrote its brief from what it already knew never imported anything,
  // and the arc should say the step was gone past rather than pretend it is
  // still ahead of them.
  const steps = walkthrough({ cc: cc(), imports: [] });
  assert.equal(steps[0].state, SKIPPED);
});

test("the taste team never reports as done, because convening is not finishing", () => {
  // It is a thing you DO, not a thing that completes. Marking it done the
  // moment a panel was opened would be a checkbox that means nothing.
  const steps = walkthrough({
    cc: cc({ counts: { slots: 10, concepts_approved: 10, launches: 1 },
             plan: { version_number: 1 }, measurable: 3,
             answers: { approvals: { state: "ok", headline: "listo" },
                        stage: { headline: "results" } } }),
    imports: [{ status: "incorporated" }],
  });
  assert.notEqual(steps.find((s) => s.key === "taste").state, DONE);
});

test("every step carries its evidence and the screen it opens", () => {
  const steps = walkthrough({ cc: cc(), imports: [] });
  for (const step of steps) {
    assert.ok(step.view, `${step.key} has no destination`);
    assert.ok(step.why, `${step.key} does not say why it matters`);
    assert.ok(step.evidence !== undefined, `${step.key} has no evidence line`);
  }
  assert.equal(steps.length, STEPS.length);
});

test("nothing is a percentage", () => {
  // Progress bars that fill themselves are decoration. Counts can be checked
  // against the objects they claim to count; a percentage cannot.
  const steps = walkthrough({ cc: cc(), imports: [] });
  const blob = JSON.stringify({ steps, p: progress(steps) });
  assert.ok(!/percent|pct|"\d+%"/.test(blob));
});
