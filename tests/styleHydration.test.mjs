// A component <style> block must not break hydration.
//
// ⚠ THE DEFECT, FOUND BY OPENING THE APP (2026-08-13). Five screens had just
// been restyled with `<style>{CSS}</style>`, the obvious spelling. React
// ESCAPES `>` and `"` when it serialises a text child on the server, so the
// server sent `.a &gt; .b {}`; the browser does NOT unescape inside a <style>
// element, so the client's text differed from the server's and React tore down
// the entire tree and re-rendered it on every single page load. The console
// filled with "Text content does not match server-rendered HTML" and the
// screens flickered.
//
// `dangerouslySetInnerHTML` is the correct spelling here, and safe precisely
// because the content is a CSS literal the component owns — never user input.
// The name warns about injecting untrusted strings, which is not what this is.
//
// This is a source rule because the failure is INVISIBLE to every other kind of
// test: the markup is right, the styles are right, the tests pass, and the app
// still throws its tree away twice a second in the browser. jsdom does not
// server-render, so no DOM test can see it either.
import assert from "node:assert/strict";
import test from "node:test";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["components", "app"];

async function* walk(dir) {
  let entries;
  try { entries = await readdir(join(ROOT, dir), { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(rel);
    else if (/\.jsx?$/.test(e.name)) yield rel;
  }
}

test("no component renders CSS as a <style> text child", async () => {
  const offenders = [];
  for (const d of DIRS) {
    for await (const rel of walk(d)) {
      const src = await readFile(join(ROOT, rel), "utf8");
      src.split("\n").forEach((line, i) => {
        // ⚠ SKIP COMMENTS. The first version of this flagged
        // `LaunchResults.jsx:25` — a comment written by another agent WARNING
        // against the very pattern, quoting it literally. A rule that fails on
        // a correct file explaining the rule is the third false positive I have
        // written this session; each one teaches people to ignore the rule.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        // `<style>{expr}` or `<style>{`…` — both serialise as a text child.
        if (/<style[^>]*>\s*\{/.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
  }

  assert.deepEqual(offenders, [], "these render CSS as a <style> text child, " +
    "which React escapes on the server and the browser does not unescape — " +
    "hydration fails and the whole tree is discarded on every load. Use " +
    "<style dangerouslySetInnerHTML={{ __html: CSS }} />:\n  " +
    offenders.join("\n  "));
});

// ⚠ THE SECOND DEFECT FROM THE SAME REVIEW, and the same root cause: THE
// SERVER RENDERS TOO. Today.jsx showed "El motor no responde" whenever
// `connected` was false — and on the server it is ALWAYS false, because
// effects never run there. So the outage banner was the first paint of every
// page load, for every tenant, including ones whose engine was healthy.
//
// ⚠ THIS WAS FIRST WRITTEN AS A SOURCE RULE — "does the file mention
// `resolved`?" — AND THAT WAS WRONG. It flagged `EngineDown.jsx`, which gates
// correctly by a different means (`status === "demo" && reason ===
// "unreachable"`, neither true before resolution), and Signals' "Datos de
// muestra", which labels a DATA SOURCE rather than claiming an outage. A rule
// that reports correct code as broken is worse than no rule: it gets silenced,
// and then it is not there on the day it is right.
//
// So this renders the app the way the server does and reads the output. It is
// the actual seam, it cannot be satisfied by naming a variable, and it would
// have caught the original defect on the first run.
test("the server's first paint claims nothing about the engine", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: React } = await import("react");
  const { default: Shell } = await import("@/components/Shell");

  // No DOM, no fetch, no effects — exactly the server's conditions.
  const html = renderToStaticMarkup(React.createElement(Shell));

  for (const claim of ["El motor no responde", "Motor sin conexión",
                       "no uses estos números para decidir"]) {
    assert.ok(!html.includes(claim),
      `the server rendered "${claim}" before anything had been asked. Effects ` +
      "do not run on the server, so a branch keyed on `connected` or `status` " +
      "is unconditionally taken there — and that becomes the first thing every " +
      "page load shows. Gate it on `engine.resolved`.");
  }
});

// ⚠ LIVENESS IS NOT READINESS, AND NOT-READY IS NOT DEMO (owner review,
// 2026-08-14). The app asked `/healthz`, which the engine defines as "the
// process is up" with NO dependency checks — deliberately, that being what a
// liveness probe is. So Postgres could be down, or the migrations behind head,
// and Atelier still reported `healthy: true`; every screen then requested data
// the engine could not serve and read the errors as emptiness.
//
// The rule that matters is not merely that the app notices. It is that noticing
// must NOT produce sample data: the brand's real rows exist and are temporarily
// unreachable, and painting invented numbers over them is strictly worse than
// saying which dependency is down. Demo data is reserved for "nothing answers
// at all".
test("an engine that is alive but not ready never yields demo data", async () => {
  const { installDom, stubFetch } = await import("./harness/dom.mjs");
  installDom();

  // Alive, and explicitly NOT ready: 503 with the engine's own diagnosis.
  globalThis.fetch = async (input) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    if (path === "/healthz") {
      return { ok: true, status: 200,
               json: async () => ({ status: "ok", mode: "production" }) };
    }
    if (path === "/readyz") {
      return { ok: false, status: 503,
               json: async () => ({ database: "unreachable" }) };
    }
    return { ok: false, status: 500, json: async () => null };
  };

  const { getEngineStatus } = await import("@/lib/api");
  const st = await getEngineStatus();

  assert.equal(st.healthy, true, "the process answered, so it is alive");
  assert.equal(st.ready, false,
    "a 503 from /readyz is the engine saying it cannot serve — the app has to " +
    "carry that through rather than reporting the box as healthy");
  assert.deepEqual(st.readiness, { database: "unreachable" },
    "the diagnosis is dropped, so the screen cannot say WHICH dependency failed");
});

test("a 404 from /readyz is not a claim that the engine is broken", async () => {
  // An engine that predates the endpoint, or a proxy that swallows it, tells us
  // nothing. Treating absence of information as failure would declare healthy
  // engines broken — which is what the first version of this did, turning 13
  // passing tests red because their stubs 404 anything they do not model.
  const { installDom } = await import("./harness/dom.mjs");
  installDom();

  globalThis.fetch = async (input) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    if (path === "/healthz") {
      return { ok: true, status: 200, json: async () => ({ status: "ok" }) };
    }
    return { ok: false, status: 404, json: async () => null };
  };

  const { getEngineStatus } = await import("@/lib/api");
  const st = await getEngineStatus();
  assert.equal(st.ready, true,
    "a missing /readyz was read as a failing one");
});
