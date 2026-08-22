// Asset bytes live behind the tenancy gate, so a raw <img src> cannot read
// them: the browser's image loader sends no Authorization header, and
// `/brands/{id}/assets/{id}/content` is a TENANT_PATH route.
//
// This renders fine today only because pilot mode allows unauthenticated
// requests — which makes it exactly the failure this codebase has already
// paid for once: "the failure only exists in the environment nobody develops
// in". A source rule is the only thing that catches it, because no local test
// run and no local browser session can.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const VIEWS = "components/views";

function sources() {
  return readdirSync(VIEWS)
    .filter((f) => f.endsWith(".jsx"))
    .map((f) => [f, readFileSync(`${VIEWS}/${f}`, "utf8")]);
}

test("no view points a raw <img> at the engine's tenant-checked asset bytes", () => {
  const offenders = [];
  for (const [file, src] of sources()) {
    // Strip comments so the warnings in this file's own header don't trip it.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/<img[^>]*src=\{([^}]*)\}/g)) {
      const expr = m[1];
      // ⚠ ONLY the tenancy-gated path counts. `/static` renders are a public
      // mount, `data:`/`blob:` URLs the client made need no credential, and a
      // brand's own CDN image is somebody else's host — flagging those would
      // make this rule noise, and a noisy rule gets deleted.
      if (/blob|data:|URL\.createObjectURL|objectUrl|preview/i.test(expr)) continue;
      // ⚠ `\b` matters: `engineAssetUrl(` is a DIFFERENT helper for a
      // direction reference's SOURCE url (external, or the engine's public
      // mount), not the tenancy-gated /assets/{id}/content route.
      if (/assets\/[^)]*content|\bassetUrl\(|content_url/i.test(expr)) {
        offenders.push(`${file}: ${expr.trim().slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    "these must go through AssetImage (engineFetch + object URL), because an "
    + "<img> tag cannot send the bearer token the engine requires:\n  "
    + offenders.join("\n  "));
});

test("AssetImage distinguishes could-not-read from there-is-none", () => {
  const src = readFileSync("components/ui/AssetImage.jsx", "utf8");
  assert.match(src, /No pudimos leer esta imagen/);
  assert.match(src, /absentText/);
  // And it must not leak object URLs — one per mounted card adds up fast.
  assert.match(src, /revokeObjectURL/);
});
