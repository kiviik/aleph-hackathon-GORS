// Resolving "which brand am I" must not depend on a route nobody may call.
//
// ⚠ THE DEFECT (owner bug hunt, 2026-08-13). `getBrandId` and `getLatestResult`
// both opened with `await get("/brands")`. That route is
// `Policy.PLATFORM_ADMIN`, and the engine's own `is_platform_admin()` documents
// the answer it gives: "⚠ NOBODY IS, YET — and that is the safe answer." So in
// production mode the request 403s for every signed-in tenant, both functions
// swallowed it in a bare `catch`, and returned null.
//
// Null does not mean "no brand" to the callers — it means *fall back*:
//   · `studioStore.loadCollections` → the shared `::brand:none` bucket, so a
//     designer's board saved "solo en este navegador", pooled with every other
//     unresolved session;
//   · `DesignStudio` refused every approval ("Sin marca activa no se puede
//     registrar una aprobación auditable") and rejected handoffs as wrong_brand;
//   · `LinePlan` rendered "sin conexión" beside a RangeBoard — same screen —
//     that resolved fine through `/me` and showed the plan;
//   · `EngineProvider` reported `run-unreadable` for brands whose run was
//     complete.
//
// ⚠ AND IT WAS INVISIBLE IN DEVELOPMENT. `/brands` is open in demo mode, so
// the failure exists only in production — the environment nobody develops in.
// That is the same shape as the four unauthenticated `fetch` callers this
// codebase already has a source rule for.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "b-1", name: "Complot", slug: "complot", has_result: true };

/** Production: `/brands` is forbidden, `/me` answers. */
function stubProduction({ onBrands } = {}) {
  const seen = [];
  stubFetch(async (path) => {
    seen.push(path);
    if (path === "/me") return { authenticated: true, brand: BRAND };
    if (path === "/brands") { onBrands?.(); return undefined; }   // 403 → throws
    if (path === `/brands/${BRAND.id}`) return BRAND;
    if (path === `/brands/${BRAND.id}/result`) {
      return { data: { brand: "Complot", matches: [{ trend_name: "t" }], dna: {} } };
    }
    return {};
  });
  return seen;
}

test("the brand resolves in production, where /brands is forbidden", async () => {
  installDom();
  let brandsWasFatal = false;
  stubProduction({ onBrands: () => { brandsWasFatal = true; } });

  const { getBrandId } = await import("@/lib/api");
  const id = await getBrandId();

  assert.equal(id, BRAND.id,
    "the signed-in tenant's brand did not resolve — every caller then treats " +
    "null as 'no brand' and falls back to browser-local storage");
  assert.equal(brandsWasFatal, false,
    "it still asks the platform-admin route first; that 403s for every tenant");
});

test("a completed run is readable in production", async () => {
  installDom();
  stubProduction();

  const { getLatestResult } = await import("@/lib/api");
  const got = await getLatestResult();

  assert.ok(got, "a brand with has_result reported no readable run — the shell " +
    "then shows `reason: run-unreadable`, which claims the payload was broken " +
    "when it was never fetched");
  assert.equal(got.brand.id, BRAND.id);
});

test("no identity and no brand list is still an honest null", async () => {
  // The answer must not swing the other way: unauthenticated with `/brands`
  // unavailable is genuinely "no brand", and callers depend on that being null
  // rather than a guess.
  installDom();
  stubFetch(async (path) => {
    if (path === "/me") return { authenticated: false, brand: null };
    return undefined;                            // /brands unavailable
  });

  const { getBrandId } = await import("@/lib/api");
  assert.equal(await getBrandId(), null);
});
