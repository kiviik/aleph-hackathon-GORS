"use client";
// Signals — "¿Qué se movió esta semana que te importa?"
// Trends are laned by brand fit (tu territorio / adyacente / caliente pero
// ajeno), every card ends in an action (Vigilar / Descartar), and the top
// strip shows REAL competitor movements from the engine crawl. No fake
// crawler stats, no stock photos: real images where a source exists,
// the material study otherwise.
//
// STYLING (2026-08-13). This screen owns its skin: every class is `sg4-`
// prefixed and lives in the component <style> block below (repo pattern:
// components/TeamBrief.jsx). The old shared classes (.plate, .attr-*,
// .sg2-*, .radar-*) simply stop being referenced here — no shared file
// changed. Nothing below 11px, blue only on pressable, and every
// missing-data statement stays rendered at the same size as the facts.
import { useEffect, useMemo, useState } from "react";
import {
  TRENDS, ATTRIBUTES, COLOR_TRENDS, STAGE_COL, STAGE_ADVICE,
  lifecycleOf, signalMomentum, signalEvidence, peakWindow, productsObs, attrDir,
} from "@/lib/signals";
import { engineAssetUrl, getCompetitorItems } from "@/lib/api";
import { appFetch } from "@/lib/auth";
import { getDirection } from "@/lib/direction";
import { useEngine } from "@/components/EngineProvider";
import { readScoped, writeScoped } from "@/lib/brandStore";
import { useCollection } from "@/components/CollectionProvider";
import Thumbnail from "@/components/Thumbnail";

const WATCH_KEY = "atelier-watchlist";
const DISMISS_KEY = "atelier-signals-dismissed";

function DirectionInspiration({ direction, loading, onNavigate }) {
  if (loading) {
    return <div className="sg4-note">Leyendo la Dirección de la colección…</div>;
  }
  if (!direction?.exists || !direction?.working_version) {
    return (
      <div className="sg4-note">
        La marca está conectada, pero esta colección todavía no tiene una Dirección que pueda orientar inspiración.
      </div>
    );
  }

  const items = direction.items || {};
  const refs = (items.references || []).slice(0, 6);
  const silhouettes = (items.silhouettes || []).slice(0, 6);
  const colours = (items.colours || []).slice(0, 8);
  const rules = (items.rules || []).filter((r) => r.kind === "must_include").slice(0, 4);
  const territories = silhouettes.slice(0, 4).map((s) => ({
    title: s.name,
    detail: [s.fit, s.length, s.proportion_notes].filter(Boolean).join(" · "),
  }));

  return (
    <section className="sg4-dir">
      <div className="sg4-dir-intro">
        <div className="sg4-kicker">Señales internas · Dirección v{direction.working_version.version_number}</div>
        <h2>El territorio visual de la marca, antes del mercado</h2>
        <p>
          Esto sí pertenece a la marca: archivo visual, decisiones de silueta, paleta y reglas del equipo.
          No son tendencias de mercado ni predicciones. Sirven para buscar inspiración y generar conceptos
          fieles mientras todavía falta el crawl comparativo.
        </p>
      </div>

      {refs.length > 0 && (
        <div className="sg4-dir-block">
          <div className="sg4-kicker">Archivo visual que orienta la colección</div>
          <div className="sg4-refs">
            {refs.map((ref) => (
              <figure key={ref.id}>
                <img src={engineAssetUrl(ref.image_url)} alt={ref.title || "Referencia de Dirección"} />
                <figcaption>{ref.purpose} · {ref.rights}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <div className="sg4-dir-cols">
        <div className="sg4-panel">
          <div className="sg4-kicker">Paleta decidida</div>
          <div className="sg4-palette">
            {colours.map((c) => (
              <span key={c.id} title={`${c.name} · ${c.role}`} style={{ background: c.hex_value }} />
            ))}
          </div>
        </div>
        <div className="sg4-panel">
          <div className="sg4-kicker">Reglas que deben sobrevivir</div>
          {rules.map((r) => <p key={r.id} className="sg4-rule">{r.value}</p>)}
        </div>
      </div>

      <div className="sg4-kicker" style={{ marginBottom: 10 }}>Territorios concretos para explorar</div>
      <div className="sg4-terr">
        {territories.map((t) => (
          <article key={t.title}>
            <h3>{t.title}</h3>
            <p>{t.detail}</p>
          </article>
        ))}
      </div>

      <div className="sg4-dir-acts">
        <button className="sg4-btn primary" onClick={() => onNavigate?.("studio")}>Generar desde esta Dirección →</button>
        <button className="sg4-btn" onClick={() => onNavigate?.("direction")}>Editar Dirección</button>
        <button className="sg4-btn" onClick={() => onNavigate?.("catalog")}>Ver archivo completo</button>
      </div>
    </section>
  );
}

// ⚠ THESE ARE PER-BRAND JUDGEMENTS AND THEY WERE STORED GLOBALLY (owner review
// 2026-08-11). `atelier-watchlist` and `atelier-signals-dismissed` are NOT in
// `brandStore.GLOBAL_KEYS` — the scoping rule already said they must be scoped
// — but this file reached past `brandStore` into raw localStorage, so the rule
// never applied to them. Watching a trend for Complot watched it for Meridian,
// and dismissing one hid it everywhere.
//
// "Which trends I care about" is a statement about ONE brand's market, which is
// the entire distinction `brandStore` exists to keep.
function loadList(key, brandId) {
  const v = readScoped(key, brandId, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function saveList(key, brandId, arr) {
  writeScoped(key, brandId, arr);
}

// ---- Brand-fit lanes ------------------------------------------------------
// Live trends carry the engine's fit_score (mapped to demand.f = fit*100 by
// the adapter); demo trends use the same fit constants in lib/signals.js.
const fitOf = (t) => (t.demand?.f ?? 0) / 100;
function laneOf(t) {
  const f = fitOf(t);
  if (f >= 0.6) return "territorio";
  if (f >= 0.45) return "adyacente";
  return "ajeno";
}
const LANES = [
  { key: "territorio", title: "Tu territorio", hint: "actuá", desc: "fit ≥ 60 con tu ADN", col: "var(--sage)" },
  { key: "adyacente", title: "Adyacente", hint: "explorá con cuidado", desc: "fit 45–60", col: "var(--ochre)" },
  { key: "ajeno", title: "Caliente pero ajeno", hint: "mirá de lejos", desc: "fit < 45 — ordenado por momentum", col: "var(--clay)" },
];

// ---- Real images ----------------------------------------------------------
// 1) An evidence URL that IS a crawled competitor product → its image_url.
// 2) Keyword overlap between the trend and crawled items → best item image.
// 3) og:image of a real (non-fixture) evidence page via /api/og.
// 4) Otherwise the honest colour/texture study — never stock photos.
function competitorRefFor(t, items) {
  if (!t.live || !items?.length) return null;
  const evidence = (t.evidence || []).map((u) => String(u).replace(/\/+$/, ""));
  const evSet = new Set(evidence);
  const direct = items.find((i) => i.url && evSet.has(i.url.replace(/\/+$/, "")) && i.image_url);
  if (direct) return { img: direct.image_url, src: direct.competitor };

  const toks = t.name.toLowerCase().split(/[^a-záéíóúñ]+/)
    .filter((w) => w.length > 3)
    .map((w) => w.replace(/s$/, ""));
  if (!toks.length) return null;
  let best = null, bestScore = 0;
  for (const it of items) {
    if (!it.image_url) continue;
    const text = `${it.title || ""} ${it.product_type || ""} ${(it.tags || []).join(" ")}`.toLowerCase();
    const hits = toks.filter((w) => text.includes(w)).length;
    const score = hits + (it.dna_fit || 0) * 0.5;
    if (hits > 0 && score > bestScore) { best = it; bestScore = score; }
  }
  return best ? { img: best.image_url, src: best.competitor } : null;
}

// og:image resolution through /api/og (same pattern as Proposals). Only real
// URLs — fixture domains (.test) never leave the client.
function useOgImage(urls, skip) {
  const [img, setImg] = useState(null);
  const keyList = (urls || []).join("|");
  useEffect(() => {
    if (skip || !urls?.length) return;
    let dead = false;
    (async () => {
      for (const u of urls) {
        try {
          const r = await appFetch(`/api/og?url=${encodeURIComponent(u)}`);
          const { image } = await r.json();
          if (dead) return;
          if (image) { setImg(image); return; }
        } catch { /* next url */ }
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList, skip]);
  return img;
}

function TrendPlate({ t, watched, onWatch, onDismiss, compItems }) {
  const lc = lifecycleOf(t);
  const ev = signalEvidence(t);
  const compRef = useMemo(() => competitorRefFor(t, compItems), [t, compItems]);
  const realUrls = useMemo(
    () => (t.evidence || []).filter((u) => /^https?:\/\//.test(u) && !u.includes(".test")).slice(0, 3),
    [t]
  );
  const og = useOgImage(realUrls, !!compRef || !t.live);
  const img = compRef?.img || og || undefined;

  return (
    <article className={`sg4-card${watched ? " watched" : ""}`}>
      <div className="sg4-fig">
        <Thumbnail color={t.col} fabric={t.fabric} img={img} />
        <span className="sg4-tag left">{t.gd.toUpperCase()}</span>
        {watched && <span className="sg4-tag right">★ vigilada</span>}
        {img && <span className="sg4-imgsrc">{compRef ? `ref: ${compRef.src}` : "foto: fuente citada"}</span>}
      </div>
      <div className="sg4-body">
        <div className="sg4-cat">{t.cat} · {t.fabric}</div>
        <div className="sg4-titlerow">
          <h4 className="sg4-name">{t.name}</h4>
          <span className="sg4-stage" style={{ color: STAGE_COL[lc.stage] }}>{lc.stage}</span>
        </div>
        {t.live && t.summary && <p className="sg4-sum">{t.summary}</p>}
        <div className="sg4-rows">
          <div className="sg4-row"><span className="l">Momentum</span><span className="v" style={{ color: STAGE_COL[lc.stage] }}>{signalMomentum(t)}</span></div>
          <div className="sg4-row"><span className="l">Evidence</span><span className="v" style={{ color: ev[1] }}>{ev[0]}</span></div>
          <div className="sg4-row"><span className="l">Fit</span><span className="v">{Math.round(fitOf(t) * 100)}</span></div>
        </div>
        <div className="sg4-lc">
          {/* A bar with no position is drawn EMPTY, not at zero. `pos` null means
              the engine could not place this on the curve; a marker at 0 would
              read as "just emerging", which is a claim nobody made. */}
          <div className="sg4-lc-track">
            {lc.pos != null && (
              <>
                <div className="sg4-lc-fill" style={{ width: `${lc.pos}%`, background: STAGE_COL[lc.stage] }} />
                <span className="sg4-lc-mark" style={{ left: `${lc.pos}%`, borderColor: STAGE_COL[lc.stage] }} />
              </>
            )}
            <span className="sg4-lc-zone" style={{ left: 0 }}>Emerging</span>
            <span className="sg4-lc-zone" style={{ left: "33%" }}>Accel.</span>
            <span className="sg4-lc-zone" style={{ left: "62%" }}>Peak</span>
            <span className="sg4-lc-zone" style={{ left: "86%" }}>Decline</span>
          </div>
          <div className="sg4-lc-advice"><span style={{ color: STAGE_COL[lc.stage], fontWeight: 700 }}>●</span> {STAGE_ADVICE[lc.stage]} · {peakWindow(lc)}</div>
        </div>
        <div className="sg4-ev">
          <span className="up">{t.yoy} {t.yoyLabel || "YoY"}</span><span className="sep">·</span>
          <span>{productsObs(t)} signals</span><span className="sep">·</span>
          <span>{t.live ? (t.sources.slice(0, 2).join(" · ") || "engine") : "observed"}</span>
        </div>
        <div className="sg4-acts">
          <button className={`sg4-watch${watched ? " on" : ""}`} onClick={() => onWatch(t.name)}>
            {watched ? "★ Vigilando" : "☆ Vigilar"}
          </button>
          <button className="sg4-dismiss" onClick={() => onDismiss(t.name)}>Descartar</button>
        </div>
      </div>
    </article>
  );
}

function TrendsMode({ mode, gender, trends, watchSet, dismissSet, onWatch, onDismiss, compItems }) {
  const visible = (t) => (mode === "global" || t.brand) && (gender === "all" || t.gd === gender) && !dismissSet.has(t.name);
  const list = trends.filter(visible);
  const movers = list.slice().sort((a, b) => b.score - a.score);
  const accel = list.filter((t) => lifecycleOf(t).stage === "Accelerating");
  const declining = list.filter((t) => lifecycleOf(t).stage === "Declining");

  if (!list.length)
    return <div className="sg4-empty"><div className="ic">○</div><h4>No trends match</h4><p>Loosen the filters, restore dismissed signals, or switch back to Global.</p></div>;

  const byLane = { territorio: [], adyacente: [], ajeno: [] };
  for (const t of list) byLane[laneOf(t)].push(t);
  // Within a lane: watched first, then momentum.
  const rank = (a, b) =>
    (watchSet.has(b.name) ? 1 : 0) - (watchSet.has(a.name) ? 1 : 0) || b.score - a.score;
  for (const k of Object.keys(byLane)) byLane[k].sort(rank);

  return (
    <>
      <div className="sg4-changed">
        <div className="sg4-changed-h">What changed this week</div>
        <ul>
          {movers[0] && <li><span className="dot" style={{ background: "var(--sage)" }} /><span><b>{movers[0].name}</b> is the strongest mover — {signalEvidence(movers[0])[0].toLowerCase()} evidence across sources.</span></li>}
          {accel[0] && accel[0] !== movers[0] && <li><span className="dot" style={{ background: "var(--ochre)" }} /><span><b>{accel[0].name}</b> sits in Accelerating — worth evaluating as an opportunity.</span></li>}
          {declining[0] && <li><span className="dot" style={{ background: "var(--clay)" }} /><span><b>{declining[0].name}</b> is past peak and declining — hold.</span></li>}
        </ul>
      </div>

      {LANES.map((lane) => {
        const rows = byLane[lane.key];
        if (!rows.length && lane.key !== "territorio") return null;
        return (
          <div key={lane.key} className="sg4-lane">
            <div className="sg4-lane-h">
              <span className="sg4-lane-dot" style={{ background: lane.col }} />
              <span className="sg4-lane-t">{lane.title}</span>
              <span className="sg4-lane-hint" style={{ color: lane.col }}>{lane.hint}</span>
              <span className="sg4-lane-desc">{lane.desc} · {rows.length}</span>
            </div>
            {rows.length ? (
              <div className="sg4-grid">
                {rows.map((t) => (
                  <TrendPlate key={t.name} t={t} watched={watchSet.has(t.name)}
                    onWatch={onWatch} onDismiss={onDismiss} compItems={compItems} />
                ))}
              </div>
            ) : (
              <div className="sg4-lane-empty">Ninguna tendencia de esta corrida cae en tu territorio — mirá las adyacentes o corré un refresh.</div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---- Competitor movements strip -------------------------------------------
// Real crawled items only (getCompetitorItems). Counts and averages are
// computed, never invented; when items lack reliable dates we say
// "último crawl", never "esta semana".
const RECENT_DAYS = 30;

function groupCompetitors(items) {
  const by = new Map();
  for (const it of items) {
    if (!by.has(it.competitor)) by.set(it.competitor, []);
    by.get(it.competitor).push(it);
  }
  const cutoff = Date.now() - RECENT_DAYS * 864e5;
  return [...by.entries()].map(([name, all]) => {
    const dated = all.filter((i) => i.published_at && !Number.isNaN(Date.parse(i.published_at)));
    const recent = dated.filter((i) => Date.parse(i.published_at) >= cutoff);
    const sel = recent.length ? recent : all;
    const when = recent.length ? `últimos ${RECENT_DAYS} días` : "último crawl";
    const counts = {};
    for (const i of sel) { const k = (i.product_type || "").trim().toLowerCase(); if (k) counts[k] = (counts[k] || 0) + 1; }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const priced = sel.filter((i) => typeof i.price === "number" && i.price > 0);
    const avg = priced.length ? priced.reduce((s, i) => s + i.price, 0) / priced.length : null;
    const currency = priced[0]?.currency || "";
    const fits = sel.filter((i) => typeof i.dna_fit === "number");
    const avgFit = fits.length ? fits.reduce((s, i) => s + i.dna_fit, 0) / fits.length : null;
    const img = sel.find((i) => i.image_url)?.image_url || null;
    return { name, n: sel.length, top, avg, currency, avgFit, img, when };
  }).sort((a, b) => b.n - a.n);
}

function CompetitorMoves({ live, items }) {
  if (!live)
    return <div className="sg4-note">Movimientos de competidores — sin datos: el engine no está conectado. Nada que mostrar (no inventamos crawls).</div>;
  if (items === null) return <div className="sg4-note">Movimientos de competidores — cargando el último crawl…</div>;
  if (!items.length)
    return <div className="sg4-note">Movimientos de competidores — el último crawl no trajo items (o la API no respondió). Nada que mostrar.</div>;

  const groups = groupCompetitors(items);
  return (
    <div className="sg4-comp">
      <div className="sg4-comp-h">Movimientos de competidores <span>{items.length} items reales · {groups.length} marcas</span></div>
      <div className="sg4-comp-strip">
        {groups.map((g) => (
          <div className="sg4-comp-card" key={g.name}>
            {g.img
              ? <img className="sg4-comp-img" src={g.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
              : <div className="sg4-comp-img noimg" />}
            <div className="sg4-comp-body">
              <div className="sg4-comp-name">{g.name}</div>
              <div className="sg4-comp-line">
                <b>{g.n}</b> item{g.n === 1 ? "" : "s"} nuevo{g.n === 1 ? "" : "s"} ({g.when})
                {g.top && <> · mayoría {g.top[0]} ({g.top[1]})</>}
              </div>
              <div className="sg4-comp-line dim">
                {g.avg != null && <>prom. {g.currency} {Math.round(g.avg).toLocaleString("es-AR")}</>}
                {g.avg != null && g.avgFit != null && " · "}
                {g.avgFit != null && <>afinidad ADN {Math.round(g.avgFit * 100)}</>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ATTRIBUTES and COLOR_TRENDS are BUNDLED SAMPLE TABLES, not a crawl. The
// trends tab already refuses to show them to a connected brand (`trends` is
// `[]` when connected without a run), but these two tabs read the constants
// directly — so a LIVE brand switching to Atributos or Colores was reading
// "Bias satin +74%, 98 brand fit" underneath a header stating its own signal
// count and generation time. That is the one place in this screen where a
// sample number could be mistaken for the brand's own market run.
// The engine has no attribute-level or colour-level breakdown to serve here
// (that is the paid attribute layer, §0a), so the honest answer is to say so.
function AttributeGap({ dimension }) {
  return (
    <div className="sg4-gap">
      <b>Desglose por {dimension} no disponible para esta marca.</b>
      <p>
        La corrida de mercado devuelve tendencias, no un desglose por {dimension}.
        Las tablas de muestra existen sólo para la maqueta sin engine y no se
        mezclan con los datos de una marca conectada.
      </p>
    </div>
  );
}

function AttributesMode({ mode, gender, live }) {
  const seg = gender === "all" ? "women" : gender;
  const data = ATTRIBUTES[seg];
  const onBrand = mode === "brand";
  if (live) return <AttributeGap dimension="atributo" />;
  return (
    <div className="sg4-attr-cols">
      {Object.entries(data).map(([group, items]) => {
        let rows = onBrand ? items.filter((x) => x.fit >= 70) : items;
        rows = [...rows].sort((a, b) => b.ad - a.ad);
        return (
          <div className="sg4-attr-col" key={group}>
            <div className="sg4-attr-h">{group}</div>
            {rows.map((x) => {
              const dr = attrDir(x.dir);
              return (
                <div className="sg4-attr-row" key={x.n}>
                  <div className="sg4-attr-thumb"><Thumbnail color="#9A968B" fabric="Satin" /></div>
                  <div className="sg4-attr-main">
                    <div className="sg4-attr-name">{x.n}</div>
                    <div className="sg4-bar"><span className="track"><i style={{ width: `${x.ad}%`, background: dr[1] }} /></span><span className="pct">{x.ad}%</span></div>
                  </div>
                  <div className="sg4-attr-meta">
                    <div className="sg4-attr-yoy" style={{ color: dr[1] }}>{dr[0]} {x.yoy}</div>
                    <div className={`sg4-attr-fit ${x.fit >= 80 ? "hi" : x.fit >= 60 ? "md" : "lo"}`}>{x.fit} fit</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ColorsMode({ mode, gender, live }) {
  const seg = gender === "all" ? "women" : gender;
  let cols = COLOR_TRENDS[seg];
  if (live) return <AttributeGap dimension="color" />;
  if (mode === "brand") cols = cols.filter((c) => c.fit >= 70);
  cols = [...cols].sort((a, b) => b.ad - a.ad);
  return (
    <div className="sg4-color-grid">
      {cols.map((c) => {
        const dr = attrDir(c.dir);
        return (
          <div className="sg4-color-card" key={c.n}>
            <div className="sg4-color-chip" style={{ background: c.h }} />
            <div className="sg4-color-body">
              <div className="sg4-color-top"><span className="sg4-color-nm">{c.n}</span><span className="sg4-color-yoy" style={{ color: dr[1] }}>{dr[0]} {c.yoy}</span></div>
              <div className="sg4-bar"><span className="track"><i style={{ width: `${c.ad}%`, background: c.h, border: "1px solid rgba(0,0,0,.1)" }} /></span><span className="pct">{c.ad}%</span></div>
              <div className={`sg4-color-fit ${c.fit >= 70 ? "hi" : "lo"}`}>{c.fit >= 70 ? "✓ " + c.fit + " brand fit" : "✕ off-brand (" + c.fit + ")"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RMODES = [["trends", "Trends"], ["attributes", "Attributes"], ["colors", "Colours"]];

export default function Signals({ onNavigate }) {
  const [mode, setMode] = useState("global");
  const [gender, setGender] = useState("all");
  const [radarMode, setRadarMode] = useState("trends");
  const engine = useEngine();
  const collection = useCollection();
  const connected = Boolean(engine.connected && engine.brandId);
  const live = engine.status === "live";
  // A connected brand without a market run must never inherit the bundled
  // sample brand's taste. Show its own Direction below and keep market trends
  // explicitly unavailable.
  const trends = live ? engine.trends : connected ? [] : TRENDS;
  const [direction, setDirection] = useState(undefined);

  useEffect(() => {
    if (!connected || live || !collection.activeId) {
      setDirection(null);
      return;
    }
    let dead = false;
    setDirection(undefined);
    getDirection(engine.brandId, collection.activeId)
      .then((payload) => { if (!dead) setDirection(payload); })
      .catch(() => { if (!dead) setDirection(null); });
    return () => { dead = true; };
  }, [connected, live, engine.brandId, collection.activeId]);

  // Watch / dismiss state (persisted).
  const [watchSet, setWatchSet] = useState(() => new Set());
  const [dismissSet, setDismissSet] = useState(() => new Set());
  const [undo, setUndo] = useState(null); // last dismissed trend name
  // ⚠ RE-READ ON BRAND SWITCH. With `[]` deps this loaded once and kept the
  // previous brand's watchlist on screen after the topbar changed — the same
  // leak the scoping fixes, arriving through the render path instead.
  useEffect(() => {
    setWatchSet(new Set(loadList(WATCH_KEY, engine.brandId)));
    setDismissSet(new Set(loadList(DISMISS_KEY, engine.brandId)));
  }, [engine.brandId]);

  function toggleWatch(name) {
    setWatchSet((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      saveList(WATCH_KEY, engine.brandId, [...next]);
      return next;
    });
  }
  function dismiss(name) {
    setDismissSet((prev) => {
      const next = new Set(prev).add(name);
      saveList(DISMISS_KEY, engine.brandId, [...next]);
      return next;
    });
    setUndo(name);
    clearTimeout(window.__sg4undo);
    window.__sg4undo = setTimeout(() => setUndo(null), 6000);
  }
  function undoDismiss() {
    if (!undo) return;
    setDismissSet((prev) => {
      const next = new Set(prev);
      next.delete(undo);
      saveList(DISMISS_KEY, engine.brandId, [...next]);
      return next;
    });
    setUndo(null);
  }

  // Real crawled competitor items — one fetch, shared by the top strip and
  // the trend plates (real image refs). null = still loading.
  const [compItems, setCompItems] = useState(null);
  useEffect(() => {
    if (!live || !engine.brandId) return;
    let dead = false;
    getCompetitorItems(engine.brandId).then((r) => { if (!dead) setCompItems(Array.isArray(r) ? r : []); });
    return () => { dead = true; };
  }, [live, engine.brandId]);

  return (
    <section className="view on">
      <style dangerouslySetInnerHTML={{ __html: `
        /* ---- Signals sg4 skin. Namespaced; touches no shared class. ---- */
        .sg4-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)}
        .sg4-eyebrow{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
        .sg4-title{font-family:var(--serif);font-weight:600;font-size:38px;line-height:1.04;letter-spacing:-.01em;color:var(--ink);margin:7px 0 0}
        .sg4-dek{font-size:14px;color:var(--ink-2);line-height:1.5;max-width:64ch;margin:10px 0 0}

        .sg4-seg{display:inline-flex;background:var(--paper-2);border:1px solid var(--line);border-radius:99px;padding:3px;gap:2px}
        .sg4-seg button{font-size:12px;font-weight:600;color:var(--ink-3);padding:6px 14px;border-radius:99px;transition:background .14s,color .14s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
        .sg4-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(23,24,28,.09)}
        .sg4-dna{width:8px;height:8px;border-radius:50%;background:var(--editorial);display:inline-block;flex:none}

        /* Provenance: slim dark band, real counts only. */
        .sg4-prov{background:var(--night);border-radius:var(--r-sm);padding:9px 14px;margin:var(--s3) 0 var(--s4);display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-family:var(--d);font-size:11px;color:#C9CBD2;line-height:1.5}
        .sg4-prov .state{display:inline-flex;align-items:center;gap:7px;color:#fff;font-weight:600;text-transform:uppercase;letter-spacing:.07em}
        .sg4-prov .dot{width:7px;height:7px;border-radius:50%;background:var(--sage);flex:none}
        .sg4-prov .dot.idle{background:var(--ochre)}
        .sg4-prov b{color:#fff;font-weight:700;font-variant-numeric:tabular-nums}
        .sg4-prov .sep{color:#54565E}
        .sg4-prov .tail{margin-left:auto;color:#8A8D97;font-variant-numeric:tabular-nums}

        /* Calm statements about missing data — visible, never dressed as data. */
        .sg4-note{font-size:12px;color:var(--ink-3);background:var(--paper-2);border-radius:var(--r-sm);padding:11px 14px;margin-top:var(--s3);line-height:1.55}

        /* Mode tabs + gender segments. */
        .sg4-toolbar{display:flex;align-items:center;gap:8px;margin:var(--s4) 0;flex-wrap:wrap}
        .sg4-toolbar .sp{flex:1}
        .sg4-tab{font-family:var(--d);font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);padding:7px 12px;border-radius:var(--r-xs);border:1px solid transparent;transition:.14s}
        .sg4-tab:hover{color:var(--ink)}
        .sg4-tab.on{color:var(--ink);background:var(--surface);border-color:var(--line)}

        /* What changed this week. */
        .sg4-changed{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;margin-top:var(--s2)}
        .sg4-changed-h{font-family:var(--d);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);margin-bottom:7px}
        .sg4-changed ul{list-style:none;margin:0;padding:0}
        .sg4-changed li{display:flex;align-items:baseline;gap:9px;font-size:12.5px;color:var(--ink-2);line-height:1.55;padding:3px 0}
        .sg4-changed li b{color:var(--ink)}
        .sg4-changed .dot{width:7px;height:7px;border-radius:50%;flex:none;transform:translateY(-1px)}

        /* Section lanes. */
        .sg4-lane{margin-top:var(--s5)}
        .sg4-lane-h{display:flex;align-items:baseline;gap:10px;padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:var(--s3);flex-wrap:wrap}
        .sg4-lane-dot{width:8px;height:8px;border-radius:50%;align-self:center;flex:none}
        .sg4-lane-t{font-family:var(--disp);font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
        .sg4-lane-hint{font-family:var(--d);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
        .sg4-lane-desc{margin-left:auto;font-family:var(--d);font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
        .sg4-lane-empty{font-size:12px;color:var(--ink-3);background:var(--paper-2);border-radius:var(--r-sm);padding:12px 14px;line-height:1.55}
        .sg4-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(390px,1fr));gap:var(--s4)}
        @media(max-width:560px){.sg4-grid{grid-template-columns:1fr}}

        /* Trend cards. */
        .sg4-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;transition:border-color .16s,box-shadow .16s}
        .sg4-card:hover{border-color:var(--hair-2);box-shadow:var(--shadow)}
        .sg4-card.watched{border-color:var(--ink)}
        .sg4-fig{position:relative;height:188px;background:var(--paper-2);border-bottom:1px solid var(--hair);overflow:hidden}
        .sg4-tag{position:absolute;top:10px;font-family:var(--d);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:var(--r-xs);background:rgba(23,24,28,.78);color:#fff}
        .sg4-tag.left{left:10px}
        .sg4-tag.right{right:10px}
        .sg4-imgsrc{position:absolute;left:0;right:0;bottom:0;font-family:var(--d);font-size:11px;color:#fff;background:linear-gradient(transparent,rgba(23,24,28,.85));padding:18px 10px 8px;line-height:1.3}
        .sg4-body{padding:13px 16px 14px;display:flex;flex-direction:column;flex:1;min-width:0}
        .sg4-cat{font-family:var(--d);font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3)}
        .sg4-titlerow{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap}
        .sg4-name{font-family:var(--disp);font-size:16px;font-weight:700;letter-spacing:-.015em;line-height:1.2;margin:0;color:var(--ink)}
        .sg4-stage{font-family:var(--d);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:99px;border:1px solid currentColor;line-height:1.35}
        .sg4-sum{margin:7px 0 0;font-size:12.5px;line-height:1.5;color:var(--ink-2)}
        .sg4-rows{margin-top:11px;border-top:1px solid var(--hair);padding-top:3px}
        .sg4-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:4px 0;font-size:12px}
        .sg4-row .l{color:var(--ink-3)}
        .sg4-row .v{font-family:var(--d);font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}
        .sg4-lc{margin-top:9px}
        .sg4-lc-track{position:relative;height:5px;background:var(--paper-2);border-radius:4px;margin-bottom:24px}
        .sg4-lc-fill{height:100%;border-radius:4px;opacity:.3}
        .sg4-lc-mark{position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:#fff;border:3px solid;transform:translate(-50%,-50%);box-shadow:0 1px 3px rgba(0,0,0,.18)}
        .sg4-lc-zone{position:absolute;top:10px;font-family:var(--d);font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-3);white-space:nowrap}
        .sg4-lc-advice{font-size:12px;color:var(--ink-2);line-height:1.5}
        .sg4-ev{margin-top:10px;border-top:1px solid var(--hair);padding-top:9px;font-family:var(--d);font-size:11px;color:var(--ink-3);display:flex;flex-wrap:wrap;gap:4px 8px;font-variant-numeric:tabular-nums;line-height:1.4}
        .sg4-ev .sep{opacity:.5}
        .sg4-acts{display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:12px}
        .sg4-watch{font-size:12.5px;font-weight:600;color:var(--ink);border:1px solid var(--line);border-radius:99px;padding:6px 15px;background:var(--surface);transition:.15s}
        .sg4-watch:hover{border-color:var(--hair-2);background:var(--paper-2)}
        .sg4-watch.on{background:var(--ink);border-color:var(--ink);color:#fff}
        .sg4-dismiss{font-size:12.5px;color:var(--ink-3);padding:6px 2px;transition:color .14s}
        .sg4-dismiss:hover{color:var(--danger)}

        /* Empty state. */
        .sg4-empty{text-align:center;padding:44px 20px;background:var(--surface);border:1px dashed var(--hair-2);border-radius:var(--r)}
        .sg4-empty .ic{font-size:22px;color:var(--ink-3)}
        .sg4-empty h4{font-family:var(--disp);font-size:15px;font-weight:700;margin:8px 0 4px}
        .sg4-empty p{font-size:12.5px;color:var(--ink-3);margin:0;line-height:1.5}

        /* Competitor movements strip — real crawl only. */
        .sg4-comp{margin-top:var(--s4)}
        .sg4-comp-h{font-family:var(--disp);font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--ink);display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap}
        .sg4-comp-h span{font-family:var(--d);font-size:11px;font-weight:400;color:var(--ink-3);font-variant-numeric:tabular-nums}
        .sg4-comp-strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}
        .sg4-comp-card{flex:0 0 auto;display:flex;gap:11px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 14px 8px 8px;min-width:232px;transition:border-color .16s,box-shadow .16s}
        .sg4-comp-card:hover{border-color:var(--hair-2);box-shadow:var(--shadow)}
        .sg4-comp-img{width:52px;height:64px;object-fit:cover;border-radius:var(--r-xs);background:var(--paper-2);flex:none;display:block}
        .sg4-comp-img.noimg{background:repeating-linear-gradient(45deg,var(--paper-2),var(--paper-2) 4px,var(--paper) 4px,var(--paper) 8px)}
        .sg4-comp-name{font-family:var(--d);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink)}
        .sg4-comp-line{font-size:12px;color:var(--ink-2);margin-top:3px;line-height:1.4;font-variant-numeric:tabular-nums}
        .sg4-comp-line b{font-weight:700;color:var(--ink)}
        .sg4-comp-line.dim{color:var(--ink-3);font-size:11.5px}

        /* Honest gap for attribute/colour tabs on a live brand. */
        .sg4-gap{background:var(--surface);border:1px dashed var(--hair-2);border-radius:var(--r);padding:18px 20px;max-width:680px}
        .sg4-gap b{font-family:var(--disp);font-size:14px;color:var(--ink)}
        .sg4-gap p{margin:7px 0 0;font-size:12px;color:var(--ink-3);line-height:1.55}

        /* Sample attribute tables (demo mode only). */
        .sg4-attr-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--s4)}
        .sg4-attr-col{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}
        .sg4-attr-h{font-family:var(--disp);font-size:14px;font-weight:700;padding-bottom:8px;border-bottom:1px solid var(--hair)}
        .sg4-attr-row{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--hair)}
        .sg4-attr-row:last-child{border-bottom:0;padding-bottom:2px}
        .sg4-attr-thumb{width:40px;height:48px;border-radius:var(--r-xs);overflow:hidden;flex:none;position:relative}
        .sg4-attr-main{flex:1;min-width:0}
        .sg4-attr-name{font-size:12.5px;font-weight:600;color:var(--ink)}
        .sg4-bar{display:flex;align-items:center;gap:7px;margin-top:4px}
        .sg4-bar .track{flex:1;height:4px;border-radius:3px;background:var(--paper-2);overflow:hidden;display:block}
        .sg4-bar .track i{display:block;height:100%}
        .sg4-bar .pct{font-family:var(--d);font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
        .sg4-attr-meta{text-align:right;flex:none}
        .sg4-attr-yoy{font-family:var(--d);font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}
        .sg4-attr-fit{font-family:var(--d);font-size:11px;color:var(--ink-3);margin-top:3px}
        .sg4-attr-fit.hi{color:var(--positive)}
        .sg4-attr-fit.md{color:var(--warning)}

        /* Sample colour cards (demo mode only). */
        .sg4-color-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--s3)}
        .sg4-color-card{display:flex;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px;transition:border-color .16s,box-shadow .16s}
        .sg4-color-card:hover{border-color:var(--hair-2);box-shadow:var(--shadow)}
        .sg4-color-chip{width:46px;height:58px;border-radius:var(--r-xs);border:1px solid var(--hair);flex:none}
        .sg4-color-body{flex:1;min-width:0}
        .sg4-color-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
        .sg4-color-nm{font-size:12.5px;font-weight:600;color:var(--ink)}
        .sg4-color-yoy{font-family:var(--d);font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}
        .sg4-color-fit{font-family:var(--d);font-size:11px;margin-top:4px}
        .sg4-color-fit.hi{color:var(--positive)}
        .sg4-color-fit.lo{color:var(--ink-3)}

        /* Direction inspiration (connected brand, no market run). */
        .sg4-dir{margin-top:var(--s4)}
        .sg4-kicker{font-family:var(--d);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--editorial)}
        .sg4-dir-intro{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
        .sg4-dir-intro h2{font-family:var(--disp);font-size:20px;font-weight:700;letter-spacing:-.015em;margin:7px 0 6px;color:var(--ink)}
        .sg4-dir-intro p{margin:0;font-size:13px;color:var(--ink-2);max-width:78ch;line-height:1.55}
        .sg4-dir-block{margin:var(--s4) 0 var(--s5)}
        .sg4-refs{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-top:10px}
        .sg4-refs figure{margin:0;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;background:var(--surface)}
        .sg4-refs img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}
        .sg4-refs figcaption{padding:8px 9px;font-family:var(--d);font-size:11px;color:var(--ink-3);line-height:1.4}
        .sg4-dir-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:var(--s3);margin-bottom:var(--s4)}
        .sg4-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px}
        .sg4-palette{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
        .sg4-palette span{width:31px;height:31px;border-radius:99px;border:1px solid var(--line);display:block}
        .sg4-rule{margin:8px 0 0;font-size:12px;color:var(--ink);line-height:1.5}
        .sg4-terr{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
        .sg4-terr article{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px}
        .sg4-terr h3{margin:0 0 5px;font-family:var(--disp);font-size:14px;font-weight:700;color:var(--ink)}
        .sg4-terr p{margin:0;font-size:11.5px;color:var(--ink-3);line-height:1.5}
        .sg4-dir-acts{display:flex;gap:9px;flex-wrap:wrap;margin-top:var(--s4)}
        .sg4-btn{font-size:12.5px;font-weight:600;color:var(--ink-2);border:1px solid var(--line);border-radius:99px;padding:8px 16px;background:var(--surface);transition:.15s}
        .sg4-btn:hover{border-color:var(--hair-2);background:var(--paper-2)}
        .sg4-btn.primary{background:var(--cobalt);border-color:var(--cobalt);color:#fff}
        .sg4-btn.primary:hover{background:var(--cobalt-ink);border-color:var(--cobalt-ink)}

        /* Undo toast. */
        .sg4-undo{position:fixed;left:50%;bottom:22px;transform:translate(-50%,14px);background:var(--night);color:#fff;border-radius:99px;padding:9px 10px 9px 17px;display:flex;align-items:center;gap:13px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;box-shadow:var(--shadow);z-index:60}
        .sg4-undo.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
        .sg4-undo b{color:#fff}
        .sg4-undo button{font-size:12px;font-weight:700;color:#fff;background:rgba(255,255,255,.14);border-radius:99px;padding:5px 13px;transition:background .14s}
        .sg4-undo button:hover{background:rgba(255,255,255,.26)}
      ` }} />

      <header className="sg4-head">
        <div>
          <div className="sg4-eyebrow">Inteligencia · Radar de tendencias</div>
          <h1 className="sg4-title">Signals</h1>
          <p className="sg4-dek">¿Qué se movió esta semana que te importa? Tendencias ordenadas por fit con tu ADN — y lo que tus competidores subieron en su último crawl.</p>
        </div>
        <div className="sg4-seg" id="signalSwitch">
          <button className={mode === "global" ? "on" : ""} onClick={() => setMode("global")}>Global</button>
          <button className={mode === "brand" ? "on" : ""} onClick={() => setMode("brand")}><span className="sg4-dna" />On-brand</button>
        </div>
      </header>

      <div className="sg4-prov">
        {live ? (
          <>
            <span className="state"><span className="dot" />Engine · {engine.mode} run</span>
            <span><b>{engine.stats.nTrends}</b> trend{engine.stats.nTrends === 1 ? "" : "s"}</span><span className="sep">·</span>
            <span><b>{engine.stats.totalSignals}</b> signals</span><span className="sep">·</span>
            <span>
              {engine.stats.sources.slice(0, 5).join(" · ") || "no sources"}
              {engine.stats.sources.length > 5 && <b> +{engine.stats.sources.length - 5} more</b>}
            </span>
            <span className="tail">generated {new Date(engine.generatedAt + (String(engine.generatedAt).endsWith("Z") ? "" : "Z")).toLocaleString()}</span>
          </>
        ) : connected ? (
          <>
            <span className="state"><span className="dot idle" />GEEL conectada</span>
            <span>sin corrida de mercado — abajo mostramos Dirección de marca, no tendencias inventadas</span>
          </>
        ) : (
          <>
            <span className="state"><span className="dot idle" />Datos de muestra</span>
            <span>el engine no está conectado — lo que ves es una maqueta, no hay crawl real detrás de estos números</span>
          </>
        )}
      </div>

      {connected && !live ? (
        <DirectionInspiration direction={direction} loading={direction === undefined} onNavigate={onNavigate} />
      ) : (
        <>
          {radarMode === "trends" && <CompetitorMoves live={live} items={compItems} />}

          <div className="sg4-toolbar" id="radarModes">
            {RMODES.map(([k, label]) => (
              <button key={k} className={`sg4-tab${radarMode === k ? " on" : ""}`} onClick={() => setRadarMode(k)}>{label}</button>
            ))}
            <div className="sp" />
            <div className="sg4-seg" id="genderSeg">
              {["all", "women", "men", "kids"].map((g) => (
                <button key={g} className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g === "all" ? "All" : g[0].toUpperCase() + g.slice(1)}</button>
              ))}
            </div>
          </div>

          <div id="radarBody">
            {radarMode === "trends" && (
              <TrendsMode mode={mode} gender={gender} trends={trends}
                watchSet={watchSet} dismissSet={dismissSet}
                onWatch={toggleWatch} onDismiss={dismiss} compItems={compItems} />
            )}
            {radarMode === "attributes" && <AttributesMode mode={mode} gender={gender} live={live} />}
            {radarMode === "colors" && <ColorsMode mode={mode} gender={gender} live={live} />}
          </div>
        </>
      )}

      <div className={`sg4-undo${undo ? " show" : ""}`}>
        <span>Descartaste <b>{undo}</b></span>
        <button onClick={undoDismiss}>Deshacer</button>
      </div>
    </section>
  );
}
