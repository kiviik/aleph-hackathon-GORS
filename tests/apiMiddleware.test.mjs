// The Next app's own API surface must have a boundary too.
//
// ⚠ WHY THIS EXISTS (second owner security review, 2026-08-12). Hardening the
// FastAPI engine and reporting the platform closed was wrong: there are TWO
// servers. `/api/generate` (OpenAI/Gemini), `/api/tryon` (FASHN) and `/api/og`
// (server-side fetch of a caller-supplied URL) live in Next, spend the server's
// provider keys, and the engine's 192-route policy table cannot see them.
// Anyone who could load the page could spend the budget.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";

function stubEngine({ mode = "production", authenticated = false } = {}) {
  const seen = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    seen.push({ path, auth: init?.headers?.authorization || null });
    if (path === "/healthz") {
      return { ok: true, status: 200, json: async () => ({ mode }) };
    }
    if (path === "/me") {
      return { ok: true, status: 200, json: async () => ({ authenticated }) };
    }
    throw new Error(`unexpected ${path}`);
  };
  return seen;
}

function req(pathname, { authorization } = {}) {
  return {
    nextUrl: { pathname },
    headers: { get: (k) => (k.toLowerCase() === "authorization" ? authorization ?? null : null) },
  };
}

/** Fresh module each time — the mode cache is module-level by design. */
async function loadMiddleware() {
  const mod = await import(`../middleware.js?v=${Math.random()}`);
  return mod.middleware;
}

test("production: paid routes refuse an anonymous caller", async () => {
  stubEngine({ mode: "production", authenticated: false });
  const middleware = await loadMiddleware();
  for (const p of ["/api/generate", "/api/tryon", "/api/og"]) {
    const res = await middleware(req(p));
    assert.ok(res, `${p} should be refused`);
    assert.equal(res.status, 401, p);
  }
});

test("production: a token the ENGINE recognises passes", async () => {
  const seen = stubEngine({ mode: "production", authenticated: true });
  const middleware = await loadMiddleware();
  const res = await middleware(req("/api/generate", { authorization: "Bearer real" }));
  assert.equal(res, undefined, "an authenticated caller should pass through");
  assert.ok(seen.some((c) => c.path === "/me" && c.auth === "Bearer real"),
    "the token must be validated against the engine, not merely present");
});

test("production: a token the engine rejects does NOT pass", async () => {
  stubEngine({ mode: "production", authenticated: false });
  const middleware = await loadMiddleware();
  const res = await middleware(req("/api/generate", { authorization: "Bearer forged" }));
  assert.equal(res?.status, 401, "presence of a header is not authentication");
});

test("demo mode is unchanged, exactly as the engine's own gate", async () => {
  stubEngine({ mode: "demo", authenticated: false });
  const middleware = await loadMiddleware();
  const res = await middleware(req("/api/generate"));
  assert.equal(res, undefined, "the keyless pilot loop must keep working");
});

test("an unreachable engine fails CLOSED", async () => {
  globalThis.fetch = async () => { throw new Error("refused"); };
  const middleware = await loadMiddleware();
  const res = await middleware(req("/api/tryon"));
  assert.equal(res?.status, 401, "unknown mode must not mean permitted");
});


// ⚠ THE FIRST VERSION SAID `if (mode !== "production") return`, WHICH WAVED
// THROUGH EVERYTHING THAT WAS NOT THAT EXACT STRING (owner review,
// 2026-08-12): `demo`, `unknown`, a 200 with no `mode`, a 5xx, an unparseable
// body. A public demo deployment configured with real provider keys — which is
// what a demo deployment IS — stayed wide open. DEMO is now the only
// affirmative exemption.
test("only an explicit demo mode is exempt; everything else needs a token", async () => {
  for (const mode of ["unknown", "", "staging", "PRODUCTION", "pilot"]) {
    stubEngine({ mode, authenticated: false });
    const middleware = await loadMiddleware();
    const res = await middleware(req("/api/generate"));
    assert.equal(res?.status, 401, `mode=${JSON.stringify(mode)} must not be exempt`);
  }
});

test("a health check that 5xxs or returns junk is not a licence", async () => {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    if (path === "/healthz") return { ok: false, status: 503, json: async () => ({}) };
    if (path === "/me") return { ok: true, status: 200, json: async () => ({ authenticated: false }) };
    throw new Error("unexpected");
  };
  const middleware = await loadMiddleware();
  assert.equal((await middleware(req("/api/og")))?.status, 401);
});

test("unguarded routes are untouched", async () => {
  stubEngine({ mode: "production", authenticated: false });
  const middleware = await loadMiddleware();
  assert.equal(await middleware(req("/api/something-else")), undefined);
});
