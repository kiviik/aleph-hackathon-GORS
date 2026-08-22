// Every engine call must carry the bearer token.
//
// ⚠ WHY THIS IS A TEST AND NOT A CONVENTION (owner security review,
// 2026-08-12). Four components called the engine with a plain `fetch()`:
// TeamBrief, RangeBoard, Observatory and Library. In demo mode the engine
// answers without a token, so they worked perfectly and nothing complained.
// The moment production authentication is switched on they return 401 and the
// screens go blank — for authenticated users, on screens that were fine
// yesterday, with no error that names the cause. That is close to the hardest
// class of bug to attribute after the fact.
//
// A convention cannot catch this because the failure is invisible in the
// environment everyone develops in. A source rule can.
import assert from "node:assert/strict";
import test from "node:test";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["components", "lib", "app"];

// `lib/auth.js` DEFINES engineFetch and appFetch, so it necessarily calls fetch.
//
// `lib/preflightApi.js` builds its headers with `authHeaders()` directly rather
// than going through `engineFetch`, because it must NOT inherit the app-wide
// behaviour of degrading to bundled demo data when the engine is unreachable —
// showing someone flags about their tech pack that no reader produced is the
// one output that product must never emit. It DOES send the token.
//
// ⚠ This entry used to say preflight was "deliberately anonymous". That stopped
// being true when `POST /preflight/check` was reclassified AUTHENTICATED — it
// uploads the submitted document to an external model. A stale exemption
// comment is how an allowlist quietly becomes a hole.
const ALLOWED = new Set(["lib/auth.js", "lib/preflightApi.js"]);

async function* walk(dir) {
  let entries;
  try { entries = await readdir(join(ROOT, dir), { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(rel);
    else if (/\.(jsx?|mjs)$/.test(e.name)) yield rel;
  }
}

test("no component calls the engine with an unauthenticated fetch", async () => {
  const offenders = [];
  for await (const rel of walk(DIRS[0])) await check(rel, offenders);
  for (const d of DIRS.slice(1)) for await (const rel of walk(d)) await check(rel, offenders);

  assert.deepEqual(offenders, [], "these call the engine without the bearer token — " +
    "use engineFetch from @/lib/auth:\n  " + offenders.join("\n  "));
});

async function check(rel, offenders) {
  if (ALLOWED.has(rel)) return;
  const src = await readFile(join(ROOT, rel), "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // A bare fetch( whose target is the engine base URL.
    if (/(?<!engine)\bfetch\(\s*`?\$?\{?API_BASE/.test(line)
        || /(?<!engine)\bfetch\(\s*`\$\{API_BASE\}/.test(line)) {
      offenders.push(`${rel}:${i + 1}`);
    }
  });
}

// The SECOND server. `middleware.js` guards /api/generate, /api/tryon and
// /api/og — the app's own routes, which the engine's policy table cannot see.
//
// ⚠ WHY THIS TEST EXISTS SEPARATELY. The rule above only knows about API_BASE,
// so it was blind to `fetch("/api/og?…")` in Signals.jsx — which survived the
// conversion of the other three call sites and would have 401'd in production
// exactly like the four engine callers did. One rule per boundary; a boundary
// with no rule is the one that drifts.
const GUARDED_APP_ROUTES = ["/api/generate", "/api/tryon", "/api/og"];

test("no component calls a guarded app route with an unauthenticated fetch", async () => {
  const offenders = [];
  for (const d of DIRS) {
    for await (const rel of walk(d)) {
      if (ALLOWED.has(rel)) continue;
      // The route handlers themselves live under app/api/** — they RECEIVE
      // these calls, they do not make them.
      if (rel.startsWith("app/api/")) continue;
      const src = await readFile(join(ROOT, rel), "utf8");
      src.split("\n").forEach((line, i) => {
        for (const route of GUARDED_APP_ROUTES) {
          // `fetch("/api/og…` or fetch(`/api/og…` — but not appFetch(.
          const re = new RegExp(String.raw`(?<!app)\bfetch\(\s*["'\`]${route}`);
          if (re.test(line)) offenders.push(`${rel}:${i + 1}  ${route}`);
        }
      });
    }
  }

  assert.deepEqual(offenders, [], "these call a middleware-guarded app route " +
    "without the bearer token — use appFetch from @/lib/auth:\n  " + offenders.join("\n  "));
});
