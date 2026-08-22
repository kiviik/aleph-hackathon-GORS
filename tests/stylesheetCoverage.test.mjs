// A screen's markup and its stylesheet have to land together.
//
// ⚠ WHY THIS EXISTS (owner review, 2026-08-13). `Direction.jsx` was rewritten
// onto a new `dw-` class namespace and its stylesheet was never written. All 80
// distinct `dw-` classes had zero rules — the palette's "proportional strip"
// rendered as the text "Ink black35 %", role headings glued their counts to
// their labels ("Protagonista1"), and references came out as `<li>` bullets.
// The whole point of that redesign was to stop the screen reading as database
// administration, and unstyled it read as a database dump.
//
// 299 tests passed against it. None of them could have failed: every test
// asserts on behaviour or on text, and the defect was that two halves of one
// change were committed apart. A build check cannot see it either — unknown
// classes are not an error in CSS or in JSX.
//
// WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT. It fails only when an
// ENTIRE namespace is unstyled: ≥8 distinct `prefix-*` classes with not one
// rule anywhere. That is the shape of "the stylesheet was never written", and
// it is nearly impossible to trip by accident.
//
// It does NOT check that every individual class has a rule. Plenty legitimately
// do not — a class used only as a test hook or a JS query selector is fine, and
// a per-class rule would be a nagging test that people learn to silence.
//
// Styles in this app live in two places and both count: `app/*.css`, and the
// component-local `<style>` blocks that most screens use (`tb-`, `xp-`, `vx-`
// and others are styled entirely that way). Reading only app/*.css would report
// a dozen false failures.
import assert from "node:assert/strict";
import test from "node:test";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["components", "app"];

// Below this, a "namespace" is more likely a coincidence of naming than a
// design surface — and a small helper with three unstyled classes is not the
// failure this is looking for.
const MIN_CLASSES = 8;

async function* walk(dir) {
  let entries;
  try { entries = await readdir(join(ROOT, dir), { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(rel);
    else yield rel;
  }
}

/** Class names written as literals in JSX. A `${...}` interpolation is blanked
 *  rather than guessed at: a name this cannot read is a name it must not
 *  report. */
function classesIn(src) {
  const out = new Set();
  const re = /className=(?:"([^"]*)"|`([^`]*)`|\{"([^"]*)"\})/g;
  for (const m of src.matchAll(re)) {
    const raw = (m[1] || m[2] || m[3] || "").replace(/\$\{[^}]*\}/g, " ");
    for (const c of raw.split(/\s+/)) {
      if (/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(c)) out.add(c);
    }
  }
  return out;
}

test("no screen ships a class namespace with no stylesheet at all", async () => {
  const sources = [];
  for (const d of DIRS) {
    for await (const rel of walk(d)) {
      if (/\.(jsx?|tsx?|mjs|css)$/.test(rel)) {
        sources.push({ rel, src: await readFile(join(ROOT, rel), "utf8") });
      }
    }
  }

  // Every rule the browser will see: real stylesheets plus inline <style>.
  const styles = sources.map((f) => f.src).join("\n");

  const used = new Set();
  for (const f of sources) {
    if (!/\.(jsx?|tsx?|mjs)$/.test(f.rel)) continue;
    for (const c of classesIn(f.src)) used.add(c);
  }

  const byPrefix = new Map();
  for (const c of used) {
    const p = c.split("-")[0];
    if (!byPrefix.has(p)) byPrefix.set(p, []);
    byPrefix.get(p).push(c);
  }

  const orphans = [];
  for (const [prefix, list] of byPrefix) {
    if (list.length < MIN_CLASSES) continue;
    if (list.some((c) => styles.includes(`.${c}`))) continue;
    orphans.push(`${prefix}-*  (${list.length} classes, 0 rules)`);
  }

  assert.deepEqual(orphans, [], "these class namespaces are used in markup and " +
    "styled nowhere — the stylesheet was not committed with the component:\n  " +
    orphans.join("\n  "));
});

// ⚠ THE MIRROR-IMAGE FAILURE, AND THE ONE THE TEST ABOVE CANNOT SEE (owner
// review, 2026-08-13: it "cannot establish ... that a stylesheet is actually
// loaded in the browser").
//
// `app/signals.css` was written, complete and correct — 386 lines, every rule
// `sg3-` prefixed — and `layout.jsx` never imported it. The commit message said
// two stylesheet imports had landed; one had. A stylesheet nobody imports is
// indistinguishable from one that does not exist, except that it looks finished
// in the diff, which is worse.
//
// Next.js only loads a global stylesheet that something imports, so the import
// IS the loading. This checks the file is referenced; it still cannot prove a
// rule matched an element in a real browser.
test("every stylesheet in app/ is imported by something", async () => {
  const files = [];
  for (const d of DIRS) for await (const rel of walk(d)) files.push(rel);

  const code = (await Promise.all(
    files.filter((f) => /\.(jsx?|tsx?|mjs)$/.test(f))
         .map((f) => readFile(join(ROOT, f), "utf8")))).join("\n");

  const unimported = files
    .filter((f) => f.endsWith(".css"))
    .filter((f) => {
      const base = f.split("/").pop();
      // `import "./globals.css"` / `import "@/app/globals.css"` / "../app/x.css"
      return !new RegExp(`import(?:\\s+[^"']+\\s+from)?\\s+["'][^"']*${base.replace(".", "\\.")}["']`).test(code);
    });

  assert.deepEqual(unimported, [], "these stylesheets are never imported, so no " +
    "browser will ever load them:\n  " + unimported.join("\n  "));
});
