"use client";
// The ACTIVE brand's own catalog, for every surface that needs to say
// "your catalog" and mean it.
//
// 2026-07-24 audit: house palette, house silhouettes, price bands, whitespace
// gaps and generation reference images were all derived from `lib/catalog.js` —
// 36 Complot products compiled into the bundle. Whichever brand was selected,
// those screens showed Complot's and called them the user's own (Design Studio
// literally rendered "derivadas de tus 36 prendas reales"). This hook replaces
// that with the engine's per-brand answer.
//
// Returns { products, visualArchive, prices, total, loading, source, note }.
// `products` is []
// — never a stand-in — while loading, when the engine is down, and when the
// brand has nothing ingested. Callers must render the honest empty state; the
// whole point is that there is no longer anything to fall back to.
import { useEffect, useState } from "react";

import { useEngine, useBrandId } from "@/components/EngineProvider";
import { getBrandCatalog } from "@/lib/api";

const EMPTY = {
  products: [], visualArchive: [], visualReferenceCount: 0,
  prices: null, total: 0, source: null, note: null,
};

export function useBrandCatalog() {
  const engine = useEngine();
  const brandId = useBrandId();
  const [state, setState] = useState({ ...EMPTY, loading: true });

  useEffect(() => {
    let dead = false;
    if (!brandId) { setState({ ...EMPTY, loading: false }); return () => {}; }
    setState((s) => ({ ...s, loading: true }));
    getBrandCatalog(brandId).then((data) => {
      if (dead) return;
      setState({
        products: data?.products || [],
        visualArchive: data?.visual_archive || [],
        visualReferenceCount: data?.visual_reference_count || 0,
        prices: data?.prices || null,
        total: data?.total_products || 0,
        source: data?.source || null,
        note: data?.note || null,
        loading: false,
      });
    });
    return () => { dead = true; };
  }, [brandId]);

  return state;
}
