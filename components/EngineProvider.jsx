"use client";
// Engine state, app-wide — and the distinction the whole app hangs off.
//
// THERE ARE TWO DIFFERENT FACTS HERE, and conflating them was a real defect
// (found 2026-07-25 while verifying a seeded collection that could not be
// opened):
//
//   CONNECTED — the engine answers and a brand is resolved. Everything in the
//     collection GRAPH is readable: collections, briefs, range plans, concepts,
//     approvals, launches, results, the critical path, the taste team. None of
//     that comes from a pipeline run; it is rows a team created.
//
//   status === "live" — a completed engine RUN payload exists for that brand.
//     Only the market-intelligence surfaces need it: trends, DNA, proposals,
//     competitor scoring, visual search.
//
// Before this, `brandId` was set ONLY when a run existed, so a brand without
// one was treated as entirely offline and every screen fell back to sample
// data. The consequence is worse than an unreachable demo collection: a brand
// could be onboarded, have its whole collection set up, approved and launched,
// and still look like an empty product until somebody remembered to trigger a
// pipeline run that none of those screens read.
//
// `status` keeps its old meaning on purpose, so every run-dependent screen is
// untouched by this change. Graph screens use `useBrandId()` below.
//
// Scenario/tenant selection (2026-07-22): when the engine serves more than one
// brand the topbar shows a selector. The choice persists per browser in
// localStorage; NEXT_PUBLIC_ATELIER_BRAND stays the default.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getEngineStatus, getLatestResult, getTrendHistory } from "@/lib/api";
import { matchBrand, readBrandPref, writeBrandPref } from "@/lib/brandPref";
import { adaptPayload } from "@/lib/engineAdapter";
import { BRAND } from "@/lib/config";

const DEMO = { status: "demo", resolved: true, connected: false,
               hasRun: false, brands: [] };

// ⚠ THE APP USED TO START BY CLAIMING "DEMO" (owner review, 2026-08-13):
// *"Engine initialization also begins in DEMO, not loading. On reload I briefly
// saw 'Datos de muestra' and an unavailable collection centre before the real
// tenant loaded."*
//
// `useState(UNRESOLVED)` is an answer, and at that moment nothing has been asked yet.
// The health check has not returned, no brand is resolved, and the app tells a
// real tenant their screen is sample data — a claim that is not merely
// premature but false, and in the direction this product cares most about.
// "Not yet known" is a state, and it is the honest one to start in: `resolved`
// is false until `loadEngine` has actually answered, and every screen that
// speaks about data provenance must wait for it.
const UNRESOLVED = { status: "loading", resolved: false, connected: false,
                     hasRun: false, brands: [] };

const EngineCtx = createContext({
  ...UNRESOLVED, refresh: async () => {}, setBrand: () => {},
});

async function loadEngine(preferred) {
  const st = await getEngineStatus().catch(() => null);
  const brands = st?.brands || [];

  if (!st?.healthy) {
    // The only state that justifies the whole app falling back to sample data:
    // nothing is readable, so nothing on screen is real.
    return { ...DEMO, reason: "unreachable", brands };   // DEMO carries resolved: true
  }

  // ⚠ ALIVE IS NOT READY, AND NOT-READY IS NOT DEMO (owner review, 2026-08-14).
  // `/healthz` is liveness with no dependencies; `/readyz` checks the database
  // and the migration head. A box whose Postgres was down or whose migrations
  // were behind reported healthy, and every screen then asked for data it could
  // not serve and read the errors as emptiness.
  //
  // Crucially this does NOT fall back to sample data. The brand's real data
  // exists and is temporarily unreachable — painting invented numbers over it
  // is worse than saying so, and avoiding exactly that is why the demo fallback
  // was narrowed to `unreachable` in the first place. `resolved: true` because
  // we DID get an answer; `status: "unready"` so nothing mistakes it for demo.
  if (st.ready === false) {
    return { ...UNRESOLVED, resolved: true, status: "unready",
             reason: "not-ready", readiness: st.readiness || null, brands };
  }

  // Resolve the brand WITHOUT caring whether it has a run. Same resolution
  // order as everywhere else, and never `brands[0]` — that fallback silently
  // bound every write to whichever tenant the API happened to list first.
  const want = preferred || readBrandPref() || BRAND;
  const selected = matchBrand(brands, want) || null;

  const base = {
    resolved: true,
    brands,
    connected: Boolean(selected),
    brandId: selected?.id || null,
    brandName: selected?.name || null,
    hasRun: Boolean(selected?.has_result),
    // 'real' | 'synthetic' | 'mixed' — the ENGINE's typed answer (0063), never
    // inferred here. `connected` proves the engine answered; it does not prove
    // the rows are a real brand's, and conflating the two had the app introduce
    // "Marca Piloto (datos inventados)" as a real collection. Null when the
    // engine predates the column or no brand resolved: unknown stays unknown.
    dataClassification: selected?.data_classification || null,
  };

  if (!selected) {
    return { ...base, status: "demo", reason: "no-brand" };
  }
  if (!selected.has_result) {
    // THE CASE THIS FIX EXISTS FOR. The graph is fully readable; only the
    // market surfaces have nothing to show, and they say so themselves.
    return { ...base, status: "demo", reason: "no-run" };
  }

  const latest = await getLatestResult(selected.name);
  if (!latest) {
    // The brand claims a result and it could not be loaded. A different
    // problem from having no run, and it must not read as one.
    return { ...base, status: "demo", reason: "run-unreadable" };
  }
  const history = await getTrendHistory(latest.brand.id);
  return {
    ...base,
    status: "live",
    brandId: latest.brand.id,
    ...adaptPayload(latest.result.data, history),
  };
}

export function EngineProvider({ children }) {
  const [state, setState] = useState(UNRESOLVED);

  const refresh = useCallback(async () => {
    setState((await loadEngine(readBrandPref())) || DEMO);
  }, []);

  const setBrand = useCallback(async (name) => {
    writeBrandPref(name);
    setState((await loadEngine(name)) || DEMO);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadEngine(readBrandPref()).then((next) => {
      if (!cancelled && next) setState(next);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <EngineCtx.Provider value={{ ...state, refresh, setBrand }}>
      {children}
    </EngineCtx.Provider>
  );
}

export function useEngine() {
  return useContext(EngineCtx);
}

// The brand id for anything reading the COLLECTION GRAPH — collections,
// briefs, plans, concepts, approvals, launches, results, the critical path,
// the taste team.
//
// Use this instead of `engine.status === "live" ? engine.brandId : null`, which
// is the old idiom and is wrong for graph screens: it demands a pipeline run
// none of them read. Screens that genuinely need run data (trends, DNA,
// proposals, visual search) keep checking `status === "live"`.
export function useBrandId() {
  const engine = useEngine();
  return engine.connected ? engine.brandId : null;
}
