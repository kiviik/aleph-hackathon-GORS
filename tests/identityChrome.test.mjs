// The shell's identity and freshness chrome, pinned.
//
// Owner review 2026-08-12: the four fixes in `2bfe32c` "work in code and were
// reportedly checked live, but the 278 tests do not protect them from
// regression." That is the whole reason this file exists — every assertion here
// corresponds to a defect that shipped, and each one was invisible to a suite
// that never mounted the chrome.
//
// The review also found a defect the port itself introduced: the loading branch
// still returned `className="si-chip"` after the chip became `si-av`, so the
// header rendered an unstyled dot. Nothing caught it. It is the first test
// below.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const BRAND = { id: "b-1", name: "Complot", slug: "complot" };
const USER = { id: "u-1", name: "Vicky Rauch", role: "owner", can_approve: true };

/** Answer every call SignIn's provider makes; `me` decides the identity state. */
function stubIdentity(me) {
  stubFetch(async (path) => {
    if (path === "/me") return me;
    if (path.endsWith("/users")) return { items: [] };
    return {};
  });
}

async function mountSignIn(me) {
  installDom();
  stubIdentity(me);
  const [{ default: SignIn }, { IdentityProvider }] = await Promise.all([
    import("@/components/SignIn"),
    import("@/components/IdentityProvider"),
  ]);
  const { default: React } = await import("react");
  return mount(
    React.createElement(IdentityProvider, null, React.createElement(SignIn)));
}

// ---------------------------------------------------------------------------

test("the loading state uses a class that actually has styles", async () => {
  // `si-chip` was removed when the chip became an avatar. A className with no
  // rule anywhere renders an unstyled dot in the top bar — which is exactly
  // what shipped, and exactly what no test noticed.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../components/SignIn.jsx", import.meta.url), "utf8");

  const used = [...src.matchAll(/className="(si-[\w-]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 0, "SignIn should carry si- classes");

  for (const cls of new Set(used)) {
    assert.match(
      src, new RegExp(`\\.${cls}[\\s,{:]`),
      `SignIn renders .${cls} but defines no CSS rule for it`);
  }
});

test("the styles are reachable from every branch, including loading", async () => {
  // The style block used to live inside the signed-in return, so an early
  // return rendered avatar markup with no CSS at all.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../components/SignIn.jsx", import.meta.url), "utf8");

  const returns = src.split("return (").length - 1;
  // ⚠ COUNT THE TAG, NOT ONE SPELLING OF IT. This matched the literal
  // "<style>" until the blocks became
  // `<style dangerouslySetInnerHTML={{ __html: CSS }} />` — the fix for a
  // hydration failure where React escapes `>` and `"` on the server and the
  // browser does not unescape them inside <style>. The property under test has
  // not changed: every return branch must carry the styles. Only the spelling
  // this assertion recognises had to.
  const styleTags = src.split("<style").length - 1;
  assert.ok(
    styleTags >= returns - 1,
    `SignIn has ${returns} returns but only ${styleTags} <style> tags — ` +
    "an early return would render unstyled markup");
});

test("signed in: the avatar carries the person, and names the tenant", async () => {
  const { container, text, unmount } = await mountSignIn(
    { authenticated: true, user: USER, brand: BRAND });

  const avatar = container.querySelector(".si-av");
  assert.ok(avatar, "the identity control should be the avatar");
  assert.equal(avatar.textContent.trim(), "V", "avatar shows the person's initial");
  assert.equal(avatar.tagName, "BUTTON", "the avatar must be clickable");

  const { act } = await import("react");
  await act(async () => { avatar.click(); });

  const menu = text();
  // GET /me answers {user, brand}; IdentityProvider used to drop `brand`, so
  // the menu read "Marca —" and nothing could name the tenant.
  assert.match(menu, /Complot/, "the identity menu must name the brand");
  assert.match(menu, /owner/, "…and the role");
  await unmount();
});

test("signed out: the control is still the avatar, not a hidden chip", async () => {
  const { container, unmount } = await mountSignIn(
    { authenticated: false, user: null, brand: null });

  const avatar = container.querySelector("button.si-av");
  assert.ok(avatar, "signed out must still expose the avatar control");
  // The regression this guards: sign-in living inside the market-provenance
  // popover, where the brief screen told people to "iniciá sesión" and the
  // control was behind a chip about offline crawl mode.
  assert.ok(avatar.getAttribute("aria-label"),
            "the avatar needs an accessible name when it shows no initial");
  await unmount();
});

test("sign-in is not mounted inside the engine-provenance popover", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../components/Shell.jsx", import.meta.url), "utf8");

  const signIn = src.indexOf("<SignIn />");
  assert.ok(signIn > 0, "Shell should mount SignIn");

  // `ax-pop` is the provenance popover. SignIn must not sit inside it.
  const popover = src.indexOf('className="ax-pop"');
  if (popover > 0 && popover < signIn) {
    const between = src.slice(popover, signIn);
    const closes = between.split("</div>").length - 1;
    const opens = between.split("<div").length - 1;
    assert.ok(closes > opens,
              "SignIn appears to be inside the ax-pop provenance popover");
  }
});

test("the freshness chip speaks about data, not about crawl runs", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../components/Shell.jsx", import.meta.url), "utf8");

  // A freshness chip answers "how old is the market evidence". Run mode is the
  // popover's first line and belongs there, not in the chip label.
  const labels = [...src.matchAll(/label: `([^`]*hace \$\{timeAgo[^`]*)`/g)]
    .map((m) => m[1]);
  assert.ok(labels.length > 0, "expected at least one freshness label");
  for (const label of labels) {
    assert.doesNotMatch(
      label, /Corrida/,
      `freshness chip still says "Corrida" (operator's word): ${label}`);
    assert.match(label, /Datos de mercado/, `unexpected chip label: ${label}`);
  }
});

test("scroll restoration is disabled so a reload cannot restore the band", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../components/Shell.jsx", import.meta.url), "utf8");

  // scrollTo(0,0) alone cannot win: on a reload the browser restores its
  // remembered offset AFTER React mounts and the effect runs, which is how a
  // ~600px blank band above the shell survived a refresh.
  assert.match(src, /scrollRestoration\s*=\s*"manual"/,
               "Shell must set history.scrollRestoration = manual");
  assert.match(src, /window\.scrollTo\(0,\s*0\)/,
               "…and still scroll to top on a route change");
});

// ---------------------------------------------------------------------------
// Signing in has to move the SCREEN, not just the chip.
//
// Found 2026-08-21 while rehearsing a hosted deploy against a production-mode
// engine, by using the app rather than by reading it. `EngineProvider` loads
// once with an empty dependency array; `signIn` reloaded identity only. So the
// screen kept whatever it had resolved to while nobody was signed in.
//
// ⚠ THE REASON IT SURVIVED THIS LONG IS THE REASON IT MATTERS. Locally the
// engine runs in DEMO mode, where the anonymous load succeeds — signing in
// changes nothing on screen and there is nothing to notice. In production the
// anonymous load 401s, so a new user signs in and goes on staring at "El motor
// no responde" until they think to reload the page by hand. It is the first
// minute of the product for every invited person.

async function mountWithEngine(mePhases) {
  installDom();
  const calls = [];
  let phase = 0;
  stubFetch(async (path) => {
    calls.push(path);
    if (path === "/me") return mePhases[phase];
    if (path === "/brands") return [];
    if (path === "/brands/b-1") return { id: "b-1", name: "Complot", has_result: false };
    if (path.endsWith("/users")) return { items: [] };
    return {};
  });

  const [{ EngineProvider }, { IdentityProvider, useIdentity }] = await Promise.all([
    import("@/components/EngineProvider"),
    import("@/components/IdentityProvider"),
  ]);
  const { default: React, act } = await import("react");

  let identity = null;
  const Probe = () => { identity = useIdentity(); return null; };

  const mounted = await mount(
    React.createElement(EngineProvider, null,
      React.createElement(IdentityProvider, null, React.createElement(Probe))));

  return {
    ...mounted,
    calls,
    signIn: async (token) => {
      phase = 1;                       // the engine now knows who is asking
      await act(async () => { await identity.signIn(token); });
    },
    signOut: async () => {
      phase = 0;
      await act(async () => { identity.signOut(); });
    },
  };
}

test("signing in re-reads the engine, not only the identity", async () => {
  const anon = { authenticated: false };
  const signed = {
    authenticated: true,
    user: { id: "u-1", name: "Vicky", role: "design", can_approve: true },
    brand: { id: "b-1", name: "Complot" },
  };

  const app = await mountWithEngine([anon, signed]);
  const brandReads = () => app.calls.filter((p) => p === "/brands/b-1").length;

  assert.equal(brandReads(), 0,
    "nothing brand-scoped should be readable before anyone is signed in");

  await app.signIn("atl_test");

  assert.ok(brandReads() > 0,
    "signing in must re-run the engine load — otherwise the screen keeps the " +
    "state it resolved to while unauthenticated, which in production is a 401");

  await app.unmount();
});

test("signing out drops the tenant's data from the screen too", async () => {
  const signed = {
    authenticated: true,
    user: { id: "u-1", name: "Vicky", role: "design", can_approve: true },
    brand: { id: "b-1", name: "Complot" },
  };

  const app = await mountWithEngine([signed, signed]);
  const before = app.calls.length;

  await app.signOut();

  assert.ok(app.calls.length > before,
    "signing out must re-run the engine load — clearing the identity while " +
    "leaving the brand's DNA and collection rendered is the wrong half");

  await app.unmount();
});
