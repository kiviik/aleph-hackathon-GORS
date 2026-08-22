// The world layer, as the screen reads it. Two kinds of assertion here.
//
// THE STRUCTURAL ONE: a world request may not carry a tenant. The engine side
// of this is a table with no brand column and a test asserting its absence; the
// client side has to be equally hard, or the first person who wants to "filter
// the view" adds `?brand_id=` and two brands quietly stop getting the same
// answer — which is the entire argument for a shared evidence network.
//
// THE HONESTY ONES: everything else here is a version of "do not show a number
// you do not have". No zero for a missing measurement, no citable state except
// the one the engine calls citable, and `insufficient_evidence` kept as a real
// group rather than filtered out of the feed.
import assert from "node:assert/strict";
import test from "node:test";

import {
  TENANT_PARAMS, WorldRequestRefused, assertBrandFree, byTrajectory,
  cycleVerdict, forecastValue, freshness, isCitable, latestPerScope, sharePct,
} from "../lib/world.mjs";

// --- the rule that keeps the layer shared -----------------------------------

test("a world request carrying a brand is refused, not filtered", () => {
  for (const param of TENANT_PARAMS) {
    assert.throws(
      () => assertBrandFree(`/world/forecasts?${param}=abc`),
      WorldRequestRefused,
      `${param} should be refused`
    );
  }
});

test("the refusal says why, because the reason is the product argument", () => {
  try {
    assertBrandFree("/world/forecasts?brand_id=abc");
    assert.fail("should have thrown");
  } catch (err) {
    assert.match(err.message, /misma respuesta/);
    assert.match(err.message, /evidencia compartida/);
  }
});

test("case does not get a tenant past the check", () => {
  assert.throws(() => assertBrandFree("/world/forecasts?Brand_Id=abc"),
                WorldRequestRefused);
});

test("legitimate world filters are untouched", () => {
  for (const path of [
    "/world/markets",
    "/world/forecasts?status=indicative&limit=50",
    "/world/observations?trend_id=x&channel=supply&geography=eu-south",
    "/world/cycles?limit=5",
  ]) {
    assert.equal(assertBrandFree(path), path);
  }
});

// --- only the engine decides what may be cited ------------------------------

test("only a published forecast is citable, and the screen is not more permissive", () => {
  assert.equal(isCitable({ status: "published" }), true);
  for (const status of ["indicative", "refused", "draft", "superseded"]) {
    assert.equal(isCitable({ status }), false, `${status} must not be citable`);
  }
  assert.equal(isCitable(null), false);
  assert.equal(isCitable({}), false);
});

// --- no invented numbers ----------------------------------------------------

test("a missing share is null, never a zero", () => {
  assert.equal(sharePct(null), null);
  assert.equal(sharePct(undefined), null);
  assert.equal(sharePct(NaN), null);
  // A measured zero is a real number and still renders.
  assert.equal(sharePct(0), "0.0%");
  assert.equal(sharePct(0.078), "7.8%");
});

test("freshness is null when nothing is known, not «hoy»", () => {
  assert.equal(freshness(null), null);
  assert.equal(freshness("not a date"), null);
  const now = new Date("2026-08-09T12:00:00Z");
  assert.equal(freshness("2026-08-09T09:00:00Z", now), "hoy");
  assert.equal(freshness("2026-08-08T09:00:00Z", now), "ayer");
  assert.equal(freshness("2026-08-01T09:00:00Z", now), "hace 8 días");
  assert.equal(freshness("2026-07-05T09:00:00Z", now), "hace 5 semanas");
});

// --- the cycle verdict ------------------------------------------------------

test("«partial» is its own answer and never reads as healthy", () => {
  const ok = cycleVerdict({ status: "ok", observations_written: 9396, failures: [] });
  const partial = cycleVerdict({ status: "partial", observations_written: 12, failures: [1, 2] });
  const failed = cycleVerdict({ status: "failed", observations_written: 0, failures: [1] });

  assert.equal(ok.tone, "ok");
  assert.equal(partial.tone, "warn");
  assert.equal(failed.tone, "bad");
  // A pass that lost work must not be described the same way as one that did
  // not run: collapsing them is how a half-broken feed reads as a healthy one.
  assert.notEqual(partial.tone, failed.tone);
  assert.match(partial.text, /2/);
});

test("a layer that never ran says so instead of looking fresh", () => {
  const verdict = cycleVerdict(null);
  assert.equal(verdict.tone, "unknown");
  assert.match(verdict.text, /nunca corrió/);
});

// --- the feed keeps the engine's vocabulary ---------------------------------

test("insufficient_evidence is a real group, not a gap to filter out", () => {
  const groups = byTrajectory([
    { trajectory: "accelerating" },
    { trajectory: "insufficient_evidence" },
    { trajectory: "insufficient_evidence" },
    { trajectory: "flat" },
  ]);
  assert.equal(groups.get("insufficient_evidence").length, 2);
  assert.equal(groups.get("accelerating").length, 1);
  // A market with too little history is a row in the answer — the owner's own
  // example is Argentina — and hiding it makes the feed look more complete
  // than the evidence is.
  assert.ok(groups.has("insufficient_evidence"));
});

test("a forecast with no trajectory does not vanish", () => {
  const groups = byTrajectory([{ id: "x" }]);
  assert.equal(groups.get("flat").length, 1);
});

test("an empty feed groups to nothing rather than throwing", () => {
  assert.equal(byTrajectory([]).size, 0);
  assert.equal(byTrajectory(null).size, 0);
});


// --- the unit, which is off by two orders of magnitude when it is wrong ------

test("an index is never rendered as a percentage", () => {
  // Google Trends returns 0–100 scaled to the peak of its own request. An
  // index forecast of 42 is «42»; rendering it as 4200% is the exact confusion
  // the observation contract was written to prevent, reintroduced on the way
  // out of the engine.
  assert.equal(forecastValue(42, "index"), "42");
  assert.notEqual(forecastValue(42, "index"), "4200.0%");
  assert.equal(forecastValue(0.16, "share"), "16.0%");
});

test("an unknown measurement gets no unit rather than a guessed one", () => {
  assert.equal(forecastValue(42, undefined), "42");
  assert.equal(forecastValue(42, "units"), "42");
  assert.equal(forecastValue(null, "share"), null);
  assert.equal(forecastValue(NaN, "index"), null);
});

test("a measured zero still renders, in either unit", () => {
  assert.equal(forecastValue(0, "share"), "0.0%");
  assert.equal(forecastValue(0, "index"), "0");
});

// --- one current answer per scope -------------------------------------------

test("the feed shows the newest row per six-axis scope, not every version", () => {
  const rows = [
    { trend_id: "a", channel: "supply", geography: "eu-south", segment: null,
      category: null, horizon_weeks: 26, created_at: "2026-01-01", status: "superseded" },
    { trend_id: "a", channel: "supply", geography: "eu-south", segment: null,
      category: null, horizon_weeks: 26, created_at: "2026-06-01", status: "published" },
  ];
  const latest = latestPerScope(rows);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].status, "published");
});

test("a horizon is part of the question, so two horizons are two answers", () => {
  const base = { trend_id: "a", channel: "supply", geography: "eu-south",
                 segment: null, category: null, created_at: "2026-06-01" };
  const latest = latestPerScope([
    { ...base, horizon_weeks: 4 }, { ...base, horizon_weeks: 26 },
  ]);
  assert.equal(latest.length, 2);
});

test("segment and category are part of the identity too", () => {
  const base = { trend_id: "a", channel: "supply", geography: "eu-south",
                 horizon_weeks: 26, created_at: "2026-06-01", category: null };
  assert.equal(latestPerScope([
    { ...base, segment: "luxury" }, { ...base, segment: "mainstream" },
  ]).length, 2);
});

test("a refused forecast is the current answer when it is the newest", () => {
  // "We tried and refused" is a real verdict about a scope, not a gap — and
  // dropping it would make the feed look more complete than the evidence is.
  const latest = latestPerScope([
    { trend_id: "a", channel: "supply", geography: "x", segment: null,
      category: null, horizon_weeks: 26, created_at: "2026-01-01", status: "published" },
    { trend_id: "a", channel: "supply", geography: "x", segment: null,
      category: null, horizon_weeks: 26, created_at: "2026-07-01", status: "refused" },
  ]);
  assert.equal(latest[0].status, "refused");
});

test("a pass that was rate limited out of the watchlist says how much it missed", () => {
  // ⚠ The engine records ONE failure when a source rate limits and DEFERS the
  // rest — so counting only `failures` describes a pass that covered one scope
  // out of eighteen as "1 falla", which is true and reads as almost nothing
  // having gone wrong. This is the live shape: 1 call, 1 failure, 17 deferred.
  const throttled = cycleVerdict({
    status: "failed", observations_written: 0,
    failures: [1], deferred: new Array(17).fill(1),
  });

  assert.equal(throttled.tone, "bad");
  assert.match(throttled.text, /17/);
  // The two are named apart: the world declining to answer and us deciding not
  // to ask again are different facts.
  assert.match(throttled.text, /sin consultar/);

  // And a pass with no deferrals still reads the way it always did.
  const plain = cycleVerdict({ status: "partial", observations_written: 12, failures: [1, 2] });
  assert.match(plain.text, /2 alcance\(s\) perdido\(s\)/);
  assert.doesNotMatch(plain.text, /sin consultar/);
});

test("a clean pass that left nothing behind is not green", () => {
  // ⚠ THE REAL SHAPE, from the first live run of the visual pipeline
  // (2026-08-10): 22 forecasts attempted, all refused for insufficient
  // evidence (one week of history), nothing errored. The engine says `ok` and
  // is right — 22 correct refusals are a working system, and calling that
  // `partial` would alert weekly on a correct state. But rendering it green
  // over "0 observaciones nuevas" says the world layer advanced when it did not.
  const cleanButEmpty = cycleVerdict({
    status: "ok", observations_written: 0, failures: [],
    forecasts: { published: 0, indicative: 0, refused: 22 },
  });
  assert.equal(cleanButEmpty.tone, "warn");
  assert.match(cleanButEmpty.text, /22/);

  // A pass that DID land evidence stays green, and so does one whose
  // forecasts were merely indicative — those are real answers.
  const landed = cycleVerdict({
    status: "ok", observations_written: 22, failures: [],
    forecasts: { published: 0, indicative: 0, refused: 22 },
  });
  assert.equal(landed.tone, "ok");
  assert.match(landed.text, /22 observaciones nuevas/);

  const answered = cycleVerdict({
    status: "ok", observations_written: 0, failures: [],
    forecasts: { published: 0, indicative: 3, refused: 5 },
  });
  assert.equal(answered.tone, "ok");
});

// ---------------------------------------------------------------------------
// Reachability — owner review 2026-08-11, finding #8
// ---------------------------------------------------------------------------
// "Direct navigation to #/world works, but the normal sidebar only exposes the
// five global destinations. The contextual world entry defined in nav.js is not
// rendered by Sidebar.jsx."
//
// Two defects, not one: it could not be reached from the sidebar, AND
// `sectionForView` had no entry for it, so arriving by URL lit up "Hoy" — the
// one screen that is NOT about this brand, filed under the brand's own day.
test("the world screen belongs to Inteligencia, not to the brand's day", async () => {
  const { sectionForView } = await import("../lib/nav.js");
  assert.equal(sectionForView("world"), "intelligence");
  // The default is "today"; the point is that world no longer falls through it.
  assert.equal(sectionForView("no-such-view"), "today");
});

test("the sidebar renders the market tools, with the world first", async () => {
  const { CONTEXT_NAV } = await import("../lib/nav.js");
  const views = CONTEXT_NAV.market.items.map((i) => i.view);
  assert.ok(views.includes("world"), "world is a market tool");
  assert.equal(views[0], "world",
    "first, and not by accident: it is the only view here that is not about "
    + "this brand");

  // The regression that made the entry inert: a menu defined in a constant and
  // rendered by nothing. Sidebar must actually consume CONTEXT_NAV.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/Sidebar.jsx", import.meta.url), "utf8");
  assert.match(src, /CONTEXT_NAV/,
    "Sidebar must render the contextual tools, not just document them");
  assert.match(src, /SECTION_TOOLS\s*\[/,
    "the section's tools must be looked up and rendered");
});
