import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const today = readFileSync(
  new URL("../components/views/Today.jsx", import.meta.url),
  "utf8",
);
const weeklyPlan = readFileSync(
  new URL("../components/WeeklyPlan.jsx", import.meta.url),
  "utf8",
);
const signals = readFileSync(
  new URL("../components/views/Signals.jsx", import.meta.url),
  "utf8",
);
const studioExplore = readFileSync(
  new URL("../components/StudioExplore.jsx", import.meta.url),
  "utf8",
);
const designStudio = readFileSync(
  new URL("../components/views/DesignStudio.jsx", import.meta.url),
  "utf8",
);

test("Hoy requires a connected brand, not a completed market run", () => {
  assert.match(today, /engine\.connected && engine\.brandId/);
  assert.doesNotMatch(today, /const live = engine\.status === "live"/);
});

test("the weekly sales plan remains usable before the first market run", () => {
  assert.match(weeklyPlan, /engine\.connected && engine\.brandId/);
  assert.doesNotMatch(weeklyPlan, /const live = engine\.status === "live"/);
});

test("a connected brand without a market run never inherits sample trends", () => {
  assert.match(signals, /live \? engine\.trends : connected \? \[\] : TRENDS/);
  assert.match(signals, /<DirectionInspiration/);
  assert.match(signals, /getDirection\(engine\.brandId, collection\.activeId\)/);
});

test("Studio distinguishes a visual archive from a structured Product Master", () => {
  assert.match(studioExplore, /brandCatalog\.visualReferenceCount/);
  assert.match(studioExplore, /referencias visuales en el archivo/);
  assert.match(studioExplore, /Sin Product Master ni archivo visual/);
});

test("an empty collection can generate and promote its first Direction-led capsule", () => {
  assert.match(studioExplore, /collectionItemCount === 0 && directionState\.ready/);
  assert.match(studioExplore, /startRun\(\{ autoPromote: true, limit: 4 \}\)/);
  assert.match(studioExplore, /collectionItemsFrom\(\s*generated/);
  assert.match(designStudio, /collectionItemCount=\{coll\?\.items\?\.length \|\| 0\}/);
});

test("automatic and designer-curated concepts share complete provenance", () => {
  assert.match(studioExplore, /prompt: c\.prompt \|\| null/);
  assert.match(studioExplore, /provider: c\.provider \|\| null/);
  assert.match(studioExplore, /directionLineage: c\.lineage \|\| null/);
  assert.match(studioExplore, /fabricSnapshot:/);
  assert.doesNotMatch(studioExplore, /GEEL|Nocturne|Morrow|Vega Dust|Sierra Ivory/i);
});
