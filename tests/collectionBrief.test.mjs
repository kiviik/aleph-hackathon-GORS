// The brief screen's rules — all of them derived from the SERVER's status.
//
// The point of these: the previous brief was a localStorage object, so the
// browser decided what state it was in. Every assertion here is that the client
// reads the server's answer rather than forming its own opinion.
import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_FIELDS, actions, asLines, fromCsv, fromLines, pct, toBody, toCsv,
  toForm, toLines,
} from "../lib/collectionBrief.mjs";

test("an approved version is never editable in the UI", () => {
  const a = actions({ status: "approved" }, { canApprove: true });
  assert.equal(a.editable, false);
  assert.equal(a.immutable, true);
  assert.equal(a.submittable, false);
  // Not approvable again either — it is already frozen.
  assert.equal(a.approvable, false);
});

test("a superseded version is immutable too, not merely old", () => {
  const a = actions({ status: "superseded" }, { canApprove: true });
  assert.equal(a.editable, false);
  assert.equal(a.immutable, true);
});

test("approving needs the permission, not just the state", () => {
  assert.equal(actions({ status: "in_review" }, { canApprove: true }).approvable, true);
  assert.equal(actions({ status: "in_review" }, { canApprove: false }).approvable, false);
  // And the screen says who it is waiting for rather than showing a dead button.
  assert.equal(
    actions({ status: "in_review" }, { canApprove: false }).awaitingSomeoneElse, true);
});

test("a draft can be submitted; an in-review version cannot be re-submitted", () => {
  assert.equal(actions({ status: "draft" }, {}).submittable, true);
  assert.equal(actions({ status: "in_review" }, {}).submittable, false);
});

test("an in-review version is still editable while it waits", () => {
  assert.equal(actions({ status: "in_review" }, { canApprove: false }).editable, true);
});

test("no version at all offers nothing", () => {
  const a = actions(null, { canApprove: true });
  assert.equal(a.editable, false);
  assert.equal(a.submittable, false);
  assert.equal(a.approvable, false);
  assert.equal(a.immutable, false);
});

test("toForm never invents content for a missing version", () => {
  const form = toForm(null);
  assert.equal(form.season, "");
  assert.equal(form.margin_target, null);
  assert.deepEqual(form.markets, []);
  assert.deepEqual(form.risks, []);
});

test("toForm keeps every field the server sent", () => {
  const version = { season: "AW26", margin_target: "57.50", markets: ["AR"],
                    risks: ["denim cropped rindió 31% en AW25"] };
  const form = toForm(version);
  assert.equal(form.season, "AW26");
  // A string, because the server sends exact decimals as strings — parsing it
  // to a float here would undo the whole reason the column is NUMERIC.
  assert.equal(form.margin_target, "57.50");
  assert.deepEqual(form.risks, ["denim cropped rindió 31% en AW25"]);
});

test("toBody sends every content field, so a PATCH cannot blank one", () => {
  const body = toBody(toForm(null));
  for (const f of CONTENT_FIELDS) {
    assert.ok(f in body, `${f} must be sent or the server would clear it`);
  }
});

test("an empty string is recorded as absence, not as an answer", () => {
  const body = toBody({ ...toForm(null), customer: "   ", season: "AW26" });
  assert.equal(body.customer, null);
  assert.equal(body.season, "AW26");
});

/* The free-form JSON lists. The screen shows constraints, risks, assumptions
   and contradictory_evidence; the column is untyped, so what arrives is not
   guaranteed to be the strings the UI writes. */

test("an object in a list is spelled out, never rendered as [object Object]", () => {
  assert.deepEqual(
    asLines([{ que: "lead time", limite: "75 días" }]),
    ["que: lead time, limite: 75 días".replace(", ", " · ")],
  );
});

test("a list field that is not a list produces no lines instead of throwing", () => {
  // The column is JSON: nothing at the database level makes it an array, and a
  // brief screen that crashes on one bad row is worse than one that shows none.
  assert.deepEqual(asLines(null), []);
  assert.deepEqual(asLines("riesgo suelto"), []);
  assert.deepEqual(asLines(undefined), []);
});

test("blank lines never become empty entries", () => {
  // An empty string in `risks` is a risk nobody wrote — and it would still be
  // counted, shown as a bullet, and saved back.
  assert.deepEqual(fromLines("uno\n\n   \ndos\n"), ["uno", "dos"]);
  assert.deepEqual(fromCsv("AR, , UY,"), ["AR", "UY"]);
});

test("round-tripping a list through the textarea keeps exactly its entries", () => {
  const risks = ["denim cropped rindió 31% en AW25", "lead time de 75 días"];
  assert.deepEqual(fromLines(toLines(risks)), risks);
  assert.deepEqual(fromCsv(toCsv(["AR", "UY"])), ["AR", "UY"]);
});

test("a percentage keeps its digits and loses only the trailing .00", () => {
  // The server sends exact decimal strings. Parsing to a float and re-rounding
  // is precisely what the NUMERIC column exists to prevent.
  assert.equal(pct("58.00"), "58%");
  // 57.50 keeps BOTH decimals: the team committed to 57.50, and trimming it to
  // 57.5 would be this screen editing the number it is only supposed to show.
  assert.equal(pct("57.50"), "57.50%");
  assert.equal(pct(null), null);
  assert.equal(pct(""), null);
});
