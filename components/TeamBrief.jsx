"use client";
// "El brief" — the designer-first weekly brief. Answers ONE question for a
// designer: ¿qué prenda me conviene diseñar ahora, por qué ahora, contra qué
// referencias reales y a qué precio de mercado?
//
// Everything here is grounded in real market crawl data (/observatory/*, which
// works without a connected brand) plus the brand's own DNA palette (only when
// a run exists). No sample photo, no PM cruft, no empty-localStorage hero — the
// old TeamBrief was a project-management dashboard with a decorative stock
// signal image, and a designer opened it and did nothing.
//
// Honesty (repo rule "nothing fake, empty-and-labeled beats plausible"):
//   · market reference images are labeled as market — "ninguna es tuya".
//   · engine down / no rising category / no images / no DNA each render an
//     explicit labeled state, never fabricated filler.
import { useCallback, useEffect, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import { stampHandoff } from "@/lib/handoff.mjs";
import { readScoped, writeScoped } from "@/lib/brandStore";
import AddEvidence from "@/components/AddEvidence";
import { engineFetch } from "@/lib/auth";

// ⚠ Engine calls go through `engineFetch`, which attaches the bearer token.
// A plain `fetch` works in demo mode and 401s the moment production auth is
// on (owner security review, 2026-08-12) — the screen would simply go blank
// for an authenticated user, which is the hardest kind of break to attribute.
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
const BRIEF_KEY = "atelier-design-brief";
const CACHE_KEY = "atelier-brief-cache"; // last successful brief, for a fast/offline fallback
const TIMEOUT_MS = 14000;                // /observatory/mix+prices run ~4s WARM (full
                                         // JSONB scans); a cold first hit needs headroom
                                         // or the brief false-alarms "Motor desconectado".

const lbl = (x) => (typeof x === "string" ? x : x?.label ?? x?.name ?? "");
const usd = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "—");
const labels = (a, n) => (a || []).map(lbl).filter(Boolean).slice(0, n);

function hace(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "hoy";
  if (d === 1) return "hace 1 día";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return `hace ${m} ${m === 1 ? "mes" : "meses"}`;
}

// Per-request timeout: the load has serial phases (mix -> prices -> refs), so a
// single shared budget starves the later requests on a cold engine. Each request
// gets its own deadline instead.
async function getJSON(path, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    // Widen the deadline on the retry — the first hit is the cold one; by the
    // second, Postgres has the pages warm and answers fast. This turns the
    // cold-start "Motor desconectado" false alarm into a self-healing reload.
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS * (attempt + 1));
    try {
      const r = await engineFetch(`${API_BASE}${path}`, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((res) => setTimeout(res, 300)); // brief backoff, then retry
    } finally { clearTimeout(timer); }
  }
}

// Stamped with the brand that produced it: Studio refuses a handoff it cannot
// attribute, because an unattributed one is how Brand A's brief was designed
// under Brand B (owner review 2026-08-11).
function seedBrief(brief, brandId) {
  try { localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff(brief, { brandId, collectionNeutral: true }))); }
  catch { /* storage full — the navigation still lands on Studio */ }
}

export default function TeamBrief({ onNavigate }) {
  const engine = useEngine();
  const brandId = engine.status === "live" ? engine.brandId : null;
  // undefined = cargando · null = motor caído · objeto = datos reales
  const [data, setData] = useState(undefined);
  const [stale, setStale] = useState(null); // { at } when showing a cached brief after a failure

  const load = useCallback(async () => {
    setData(undefined); setStale(null);
    try {
      // mix is the core: without it there is no brief. prices/movement/summary
      // are optional — a single failure degrades the brief, it doesn't kill it.
      const [mix, prices, movement, summary, brandMix] = await Promise.all([
        getJSON("/observatory/mix"),
        getJSON("/observatory/prices").catch(() => ({ bands: [] })),
        getJSON("/observatory/movement?weeks=12").catch(() => []),
        getJSON("/observatory/summary").catch(() => null),
        // Brand relevance: the brand's OWN catalog composition. Optional — but
        // without it the hero is a pure market read and says so on screen.
        brandId ? getJSON(`/brands/${brandId}/catalog-mix`).catch(() => null) : Promise.resolve(null),
      ]);
        const pricesMissing = !(prices.bands || []).length;
        const bands = new Map((prices.bands || []).map((b) => [b.category, b]));
        // Don't require a band here — otherwise a momentary prices outage leaves
        // NO categories and no hero at all. We prefer a band-carrying category
        // below, but fall back to a band-less hero (partial render) over nothing.
        const cats = (mix.categories || []).filter((c) => c.newness_index != null);
        const sortedShares = cats.map((c) => c.share_pct).sort((a, b) => a - b);
        const medianShare = sortedShares.length ? sortedShares[Math.floor(sortedShares.length / 2)] : 0;

        // Rising AND material: over-represented in what's new, at or above the
        // median share (not a rounding artifact).
        const rising = cats
          .filter((c) => c.newness_index >= 1.1 && c.share_pct >= medianShare)
          .sort((a, b) => b.newness_index - a.newness_index);
        const byShare = cats.slice().sort((a, b) => b.share_pct - a.share_pct);

        // BRAND GATE (trust §8): the hero must clear market evidence AND brand
        // relevance. A market-rising category the brand has never produced is an
        // ADJACENCY — shown separately, labeled, never the recommendation. This
        // is what stopped "Calzado" being pitched to a tee-shirt brand.
        const brandCats = brandMix?.categories?.length
          ? new Map(brandMix.categories.map((c) => [c.category, c]))
          : null;
        const inBrand = (c) => brandCats?.has(c.category);
        const risingYours = brandCats ? rising.filter(inBrand) : rising;
        const adjacent = brandCats ? rising.filter((c) => !inBrand(c)).slice(0, 3) : [];
        const byShareYours = brandCats ? byShare.filter(inBrand) : byShare;

        // Prefer a brand-relevant rising category with a real price band; then
        // any brand-relevant rising; then the brand's largest market category.
        // The market-wide fallback (byShare[0]) fires ONLY when there is NO brand
        // catalog to gate against. With a brand connected, an off-brand category
        // can NEVER be the hero — we abstain (heroCat null → honest empty state)
        // rather than pitch a category the brand doesn't make. (This closes the
        // path that let "Calzado" resurface for a tee-shirt brand.)
        const heroCat = risingYours.find((c) => bands.has(c.category))
          || risingYours[0] || byShareYours[0]
          || (brandCats ? null : (byShare.find((c) => bands.has(c.category)) || byShare[0]))
          || null;
        const heroMode = risingYours.length ? "rising" : "largest";
        const heroBrand = heroCat && brandCats ? brandCats.get(heroCat.category) || null : null;

        let wall = [], total = 0;
        if (heroCat) {
          // /library's q is a literal text search on raw (English) fields, so a
          // Spanish canonical category finds nothing. category-refs filters by
          // the same canon_category() derivation /mix uses.
          const lib = await getJSON(
            `/observatory/category-refs?category=${encodeURIComponent(heroCat.category)}&days=90&limit=8`
          ).catch(() => ({ items: [] }));
          wall = (lib.items || []).filter((it) => it.image_url).slice(0, 6);
          total = wall.length;
        }
        const movers = (Array.isArray(movement) ? movement : [])
          .filter((m) => m.delta_pct != null && m.delta_pct > 0)
          .sort((a, b) => b.delta_pct - a.delta_pct).slice(0, 6);
        // The board shows only brand-relevant categories — adjacencies get their
        // own labeled strip, never mixed in as if they were recommendations.
        const board = (risingYours.length ? risingYours : byShareYours)
          .filter((c) => c.category !== heroCat?.category).slice(0, 5)
          // `brand` rides along so the row's own button can state brand fit the
          // same way the hero does. Without it the second list issued exactly
          // the imperative the first list had stopped issuing.
          .map((c) => ({ ...c, band: bands.get(c.category),
                         brand: brandCats?.get(c.category) || null }));

        const built = { heroCat, heroMode, band: heroCat ? bands.get(heroCat.category) : null,
                        wall, total, movers, board, summary, pricesMissing,
                        heroBrand, adjacent, brandGated: !!brandCats,
                        brandTotal: brandMix?.total_products || 0 };
        setData(built);
        // Cache the last successful brief so a slow/dead engine falls back to it.
        // ⚠ SCOPED. This cache was one global key, so a failed request under
        // Brand B fell back to Brand A's last successful market brief and
        // rendered it as B's — the offline path quietly crossing tenants,
        // which is the one moment a fallback is least likely to be questioned.
        writeScoped(CACHE_KEY, brandId, { at: Date.now(), data: built });
    } catch {
      // Core (mix) failed or timed out. Show the last successful brief if we have
      // one, clearly labelled as stale — otherwise the honest dead state.
      const cached = readScoped(CACHE_KEY, brandId, null);
      if (cached?.data) { setData(cached.data); setStale({ at: cached.at }); }
      else setData(null);
    }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  const dna = engine.status === "live" ? engine.dna : null;
  const palette = dna?.palette?.length ? dna.palette : [];

  // ⚠ THE IMPERATIVE USED TO TRAVEL AND THE HEDGE DID NOT.
  //
  // This summary said "Diseñá tu versión de marca" — an instruction to make a
  // specific product — and it was written into the handoff the Studio reads.
  // The honest qualification ("tomala como adyacencia, no como recomendación",
  // rendered in tb-why below) stayed on THIS screen. So the owner opened a
  // workspace whose brief commanded a garment while the same workspace
  // reported brand fit not scored, taste not calibrated, comparisons 0 of 20.
  //
  // ⚠ AND NOTHING GATED IT. api/app/gates.py exists precisely to downgrade an
  // unsupported accept, but gates.apply_to_decision is called from exactly one
  // place — api/app/routers/brands.py:330, the DECISIONS path. An opportunity
  // card never reaches it, and this brief is composed in the browser and
  // written to localStorage, so it passes no server gate at all.
  //
  // The rule (ROADMAP A16.2): with no measured brand fit, this is an
  // exploration, not a recommendation — and the verb is part of the claim.
  function designCategory(cat, band, fit = null) {
    const grounded = !!fit?.count;
    const marketRead = band
      ? `El mercado sobre-representa ${cat} en lo nuevo. Banda de precio de mercado USD ${usd(band.p25)}–${usd(band.p50)}–${usd(band.p75)}.`
      : `Dirección de mercado: ${cat}.`;
    const standing = grounded
      ? `Tu catálogo ya vive en esta categoría (${fit.count} ${fit.count === 1 ? "producto" : "productos"}, ${fit.share_pct}%), así que hay terreno propio con el que compararla.`
      : "⚠ Sin encaje de marca medido: tu catálogo no tiene productos en esta categoría, así que Atelier no puede decir si te pertenece. Exploración, no recomendación.";
    seedBrief({
      trend: `${cat} — mayor presencia en la oferta nueva`,
      typology: cat, fabric: null, colors: palette,
      summary: `${marketRead} ${standing}`,
      // Travels with the brief so the Studio can render the same caveat rather
      // than re-deriving it — or, worse, not showing it.
      brandFit: grounded
        ? { measured: true, count: fit.count, share_pct: fit.share_pct }
        : { measured: false, reason: "sin productos propios en esta categoría" },
      stance: grounded ? "opportunity" : "exploration",
      rationale: "El brief — categoría sobre-representada en publicaciones nuevas del mercado.",
      sources: (data?.wall || []).map((w) => w.store), urls: (data?.wall || []).map((w) => w.url).filter(Boolean),
      image: null,
      priceHint: band ? { p25: band.p25, p50: band.p50, p75: band.p75, currency: "USD" } : null,
    }, brandId);
    onNavigate?.("studio");
  }

  function designReference(it) {
    seedBrief({
      trend: it.title,
      summary: `Referencia real del mercado: ${it.store}${it.price != null ? ` (precio local ${it.price}${it.currency ? " " + it.currency : ""})` : ""}, publicada ${hace(it.published_at)}.`,
      rationale: "Biblioteca — precedente de mercado elegido a mano.",
      colors: [], fabric: null, typology: it.product_type || null,
      sources: [it.store], urls: it.url ? [it.url] : [], image: it.image_url,
    }, brandId);
    onNavigate?.("studio");
  }

  return (
    <section className="tb" aria-labelledby="tb-title">
      <style dangerouslySetInnerHTML={{ __html: `
        .tb{--ink0:var(--ink);color:var(--ink);padding-top:2px}
        .tb-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin:6px 0 16px;flex-wrap:wrap}
        .tb-kick{font-size:11px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:var(--cobalt);margin-bottom:6px}
        .tb h1{font-size:30px;line-height:1.04;letter-spacing:-.03em;margin:0 0 7px;font-weight:850;max-width:720px}
        .tb-sub{font-size:12px;line-height:1.5;color:var(--ink-2);max-width:640px}
        .tb-head-r{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
        .tb-pill{font-family:var(--d);font-size:11px;font-weight:700;color:var(--ink-2);background:var(--paper-2);border-radius:999px;padding:5px 11px;white-space:nowrap}
        .tb-quiet{border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);padding:8px 12px;font-size:11px;font-weight:800;cursor:pointer}
        .tb-hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,.92fr);background:var(--night);border-radius:18px;overflow:hidden;min-height:340px;box-shadow:0 14px 38px rgba(23,24,28,.12)}
        .tb-hc{padding:28px 30px 24px;display:flex;flex-direction:column;color:#fff;min-width:0}
        .tb-hk{font-size:11px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:#8FA2FF;margin-bottom:12px}
        .tb-tag{align-self:flex-start;font-size:11px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:4px 9px;margin-bottom:11px;background:rgba(143,162,255,.16);color:#BBC6FF}
        .tb-hero h2{font-size:32px;line-height:1.02;letter-spacing:-.04em;margin:0 0 10px}
        .tb-why{font-size:12.5px;line-height:1.5;color:rgba(255,255,255,.72);margin:0 0 16px;max-width:560px}
        .tb-why b{color:#fff}
        .tb-band{margin:2px 0 16px;max-width:440px}
        .tb-band-l{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:7px}
        .tb-track{position:relative;height:16px;background:rgba(255,255,255,.1);border-radius:5px}
        .tb-span{position:absolute;top:0;bottom:0;background:#8FA2FF;opacity:.5;border-radius:5px}
        .tb-med{position:absolute;top:-2px;bottom:-2px;width:2.5px;background:#fff;border-radius:2px}
        .tb-band-v{display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:700}
        .tb-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
        .tb-meta span{font-size:11px;color:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:4px 9px}
        .tb-acts{display:flex;gap:8px;margin-top:auto;flex-wrap:wrap}
        .tb-acts button{border:0;border-radius:9px;padding:11px 15px;font-size:11px;font-weight:850;cursor:pointer}
        .tb-primary{background:#fff;color:var(--night)}
        .tb-ghost{background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.16)!important}
        .tb-wall{position:relative;background:#22242B;padding:14px;display:flex;flex-direction:column;min-width:0}
        .tb-wall-l{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:9px;line-height:1.4}
        .tb-wall-l span{display:block;font-weight:600;letter-spacing:0;text-transform:none;color:rgba(255,255,255,.4);font-size:11px;margin-top:2px}
        .tb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;flex:1}
        .tb-tile{position:relative;border-radius:8px;overflow:hidden;background:#2E3038;aspect-ratio:3/4;cursor:pointer}
        .tb-tile img{width:100%;height:100%;object-fit:cover;display:block}
        .tb-tile .st{position:absolute;left:0;right:0;bottom:0;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(0deg,rgba(0,0,0,.72),transparent);padding:12px 6px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tb-tile .when{position:absolute;top:4px;right:5px;font-size:11px;color:rgba(255,255,255,.85);background:rgba(0,0,0,.4);border-radius:4px;padding:1px 4px}
        .tb-tile .use{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(40,70,216,.85);color:#fff;font-size:11px;font-weight:850;opacity:0;transition:opacity .12s}
        .tb-tile:hover .use{opacity:1}
        .tb-wall-empty{flex:1;display:flex;align-items:center;text-align:center;font-size:11px;line-height:1.5;color:rgba(255,255,255,.55);padding:0 8px}
        .tb-cols{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:10px;margin-top:10px;align-items:start}
        .tb-card{background:var(--card);border:1px solid var(--line);border-radius:15px;overflow:hidden}
        .tb-card-h{padding:13px 16px;border-bottom:1px solid var(--paper-2)}
        .tb-card-h h3{font-size:13px;margin:0 0 2px}.tb-card-h p{font-size:11px;color:var(--ink-3);margin:0}
        .tb-row{display:grid;grid-template-columns:1fr auto auto auto;gap:11px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--paper-2);font-size:11.5px}
        .tb-row:last-child{border-bottom:0}
        .tb-row .c{font-weight:750;color:var(--ink)}
        .tb-row .idx{font-size:11px;font-weight:800}.tb-row .idx.up{color:var(--sage)}
        .tb-row .med{font-size:11px;color:var(--ink-2);font-weight:700;font-variant-numeric:tabular-nums}
        .tb-row button{border:0;background:none;color:var(--cobalt);font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
        .tb-rail{padding:15px 16px}
        .tb-rail h3{font-size:12px;margin:0 0 10px}
        .tb-sw{display:flex;gap:5px;margin-bottom:11px;flex-wrap:wrap}
        .tb-sw i{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);display:block}
        .tb-adn{font-size:11px;color:var(--ink-2);line-height:1.55}.tb-adn b{color:var(--ink)}
        .tb-rail-empty{font-size:11px;line-height:1.55;color:var(--ink-3)}
        .tb-move{margin-top:10px;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:14px 16px}
        .tb-move-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:11px}
        .tb-move-h h3{font-size:13px;margin:0}.tb-move-h span{font-size:11px;color:var(--ink-3)}
        .tb-chips{display:flex;gap:7px;flex-wrap:wrap}
        .tb-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:999px;padding:6px 11px;font-size:11px;font-weight:700;color:var(--ink);cursor:pointer;background:var(--card)}
        .tb-chip b{color:var(--sage);font-size:11px}
        .tb-foot{font-size:11px;color:var(--ink-3);text-align:center;margin:16px 0 2px;line-height:1.5}
        .tb-dead{background:var(--card);border:1px dashed var(--line);border-radius:16px;padding:34px 22px;text-align:center;max-width:560px;margin:12px auto}
        .tb-dead h3{font-size:15px;margin:0 0 6px}.tb-dead p{font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:0 auto 14px;max-width:440px}
        .tb-loading{padding:40px 8px;color:var(--ink-3);font-size:12px}
        @media(max-width:1000px){.tb-hero{grid-template-columns:1fr}.tb-cols{grid-template-columns:1fr}}
        @media(max-width:560px){.tb h1{font-size:24px}.tb-hero h2{font-size:26px}.tb-grid{grid-template-columns:repeat(3,1fr)}}
      ` }} />

      {data === undefined && <div className="tb-loading">Leyendo el mercado…</div>}

      {data === null && (
        <div className="tb-dead">
          <h3>Motor desconectado</h3>
          <p>Sin datos reales del mercado no hay brief: preferimos decírtelo antes que inventar una dirección de diseño.</p>
          <button className="tb-primary" style={{ borderRadius: 9, padding: "10px 16px", fontWeight: 850, border: 0, cursor: "pointer", background: "var(--cobalt)", color: "#fff", marginRight: 8 }}
            onClick={load}>Reintentar</button>
          <button className="tb-quiet" onClick={() => onNavigate?.("studio")}>Entrar a Studio con lienzo en blanco →</button>
        </div>
      )}

      {stale && data && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 12px",
          fontSize: 11, color: "var(--ochre)", background: "var(--ochre-wash)", border: "1px solid var(--ochre)", borderRadius: 9, padding: "8px 12px" }}>
          <span>Mostrando la última lectura ({hace(new Date(stale.at).toISOString())}) — no pudimos actualizar el mercado ahora.</span>
          <button className="tb-quiet" onClick={load}>Reintentar</button>
        </div>
      )}

      {data && data.heroCat && (() => {
        const { heroCat, heroMode, band, wall, total, movers, board,
                heroBrand, adjacent = [], brandGated, brandTotal } = data;
        const cat = heroCat.category;
        // Median tick position as a real fraction of the IQR, clamped to [0,100].
        const medPos = band && band.p75 > band.p25
          ? Math.min(100, Math.max(0, ((band.p50 - band.p25) / (band.p75 - band.p25)) * 100))
          : 50;
        const nidx = (v) => (typeof v === "number" ? v.toFixed(1) : v);
        const heroH1 = heroMode === "rising"
          ? <>Esta semana crece la oferta nueva de <span style={{ color: "var(--cobalt)" }}>{cat}</span>.</>
          : <>La mayor parte de la oferta observada es <span style={{ color: "var(--cobalt)" }}>{cat}</span>.</>;
        return (
          <>
            <header className="tb-head">
              <div>
                <div className="tb-kick">Mercado · Dirección (no es el brief de colección)</div>
                <h1 id="tb-title">{heroH1}</h1>
                <div className="tb-sub">Una lectura de surtido lista para explorar, armada con publicaciones reales. Mide oferta de mercado, no demanda del consumidor.</div>
              </div>
              <div className="tb-head-r">
                {data.summary && (
                  <span className="tb-pill">
                    {(data.summary.products_distinct ?? data.summary.products_harvested ?? 0).toLocaleString("es-AR")} productos · {(data.summary.products_harvested || 0).toLocaleString("es-AR")} observaciones · {data.summary.fingerprints_computed || 0} catálogos analizados
                  </span>
                )}
                <button className="tb-quiet" onClick={() => onNavigate?.("library")}>Abrir Biblioteca →</button>
              </div>
            </header>

            <div className="tb-hero">
              <div className="tb-hc">
                <div className="tb-hk">El brief de hoy</div>
                <span className="tb-tag">{heroMode === "rising" ? "Más presente entre las publicaciones nuevas" : "Mayor peso en la oferta observada"}</span>
                <h2>{cat}</h2>
                <p className="tb-why">
                  {heroMode === "rising"
                    ? <>Sobre-representada en lo nuevo: <b>×{nidx(heroCat.newness_index)}</b> sobre su peso habitual ({heroCat.share_pct}% del surtido).</>
                    : <>Es <b>{heroCat.share_pct}%</b> del surtido observado — dirección por tamaño, no por novedad.</>}
                </p>
                <p className="tb-why" style={{ marginTop: 2 }}>
                  {heroBrand
                    ? <>Y es terreno tuyo: <b>{heroBrand.count} {heroBrand.count === 1 ? "producto" : "productos"}</b> de tu catálogo ({heroBrand.share_pct}%) {heroBrand.count === 1 ? "vive" : "viven"} en esta categoría.</>
                    : brandGated
                      ? <>⚠ Fuera de tu catálogo actual — el mercado la empuja, pero tu marca nunca produjo acá. Tomala como adyacencia, no como recomendación.</>
                      : <>Lectura de mercado pura — sin catálogo de marca conectado, este brief no está condicionado por tu identidad.</>}
                </p>
                {band && (
                  <div className="tb-band">
                    <div className="tb-band-l">Precio de mercado (USD) · oferta publicada, no ventas</div>
                    <div className="tb-track">
                      <span className="tb-span" style={{ left: 0, width: "100%" }} />
                      <span className="tb-med" style={{ left: `${medPos}%` }} />
                    </div>
                    <div className="tb-band-v"><span>p25 {usd(band.p25)}</span><span>mediana {usd(band.p50)}</span><span>p75 {usd(band.p75)}</span></div>
                  </div>
                )}
                {!band && data.pricesMissing && (
                  <div className="tb-band-l" style={{ marginBottom: 16 }}>Precio de mercado no disponible en esta lectura — el resto del brief sí es real.</div>
                )}
                <div className="tb-meta">
                  <span>{heroCat.share_pct}% del surtido</span>
                  {band && <span>{band.n.toLocaleString("es-AR")} productos</span>}
                  {band && <span>{band.stores} tiendas</span>}
                </div>
                <div className="tb-acts">
                  {/* Market Direction hands off to the BRIEF as a pinned
                      evidence link, not as a serialized object in the browser
                      (2026-07-24 review, priority 4). */}
                  <AddEvidence evidence={{
                    evidence_type: "market_observation",
                    evidence_id: `category:${cat}`,
                    relevance: `${cat} — lectura de mercado del ${new Date().toISOString().slice(0, 10)}`,
                    observed_at: data?.takenAt || null,
                  }} />
                  {/* heroBrand is this screen's ONLY measure of brand fit — it
                      is what tb-why already uses to decide between "es terreno
                      tuyo" and "tomala como adyacencia". It now travels with
                      the brief instead of being spent on one paragraph. */}
                  <button className="tb-primary" onClick={() => designCategory(cat, band, heroBrand)}>
                    {heroBrand ? `Diseñar ${cat} en Studio →` : `Explorar ${cat} en Studio →`}
                  </button>
                  <button className="tb-ghost" onClick={() => onNavigate?.("library")}>Ver referencias en Biblioteca →</button>
                </div>
              </div>
              <div className="tb-wall">
                <div className="tb-wall-l">Referencias reales del mercado<span>otras marcas, del crawl — ninguna es tuya</span></div>
                {wall.length ? (
                  <div className="tb-grid">
                    {wall.map((it) => (
                      <div className="tb-tile" key={it.url} onClick={() => designReference(it)} title={`${it.title} · ${it.store}`}>
                        <img src={it.image_url} alt={it.title} loading="lazy" referrerPolicy="no-referrer"
                          onError={(e) => { const t = e.target.closest(".tb-tile"); if (t) t.style.display = "none"; }} />
                        {it.published_at && <span className="when">{hace(it.published_at)}</span>}
                        <span className="st">{it.store}</span>
                        <span className="use">Usar en Studio →</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tb-wall-empty">El crawl no devolvió fotos para {cat} en la ventana. No rellenamos con stock.</div>
                )}
              </div>
            </div>

            {adjacent.length > 0 && (
              <div className="tb-card" style={{ marginTop: 10, borderLeft: "3px solid var(--ochre)" }}>
                <div className="tb-card-h">
                  <h3>Se mueve en el mercado — pero está fuera de tu surtido</h3>
                  <p>adyacencias, no recomendaciones: tu catálogo ({brandTotal} productos) no tiene presencia acá; entrar es una decisión estratégica, no una señal</p>
                </div>
                {adjacent.map((c) => (
                  <div className="tb-row" key={c.category}>
                    <span className="c">{c.category}</span>
                    <span className="idx up">▲ ×{nidx(c.newness_index)}</span>
                    <span className="med">{c.share_pct}% del mercado</span>
                    <span style={{ fontSize: 9.5, color: "var(--ink-3)" }}>0 productos tuyos</span>
                  </div>
                ))}
              </div>
            )}

            <div className="tb-cols">
              <div className="tb-card">
                <div className="tb-card-h">
                  <h3>El resto del tablero</h3>
                  <p>{board.length ? (heroMode === "rising" ? "otras categorías con más presencia en la oferta nueva" : "otras categorías por peso en el surtido") : "sin más categorías sobre el umbral esta semana"}</p>
                </div>
                {board.length ? board.map((c) => (
                  <div className="tb-row" key={c.category}>
                    <span className="c">{c.category}</span>
                    <span className={`idx${c.newness_index >= 1.1 ? " up" : ""}`}>{c.newness_index >= 1.1 ? "▲ " : ""}×{nidx(c.newness_index)}</span>
                    <span className="med">{c.band ? `med ${usd(c.band.p50)}` : "—"}</span>
                    <button onClick={() => designCategory(c.category, c.band, c.brand)}>
                      {c.brand ? "Diseñar →" : "Explorar →"}
                    </button>
                  </div>
                )) : (
                  <div style={{ padding: "16px", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
                    Ninguna otra categoría cruza el umbral de “en alza” esta semana. Es una señal, no una falla: el mercado está quieto.
                  </div>
                )}
              </div>

              <aside className="tb-card tb-rail">
                <h3>Tu ADN</h3>
                {dna && (palette.length || labels(dna.silhouettes, 3).length || labels(dna.materials, 4).length) ? (
                  <>
                    {palette.length > 0 && <div className="tb-sw">{palette.slice(0, 7).map((h, i) => <i key={i} style={{ background: lbl(h) }} />)}</div>}
                    <div className="tb-adn">
                      {labels(dna.silhouettes, 3).length > 0 && <div><b>Siluetas:</b> {labels(dna.silhouettes, 3).join(", ")}</div>}
                      {labels(dna.materials, 4).length > 0 && <div style={{ marginTop: 4 }}><b>Materiales:</b> {labels(dna.materials, 4).join(", ")}</div>}
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.5 }}>El crawl muestra qué están publicando las marcas; tu ADN orienta cómo podría verse una exploración propia. Ninguno de los dos prueba demanda.</div>
                  </>
                ) : (
                  <div className="tb-rail-empty">Todavía no calculamos el ADN de tu marca. Conectá tu tienda o Instagram en <b>Integraciones</b> y esta guía se llena con tus colores y siluetas reales. No inventamos una paleta.</div>
                )}
              </aside>
            </div>

            {movers.length > 0 && (
              <div className="tb-move">
                <div className="tb-move-h">
                  <h3>Qué se está acelerando</h3>
                  <span>conceptos que aparecen cada vez más seguido en catálogos reales · Δ últimas 4 semanas vs 4 previas</span>
                </div>
                <div className="tb-chips">
                  {movers.map((m) => (
                    <span className="tb-chip" key={m.concept} onClick={() => onNavigate?.("library")} title="Buscar en Biblioteca">
                      {m.concept} <b>▲{m.delta_pct}%</b>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="tb-foot">Categorías, precios e imágenes salen del crawl fechado. Los conteos son observaciones de publicaciones y pueden repetir un producto entre snapshots; no son ventas ni productos únicos.</div>
          </>
        );
      })()}

      {data && !data.heroCat && (
        <div className="tb-dead">
          <h3>El brief</h3>
          <p>{data.brandGated
            ? "Esta semana ninguna de tus categorías está entre las que se mueven en el mercado. No forzamos una dirección fuera de tu surtido."
            : "El mercado no muestra una categoría con datos suficientes para armar un brief esta semana. No forzamos una dirección inventada."}</p>
          {data.adjacent?.length > 0 && (
            <p style={{ fontSize: 11, color: "var(--ink-3)" }}>
              Se mueve en el mercado, pero fuera de tu surtido (adyacencias, no recomendaciones):{" "}
              {data.adjacent.map((c) => `${c.category} ×${(c.newness_index).toFixed(1)}`).join(" · ")}
            </p>
          )}
          <button className="tb-quiet" onClick={() => onNavigate?.("observatory")}>Ver el Observatorio →</button>
        </div>
      )}
    </section>
  );
}
