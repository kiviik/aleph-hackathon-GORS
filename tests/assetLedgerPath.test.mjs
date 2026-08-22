// Generation goes through the BRAND'S door, and the old one stays shut.
//
// ⚠ WHY THIS IS A TEST AND NOT A CODE REVIEW. `POST /studio/generate` takes no
// brand — not in the path, not in the body, not in any row it wrote. So its
// images were unattributable, unmeterable, and landed in one shared directory
// that `/studio/history` listed to any authenticated token, from the day the
// studio shipped until engine migration 0068. The engine grew the honest
// replacement (`/brands/{id}/assets/generate`: tenancy, budget reservation,
// idempotency, durable storage) and the busiest screen kept calling the old
// route for two more weeks, because nothing failed when it did.
//
// That is the shape this repo keeps paying for — the honest architecture exists
// and the busiest path does not use it — so the assertion is on the SOURCE:
// a future edit that reaches for the old route fails here rather than in a
// tenancy audit six weeks later.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import "./harness/register.mjs";

const SRC = readFileSync(
  new URL("../components/views/DesignStudio.jsx", import.meta.url), "utf8");

test("the studio does not call the brandless generation route", () => {
  assert.ok(!/\$\{API_BASE\}\/studio\/generate/.test(SRC),
    "DesignStudio is calling /studio/generate again — that route carries no "
    + "brand, so its output cannot be attributed, metered or kept");
});

test("generation goes through the brand-scoped asset ledger", async () => {
  assert.match(SRC, /generateAssets\(brandId,/,
    "the generate call must be the brand-scoped one");
  const { generateAssets } = await import("@/lib/assets");
  assert.equal(typeof generateAssets, "function");
});

test("no brand means the fallback, never a guessed brand id", () => {
  // A studio running before a brand is chosen is a real state. Inventing an id
  // to satisfy the route would file one tenant's image under another — the
  // exact defect `test_body_carried_fks` exists for on the engine side.
  assert.match(SRC, /if \(!brandId\) throw new Error\("sin marca activa"\)/,
    "a missing brand must skip to the fallback, not fabricate an id");
});

test("the brand's own cap is never reported as a provider failure", () => {
  // The engine answers an exhausted allowance with 429, deliberately NOT with
  // {"error": ...} in a 200 body, because callers narrow unknown codes to
  // "provider" — and telling a designer the model is broken when the answer is
  // "you set the limit to 20" is a support ticket the product caused.
  assert.match(SRC, /if \(capReached\(error\)\) throw new Error\(errorText\("quota"\)\)/,
    "a 429 must become the quota sentence");
  // And it must NOT fall through to the app's own generator: retrying there
  // spends money the owner capped on purpose.
  //
  // ⚠ SCOPED TO `callGenerate`, because `/api/generate` is also probed for
  // READINESS elsewhere in this file — a naive indexOf over the whole source
  // finds that probe and proves nothing about the order that matters.
  const start = SRC.indexOf("async function callGenerate(");
  const end = SRC.indexOf("\n  }", SRC.indexOf("compactGeneratedImage(url)", start));
  const fn = SRC.slice(start, end);
  assert.ok(start > 0 && fn.length > 0, "callGenerate not found");
  assert.ok(fn.indexOf("capReached(error)") > 0,
    "the cap check must live inside callGenerate");
  assert.ok(fn.indexOf('appFetch("/api/generate"') > fn.indexOf("capReached(error)"),
    "the cap check must run before the fallback can be reached");
});

test("each generation carries its own idempotency key", async () => {
  // ⚠ A KEY PER GARMENT WOULD MAKE THE SECOND VERSION A 409 (engine 0076
  // refuses a reused key carrying a different request). The key is the item
  // plus how many versions it already has: a failed attempt retried is free,
  // a genuinely new image gets a new key.
  assert.match(SRC, /idempotencyKey: `concepto:\$\{it\.id\}:\$\{it\.images\.length\}`/);
  assert.match(SRC, /idempotencyKey: `modelo:\$\{it\.id\}:\$\{it\.images\.length\}`/);
});

test("the asset url is absolute before it reaches an <img>", async () => {
  const { assetUrl } = await import("@/lib/assets");
  // The engine returns a PATH, because the row knows nothing about which host
  // serves it. Rendering that path directly would ask the Next app for bytes
  // only the engine has.
  assert.match(assetUrl("/brands/abc/assets/def/content"),
    /^https?:\/\/[^/]+\/brands\/abc\/assets\/def\/content$/);
  // An absolute url is left alone, and nothing is invented from nothing.
  assert.equal(assetUrl("https://cdn.example/x.png"), "https://cdn.example/x.png");
  assert.equal(assetUrl(null), null);
  assert.equal(assetUrl(""), null);
});

// --------------------------------------------------------------------------- //
// the identity chain: asset -> concept version
//
// ⚠ THE HALF THE FIRST PASS MISSED, found by review. Phase 2b made the image
// brand-owned, budgeted and durable — and the version that DISPLAYED it kept
// only a url, because `makeVersion` builds its object field by field and
// silently dropped the `assetId` the studio was already passing in. Brand
// ownership without identity is half a fix: the ledger row and the design it
// became could never find each other.
// --------------------------------------------------------------------------- //

test("the canonical version shape keeps the asset it came from", async () => {
  const { makeVersion } = await import("@/lib/version");
  const v = makeVersion("concepto", "http://x/y.png", "nota",
    { assetId: "asset-123", provider: "openai" });
  assert.equal(v.asset_id, "asset-123",
    "makeVersion dropped assetId — the ledger row and the version it became "
    + "can no longer find each other");
  // Absent stays absent: a fallback-generated image has no ledger row, and
  // inventing an id would be worse than admitting there is none.
  assert.equal(makeVersion("concepto", "u", null, {}).asset_id, null);
});

test("approval links an engine-made asset instead of re-uploading it", () => {
  const src = readFileSync(
    new URL("../lib/concepts.js", import.meta.url), "utf8");
  // An engine-made image is already a row — it needs LINKING, not ingesting.
  assert.match(src, /if \(version\.asset_id && pushed\?\.id\)/,
    "the approve path must attach an engine-made asset to its version");
  assert.match(src, /attachAsset\(brandId, version\.asset_id/);
  // And the browser-held path still exists for pixels that never were a row.
  assert.match(src, /else if \(shouldIngestImage\(version\.url\)\)/,
    "the ingest path must remain for images the engine never made");
});
