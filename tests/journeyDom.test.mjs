// The journey, actually mounted.
//
// ⚠ WHY THE PREVIOUS JOURNEY TEST WAS NOT ONE. Owner review, fourth pass
// 2026-08-12: *"It uses pure helpers and an in-memory Map. It does not mount
// Inspiration, Opportunities or Studio, switch the actual contexts, or inspect
// the resulting collection item. That is why the race and lost lineage remain
// despite the green test."*
//
// Exactly right, and it is the same mistake one level up: `journey.test.mjs`
// asserted that `claimHandoff` RETURNS `recommendation_id`, which it always
// did — while the Studio item constructor dropped it on the floor. A test of
// the helper cannot see the seam, and the seam is where every one of these
// defects has lived.
//
// So this one mounts the real screens, writes through the real producer, reads
// through the real consumer, and looks at the collection item that comes out.
import assert from "node:assert/strict";
import test from "node:test";

import "./harness/register.mjs";
import { installDom, mount, stubFetch } from "./harness/dom.mjs";

const A = { id: "aaaa1111-0000-0000-0000-00000000000a", name: "Marca A", slug: "marca-a", has_result: false };
const B = { id: "bbbb2222-0000-0000-0000-00000000000b", name: "Marca B", slug: "marca-b", has_result: false };

const CARD = {
  key: "ws-Faldas", category: "Faldas", kind: "sin-cobertura", score: 63,
  title: "Faldas — no tenés ninguno", verdict: { label: "hueco real", tone: "make" },
  yours: 0, rivals: 26, ars_rivals: 26, brands: ["47 Street"], ars_brands: ["47 Street"],
  band_gaps: [], ars_avg: 40000, ars_avg_label: "$40.000", trend: null,
  risk: "riesgo acotado", retailers_carrying: 4, prevalence: 0.108,
  per_retailer: { "47 Street": { in_category: 13, crawled: 60, share: 0.216 } },
  evidence_window: { oldest: null, newest: null, dated_items: 0, total_items: 26,
                     age_days: 1, stale: false, note: null },
  sample: [{ competitor: "47 Street", title: "FALDA CRUST", product_type: "Polleras",
             price: 39900, currency: "ARS", url: "https://x.test/1", image_url: null,
             published_at: null }],
  evidence_total: 26,
  brief: { typology: "Faldas", fabric: "", price_hint: "$40.000", note: "Categoría sin cobertura propia." },
  coherence: { agreement: 1.0, verified: true },
  title_agreement: { speaking: 26, agreeing: 23, silent: 0, agreement: 0.88,
                     measurable: true, passed: true, disagreeing: [] },
};

const MINTED = { id: "rec-9999", candidate_key: "ws-Faldas", stance: "explore" };

function baseStub(extra = {}) {
  return async (path, init) => {
    if (path === "/healthz") return { status: "ok", mode: "demo", build: { commit: "test" } };
    if (path === "/brands") return [A, B];
    if (path === "/me") return { authenticated: false, user: null };
    if (path.endsWith("/opportunities")) {
      return { brand: "Marca A", opportunities: [CARD], withheld: [], reason: null,
               panel: { retailers: 4, crawled_per_retailer: { "47 Street": 60 }, note: "…" },
               trend_categories: {}, catalog: { products: 36 }, price_bands: [] };
    }
    if (path.endsWith("/recommendations") && init?.method === "POST") return MINTED;
    for (const [suffix, body] of Object.entries(extra)) {
      if (path.endsWith(suffix)) return body;
    }
    return undefined;
  };
}

const BRIEF_KEY = "atelier-design-brief";

async function pickOpportunityUnder(brand) {
  installDom();
  localStorage.setItem("atelier-active-brand", brand.slug);
  stubFetch(baseStub());

  const { EngineProvider } = await import("@/components/EngineProvider");
  const Opportunities = (await import("@/components/views/Opportunities")).default;
  const { createElement: h, act } = await import("react");

  const view = await mount(h(EngineProvider, null, h(Opportunities, { onNavigate: () => {} })));
  // The real "Diseñar para este hueco" button — the producer under test.
  const design = [...view.container.querySelectorAll("button")]
    .find((b) => /Diseñar para este hueco/.test(b.textContent));
  assert.ok(design, "the design button never rendered — the card did not load");
  await act(async () => { design.click(); });
  return view;
}

test("JOURNEY: the recommendation survives from the card to the collection item", async () => {
  // ⚠ THE SEAM THE HELPER TEST COULD NOT SEE. The id was minted, carried by the
  // handoff, and dropped by the Studio item constructor — so a concept could
  // never prove which validated opportunity caused it, which is precisely what
  // the tech pack has to cite.
  const view = await pickOpportunityUnder(A);
  const written = JSON.parse(localStorage.getItem(BRIEF_KEY));
  await view.unmount();

  assert.equal(written.recommendation_id, "rec-9999",
    "Opportunities must mint and carry the recommendation");
  assert.equal(written.handoff.brand_id, A.id);

  // Now the consumer's own construction, through the shared body builder that
  // both Studio and the approval path use.
  const { conceptRecord } = await import("@/lib/conceptRegistry.mjs");
  const item = {
    id: "item-1", name: written.trend, silhouette: written.typology,
    recommendationId: written.recommendation_id,
    opportunityKey: written.opportunity_key,
  };
  const body = conceptRecord({ id: "coll-1", name: "AW26" }, item);

  assert.equal(body.recommendation_id, "rec-9999",
    "the concept the engine stores must cite the opportunity that caused it");
  // ⚠ And ONLY the id: the opportunity key is derived server-side from the
  // recommendation's own candidate_key, so the browser cannot pair a
  // recommendation with a label that disagrees with it.
  assert.ok(!("opportunity_key" in body),
    "the client must not supply a second description of the same cause");
});

test("JOURNEY: the same handoff cannot be opened after switching brands", async () => {
  const view = await pickOpportunityUnder(A);
  const written = JSON.parse(localStorage.getItem(BRIEF_KEY));
  await view.unmount();

  const { claimHandoff } = await import("@/lib/handoff.mjs");
  // ⚠ The key is global by design, so the payload really is sitting there when
  // Brand B's Studio mounts. The refusal is what stops it, not the storage.
  const asB = claimHandoff(written, { brandId: B.id, collectionId: "coll-2" });
  assert.equal(asB.ok, false);
  assert.equal(asB.code, "wrong_brand");
  assert.ok(asB.reason, "and the designer is told, rather than finding an empty Studio");
});

test("JOURNEY: switching brands never writes one brand's boards under another", async () => {
  // ⚠ THE RACE THE REF-BASED GUARD LEFT OPEN. The load effect set a ref to the
  // new brand BEFORE React applied the new boards, so the save effect from that
  // same render could write the still-visible previous boards under the new
  // brand's key. The next render repaired it — which makes isolation a race
  // that usually wins rather than a guarantee.
  //
  // Mounting it is the only way to see this: the pure store tests pass either
  // way, because they never render.
  installDom();
  localStorage.setItem("atelier-active-brand", A.slug);
  stubFetch(baseStub());

  const { EngineProvider } = await import("@/components/EngineProvider");
  const Inspiration = (await import("@/components/views/Inspiration")).default;
  const { createElement: h, act } = await import("react");
  const { scopedKey } = await import("@/lib/brandStore.mjs");

  // Brand A already has a board with work on it.
  const KEY = "atelier-inspiration-boards-v1";
  const aBoards = [{ id: "b-a", name: "Tablero de A", cards: [{ id: "c1" }], createdAt: "2026-08-01" }];
  localStorage.setItem(scopedKey(KEY, A.id), JSON.stringify(aBoards));

  // ⚠ THE SWITCH MUST GO THROUGH `setBrand`, WHICH IS WHAT THE TOPBAR CALLS.
  // The first version of this test wrote the pref key and fired a `storage`
  // event — and nothing listens for that, so `engine.brandId` never changed,
  // the load effect never re-ran, and the test passed with the guard REMOVED.
  // A journey test that does not move the context is the same vacuous green
  // this file exists to stop; it is only a real test because it was checked
  // against the broken code.
  let engineApi = null;
  const Probe = () => {
    const { useEngine } = probeMod;
    engineApi = useEngine();
    return null;
  };
  const probeMod = await import("@/components/EngineProvider");

  // Every write, in order, so an intermediate one cannot hide behind a repair.
  //
  // ⚠ PATCH THE PROTOTYPE, NOT THE INSTANCE. jsdom's Storage is a Proxy whose
  // `set` trap treats property assignment as a STORAGE WRITE — so
  // `localStorage.setItem = fn` quietly stores the string "fn" under the key
  // "setItem" and every real call still goes to the original method. The first
  // version of this spy did that and recorded nothing, which made the test pass
  // against the broken code for the second time.
  const writes = [];
  const proto = Object.getPrototypeOf(localStorage);
  const realSetItem = proto.setItem;
  proto.setItem = function spy(key, value) {
    writes.push({ key: String(key), value: String(value) });
    return realSetItem.call(this, key, value);
  };

  const view = await mount(
    h(EngineProvider, null, h(Probe, null), h(Inspiration, null)));
  assert.match(view.text(), /Tablero de A/, "Brand A's board did not load");
  assert.equal(engineApi.brandId, A.id, "the provider never resolved Brand A");

  await act(async () => { await engineApi.setBrand(B.slug); });
  await act(async () => {});
  assert.equal(engineApi.brandId, B.id, "the brand switch did not take effect");

  // ⚠ ASSERT ON EVERY WRITE, NOT ON THE FINAL STATE. This is the whole reason
  // the first version of this test was vacuous. Instrumenting the racy code
  // showed the leak happening and then being repaired one render later:
  //
  //   { savingBrand: B, boardsBrand: A, names: ["Tablero de A"] }  <- the leak
  //   { savingBrand: B, boardsBrand: B, names: ["Tablero 1"]    }  <- repaired
  //
  // So a final-state assertion passes against the broken code, which is exactly
  // the "usually wins" the review called out. The guarantee is that the write
  // never happens — and only a test that watches the writes can say so.
  const leaked = writes.filter(
    (w) => w.key === scopedKey(KEY, B.id) && w.value.includes("Tablero de A"));
  assert.deepEqual(leaked, [],
    "Brand A's board was written under Brand B's key, even momentarily");

  // And A's own work is untouched — isolation must not mean amnesia.
  assert.deepEqual(JSON.parse(localStorage.getItem(scopedKey(KEY, A.id))), aBoards);
  proto.setItem = realSetItem;
  await view.unmount();
});

// ---------------------------------------------------------------------------
// Studio actually consuming the handoff
// ---------------------------------------------------------------------------
// ⚠ THE GAP IN THE PREVIOUS VERSION, named by the review: *"journeyDom.test.mjs
// still does not mount Studio. It mounts Opportunities, reads the handoff,
// manually creates an item-shaped object, and calls conceptRecord(). That is
// useful integration coverage, but it does not verify Studio consumed the
// handoff or persisted the resulting item."*
//
// Correct, and the hand-built object is exactly the kind of stand-in that lets
// a seam stay broken under a green test — I wrote the item shape the assertion
// wanted rather than the shape the screen produces. This mounts the screen.

const COLLECTIONS = [
  { id: "coll-1", name: "AW26 · Primera", items: [], updated_at: "2026-08-01T00:00:00Z" },
  { id: "coll-2", name: "SS27 · Segunda", items: [], updated_at: "2026-08-01T00:00:00Z" },
];

async function mountStudio({ handoff, activeCollectionId = "coll-2" }) {
  installDom();
  localStorage.setItem("atelier-active-brand", A.slug);
  if (handoff) localStorage.setItem(BRIEF_KEY, JSON.stringify(handoff));

  const saved = [];
  stubFetch(async (path, init) => {
    if (path === "/healthz") return { status: "ok" };
    if (path === "/brands") return [A, B];
    if (path === "/me") return { authenticated: false, user: null };
    if (path.endsWith("/studio/collections")) {
      if (init?.method === "PUT" || init?.method === "POST") {
        saved.push(JSON.parse(init.body));
        return COLLECTIONS[0];
      }
      return COLLECTIONS;
    }
    if (/\/studio\/collections\/[^/]+$/.test(path) && init?.method === "PUT") {
      saved.push(JSON.parse(init.body));
      return { ...COLLECTIONS[0], ...JSON.parse(init.body) };
    }
    if (path.endsWith("/concepts")) return [];
    if (path.endsWith("/direction")) return { exists: false, status: "empty", versions: [], working_version: null, items: null };
    if (path.endsWith("/generation-readiness")) {
      return { collection: "AW26", can_generate: true, can_attach: false,
               attach_blockers: ["sin brief"], can_ground_a_run: false,
               direction_gaps: ["sin siluetas"], brief: { approved: false },
               direction: {}, sentence: "…" };
    }
    return undefined;
  });

  const { EngineProvider } = await import("@/components/EngineProvider");
  const { CollectionProvider } = await import("@/components/CollectionProvider");
  const { IdentityProvider } = await import("@/components/IdentityProvider");
  const DesignStudio = (await import("@/components/views/DesignStudio")).default;
  const { createElement: h } = await import("react");

  localStorage.setItem("atelier-active-collection", activeCollectionId);
  const view = await mount(
    h(EngineProvider, null,
      h(IdentityProvider, null,
        h(CollectionProvider, null,
          h(DesignStudio, { onNavigate: () => {} })))));
  return { view, saved, COLLECTIONS };
}

test("JOURNEY: Studio itself consumes the handoff and keeps the lineage on the item", async () => {
  const { stampHandoff } = await import("@/lib/handoff.mjs");
  const handoff = stampHandoff({
    trend: "Hueco: Faldas", typology: "Faldas", summary: "Categoría sin cobertura",
    recommendation_id: "rec-9999", opportunity_key: "ws-Faldas",
    recommendation_stance: "explore", colors: [], fabric: "",
  }, { brandId: A.id, collectionNeutral: true });

  const { view } = await mountStudio({ handoff });

  // The screen consumed it — the key is cleared, which is what "one-shot" means.
  assert.equal(localStorage.getItem(BRIEF_KEY), null,
    "Studio must consume the handoff, not leave it to be re-read on every mount");

  // And the item it built carries the cause, in the shape the SCREEN produces
  // rather than one a test wrote to match its own assertion.
  //
  // Read from the local mirror `persistColls` writes synchronously — the server
  // write is debounced and only scheduled for a versioned collection, so
  // asserting on the network would be asserting on a timer.
  const { scopedKey } = await import("@/lib/brandStore.mjs");
  const board = JSON.parse(
    localStorage.getItem(scopedKey("atelier-studio-collections-v1", A.id)) || "[]");
  const items = board.flatMap((c) => c.items || []);
  const fromGap = items.find((i) => /Hueco: Faldas/.test(i?.name || ""));
  assert.ok(fromGap, `Studio never persisted the handoff item (saw ${items.length})`);
  assert.equal(fromGap.recommendationId, "rec-9999",
    "the design must remember which opportunity caused it");
  assert.equal(fromGap.opportunityKey, "ws-Faldas");

  await view.unmount();
});
