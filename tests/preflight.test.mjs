/**
 * The pre-flight screen's pure logic.
 *
 * `asPlainText` gets the most attention because it is the distribution
 * mechanism, not a convenience: the build handoff's bet is that a designer
 * sends this output to another designer, and what travels is pasted text.
 * A flag that renders on screen and vanishes from the paste is a flag nobody
 * downstream ever sees.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  asPlainText,
  base64FromDataUrl,
  groupByTier,
  headline,
  readingCaveat,
  TIERS,
} from "../lib/preflight.mjs";

function flag(over = {}) {
  return {
    key: "fabric_weight",
    tier: "blocking",
    field: "Fabric weight (GSM or oz)",
    status: "ambiguous",
    why: "Changes cost per metre and handfeel.",
    they_will_ask: { zh: "面料克重是多少?", en: "What's the GSM?" },
    suggest: 'e.g. "180 gsm"',
    note: '"midweight" is a handfeel, not a weight',
    found: {},
    ...over,
  };
}

function result(over = {}) {
  return {
    summary: {
      headline: "1 blocking",
      checks_run: 31,
      open: 1,
      by_tier: { blocking: 1, sample_round: 0, cost_variance: 0 },
      by_status: { missing: 0, ambiguous: 1, present: 30 },
      can_be_quoted: false,
    },
    flags: [flag()],
    passed: [],
    reading: {
      fields_read: 17,
      fields_looked_for: 38,
      evidence_verifiable: true,
      unverified_fields: [],
      note: "ok",
    },
    source: "pasted text",
    ...over,
  };
}

test("groupByTier keeps engine order and drops empty tiers", () => {
  const grouped = groupByTier(result({
    flags: [flag({ tier: "cost_variance", key: "incoterm" }), flag()],
  }));
  assert.deepEqual(grouped.map((g) => g.tier), ["blocking", "cost_variance"]);
  assert.equal(grouped[0].flags.length, 1);
});

test("groupByTier survives an empty or malformed answer", () => {
  assert.deepEqual(groupByTier(null), []);
  assert.deepEqual(groupByTier({}), []);
});

test("headline counts open flags per tier", () => {
  assert.equal(
    headline(result({
      summary: { ...result().summary, by_tier: { blocking: 4, sample_round: 7, cost_variance: 3 }, open: 14 },
    })),
    "4 blocking · 7 sample-round risk · 3 cost-variance risk"
  );
});

test("headline says so when nothing is open, without inventing praise", () => {
  const clean = result({ summary: { ...result().summary, open: 0 }, flags: [] });
  assert.equal(headline(clean), "Nothing open across 31 checks.");
});

test("headline reports an unreadable document as unread, not as clean", () => {
  assert.equal(headline({ unreadable: true }), "This document could not be read.");
});

test("the reading caveat has three states and never collapses them", () => {
  assert.equal(readingCaveat(result()).tone, "ok");

  const unverified = readingCaveat(result({
    reading: { ...result().reading, unverified_fields: ["fabric_weight"] },
  }));
  assert.equal(unverified.tone, "warn");
  assert.match(unverified.text, /could not be traced/);

  const image = readingCaveat(result({
    reading: { ...result().reading, evidence_verifiable: false },
  }));
  assert.equal(image.tone, "warn");
  assert.match(image.text, /read from an image/);
});

test("asPlainText carries everything a factory needs from a flag", () => {
  const text = asPlainText(result());
  assert.match(text, /PRE-FLIGHT BRIEF CHECK/);
  assert.match(text, /BLOCKING/);
  assert.match(text, /AMBIGUOUS: Fabric weight/);
  assert.match(text, /Why: Changes cost per metre/);
  assert.match(text, /What's unclear: "midweight" is a handfeel/);
  assert.match(text, /面料克重是多少\?/);        // the phrasing they will actually use
  assert.match(text, /What's the GSM\?/);
  assert.match(text, /Suggest: e\.g\. "180 gsm"/);
});

test("asPlainText names what already passed, so the paste is not all bad news", () => {
  const text = asPlainText(result({
    passed: [flag({ key: "quantity", field: "Quantity or quantity range", status: "present" })],
  }));
  assert.match(text, /1 of 31 checks passed: Quantity or quantity range/);
});

test("asPlainText on an unreadable document says that and nothing else", () => {
  const text = asPlainText({
    unreadable: true,
    reading: { note: "This PDF has no text layer." },
  });
  assert.match(text, /no text layer/);
  assert.doesNotMatch(text, /BLOCKING/);
});

test("asPlainText never claims a tier that has no flags", () => {
  const text = asPlainText(result());
  assert.doesNotMatch(text, /COST-VARIANCE/);
});

test("base64FromDataUrl strips the prefix and refuses a non-data-url", () => {
  assert.equal(base64FromDataUrl("data:application/pdf;base64,JVBERi0="), "JVBERi0=");
  assert.equal(base64FromDataUrl("nonsense"), "");
  assert.equal(base64FromDataUrl(null), "");
});

test("the tier vocabulary matches the engine's", () => {
  // The engine owns these strings (api/app/preflight.py). Inventing a fourth
  // here would silently drop a whole tier out of the report.
  assert.deepEqual(TIERS, ["blocking", "sample_round", "cost_variance"]);
});
