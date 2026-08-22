"use client";
// Biblioteca — the market style library (the Zhiyi-shaped organ, 2026-07-20
// platform-shape decision) + the EDITED-shaped analytics strip, in one screen.
// Everything is the real dated harvest: every card has a real image, a real
// store and a real published date, or it doesn't qualify (engine contract).
// The analytics strip is computed over the CURRENT filter — the charts always
// describe exactly what the grid shows. Price architecture only appears with
// a single store selected (the harvest mixes currencies; cross-store price
// stats would be a number-shaped lie — the engine refuses to compute them).
// Every card ends in an action: use it as a Studio reference.
import { useCallback, useEffect, useRef, useState } from "react";

import ExportButton from "../ExportButton";
import { useBrandId } from "@/components/EngineProvider";
import { stampHandoff } from "@/lib/handoff.mjs";
import { engineFetch } from "@/lib/auth";

// ⚠ Engine calls go through `engineFetch`, which attaches the bearer token.
// A plain `fetch` works in demo mode and 401s the moment production auth is
// on (owner security review, 2026-08-12) — the screen would simply go blank
// for an authenticated user, which is the hardest kind of break to attribute.
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
const BRIEF_KEY = "atelier-design-brief";
const PAGE = 60;
const DAYS = [[7, "7 días"], [30, "30 días"], [90, "90 días"], [180, "180 días"]];
const ORDERS = [["recent", "Más nuevo"], ["price_asc", "Precio ↑"], ["price_desc", "Precio ↓"]];

const fmtN = (v) => (v == null ? "—" : Math.round(v).toLocaleString("es-AR"));
const fmtD = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ---------------------------------------------------------------- styles -- */

// ⚠ MOUNTED AS `dangerouslySetInnerHTML`, never as a `<style>{CSS}</style>`
// text child: React escapes `>` and `"` when it serialises a text child on the
// server, the browser does not unescape inside <style>, and the mismatch makes
// React throw the whole tree away on every load. See tests/styleHydration.
// ⚠ 11px IS THE FLOOR. Nothing below it, anywhere in this file.
const CSS = `
/* ============ Biblioteca — lb2- ====================================
   The evidence library. Every tile is a real garment with a real store,
   a real date and a real photograph, so the design job is provenance:
   source, date and link legible on every row. Blue only on the two
   things you can press. A SELECTED filter is not an invitation, so it
   reads ink-on-paper rather than blue. */

.lb2 { min-width: 0; container-type: inline-size; container-name: lb2; }

/* ---- header ---- */
.lb2-head { margin: 0 0 var(--s4); }
.lb2-eyebrow {
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s2);
}
.lb2-title {
  font-family: var(--serif); font-size: 36px; font-weight: 600;
  line-height: 1.08; letter-spacing: -.015em; color: var(--ink); margin: 0 0 var(--s2);
}
.lb2-lede {
  font-size: 14px; line-height: 1.55; color: var(--ink-2); margin: 0; max-width: 66ch;
}

/* ---- filters. The selected one is ink on paper: it is a state, not a CTA ---- */
.lb2-filters {
  display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap;
  margin: 0 0 var(--s3);
}
.lb2-search {
  flex: 1; min-width: 220px; display: flex; align-items: center; gap: var(--s2);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 9px 13px; color: var(--ink-3);
}
.lb2-search input {
  border: none; background: none; outline: none;
  font-size: 13px; width: 100%; color: var(--ink);
}
.lb2-sel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 9px 11px;
  font-size: 12px; font-weight: 600; color: var(--ink-2); max-width: 190px;
}
.lb2-chips {
  display: flex; border: 1px solid var(--line); border-radius: var(--r-sm);
  overflow: hidden; background: var(--surface);
}
.lb2-chips button {
  border: none; background: none; cursor: pointer;
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .04em; padding: 9px 12px; color: var(--ink-3);
}
.lb2-chips button:hover { color: var(--ink); }
.lb2-chips button.on { background: var(--paper-2); color: var(--ink); font-weight: 600; }
.lb2-push { margin-left: auto; }

/* ---- the counts the component already computed, hairline-separated ---- */
.lb2-counts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1px; background: var(--hair);
  border: 1px solid var(--line); border-radius: var(--r);
  box-shadow: var(--shadow); overflow: hidden; margin: 0 0 var(--s3);
}
.lb2-count { background: var(--surface); padding: 13px 16px; }
.lb2-count span {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
  margin-bottom: 7px; line-height: 1.35;
}
.lb2-count b {
  display: block; font-family: var(--disp); font-size: 21px; font-weight: 600;
  line-height: 1; letter-spacing: -.01em; font-variant-numeric: tabular-nums;
  color: var(--ink);
}
/* An outage is not a count of zero, and it does not get to look like one. */
.lb2-count b.none {
  font-family: var(--d); font-size: 12px; font-weight: 500;
  letter-spacing: 0; color: var(--ink-3);
}

/* ---- analytics over the CURRENT filter ---- */
.lb2-an {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(238px, 1fr));
  gap: var(--s3); margin: 0 0 var(--s5);
}
.lb2-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s4);
}
.lb2-k {
  display: flex; justify-content: space-between; align-items: baseline; gap: var(--s2);
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-3); margin: 0 0 var(--s3);
}
.lb2-k b {
  color: var(--ink); font-weight: 600; letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.lb2-spark { display: flex; align-items: flex-end; gap: 2px; height: 52px; }
.lb2-bar { flex: 1; height: 100%; display: flex; align-items: flex-end; cursor: default; }
.lb2-bar i {
  display: block; width: 100%; background: var(--ink-2);
  border-radius: 2px 2px 0 0; min-height: 3px;
}

.lb2-row { display: flex; align-items: center; gap: var(--s2); margin-bottom: 6px; }
.lb2-nm {
  flex: none; width: 96px; font-family: var(--d); font-size: 11px; color: var(--ink-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lb2-track { flex: 1; height: 8px; border-radius: 99px; background: var(--paper-2); overflow: hidden; }
.lb2-track i { display: block; height: 100%; background: var(--ink-2); border-radius: 99px; }
.lb2-v {
  flex: none; width: 40px; text-align: right; font-family: var(--d);
  font-size: 11px; font-weight: 600; color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.lb2-range { position: relative; height: 34px; margin-top: var(--s4); }
.lb2-range .track { position: absolute; left: 0; right: 0; top: 14px; height: 8px; border-radius: 99px; background: var(--paper-2); }
.lb2-range .band { position: absolute; top: 14px; height: 8px; border-radius: 99px; background: var(--hair-2); }
.lb2-range .mid { position: absolute; top: 11px; width: 2px; height: 14px; border-radius: 2px; background: var(--ink); }
.lb2-range .lbl {
  position: absolute; top: -7px; transform: translateX(-50%);
  font-family: var(--d); font-size: 11px; font-weight: 600; color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
/* The honest gap: what the harvest does not support, said in words. */
.lb2-honest { font-size: 12px; line-height: 1.55; color: var(--ink-3); }

/* ---- the waterfall of evidence ---- */
.lb2-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(182px, 1fr));
  gap: var(--s3);
}
.lb2-it {
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); transition: border-color .14s;
}
.lb2-it:hover { border-color: var(--ink-3); }
.lb2-fig { aspect-ratio: 3 / 4; background: var(--paper-2); position: relative; }
.lb2-fig img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lb2-when {
  position: absolute; top: 8px; left: 8px;
  font-family: var(--d); font-size: 11px; font-variant-numeric: tabular-nums;
  background: var(--night); color: #C9CBD2; border-radius: 999px; padding: 3px 8px;
}
.lb2-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
.lb2-t {
  font-size: 13.5px; font-weight: 600; color: var(--ink); line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; min-height: 35px;
}
.lb2-m {
  display: flex; justify-content: space-between; gap: 6px;
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
}
.lb2-m .lb2-store { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb2-m b { color: var(--ink-2); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.lb2-m b span { font-weight: 400; color: var(--ink-3); }
.lb2-acts { display: flex; align-items: center; gap: var(--s2); margin-top: auto; }
.lb2-use {
  flex: 1; border: none; border-radius: var(--r-xs); background: var(--cobalt); color: #fff;
  font-size: 12px; font-weight: 600; padding: 8px 7px; cursor: pointer;
}
.lb2-use:hover { opacity: .9; }
.lb2-out {
  flex: none; font-size: 12.5px; font-weight: 600; color: var(--cobalt);
  text-decoration: none; padding: 8px 2px; white-space: nowrap;
}
.lb2-out:hover { text-decoration: underline; }

.lb2-more {
  display: block; margin: var(--s4) auto 0;
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface);
  font-size: 12.5px; font-weight: 600; padding: 10px 22px; cursor: pointer; color: var(--cobalt);
}
.lb2-more:hover { border-color: var(--cobalt); }
.lb2-more:disabled { color: var(--ink-3); cursor: default; }

/* ---- empty and outage: calm, centered, and never the same sentence ---- */
.lb2-empty {
  background: var(--surface); border: 1px dashed var(--hair-2); border-radius: var(--r);
  padding: var(--s6) var(--s5); text-align: center;
  font-size: 13px; line-height: 1.65; color: var(--ink-2);
}
.lb2-empty b {
  display: block; font-family: var(--serif); font-size: 22px; font-weight: 600;
  letter-spacing: -.01em; color: var(--ink); margin: 0 0 var(--s2);
}
.lb2-empty p { margin: 0 auto; max-width: 56ch; }
.lb2-retry {
  margin-top: var(--s3); border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--surface); font-size: 12.5px; font-weight: 600;
  padding: 9px 18px; cursor: pointer; color: var(--cobalt);
}
.lb2-retry:hover { border-color: var(--cobalt); }

.lb2-toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: var(--night); color: #C9CBD2; font-family: var(--d); font-size: 12px;
  border-radius: var(--r-sm); padding: 11px 16px; z-index: 60;
}

@container lb2 (max-width: 620px) {
  .lb2-title { font-size: 30px; }
  .lb2-push { margin-left: 0; }
}
`;

// Single-series bar sparkline: one hue, thin rounded bars, per-bar tooltip.
function WeeklyBars({ weekly }) {
  const max = Math.max(...weekly.map((w) => w.n), 1);
  return (
    <div className="lb2-spark" role="img" aria-label="Novedades por semana">
      {weekly.map((w) => (
        <div key={w.wk} className="lb2-bar" title={`semana del ${fmtD(w.wk)}: ${w.n} productos`}>
          <i style={{ height: `${Math.max(6, (w.n / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function Library({ onNavigate }) {
  const brandId = useBrandId();
  const [q, setQ] = useState("");
  const [store, setStore] = useState("");
  const [days, setDays] = useState(90);
  const [order, setOrder] = useState("recent");
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);   // latest response (aggregates ride along)
  const [items, setItems] = useState([]);   // accumulated pages
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false); // engine unreachable — NOT "zero results"
  const [toast, setToast] = useState("");
  const reqRef = useRef(0);

  const dq = useDebounced(q, 350);

  const fetchPage = useCallback(async (offset) => {
    const id = ++reqRef.current;
    setBusy(true);
    try {
      const p = new URLSearchParams({ q: dq, store, days: String(days), order, limit: String(PAGE), offset: String(offset) });
      const res = await engineFetch(`${API_BASE}/observatory/library?${p}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      if (id !== reqRef.current) return; // a newer filter superseded this request
      setError(false);
      setData(d);
      setItems((prev) => (offset === 0 ? d.items : [...prev, ...d.items]));
    } catch {
      // A failed request is the engine not answering — NOT the market being
      // empty. Flag it as an outage; never let it read as "no store published
      // anything" (the same false-conclusion class as "0 trends").
      if (id === reqRef.current) { setError(true); if (offset === 0) { setData(null); setItems([]); } }
    }
    if (id === reqRef.current) setBusy(false);
  }, [dq, store, days, order]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  // Export the ENTIRE active filter, not just the loaded pages. Walks every
  // page (endpoint offset ceiling is 5000) so the CSV is never a silent partial.
  const fetchAllForExport = useCallback(async () => {
    const out = [];
    for (let offset = 0; offset <= 5000; offset += 200) {
      const p = new URLSearchParams({ q: dq, store, days: String(days), order, limit: "200", offset: String(offset) });
      const res = await engineFetch(`${API_BASE}/observatory/library?${p}`);
      if (!res.ok) break;
      const d = await res.json();
      const batch = d.items || [];
      out.push(...batch);
      if (batch.length < 200 || out.length >= (d.total ?? out.length)) break;
    }
    return out;
  }, [dq, store, days, order]);
  useEffect(() => {
    engineFetch(`${API_BASE}/observatory/library/stores?days=180`)
      .then((r) => r.json()).then((r) => setStores(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  function sendToStudio(it) {
    try {
      // Stamped: Studio refuses a handoff whose brand it cannot verify.
      localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff({
        trend: it.title,
        summary: `Referencia real del mercado: ${it.store}${it.price ? ` (precio local ${fmtN(it.price)})` : ""}, publicada ${fmtD(it.published_at)}.`,
        rationale: "Biblioteca — precedente de mercado elegido a mano.",
        colors: [], fabric: null, typology: it.product_type || null,
        sources: [it.store], urls: it.url ? [it.url] : [], image: it.image_url,
      }, { brandId, collectionNeutral: true })));
    } catch { /* lleno */ }
    setToast(`${it.title.slice(0, 40)} → brief del Studio`);
    clearTimeout(window.__lbt); window.__lbt = setTimeout(() => setToast(""), 2000);
    onNavigate?.("studio");
  }

  const total = data?.total ?? 0;
  const price = data?.price;

  return (
    <section className="lb2">
      {/* ⚠ First child of the one root every branch returns through, so no
          state of this screen can paint before its stylesheet. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="lb2-head">
        <div className="lb2-eyebrow">Inteligencia · Mercado global</div>
        <h1 className="lb2-title">Biblioteca</h1>
        <p className="lb2-lede">Todo lo que cayó en tiendas reales, con fecha, buscable. Cada prenda existe en el crawl — imagen real, tienda real, fecha real — y cualquiera puede volverse referencia de diseño en un click.</p>
      </div>

      <div className="lb2-filters">
        <label className="lb2-search">⌕<input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá por prenda o categoría — denim, cargo, satén…" /></label>
        <select className="lb2-sel" value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="">Todas las tiendas</option>
          {stores.map((s) => <option key={s.store} value={s.store}>{s.store} ({s.n})</option>)}
        </select>
        <div className="lb2-chips">
          {DAYS.map(([d, l]) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{l}</button>)}
        </div>
        <div className="lb2-chips">
          {ORDERS.map(([o, l]) => <button key={o} className={order === o ? "on" : ""} onClick={() => setOrder(o)}>{l}</button>)}
        </div>
        <span className="lb2-push">
          <ExportButton filename={`biblioteca${store ? "-" + store : ""}`} rows={items} fetchRows={fetchAllForExport} columns={[
            { key: "title", header: "titulo" },
            { key: "store", header: "tienda" },
            { key: "product_type", header: "categoria" },
            { key: "price", header: "precio_moneda_tienda" },
            { key: "currency", header: "moneda" },
            { key: "published_at", header: "publicado" },
            { key: "url", header: "url" },
          ]} />
        </span>
      </div>

      {/* The counts, exactly the ones already computed: the filter's total, what
          is on screen, and the window that produced them. An outage says so
          instead of standing in as a zero. */}
      <div className="lb2-counts">
        <div className="lb2-count">
          <span>prendas en el filtro actual</span>
          {/* Nothing answered yet is not "0 prendas". Until the engine replies
              this cell has no number, and says so. */}
          <b className={error || !data ? "none" : undefined}>
            {error ? "motor sin respuesta" : data ? fmtN(total) : "—"}
          </b>
        </div>
        <div className="lb2-count">
          <span>cargadas en pantalla</span>
          {/* ⚠ THE CELL BESIDE THIS ONE LEARNED THIS LESSON AND THIS ONE DID
              NOT. The 90-day window is ~32k rows and the first page takes
              ~2.3s, during which this printed a hard 0 next to "90 días" —
              read, correctly, as "zero garments in 90 days" on the screen
              whose whole job is evidence. Nothing has answered yet is not a
              count of zero, here either. */}
          <b className={!data && !error ? "none" : undefined}>
            {data || error ? fmtN(items.length) : "—"}
          </b>
        </div>
        <div className="lb2-count">
          <span>ventana observada</span>
          <b>{days} días</b>
        </div>
      </div>

      {data && (
        <div className="lb2-an">
          <div className="lb2-card">
            <div className="lb2-k">Novedades por semana <b>{fmtN(total)}</b></div>
            {data.weekly?.length ? <WeeklyBars weekly={data.weekly} /> : <div className="lb2-honest">sin datos en la ventana</div>}
          </div>
          <div className="lb2-card">
            <div className="lb2-k">Mix de tiendas <span>en este filtro</span></div>
            {(data.stores || []).slice(0, 5).map((s) => {
              const max = data.stores[0]?.n || 1;
              return (
                <div className="lb2-row" key={s.store} title={`${s.store}: ${s.n} prendas`}>
                  <span className="lb2-nm">{s.store}</span>
                  <span className="lb2-track"><i style={{ width: `${(s.n / max) * 100}%` }} /></span>
                  <span className="lb2-v">{fmtN(s.n)}</span>
                </div>
              );
            })}
          </div>
          <div className="lb2-card">
            <div className="lb2-k">Arquitectura de precios {store && <b>{store}</b>}</div>
            {price?.priced ? (() => {
              const lo = price.p25, hi = price.p75, mid = price.p50;
              const span = Math.max(hi - lo, 1);
              const pad = span * 0.35;
              const x = (v) => `${Math.min(96, Math.max(4, ((v - (lo - pad)) / (span + 2 * pad)) * 100))}%`;
              return (
                <div className="lb2-range" title={`p25 ${fmtN(lo)} · mediana ${fmtN(mid)} · p75 ${fmtN(hi)} (${price.priced} con precio, moneda local de ${store})`}>
                  <span className="track" />
                  <span className="band" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
                  <span className="mid" style={{ left: x(mid) }} />
                  <span className="lbl" style={{ left: x(lo) }}>{fmtN(lo)}</span>
                  <span className="lbl" style={{ left: x(mid), top: 26 }}>{fmtN(mid)}</span>
                  <span className="lbl" style={{ left: x(hi) }}>{fmtN(hi)}</span>
                </div>
              );
            })() : (
              <div className="lb2-honest">
                {store ? "esta tienda no publica precios legibles" :
                  "elegí UNA tienda para ver precios — el crawl mezcla monedas y un promedio entre monedas sería un número mentiroso"}
              </div>
            )}
          </div>
        </div>
      )}

      {error && items.length === 0 ? (
        <div className="lb2-empty">
          <b>No pudimos consultar el motor.</b>
          <p>
            Esto NO quiere decir que el mercado esté vacío — quiere decir que la
            consulta al Observatorio falló. Antes de afirmar que ninguna tienda
            publicó nada, preferimos decirte que no pudimos preguntar.
          </p>
          <button className="lb2-retry" onClick={() => fetchPage(0)}>Reintentar</button>
        </div>
      ) : items.length === 0 && !busy ? (
        <div className="lb2-empty">
          <b>Nada en el crawl para este filtro.</b>
          <p>Probá con otra palabra o una ventana más larga — si no está acá, ninguna tienda observada lo publicó.</p>
        </div>
      ) : items.length === 0 ? (
        // busy, and nothing on screen yet. Without this branch the page fell
        // through to an EMPTY GRID: a blank screen under a "0", for the
        // seconds the query takes. The three states this screen must never
        // collapse are "no pudimos preguntar", "preguntamos y no hay" and
        // "todavía estamos preguntando" — the last one had no branch.
        <div className="lb2-empty">
          <b>Consultando el Observatorio…</b>
          <p>
            La ventana de {days} días son decenas de miles de prendas y la
            primera página tarda unos segundos. Todavía no sabemos cuántas
            hay — esto no es un cero.
          </p>
        </div>
      ) : (
        <>
          <div className="lb2-grid">
            {items.map((it) => (
              <div className="lb2-it" key={it.url}>
                <div className="lb2-fig">
                  <img src={it.image_url} alt={it.title} loading="lazy" referrerPolicy="no-referrer" />
                  <span className="lb2-when">{fmtD(it.published_at)}</span>
                </div>
                <div className="lb2-body">
                  <div className="lb2-t">{it.title}</div>
                  <div className="lb2-m"><span className="lb2-store">{it.store}</span>{it.price != null && <b>{fmtN(it.price)} <span>local</span></b>}</div>
                  <div className="lb2-acts">
                    <button className="lb2-use" onClick={() => sendToStudio(it)}>Usar en Studio →</button>
                    {it.url && <a className="lb2-out" href={it.url} target="_blank" rel="noreferrer">Ver fuente ↗</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {items.length < total && (
            <button className="lb2-more" disabled={busy} onClick={() => fetchPage(items.length)}>
              {busy ? "Cargando…" : `Cargar más (${fmtN(total - items.length)} restantes)`}
            </button>
          )}
        </>
      )}

      {toast && <div className="lb2-toast">{toast}</div>}
    </section>
  );
}
