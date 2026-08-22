"use client";
// Observatory — "miramos el mercado de moda del mundo, todo el tiempo, con
// recibos". Todo lo que se ve acá sale de /observatory/* del engine, que a su
// vez sale de filas crawleadas y fechadas en Postgres. Si la API no contesta,
// esta vista lo dice — nunca inventa un número.
import { useEffect, useMemo, useState } from "react";

import ExportButton from "../ExportButton";
import { engineFetch } from "@/lib/auth";

// Same base-url logic as lib/api.js (fetches live inline by design — this
// view has its own read-only contract with the engine).
// ⚠ Engine calls go through `engineFetch`, which attaches the bearer token.
// A plain `fetch` works in demo mode and 401s the moment production auth is
// on (owner security review, 2026-08-12) — the screen would simply go blank
// for an authenticated user, which is the hardest kind of break to attribute.
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function get(path) {
  const res = await engineFetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("es-AR") : "—");

function hace(iso) {
  if (!iso) return "s/d";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 60 * 24) return `hace ${Math.round(mins / 60)} h`;
  const days = Math.round(mins / (60 * 24));
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

// A value the engine did not compute stays visibly absent. A zero standing in
// for "no lo sabemos" is the one lie this screen must never tell.
const isMissing = (v) => v === "—" || v === "s/d";

/* ---------------------------------------------------------------- styles -- */

// ⚠ MOUNTED AS `dangerouslySetInnerHTML`, never as a `<style>{CSS}</style>`
// text child: React escapes `>` and `"` when it serialises a text child on the
// server, the browser does not unescape inside <style>, and the mismatch makes
// React throw the whole tree away on every load. See tests/styleHydration.
// ⚠ 11px IS THE FLOOR. Nothing below it, anywhere in this file.
const CSS = `
/* ============ Observatorio — ob2- ==================================
   An evidence surface: every figure on it is a crawled, dated row, so
   the page is built to show provenance rather than to decorate it.
   Dense, calm, sober. Blue only on things you can press. */

.ob2 { min-width: 0; container-type: inline-size; container-name: ob2; }

/* ---- header ---- */
.ob2-head { margin: 0 0 var(--s2); }
.ob2-eyebrow {
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s2);
}
.ob2-title {
  font-family: var(--serif); font-size: 36px; font-weight: 600;
  line-height: 1.08; letter-spacing: -.015em; color: var(--ink);
  margin: 0 0 var(--s2);
}
.ob2-lede {
  font-size: 14px; line-height: 1.55; color: var(--ink-2);
  margin: 0 0 var(--s5); max-width: 66ch;
}

/* ---- the counts the engine computed, as one card with hairline cells ---- */
.ob2-panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
  overflow: hidden; margin: 0 0 var(--s6);
}
.ob2-counts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 1px; background: var(--hair);
}
.ob2-count { background: var(--surface); padding: 14px 16px; }
.ob2-count span {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 7px; line-height: 1.35;
}
.ob2-count b {
  display: block; font-family: var(--disp); font-size: 21px; font-weight: 600;
  line-height: 1; letter-spacing: -.01em; font-variant-numeric: tabular-nums;
  color: var(--ink);
}
/* Not computed is not zero. It keeps its own quiet mark. */
.ob2-count b.none {
  font-family: var(--d); font-size: 12px; font-weight: 500;
  letter-spacing: 0; color: var(--ink-3);
}
.ob2-subs {
  border-top: 1px solid var(--hair); padding: 12px 16px;
  display: flex; flex-wrap: wrap; gap: 7px 20px;
  font-family: var(--d); font-size: 11px; line-height: 1.5; color: var(--ink-3);
}
.ob2-subs b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.ob2-dim { color: var(--ink-3); }

/* ---- sections ---- */
.ob2-sect { margin: 0 0 var(--s6); }
.ob2-sect-h {
  display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap;
  margin: 0 0 var(--s3); padding: 0 0 9px; border-bottom: 1px solid var(--hair);
}
.ob2-sect-h h3 {
  margin: 0; font-family: var(--serif); font-size: 19px; font-weight: 600;
  letter-spacing: -.01em; color: var(--ink);
}
.ob2-sect-meta {
  font-family: var(--d); font-size: 11px; line-height: 1.55;
  color: var(--ink-3); max-width: 78ch;
}
.ob2-push { margin-left: auto; }
.ob2-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s4);
}

/* ---- honest states ---- */
.ob2-loading {
  font-family: var(--d); font-size: 12px; color: var(--ink-3); padding: var(--s4) 0;
}
.ob2-empty {
  border: 1px dashed var(--hair-2); border-radius: var(--r);
  background: var(--surface); padding: var(--s5) var(--s4);
  font-size: 13px; line-height: 1.6; color: var(--ink-2); text-align: center;
}
.ob2-dead {
  background: var(--surface); border: 1px dashed var(--hair-2);
  border-radius: var(--r); padding: var(--s7) var(--s5);
  text-align: center; max-width: 560px; margin: var(--s5) auto;
}
.ob2-dead-ic { font-size: 20px; color: var(--ink-3); line-height: 1; }
.ob2-dead h4 {
  font-family: var(--serif); font-size: 24px; font-weight: 600;
  letter-spacing: -.01em; color: var(--ink); margin: var(--s3) 0 var(--s2);
}
.ob2-dead p {
  margin: 0 auto; font-size: 13px; line-height: 1.6;
  color: var(--ink-2); max-width: 54ch;
}

/* ---- drops: real garments, each one a source you can open ---- */
.ob2-drops {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(174px, 1fr));
  gap: var(--s3);
}
.ob2-drop {
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
  transition: border-color .14s;
}
.ob2-drop:hover { border-color: var(--ink-3); }
.ob2-drop-fig { position: relative; aspect-ratio: 3 / 4; background: var(--paper-2); }
.ob2-drop-fig img {
  width: 100%; height: 100%; object-fit: cover; object-position: center top;
  display: block;
}
.ob2-drop-when {
  position: absolute; left: 8px; bottom: 8px;
  font-family: var(--d); font-size: 11px; font-variant-numeric: tabular-nums;
  background: var(--night); color: #C9CBD2; padding: 3px 8px; border-radius: 999px;
}
.ob2-drop-body {
  flex: 1; padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px;
}
.ob2-drop-title {
  font-size: 13.5px; font-weight: 600; line-height: 1.35; color: var(--ink);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ob2-drop-meta {
  display: flex; justify-content: space-between; gap: var(--s2);
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
}
.ob2-drop-store { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob2-drop-price { flex: none; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.ob2-drop-src { margin-top: auto; font-size: 12.5px; font-weight: 600; color: var(--cobalt); }
.ob2-drop:hover .ob2-drop-src { text-decoration: underline; }

/* ---- movement: weekly counts, one row per derived concept ---- */
.ob2-move { padding: 0 var(--s4); }
.ob2-move-head, .ob2-move-row {
  display: grid; grid-template-columns: minmax(110px, 1.1fr) minmax(0, 2fr) 74px 84px;
  gap: var(--s3); align-items: center;
}
.ob2-move-head {
  font-family: var(--d); font-size: 11px; font-weight: 500; letter-spacing: .06em;
  text-transform: uppercase; color: var(--ink-3);
  padding: 13px 0 9px; border-bottom: 1px solid var(--hair);
}
.ob2-move-head span:nth-child(3), .ob2-move-head span:nth-child(4) { text-align: right; }
.ob2-move-row { padding: 10px 0; border-bottom: 1px solid var(--hair); }
.ob2-move-row:last-child { border-bottom: none; }
.ob2-move-name {
  font-size: 13.5px; font-weight: 600; color: var(--ink); text-transform: capitalize;
}
.ob2-move-bars { display: flex; align-items: flex-end; gap: 3px; height: 30px; }
.ob2-move-bar { flex: 1; min-width: 3px; background: var(--hair-2); border-radius: 2px 2px 0 0; }
.ob2-move-bar.cur { background: var(--ink-2); }
.ob2-move-total {
  font-family: var(--d); font-size: 12px; color: var(--ink);
  text-align: right; font-variant-numeric: tabular-nums;
}
.ob2-move-delta {
  font-family: var(--d); font-size: 11px; font-weight: 600;
  text-align: right; font-variant-numeric: tabular-nums;
}
.ob2-move-delta.up { color: var(--positive); }
.ob2-move-delta.down { color: var(--warning); }
.ob2-move-delta.na { color: var(--ink-3); font-weight: 500; }

/* ---- shared table furniture for the two measured grids ---- */
.ob2-th {
  font-family: var(--d); font-size: 11px; font-weight: 500; letter-spacing: .06em;
  text-transform: uppercase; color: var(--ink-3);
}
.ob2-th.r { text-align: right; }
.ob2-cat { font-size: 13px; font-weight: 600; color: var(--ink); }

/* ---- mix: measured share per category ---- */
.ob2-mix {
  display: grid; grid-template-columns: minmax(108px, 1fr) minmax(0, 2.2fr) 58px 92px;
  gap: 10px var(--s3); align-items: center;
}
.ob2-track { height: 8px; background: var(--paper-2); border-radius: 99px; overflow: hidden; }
.ob2-fill { display: block; height: 100%; background: var(--ink-2); border-radius: 99px; }
.ob2-pct {
  font-family: var(--d); font-size: 12px; font-weight: 600; color: var(--ink);
  text-align: right; font-variant-numeric: tabular-nums;
}
.ob2-new {
  font-family: var(--d); font-size: 11px; font-weight: 600;
  text-align: right; font-variant-numeric: tabular-nums;
}
.ob2-new.up { color: var(--positive); }
.ob2-new.dn { color: var(--warning); }
.ob2-new.flat { color: var(--ink-3); }

/* ---- prices: p25–p50–p75 on one shared scale ---- */
.ob2-pb {
  display: grid; grid-template-columns: minmax(100px, 1fr) minmax(0, 2.4fr) 78px 56px;
  gap: 24px var(--s3); align-items: center;
}
.ob2-pb-track { position: relative; height: 8px; background: var(--paper-2); border-radius: 99px; }
.ob2-pb-span { position: absolute; top: 0; bottom: 0; background: var(--hair-2); border-radius: 99px; }
.ob2-pb-med { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); border-radius: 2px; }
.ob2-pb-end {
  position: absolute; top: 13px; font-family: var(--d); font-size: 11px;
  color: var(--ink-3); white-space: nowrap; font-variant-numeric: tabular-nums;
}
.ob2-p50 {
  font-family: var(--d); font-size: 12.5px; font-weight: 600; color: var(--ink);
  text-align: right; font-variant-numeric: tabular-nums;
}
.ob2-n {
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
  text-align: right; font-variant-numeric: tabular-nums;
}
/* What was kept, what was dropped, and why — never silent, never rounded away. */
.ob2-cov {
  margin-top: var(--s5); padding-top: var(--s3); border-top: 1px solid var(--hair);
  display: flex; flex-wrap: wrap; gap: 6px 10px;
}
.ob2-chip {
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
  background: var(--paper-2); border-radius: 999px; padding: 3px 10px;
  font-variant-numeric: tabular-nums;
}

.ob2-foot {
  font-family: var(--d); font-size: 11px; line-height: 1.55; color: var(--ink-3);
  border-top: 1px solid var(--hair); padding-top: var(--s3); margin-top: var(--s5);
}

@container ob2 (max-width: 660px) {
  .ob2-title { font-size: 30px; }
  .ob2-move-head, .ob2-move-row { grid-template-columns: minmax(0, 1fr) 64px 74px; }
  .ob2-move-bars { display: none; }
  .ob2-mix { grid-template-columns: minmax(0, 1fr) 56px 84px; }
  .ob2-mix .ob2-track, .ob2-mix .ob2-th.bar { display: none; }
  .ob2-pb { grid-template-columns: minmax(0, 1fr) 78px 56px; }
  .ob2-pb .ob2-pb-track, .ob2-pb .ob2-th.bar { display: none; }
}
`;

// ---- Hero: coverage counters, straight from /summary -----------------------

function Hero({ s }) {
  const stats = [
    { v: fmt(s.stores_total), l: "marcas en el directorio" },
    { v: fmt(s.countries.length), l: "países" },
    { v: fmt(s.products_harvested), l: "observaciones de producto" },
    { v: fmt(s.products_dated), l: "observaciones fechadas" },
    { v: hace(s.last_harvest_at).replace(/^hace /, ""), l: "último ciclo" },
  ];
  const topCountries = s.countries.slice(0, 5).map((c) => `${c.country} ${c.n}`).join(" · ");
  const platforms = s.platforms.slice(0, 4).map((p) => `${p.platform} ${p.n}`).join(" · ");
  return (
    <div className="ob2-panel">
      <div className="ob2-counts">
        {stats.map((x) => (
          <div className="ob2-count" key={x.l}>
            <span>{x.l}</span>
            <b className={isMissing(x.v) ? "none" : undefined}>{x.v}</b>
          </div>
        ))}
      </div>
      <div className="ob2-subs">
        <span><b>{fmt(s.stores_reachable)}</b> sitios alcanzables</span>
        <span><b>{fmt(s.stores_with_catalog)}</b> catálogos públicos detectados</span>
        <span><b>{fmt(s.fingerprints_computed)}</b> catálogos analizados visualmente</span>
        <span className="ob2-dim">{topCountries}</span>
        <span className="ob2-dim">plataformas: {platforms}</span>
      </div>
    </div>
  );
}

// ---- Drops: real garments, dated, dedupe done server-side ------------------

function DropCard({ d }) {
  const [dead, setDead] = useState(false);
  if (dead) return null; // la foto no cargó — el card entero se va, sin placeholder trucho
  return (
    <a className="ob2-drop" href={d.url} target="_blank" rel="noreferrer">
      <div className="ob2-drop-fig">
        <img src={d.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setDead(true)} />
        <span className="ob2-drop-when">{hace(d.published_at)}</span>
      </div>
      <div className="ob2-drop-body">
        <div className="ob2-drop-title">{d.title}</div>
        <div className="ob2-drop-meta">
          <span className="ob2-drop-store">{d.store}</span>
          {typeof d.price === "number" && d.price > 0 && (
            <span className="ob2-drop-price" title="precio listado, en la moneda de la tienda">{fmt(d.price)}</span>
          )}
        </div>
        <span className="ob2-drop-src">Ver fuente</span>
      </div>
    </a>
  );
}

// ---- Movement: concepts derived from the crawl, weekly counts --------------

function MoveRow({ m }) {
  const max = Math.max(1, ...m.weekly.map((w) => w.n));
  const up = (m.delta_pct ?? 0) >= 0;
  return (
    <div className="ob2-move-row">
      <div className="ob2-move-name">{m.concept}</div>
      <div className="ob2-move-bars">
        {m.weekly.map((w, i) => (
          <span
            key={w.week}
            className={`ob2-move-bar${i === m.weekly.length - 1 ? " cur" : ""}`}
            style={{ height: `${Math.max(5, Math.round((w.n / max) * 100))}%` }}
            title={`${w.week}: ${w.n} productos nuevos`}
          />
        ))}
      </div>
      <div className="ob2-move-total">{fmt(m.total)}</div>
      <div className={`ob2-move-delta ${m.delta_pct == null ? "na" : up ? "up" : "down"}`}>
        {m.delta_pct == null ? "s/d" : `${up ? "▲" : "▼"} ${Math.abs(m.delta_pct)}%`}
      </div>
    </div>
  );
}

// ---- Mix: assortment composition of the market, by category (EDITED-shape) -

function MixSection({ mix }) {
  const max = Math.max(1, ...mix.categories.map((c) => c.share_pct));
  return (
    <div className="ob2-sect">
      <div className="ob2-sect-h">
        <h3>Estructura del surtido del mercado</h3>
        <span className="ob2-sect-meta">
          composición por categoría sobre {fmt(mix.total_products)} productos únicos ·
          índice de novedad = peso en lo publicado últimos {mix.window_days} días vs peso total ·
          libre de moneda (conteos, no precios)
        </span>
        <span className="ob2-push">
          <ExportButton filename="surtido-mercado" rows={mix.categories} columns={[
            { key: "category", header: "categoria" },
            { key: "count", header: "productos" },
            { key: "share_pct", header: "participacion_pct" },
            { key: "recent_count", header: "recientes_30d" },
            { key: "newness_index", header: "indice_novedad" },
          ]} />
        </span>
      </div>
      <div className="ob2-card">
        <div className="ob2-mix">
          <span className="ob2-th">categoría</span>
          <span className="ob2-th bar">participación</span>
          <span className="ob2-th r">%</span>
          <span className="ob2-th r">novedad</span>
          {mix.categories.slice(0, 12).map((c) => {
            const idx = c.newness_index;
            const cls = idx == null ? "flat" : idx >= 1.1 ? "up" : idx <= 0.9 ? "dn" : "flat";
            return (
              <div key={c.category} style={{ display: "contents" }}>
                <span className="ob2-cat">{c.category}</span>
                <span className="ob2-track"><span className="ob2-fill" style={{ width: `${(c.share_pct / max) * 100}%` }} /></span>
                <span className="ob2-pct">{c.share_pct}%</span>
                <span className={`ob2-new ${cls}`} title="novedad: >1 crece, <1 se enfría">
                  {idx == null ? "s/d" : `${idx >= 1.1 ? "▲" : idx <= 0.9 ? "▼" : "—"} ×${idx}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Prices: currency-normalized price bands per category (EDITED signature)-

const usd = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "—");

function PricesSection({ prices }) {
  const bands = prices.bands || [];
  // Shared linear scale so bands are comparable; cap at the widest p75 shown.
  const scaleMax = Math.max(1, ...bands.slice(0, 14).map((b) => b.p75));
  const cov = prices.coverage || {};
  const fx = prices.fx || {};
  const win = prices.plausible_window_usd || {};
  const keptPct = cov.kept_share != null ? Math.round(cov.kept_share * 100) : null;
  const droppedPct =
    cov.distinct_priced_products
      ? Math.round((cov.excluded_implausible / cov.distinct_priced_products) * 100)
      : null;
  const unconvPct =
    cov.distinct_priced_products
      ? Math.round((cov.unconvertible_no_currency / cov.distinct_priced_products) * 100)
      : null;
  return (
    <div className="ob2-sect">
      <div className="ob2-sect-h">
        <h3>Arquitectura de precios del mercado</h3>
        <span className="ob2-sect-meta">
          bandas p25–p50–p75 en USD por categoría · moneda inferida del país de la
          tienda (el crawl no trae moneda por producto) · convertido con tasas del{" "}
          {fx.as_of || "s/d"} ({fx.source || "s/d"}) · oferta publicada, no ventas
        </span>
        <span className="ob2-push">
          <ExportButton filename="precios-mercado" rows={bands} columns={[
            { key: "category", header: "categoria" },
            { key: "n", header: "productos" },
            { key: "stores", header: "tiendas" },
            { key: "p25", header: "p25_usd" },
            { key: "p50", header: "mediana_usd" },
            { key: "p75", header: "p75_usd" },
          ]} />
        </span>
      </div>
      <div className="ob2-card">
        <div className="ob2-pb">
          <span className="ob2-th">categoría</span>
          <span className="ob2-th bar">banda de precio (USD)</span>
          <span className="ob2-th r">mediana</span>
          <span className="ob2-th r">n</span>
          {bands.slice(0, 14).map((b) => {
            const l = (b.p25 / scaleMax) * 100;
            const r = (b.p75 / scaleMax) * 100;
            const m = (b.p50 / scaleMax) * 100;
            return (
              <div key={b.category} style={{ display: "contents" }}>
                <span className="ob2-cat">{b.category}</span>
                <span className="ob2-pb-track" title={`${b.stores} tiendas`}>
                  <span className="ob2-pb-span" style={{ left: `${l}%`, width: `${Math.max(1, r - l)}%` }} />
                  <span className="ob2-pb-med" style={{ left: `${m}%` }} />
                  <span className="ob2-pb-end" style={{ left: `${l}%`, transform: "translateX(-50%)" }}>{usd(b.p25)}</span>
                  <span className="ob2-pb-end" style={{ left: `${r}%`, transform: "translateX(-50%)" }}>{usd(b.p75)}</span>
                </span>
                <span className="ob2-p50">{usd(b.p50)}</span>
                <span className="ob2-n">{fmt(b.n)}</span>
              </div>
            );
          })}
        </div>
        {/* Honesty strip: what we kept, what we dropped, and why — never silent. */}
        <div className="ob2-cov">
          {keptPct != null && (
            <span className="ob2-chip">{fmt(cov.kept)} precios usados · {keptPct}% de {fmt(cov.distinct_priced_products)}</span>
          )}
          {unconvPct != null && cov.unconvertible_no_currency > 0 && (
            <span className="ob2-chip">{unconvPct}% sin moneda conocida (excluido)</span>
          )}
          {droppedPct != null && cov.excluded_implausible > 0 && (
            <span className="ob2-chip" title={`fuera de $${win.min}–$${win.max}: moneda/escala mal registrada en el crawl`}>
              {droppedPct}% descartado por precio implausible
            </span>
          )}
          <span className="ob2-chip" title="el campo de precio del crawl mezcla dólares, centavos y datos corruptos; el arreglo de raíz es en el crawler">
            limpieza de datos declarada ⓘ
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Observatory() {
  // undefined = cargando · null = engine caído · objeto = datos reales
  const [summary, setSummary] = useState(undefined);
  const [drops, setDrops] = useState(null);
  const [dropsFailed, setDropsFailed] = useState(false); // request failed != no drops
  const [movement, setMovement] = useState(null);
  const [mix, setMix] = useState(null);
  const [prices, setPrices] = useState(null);

  useEffect(() => {
    let dead = false;
    get("/observatory/summary").then((s) => !dead && setSummary(s)).catch(() => !dead && setSummary(null));
    get("/observatory/drops?days=60&limit=48").then((d) => { if (!dead) { setDropsFailed(false); setDrops(Array.isArray(d) ? d : []); } }).catch(() => { if (!dead) { setDropsFailed(true); setDrops([]); } });
    get("/observatory/movement?weeks=12").then((m) => !dead && setMovement(Array.isArray(m) ? m : [])).catch(() => !dead && setMovement([]));
    get("/observatory/mix").then((m) => !dead && setMix(m?.categories?.length ? m : null)).catch(() => !dead && setMix(null));
    get("/observatory/prices").then((p) => !dead && setPrices(p?.bands?.length ? p : null)).catch(() => !dead && setPrices(null));
    return () => { dead = true; };
  }, []);

  const weeksSpan = useMemo(() => {
    if (!movement?.length) return null;
    const wk = movement[0].weekly;
    return `${wk[0].week} → ${wk[wk.length - 1].week}`;
  }, [movement]);

  // Movement is concept × weekly-series: flatten to one row per concept with a
  // column per ISO week (all concepts share the same weeks), so the export is a
  // real spreadsheet grid, not a JSON blob in a cell.
  const movementCols = useMemo(() => {
    if (!movement?.length) return [];
    const weeks = movement[0].weekly.map((w) => w.week);
    return [
      { key: "concept", header: "concepto" },
      { key: "total", header: "total" },
      { key: "delta_pct", header: "delta_pct_4v4" },
      ...weeks.map((wk) => ({
        key: wk, header: wk,
        get: (r) => (r.weekly.find((x) => x.week === wk)?.n ?? 0),
      })),
    ];
  }, [movement]);

  const dropsCols = [
    { key: "title", header: "titulo" },
    { key: "store", header: "tienda" },
    { key: "price", header: "precio_moneda_tienda" },
    { key: "published_at", header: "publicado" },
    { key: "url", header: "url" },
  ];

  return (
    <section className="ob2">
      {/* ⚠ The style block is the first child of the ONE root every branch
          returns through — an early return that skipped it shipped an
          unstyled first paint once already. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="ob2-head">
        <div className="ob2-eyebrow">Observatorio · Mercado global</div>
        <h1 className="ob2-title">Observatorio</h1>
        <p className="ob2-lede">
          Directorio, snapshots y publicaciones de tiendas reales, con sus
          fechas y fuentes. Los conteos de producto son observaciones del
          crawl — no productos únicos, ventas ni demanda.
        </p>
      </div>

      {summary === undefined && <div className="ob2-loading">Consultando el engine…</div>}

      {summary === null && (
        <div className="ob2-dead">
          <div className="ob2-dead-ic">○</div>
          <h4>Engine desconectado</h4>
          <p>
            No pudimos hablar con la API del Observatorio ({API_BASE}). Antes
            que inventar números, preferimos decirte esto: no hay nada real
            para mostrar hasta que el engine vuelva.
          </p>
        </div>
      )}

      {summary && (
        <>
          <Hero s={summary} />

          <div className="ob2-sect">
            <div className="ob2-sect-h">
              <h3>Cayó esta semana</h3>
              <span className="ob2-sect-meta">
                lo más nuevo publicado en tiendas reales · últimos 60 días, más reciente primero
                {drops?.length ? ` · ${drops.length} productos` : ""}
              </span>
              {drops?.length > 0 && (
                <span className="ob2-push">
                  <ExportButton filename="drops-mercado" rows={drops} columns={dropsCols} />
                </span>
              )}
            </div>
            {drops === null && <div className="ob2-loading">Cargando los últimos drops…</div>}
            {dropsFailed && (
              <div className="ob2-empty">No pudimos consultar los drops — la petición al engine falló. No es que el mercado esté vacío; no pudimos preguntar.</div>
            )}
            {!dropsFailed && drops?.length === 0 && (
              <div className="ob2-empty">El engine no devolvió drops con foto y fecha en la ventana. No rellenamos con stock.</div>
            )}
            {drops?.length > 0 && (
              <div className="ob2-drops">
                {drops.map((d) => <DropCard d={d} key={d.url} />)}
              </div>
            )}
          </div>

          <div className="ob2-sect">
            <div className="ob2-sect-h">
              <h3>Qué se está moviendo</h3>
              <span className="ob2-sect-meta">
                conceptos derivados de los propios catálogos (frecuencia de tokens, sin vocabulario a mano) ·
                productos nuevos por semana ISO{weeksSpan ? ` · ${weeksSpan}` : ""} · Δ últimas 4 vs 4 previas ·
                la semana en curso está incompleta
              </span>
              {movement?.length > 0 && (
                <span className="ob2-push">
                  <ExportButton filename="movimiento-mercado" rows={movement} columns={movementCols} />
                </span>
              )}
            </div>
            {movement === null && <div className="ob2-loading">Contando productos nuevos por semana…</div>}
            {movement?.length === 0 && (
              <div className="ob2-empty">Sin suficientes productos fechados en la ventana para derivar conceptos.</div>
            )}
            {movement?.length > 0 && (
              <div className="ob2-card ob2-move">
                <div className="ob2-move-head">
                  <span>concepto</span><span>semanas</span><span>total</span><span>Δ 4 sem</span>
                </div>
                {movement.map((m) => <MoveRow m={m} key={m.concept} />)}
              </div>
            )}
          </div>

          {mix && <MixSection mix={mix} />}

          {prices && <PricesSection prices={prices} />}

          <div className="ob2-foot">
            Cada número de esta pantalla sale de datos crawleados con fecha. Nada es muestra.
          </div>
        </>
      )}
    </section>
  );
}
