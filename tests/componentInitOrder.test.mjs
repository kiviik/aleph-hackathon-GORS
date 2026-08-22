// A component may not use a `const` before it declares it.
//
// 2026-07-25, owner: opening ANY product workspace threw
//
//     ReferenceError: Cannot access 'personaBrandId' before initialization
//
// and took the whole creative half of the product with it — AI editing,
// controlled variants, model shots, try-on, review prep, product approval. The
// cause is plain once seen: `StudioItemEditor.jsx` read `personaBrandId` in a
// hook dependency array on line 68 and declared it on line 127. `const` is not
// hoisted the way `var` is, and a dependency array is evaluated DURING render,
// so the read lands inside the temporal dead zone. `team` had the same shape
// one line further down.
//
// Two things make this worth a test rather than a fix and a shrug:
//
//   1. It is invisible to every test this repo has. 59/59 passed with the crash
//      in place, because nothing mounts a component. A test that only checks
//      pure modules cannot tell you the app boots.
//   2. It is a SHAPE, not an incident — the same lesson as the body-carried FK
//      that turned out to be in three routers this morning. A report is a
//      sample, not the population. So this sweeps every .jsx rather than
//      pinning the one file that was reported.
//
// It is a lint rule in test form. When it was written there was no way to mount
// a component here at all; `tests/studioWorkspace.test.mjs` now does exactly
// that, and it is the stronger test — it fails on anything that throws while
// React runs, not only on the one shape this file knows how to look for.
//
// Both are kept, and the division is worth stating so nobody deletes the wrong
// one: the mount test proves ONE component boots, this one sweeps EVERY .jsx
// for the shape. Mounting all of them would be better still and is not free —
// each needs its own realistic props and provider stack. Until that exists,
// this is what stands between the next reordering and a blank screen.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function jsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsxFiles(full));
    else if (entry.endsWith(".jsx")) out.push(full);
  }
  return out;
}

// Declarations at component-body level (two-space indent). Nested scopes have
// their own dead zones and their own rules, so they stay out of this.
const DECL = /^ {2}const \{?\s*([A-Za-z0-9_,\s:]+?)\s*\}?\s*=/;

const namesIn = (declText) =>
  declText.split(",").map((s) => s.split(":").pop().trim()).filter(Boolean);

/** Identifiers actually referenced in a fragment of code.
 *
 * Everything stripped here produced a false positive on the first run, and a
 * rule that cries wolf is one people learn to skip:
 *   · comments   — `// key of a "waiting" row` is not a use of `waiting`
 *   · strings    — `useState("trends")` is not a use of `trends`
 *   · object keys— `useState({ view: X, tab: null })` declares keys, not refs
 *   · properties — `data.res` is not a use of a local named `res`
 */
function identifiers(fragment) {
  const code = fragment
    .replace(/\/\/.*$/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const out = [];
  for (const m of code.matchAll(/(\.)?\b([A-Za-z_$][A-Za-z0-9_$]*)\b\s*(:)?/g)) {
    if (m[1] || m[3]) continue;          // property access, or an object key
    out.push(m[2]);
  }
  return out;
}

/** Lines that are EVALUATED DURING RENDER and therefore hit the dead zone.
 *
 * Deliberately not "every mention". A reference inside a function body or an
 * event handler runs long after the component body finished, so it is legal
 * and flagging it would make this rule noise that people learn to ignore.
 */
function renderTimeRefs(line) {
  const refs = [];
  // A hook's dependency array: `}, [a, b]);` — evaluated on every render.
  const deps = line.match(/\}\s*,\s*\[([^\]]*)\]\s*\)/);
  if (deps) refs.push(...identifiers(deps[1]));
  // A component-body const whose right-hand side is a plain expression, i.e.
  // NOT a function or a hook callback. `const owner = team.byId(x)` runs now;
  // `const f = () => team.byId(x)` does not.
  const decl = line.match(/^ {2}const [^=]+=\s*(.+)$/);
  if (decl && !/=>|\bfunction\b/.test(decl[1])) refs.push(...identifiers(decl[1]));
  return refs;
}

const files = jsxFiles(path.join(ROOT, "components"))
  .concat(jsxFiles(path.join(ROOT, "app")));

// A dead zone is per SCOPE. One file usually holds several components, and a
// `const` in one is simply invisible to the next — comparing across them
// produces confident nonsense, which is how a lint rule earns the right to be
// ignored. Split on column-0 function boundaries and check each body alone.
const TOP_LEVEL_FN =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s|^(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(/;

function scopes(lines) {
  const starts = [];
  lines.forEach((line, i) => { if (TOP_LEVEL_FN.test(line)) starts.push(i); });
  if (!starts.length) return [];
  return starts.map((start, n) => ({
    start, end: n + 1 < starts.length ? starts[n + 1] : lines.length,
  }));
}

test("no component reads a const before it is declared", () => {
  const offences = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");

    for (const { start, end } of scopes(lines)) {
      const declaredAt = new Map();
      for (let i = start; i < end; i++) {
        const m = lines[i].match(DECL);
        if (!m) continue;
        for (const name of namesIn(m[1])) {
          if (!declaredAt.has(name)) declaredAt.set(name, i);
        }
      }
      for (let i = start; i < end; i++) {
        for (const ref of renderTimeRefs(lines[i])) {
          const at = declaredAt.get(ref);
          if (at !== undefined && at > i) {
            offences.push(
              `${path.relative(ROOT, file)}:${i + 1} uses \`${ref}\`, ` +
              `declared at line ${at + 1}`);
          }
        }
      }
    }
  }

  assert.deepEqual(offences, [], "\n" + offences.join("\n"));
});

// The specific file the owner hit, pinned by name. If someone reorders it back,
// the sweep above catches it — this says WHICH file and why, so the next reader
// does not have to re-derive the story from a diff.
test("StudioItemEditor reads its contexts before anything uses them", () => {
  const src = readFileSync(
    path.join(ROOT, "components/StudioItemEditor.jsx"), "utf8").split("\n");
  const lineOf = (needle) => src.findIndex((l) => l.includes(needle));

  const declTeam = lineOf("const team = useTeam()");
  const declBrand = lineOf("const personaBrandId =");
  const firstDep = src.findIndex((l) => l.includes("[personaBrandId]"));
  const firstTeamUse = lineOf("const owner = team.byId");

  assert.ok(declTeam > 0 && declBrand > 0, "the declarations still exist");
  assert.ok(declBrand < firstDep,
            "personaBrandId must be declared before the effect that depends on it");
  assert.ok(declTeam < firstTeamUse,
            "useTeam() must run before a render-time team.byId() call");
});

// The related bug found in the same lines: personas are brand-scoped BROWSER
// state, which exists whether or not the brand ever ran a market pass. Under
// the run-gate idiom every brand without a run shared one unscoped bucket.
test("persona storage is scoped by connection, not by a market run", () => {
  const src = readFileSync(
    path.join(ROOT, "components/StudioItemEditor.jsx"), "utf8");
  assert.ok(!/personaBrandId\s*=\s*engineCtx\.status === "live"/.test(src),
            "the run-gate idiom is wrong for non-run-dependent state");
});
