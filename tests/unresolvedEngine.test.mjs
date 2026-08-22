// The app may not describe its own data before it knows what its data is.
//
// ⚠ WHAT SHIPPED (owner review, 2026-08-13): *"Engine initialization also begins
// in DEMO, not loading. On reload I briefly saw 'Datos de muestra' and an
// unavailable collection centre before the real tenant loaded."*
//
// `EngineProvider` started at `useState(DEMO)`. That is an ANSWER — `status:
// "demo"`, `connected: false` — asserted before the health check had returned
// and before any brand was resolved. The status chip fell through every branch
// to the last one, so on every reload a real tenant was told, in the app's own
// trust indicator, that the numbers in front of them were sample data.
//
// A warning that appears and then retracts itself is worse than a slow one: it
// is precisely the training that teaches people to ignore the warning on the day
// it is true. "Not yet known" is a state, and it is the honest one to start in.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "b-1", name: "Complot", slug: "complot", has_result: false };

/** Health and brands never resolve, so the app is frozen in its initial state —
 *  the exact instant the defect was visible. */
function stubNeverResolves() {
  stubFetch(() => new Promise(() => {}));
}

test("the initial engine state is unresolved, not demo", async () => {
  installDom();
  stubNeverResolves();
  const { default: React } = await import("react");
  const { EngineProvider, useEngine } = await import("@/components/EngineProvider");

  let engine = null;
  function Probe() { engine = useEngine(); return null; }
  const view = await mount(
    React.createElement(EngineProvider, null, React.createElement(Probe)));

  assert.equal(engine.resolved, false,
    "the provider claimed to have resolved before any request returned");
  assert.notEqual(engine.status, "demo",
    "the app starts by asserting demo mode — a claim about the data, made " +
    "before the data has been looked at");

  await view.unmount();
});

test("no sample-data warning is shown while the engine is unresolved", async () => {
  installDom();
  stubNeverResolves();
  const { default: React } = await import("react");
  const { default: Shell } = await import("@/components/Shell");

  const view = await mount(React.createElement(Shell));
  const text = view.text() || "";

  assert.ok(!/Datos de muestra/.test(text),
    "the shell announced 'Datos de muestra' before knowing which brand this is " +
    "or whether a run exists — a warning that retracts itself is how people " +
    "learn to ignore the one that matters");
  assert.ok(!/no uses estos números para decidir/i.test(text),
    "the do-not-decide warning bar rendered on an unresolved engine");

  await view.unmount();
});

test("once resolved, the app does describe its data", async () => {
  // The complement, so "say nothing" cannot be satisfied by saying nothing ever.
  installDom();
  stubFetch(async (path) => {
    if (path === "/healthz") return { status: "ok", mode: "demo", build: { commit: "t" } };
    if (path === "/brands") return [BRAND];
    if (path === "/me") return { authenticated: false };
    if (path.endsWith("/users")) return [];
    return {};
  });
  const { default: React, act } = await import("react");
  const { EngineProvider, useEngine } = await import("@/components/EngineProvider");

  let engine = null;
  function Probe() { engine = useEngine(); return null; }
  const view = await mount(
    React.createElement(EngineProvider, null, React.createElement(Probe)));
  for (let i = 0; i < 4; i++) await act(async () => {});

  assert.equal(engine.resolved, true, "the engine never finished resolving");
  assert.equal(engine.connected, true, "the brand should have resolved");

  await view.unmount();
});
