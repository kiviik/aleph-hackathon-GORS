// Startup must survive production authorization.
//
// ⚠ WHAT THIS GUARDS (second owner security review, 2026-08-12). `GET /brands`
// lists every tenant, so it correctly became platform-admin-only — and nobody
// holds platform-admin, so it 403s. `getEngineStatus` called it, caught the
// throw, and reported `healthy: false`; `EngineProvider` then did the one thing
// it reserves for a dead engine and served synthetic data.
//
// The result was the worst possible failure mode: a correctly-authenticated
// user, a perfectly healthy engine, and a screen full of invented numbers with
// nothing anywhere saying so. Locking down an endpoint turned the product into
// a demo.
//
// Startup needs THIS caller's brand, not the tenant list. `/me` is public and
// answers exactly that.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";

const BRAND = { id: "b-1", name: "Complot" };

/** Serve a fake engine; `brandsStatus` decides how `/brands` behaves. */
function stubEngine({ brandsStatus = 403, me = null } = {}) {
  const seen = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    seen.push(path);
    if (path === "/healthz") {
      return { ok: true, status: 200, json: async () => ({ build: "abc", mode: "demo" }) };
    }
    if (path === "/me") {
      return { ok: true, status: 200, json: async () => me };
    }
    if (path === "/brands") {
      if (brandsStatus !== 200) {
        return { ok: false, status: brandsStatus, json: async () => ({ detail: "nope" }) };
      }
      return { ok: true, status: 200, json: async () => [BRAND] };
    }
    if (path === `/brands/${BRAND.id}`) {
      return { ok: true, status: 200, json: async () => BRAND };
    }
    return { ok: false, status: 404, json: async () => null };
  };
  return seen;
}

test("a 403 on the admin-only tenant list does not mean the engine is down", async () => {
  const seen = stubEngine({
    brandsStatus: 403,
    me: { authenticated: true, user: { name: "Vicky" }, brand: BRAND },
  });
  const { getEngineStatus } = await import("@/lib/api");
  const st = await getEngineStatus();

  assert.equal(st.healthy, true,
    "a locked-down admin endpoint must not be read as an unreachable engine");
  assert.deepEqual(st.brands.map((b) => b.id), [BRAND.id],
    "startup should resolve the caller's own brand");
  assert.ok(seen.includes("/me"), "identity should come from /me");
  assert.ok(seen.includes(`/brands/${BRAND.id}`),
    "and the brand should be fetched by id, not from the tenant list");
});

test("signed out, it still reports healthy and simply has no brand", async () => {
  // Production: no identity AND no tenant list. That is not a health problem.
  stubEngine({ brandsStatus: 403, me: { authenticated: false, user: null, brand: null } });
  const { getEngineStatus } = await import("@/lib/api");
  const st = await getEngineStatus();

  assert.equal(st.healthy, true);
  assert.deepEqual(st.brands, []);
});

test("demo mode is unchanged — the open tenant list still populates", async () => {
  stubEngine({ brandsStatus: 200, me: { authenticated: false, user: null, brand: null } });
  const { getEngineStatus } = await import("@/lib/api");
  const st = await getEngineStatus();

  assert.equal(st.healthy, true);
  assert.deepEqual(st.brands.map((b) => b.id), [BRAND.id]);
});

test("a dead engine is still reported dead", async () => {
  globalThis.fetch = async () => { throw new Error("connection refused"); };
  const { getEngineStatus } = await import("@/lib/api");
  const st = await getEngineStatus();

  assert.equal(st.healthy, false, "the demo fallback must still exist for a real outage");
  assert.deepEqual(st.brands, []);
});
