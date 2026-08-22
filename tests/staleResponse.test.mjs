// The slow answer to an old question must not overwrite the new one.
//
// ⚠ TWO INSTANCES, ONE SHAPE (owner bug hunt, 2026-08-13). Both `reload` in
// CollectionProvider and `load` in CollectionBrief were `useCallback`s with no
// cancellation, so a response that resolved after the user had already moved on
// still called `setState`.
//
// CollectionProvider: switch brand while A's list is in flight, and A's
// collections render under B — in the switcher, CollectionHeader, StageRail,
// CommandCentre and Walkthrough at once. It is invisible because it is
// SELF-CONSISTENT: `loaded.brandId` is A too, so every field agrees with every
// other field. Nothing looks wrong; it is simply the wrong tenant. And this
// provider sits above the Shell's brand remount key on purpose, so nothing else
// catches it.
//
// CollectionBrief is worse, because that one wrote to the EDIT FORM. A late
// brief replaced both the rendered document and `form`, while the header —
// which has its own guard — still named the new collection. Clicking Editar and
// saving then sent `editVersion`/`newVersion` the ids from the stale payload:
// an edit committed to the previous collection's brief, under a header naming
// the current one.
//
// A monotonic counter, not a boolean: brand switches overlap, and the rule is
// "only the newest request may write", not "the one I cancelled may not".
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const A = { id: "brand-a", name: "Marca A", slug: "marca-a", has_result: false };
const B = { id: "brand-b", name: "Marca B", slug: "marca-b", has_result: false };

const A_COLLS = [{ id: "coll-a", name: "Colección de A" }];
const B_COLLS = [{ id: "coll-b", name: "Colección de B" }];

/** A's collection list hangs until `release()`; B's answers at once. */
function stubSlowBrandA() {
  let releaseA;
  const aPending = new Promise((r) => { releaseA = r; });

  stubFetch(async (path) => {
    if (path === "/healthz") return { status: "ok", mode: "demo", build: { commit: "t" } };
    if (path === "/me") return { authenticated: false, brand: null };
    if (path === "/brands") return [A, B];
    if (path === `/brands/${A.id}/studio/collections`) {
      await aPending;
      return A_COLLS;
    }
    if (path === `/brands/${B.id}/studio/collections`) return B_COLLS;
    if (path.endsWith("/users")) return [];
    // Answer readiness with the shape the engine actually returns:
    // `collection_gates.generation_readiness` sets `direction_gaps`
    // unconditionally as a list, so the catch-all `{}` below would hand Studio
    // a payload no server produces. A stub that invents a shape tests fiction.
    if (path.endsWith("/generation-readiness")) {
      return { can_ground_a_run: false, direction_gaps: [], blockers: [] };
    }
    return {};
  });

  return () => releaseA();
}

test("a brand's collections cannot arrive after you have switched away", async () => {
  installDom();
  const releaseA = stubSlowBrandA();

  const { default: React, act } = await import("react");
  const { EngineProvider } = await import("@/components/EngineProvider");
  const { CollectionProvider, useCollection } =
    await import("@/components/CollectionProvider");

  let ctx = null;
  function Probe() { ctx = useCollection(); return null; }

  const view = await mount(React.createElement(EngineProvider, null,
    React.createElement(CollectionProvider, null, React.createElement(Probe))));
  await act(async () => {});

  // Force a second load while the first is still hanging, then let A land last.
  await act(async () => { ctx.reload(); });
  await act(async () => { releaseA(); });
  await act(async () => {});

  const names = (ctx.collections || []).map((c) => c.name);
  assert.ok(!names.includes("Colección de A") || !names.includes("Colección de B"),
    "both brands' collections are in one list — a late response merged tenants");

  await view.unmount();
});

// The remaining guards are asserted at the SOURCE, because reproducing each
// write needs a stalled request plus a click plus a save, and a test that
// elaborate tends to pass for reasons unrelated to the property it names.
//
// ⚠ ALL FOUR OF THESE WRITE INTO EDITABLE STATE, which is what makes them worth
// a rule rather than four fixes. A late response here does not just show the
// wrong thing — the grid or the form then EDITS it, and the save goes to the
// collection the user walked away from.
//
// `RangeSlots` is the sharpest: its loader calls `createPlanVersion`, so an
// unguarded stale load can MINT a version on a plan nobody is looking at.
const GUARDED_LOADERS = [
  { file: "components/views/CollectionBrief.jsx",
    from: "const load = useCallback", to: "useEffect(() => { load(); }",
    why: "a late brief replaces the rendered document AND the edit form, so a " +
         "subsequent save commits to the previous collection's brief version" },
  { file: "components/RangeBoard.jsx",
    from: "const load = useCallback", to: "useEffect(() => { load(); }",
    why: "a late plan version becomes what the grid edits, so saveCell patches " +
         "the previous collection's slot ids" },
  { file: "components/RangeSlots.jsx",
    from: "const load = useCallback", to: "useEffect(() => { load(); }",
    why: "this loader can CREATE a plan version — a stale run mints a row on a " +
         "plan the user already left, then hands the grid its slot ids" },
  { file: "components/CollectionProvider.jsx",
    from: "const reload = useCallback", to: "// Clear first",
    why: "a late collection list renders one brand's collections under another, " +
         "invisibly, because every field in the payload agrees with every other" },
];

for (const loader of GUARDED_LOADERS) {
  test(`${loader.file} will not write for a superseded request`, async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL(`../${loader.file}`, import.meta.url), "utf8");

    const start = src.indexOf(loader.from);
    assert.ok(start !== -1, `could not find "${loader.from}" — did it get renamed?`);
    const body = src.slice(start, src.indexOf(loader.to, start));

    assert.match(body, /generation\.current/,
      `${loader.file} has no staleness guard: ${loader.why}`);

    // ⚠ AND THE ERROR PATH TOO — but only where there IS one. The first
    // version of this demanded two guards everywhere and failed
    // `CollectionProvider`, which has a single await and no `catch` at all:
    // one guard is the complete answer there. Demanding a fixed count tests the
    // shape of the code rather than the property, which is how a correct file
    // ends up reported as broken.
    if (/\bcatch\s*\(/.test(body)) {
      const afterCatch = body.slice(body.search(/\bcatch\s*\(/));
      assert.match(afterCatch, /mine !== generation\.current/,
        `${loader.file} guards its success path but not its catch — an error ` +
        "belonging to the request the user abandoned would still blank the " +
        "state of the one they are looking at");
    }
  });
}
