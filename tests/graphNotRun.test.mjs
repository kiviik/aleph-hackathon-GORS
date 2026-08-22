// A screen that reads the collection graph must not require a market run.
//
// ⚠ THE DEFECT, FOUND TWICE (owner review, 2026-08-14). `engine.status ===
// "live"` means one specific thing: a completed pipeline RUN payload exists for
// this brand — trends, DNA, competitor scoring, visual search. It says nothing
// about whether the engine is reachable or the brand resolved.
//
// Two screens used it as a proxy for "can I talk to the engine":
//
//   · Memoria de decisiones — the decision ledger, written by people accepting
//     and rejecting proposals. A connected brand with no crawl saw "solo local
//     (engine offline)" over a ledger the engine was holding, and every
//     decision it recorded stayed in the browser marked `local`.
//   · Pipeline — `product_bets`, which its own header calls "the permanent
//     object each accept births server-side". Same story: the board showed a
//     browser cache instead of the brand's real bets.
//
// `EngineProvider`'s header has stated the rule since 2026-07-25 — graph
// screens use `useBrandId()` — and both of these were still on the old idiom a
// month later, which is why it is now a test rather than a paragraph.
//
// ⚠ WHAT THIS RULE MUST NOT DO is flag the screens that GENUINELY need a run.
// Signals, Feed, StudioExplore, DesignStudio, VisualSearch and Integrations all
// read `engine.dna`, `engine.trends` or `engine.stats`, which exist only after
// a run — for them `status === "live"` is exactly right. A rule that reported
// those would be the fifth false positive of this session and would be
// silenced. So this checks a NAMED LIST of graph screens, and the list is the
// judgement; growing it is a human decision.
import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";

// Screens whose data lives in the collection graph: rows people created, none
// of which come from a pipeline run.
const GRAPH_SCREENS = [
  ["components/views/Decisions.jsx", "the decision ledger"],
  ["components/views/Pipeline.jsx", "product_bets"],
  ["components/views/CollectionBrief.jsx", "collection briefs"],
  ["components/views/LinePlan.jsx", "range plans"],
  ["components/views/Review.jsx", "approvals"],
  ["components/views/Materials.jsx", "the brand material sheet"],
  ["components/views/Portfolio.jsx", "the collection portfolio"],
  ["components/views/LaunchResults.jsx", "launches and their outcomes"],
];

for (const [file, what] of GRAPH_SCREENS) {
  test(`${file} does not require a market run to read ${what}`, async () => {
    const src = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

    const offenders = [];
    src.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;      // comments explaining it
      if (/status\s*===\s*"live"/.test(line)) offenders.push(`${i + 1}: ${line.trim()}`);
    });

    assert.deepEqual(offenders, [], `${file} reads ${what} — collection-graph ` +
      "data that exists whether or not a crawl ever ran — but gates on " +
      "`status === \"live\"`, which is true only after a completed market run. " +
      "A connected brand without one then sees browser-local data, or nothing, " +
      "over rows the engine is holding. Use `useBrandId()`:\n  " +
      offenders.join("\n  "));
  });
}
