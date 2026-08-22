// The whitespace cards come from the engine, or there are no cards.
//
// Owner review, 2026-08-10 and again 2026-08-11: the live Oportunidades screen
// ranked "Sweaters" with socks and a tee as evidence, "Faldas" with two tops,
// "Jeans" with a short and a skirt — and the verdict was that the screen "turns
// bad classification into confident product advice". The cause was that it
// computed its own gaps in the browser, through a category rule table with no
// underwear rule in it, so a knitted sock tagged `knit` matched Sweaters.
//
// The 08-10 pass gated those local cards against the engine. It could not work:
// the engine judged the rows IT selected while the card drew the rows the
// BROWSER selected, so the verdict certified a different set than the one on
// screen. The gap is now computed server-side and returned WITH the rows it was
// counted over.
//
// The property these tests protect is the one that is easy to regress, and it
// is the same property as before pointed at a different call: this screen may
// not fall back to a local reading. Every other view degrades to something; here
// degrading means rendering unvetted product advice, which is the defect itself.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const BRAND = "11111111-1111-1111-1111-111111111111";

async function withFetch(handler, run) {
  const api = await import("../lib/api.js");
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run(api);
  } finally {
    globalThis.fetch = original;
  }
}

const ok = (body) => async () => ({
  ok: true, status: 200, json: async () => body,
});

const CARD = {
  key: "ws-Faldas", category: "Faldas", kind: "sin-cobertura", score: 63,
  title: "Faldas — no tenés ninguno", verdict: { label: "hueco real", tone: "make" },
  yours: 0, rivals: 26, ars_rivals: 26, brands: ["47 Street"],
  ars_brands: ["47 Street"], band_gaps: [], ars_avg: 40000,
  ars_avg_label: "$40.000", trend: null, risk: "riesgo acotado",
  sample: [{ competitor: "47 Street", title: "FALDA CRUST", product_type: "Polleras",
             price: 39900, currency: "ARS", url: "https://x.test/1",
             image_url: null, published_at: null }],
  evidence_total: 26,
  brief: { typology: "Faldas", fabric: "", price_hint: "$40.000", note: "…" },
  coherence: { agreement: 1.0, verified: true },
  title_agreement: { speaking: 26, agreeing: 23, silent: 0, agreement: 0.88,
                     measurable: true, passed: true, disagreeing: [] },
};

test("the engine's cards are returned as the engine sent them", async () => {
  const body = await withFetch(
    ok({ opportunities: [CARD], withheld: [], reason: null }),
    (api) => api.getOpportunities(BRAND),
  );
  assert.equal(body.opportunities.length, 1);
  assert.equal(body.opportunities[0].category, "Faldas");
  // The references travel WITH the card — that is the whole migration.
  assert.equal(body.opportunities[0].sample[0].product_type, "Polleras");
});

test("a withheld category arrives named, with the engine's own sentence", async () => {
  // Withheld, not annotated: a caveat under an opportunity leaves the
  // opportunity, and "Diseñar" is one click away.
  const body = await withFetch(
    ok({
      opportunities: [CARD],
      withheld: [{
        category: "Sweaters",
        why: "18 de 31 ítems bajo «Sweaters» tienen un título que coincide…",
        title_agreement: { disagreeing: [{ title: "Longline Tee", title_says: "Remeras" }] },
      }],
    }),
    (api) => api.getOpportunities(BRAND),
  );
  assert.equal(body.withheld.length, 1);
  assert.equal(body.withheld[0].category, "Sweaters");
  assert.match(body.withheld[0].why, /título/);
  // Withheld categories never also appear as opportunities.
  assert.ok(!body.opportunities.some((o) => o.category === "Sweaters"));
});

test("⚠ an unreachable engine yields NULL, never an empty list", async () => {
  // The distinction the screen rests on: null means "we could not ask" and
  // renders as such; an empty list is a real answer about a well-covered range.
  // Collapsing them would report an outage as "no opportunities" — and there is
  // deliberately no local recompute to fall back to.
  const down = await withFetch(
    async () => { throw new Error("connection refused"); },
    (api) => api.getOpportunities(BRAND),
  );
  assert.equal(down, null);

  const errored = await withFetch(
    async () => ({ ok: false, status: 500, json: async () => ({}) }),
    (api) => api.getOpportunities(BRAND),
  );
  assert.equal(errored, null);
});

test("no brand asks the engine nothing", async () => {
  const calls = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const empty = await withFetch(calls, (api) => api.getOpportunities(null));
  assert.equal(empty, null);
  assert.equal(calls.mock.callCount(), 0, "an empty question is not asked");
});

test("the screen has no local gap computation left to fall back to", async () => {
  // The regression this guards is a re-import: someone restoring "just a
  // fallback" would restore the defect, because the fallback IS the defect.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../components/views/Opportunities.jsx", import.meta.url), "utf8");
  // Mentions are fine — the file explains at length why it no longer does this,
  // and that explanation is the thing most likely to stop a future "fallback".
  // What must not come back is an IMPORT or a CALL.
  assert.ok(!/from ["']@\/lib\/whitespace["']/.test(src),
    "Opportunities must not import the browser category rules");
  assert.ok(!/\bfindWhitespace\s*\(/.test(src),
    "Opportunities must not compute gaps in the browser");
});

// ---------------------------------------------------------------------------
// The two P0s from the 2026-08-11 review — both one-line regressions
// ---------------------------------------------------------------------------

test("⚠ the engine card runs the SELECTED brand, never the first one listed", async () => {
  // Live at the time of the review: the sidebar read "BY COMPLOT" while
  // `GET /brands[0]` was Meridian, so "Correr demo" queued a run and wrote DNA
  // on a brand the person was not looking at. Tenancy does not catch it either
  // — pilot/demo mode carries no token, so the write went through.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../components/views/Integrations.jsx", import.meta.url), "utf8");

  // The file QUOTES the old expression in the comment explaining why it went —
  // and that explanation is the thing most likely to stop it coming back. What
  // must not exist is the ASSIGNMENT.
  assert.ok(!/const brand = status\?\.brands\?\.\[0\]/.test(src),
    "the engine card must not take the first brand the API happens to list");
  assert.match(src, /find\(\(b\) => b\.id === activeBrandId\)/,
    "the subject must be the active brand");
  // And no stand-in when the active brand is absent: `|| null`, never `|| [0]`.
  assert.match(src, /=== activeBrandId\) \|\| null/);
});

test("⚠ EVERY path into the collection consults can_attach, not just one", async () => {
  // The 08-11 pass gated the automatic "Crear primera cápsula" button and left
  // the manual tray send ungated, so the sandbox still leaked onto the
  // collection board. Gating one of two doors is not gating.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../components/StudioExplore.jsx", import.meta.url), "utf8");

  assert.match(src, /function attachRefused\(\)/,
    "one refusal, shared by every path");
  assert.match(src, /function sendToCollection\(\)[\s\S]{0,120}attachRefused\(\)/,
    "the manual tray send must consult it");
  assert.match(src, /if \(autoPromote && !attachRefused\(\)\)/,
    "the automatic promotion must consult the same function");
  // The THIRD door, added with the free prompt box: the same refusal, checked
  // before anything reaches the board. The count below caught it while it was
  // unreviewed; this line is what keeps it caught after the count moved.
  assert.match(src, /function sendFreeToCollection\([\s\S]{0,120}attachRefused\(\)/,
    "the free-prompt send must consult it");

  // ⚠ THE COUNT IS THE TRIPWIRE, AND BUMPING IT IS ONLY HALF AN ANSWER. Each
  // caller of onSendToCollection is a door onto the collection board; the count
  // exists so a NEW one cannot appear without a person looking at it. It has
  // now fired once and been answered properly — the free-prompt path was
  // verified to sit behind `attachRefused()` and pinned by name above. Raising
  // this number without adding that assertion would turn a guard into a
  // formality.
  const sends = src.match(/onSendToCollection\(/g) || [];
  assert.equal(sends.length, 3,
    "a new path into the collection must go through attachRefused()");
});

test("the engine build travels instead of being fetched and dropped", async () => {
  const body = await withFetch(
    async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes("/healthz")
        ? { status: "ok", mode: "demo", build: { commit: "4507ed1" } }
        : [{ id: BRAND, name: "Complot" }]),
    }),
    (api) => api.getEngineStatus(),
  );
  // `/healthz` has carried the loaded commit since the stale-server fix — whose
  // entire purpose was that a server cannot fail to say it is stale. Awaiting
  // that payload and discarding it reinstated the problem.
  assert.equal(body.build.commit, "4507ed1");
  assert.equal(body.mode, "demo");
});
