// Opening a collection has to open THAT collection.
//
// ⚠ THE DEFECT (owner review, 2026-08-13, found by clicking it in the live app).
// *"I clicked 'Abrir la colección' for Colección 4, but Atelier opened
// Colección nueva."* The chain:
//
//   1. Portfolio calls `setActive(row.collection_id)` — which SCHEDULES a state
//      update, it does not apply one.
//   2. Portfolio calls `onNavigate(view)` in the same tick.
//   3. Shell's `navigate` reads `activeCollectionId` from its closure — still
//      the PREVIOUS collection — and writes `?collection=<previous>`.
//   4. CollectionProvider's `hashchange` listener reads the URL as the
//      authority and overwrites the correct pending selection with the stale
//      one.
//
// The URL being the authority is deliberate: it is what makes a collection
// linkable and what survives a reload. The bug is that a click could write a
// URL one render behind itself.
//
// ⚠ WHY THIS IS WORSE THAN LANDING ON THE WRONG SCREEN. Every stage — Rango,
// Studio, Revisión, the approvals — operates on "the active collection". A
// designer could spend a session editing one collection in the belief that it
// was another, and no part of the page would contradict them. The collection
// name in the top bar would agree with the wrong answer.
//
// These tests mount the REAL Shell against a stubbed engine and read
// `window.location.hash`, because that is the seam where the two facts got out
// of step. A test of `navigate` alone would have passed throughout.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "b-1", name: "Complot", slug: "complot", has_result: false };

const A = { id: "c-aaaa", name: "Colección 4" };
const B = { id: "c-bbbb", name: "Colección nueva" };

function row(c) {
  return {
    collection_id: c.id, name: c.name, state: "ok", stage: "brief",
    intent: "", blockers: 0, approvals_outstanding: 0,
    counts: {}, action: null,
  };
}

/** Every call the shell and Portfolio make on the way to a rendered board.
 *  The collection list comes from `studio/collections` (a bare array, mapped by
 *  `fromRow`), NOT from a `/collections` envelope — getting that wrong renders
 *  "sin colección" and the switcher never mounts. */
function stubEngine() {
  stubFetch(async (path) => {
    if (path === "/healthz") return { status: "ok", mode: "demo", build: { commit: "test" } };
    if (path === "/me") return { authenticated: false };
    if (path === "/brands") return [BRAND];
    // `count` is load-bearing: Portfolio renders its empty state on
    // `!data?.count`, so an envelope without it produces a screen with no
    // collections and no way into one.
    if (path.endsWith("/collections/portfolio")) {
      return { items: [row(A), row(B)], count: 2, needs_attention: 0 };
    }
    if (path.endsWith("/studio/collections")) return [A, B];
    if (path.endsWith("/users")) return [];   // an ARRAY: IdentityProvider filters it
    // The destination of "Abrir la colección". Answered only enough to render
    // without throwing — what it shows is not this test's subject, the URL it
    // was reached by is.
    // Readiness answered with the shape the engine actually returns —
    // `generation_readiness` sets `direction_gaps` unconditionally as a list,
    // so the catch-all `{}` below would hand Studio a payload the server never
    // produces. A stub that invents a shape tests fiction.
    //
    // ⚠ THIS DID NOT FIX THE FAILURE I FIRST BLAMED ON IT. I assumed the
    // fabricated payload caused a `.map` crash in StudioExplore; swapping in
    // the COMMITTED StudioExplore proved otherwise — it passes 5/5, and the
    // crash belongs to uncommitted in-flight work on that file. The stub is
    // still more honest this way, which is why it stays.
    if (path.endsWith("/generation-readiness")) {
      return { can_ground_a_run: false, direction_gaps: [], blockers: [] };
    }
    if (path.endsWith("/command-centre")) {
      return { order: [], answers: {}, counts: {}, state: "ok", plan: null };
    }
    return {};
  });
}

async function mountShell({ hash }) {
  const win = installDom({ url: `http://localhost:3000/${hash}` });
  stubEngine();
  const { default: React } = await import("react");
  const { default: Shell } = await import("@/components/Shell");
  const view = await mount(React.createElement(Shell));
  // The collection list and the portfolio are separate reads; let both land.
  const { act } = await import("react");
  await act(async () => {});
  return { win, view };
}

/** The `collection` the URL currently claims. */
function collectionInHash(win) {
  const m = /[?&]collection=([^&]+)/.exec(win.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

function findByText(container, selector, text) {
  return [...container.querySelectorAll(selector)]
    .find((el) => (el.textContent || "").includes(text)) || null;
}

// ---------------------------------------------------------------------------

test("opening collection A while B is active puts A in the URL, not B", async () => {
  // Start on B, deliberately: the defect is invisible when the collection you
  // click is already the active one, which is why casual clicking misses it.
  const { win, view } = await mountShell({ hash: `#/portfolio?collection=${B.id}` });
  const { act } = await import("react");

  assert.equal(collectionInHash(win), B.id, "setup: B should be the active collection");

  const open = findByText(view.container, "button.cx-open, button.cx-name", A.name)
    || findByText(view.container, "button", "Abrir la colección");
  assert.ok(open, "Portfolio did not render a way into a collection");

  await act(async () => { open.click(); });
  await act(async () => {});

  assert.equal(
    collectionInHash(win), A.id,
    `clicking into ${A.name} left the URL pointing at ${B.name} — every stage ` +
    "downstream would then operate on the collection the designer did not pick");

  await view.unmount();
});

// ⚠ THE STRUCTURAL RULE, AND THE REASON THE FIRST TWO FIXES WERE NOT ENOUGH
// (owner review, 2026-08-13, second pass). Portfolio and the top-bar switcher
// were each fixed where the bug was seen, which left the collection with two
// writers — state and URL — and a day later Studio's own collection tabs were
// found doing the same thing: the whole screen changed, `?collection=` did not,
// and a reload went back to the previous collection.
//
// So this asserts the ARCHITECTURE rather than a third symptom: `selectCollection`
// is the only way a screen changes the collection, and it writes the canonical
// URL. A component that calls `setActive` is mirroring state by hand, which is
// how all three defects happened.
test("no screen changes the collection by mirroring state instead of the URL", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const ROOT = new URL("..", import.meta.url).pathname;

  async function* walk(dir) {
    for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) yield* walk(rel);
      else if (/\.jsx?$/.test(e.name)) yield rel;
    }
  }

  // ⚠ MATCH THE SOURCE, NOT THE NAME — AND MATCH BOTH WAYS OF REACHING IT.
  //
  // The first version flagged any `setActive(` and caught `Today.jsx:279`, a
  // carousel index with nothing to do with collections. `setActive` is an
  // ordinary name; what makes it this defect is taking it from the COLLECTION
  // context.
  //
  // The second version fixed that by matching the destructuring — and then
  // failed its own mutation check, because Studio never destructured: it held
  // the whole context as `collectionCtx` and called `collectionCtx.setActive`.
  // A rule that misses the exact defect it is named for is worse than no rule,
  // because it reads as coverage. Both shapes count.
  const offenders = [];
  for await (const rel of walk("components")) {
    if (rel.endsWith("CollectionProvider.jsx")) continue;   // it defines both
    const src = await readFile(join(ROOT, rel), "utf8");

    // (a) `const { …, setActive, … } = useCollection()`
    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*useCollection\(\)/g)) {
      if (!/\bsetActive\b/.test(m[1])) continue;
      offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length}  destructured`);
    }

    // (b) `ctx.setActive(…)` — the context held whole. A member access by this
    // name is the collection's: the other `setActive`s in the app are bare
    // `useState` setters, which are never called through a dot.
    src.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/\.\s*setActive\s*\(/.test(line)) {
        offenders.push(`${rel}:${i + 1}  via the context object`);
      }
    });
  }

  assert.deepEqual(offenders, [], "these change the active collection without " +
    "writing the canonical URL — use selectCollection(id), or navigate(view, " +
    "{ collectionId }) when the view changes too:\n  " + offenders.join("\n  "));
});

// The operation Studio's tabs now call, and the property that was missing when
// they mirrored state instead: *"Inside Studio, I switched from Pilot to
// Colección 4 using Studio's own collection tabs. The entire UI changed to
// Colección 4. The URL remained collection=<Pilot>. Reload returned the
// platform to Pilot."*
//
// This drives `selectCollection` through the real provider rather than through
// Studio's tab markup — the coverage of Studio itself comes from the source
// rule above, which fails if any screen goes back to mirroring `setActive`.
// Together: no screen may mirror, and the one operation they must use moves the
// canonical URL.
test("selectCollection moves the URL and the state together", async () => {
  const win = installDom({ url: `http://localhost:3000/#/studio?collection=${B.id}` });
  stubEngine();
  const { default: React, act } = await import("react");
  const { EngineProvider } = await import("@/components/EngineProvider");
  const { CollectionProvider, useCollection } =
    await import("@/components/CollectionProvider");

  let ctx = null;
  function Probe() { ctx = useCollection(); return null; }

  const view = await mount(React.createElement(EngineProvider, null,
    React.createElement(CollectionProvider, null, React.createElement(Probe))));
  await act(async () => {});

  assert.equal(ctx.activeId, B.id, "setup: the URL's collection should be active");

  await act(async () => { ctx.selectCollection(A.id); });
  await act(async () => {});

  assert.equal(collectionInHash(win), A.id,
    "selecting a collection left the URL on the previous one — a reload would " +
    "silently return the whole platform to the collection you just left");
  assert.equal(ctx.activeId, A.id,
    "the state did not move with the URL — a screen would show one collection\n     while the URL named another");

  await view.unmount();
});

// ⚠ THE REGRESSION THE FIRST VERSION OF THE FIX INTRODUCED, caught only by
// reloading the page in a browser. Routing every `setActiveId` in Studio through
// `selectCollection` made STARTUP write the URL instead of read it: open
// `#/studio?collection=<Pilot>`, and a beat later Studio resolved its own
// default and overwrote the hash with a different collection. Same symptom as
// the original bug — reload lands somewhere you did not pick — from the
// opposite direction, and every routing test still passed.
//
// The distinction that matters: choosing is a write, loading is a read.
test("a screen loading a collection does not overwrite the URL that chose it", async () => {
  // Studio specifically: it is the screen with its own loader, and mounting a
  // screen without one would make this pass for the wrong reason. B is
  // deliberately NOT first in the list — Studio's fallback is `cs[0]`, so a
  // loader that writes instead of reads lands on A and the URL says A.
  const { win, view } = await mountShell({ hash: `#/studio?collection=${B.id}` });
  const { act } = await import("react");

  // Let every load settle — the overwrite happened one beat AFTER mount, which
  // is why a test that asserted immediately would not have seen it.
  for (let i = 0; i < 6; i++) await act(async () => {});

  assert.equal(
    collectionInHash(win), B.id,
    "a screen rewrote ?collection= while loading, so the collection the URL " +
    "asked for is not the one that ended up selected");

  await view.unmount();
});

test("the collection switcher moves the URL, so a reload stays where you are", async () => {
  // Same fact, second writer. Picking in the top-bar `<select>` used to update
  // state only; the URL kept the previous collection, and a reload resolved the
  // disagreement in the URL's favour — silently returning you to the collection
  // you had just left.
  const { win, view } = await mountShell({ hash: `#/dashboard?collection=${B.id}` });
  const { act } = await import("react");

  const select = view.container.querySelector(".ax-coll select");
  assert.ok(select, "the collection switcher did not render");

  await act(async () => {
    select.value = A.id;
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
  });
  await act(async () => {});

  assert.equal(
    collectionInHash(win), A.id,
    "the switcher changed the active collection without moving the URL, so a " +
    "reload would put the previous collection back");

  await view.unmount();
});
