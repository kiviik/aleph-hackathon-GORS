"use client";
// Brand Model — five editable layers (spec 2026-07-19):
//   Identidad visual / Identidad de producto / Identidad comercial /
//   Identidad de cliente / Límites creativos.
// Identity is STRATEGIC: the team declares it, the engine proposes, outcomes
// validate it. Visual+producto are prefilled from the latest engine DNA
// (labeled "detectado por el engine · editable"); comercial from the REAL
// price bands (engine price_architecture, else the real catalog); cliente is
// honestly empty until real data exists; límites creativos are owner-declared.
//
// Persistence: localStorage 'atelier-brand-model'. Merge rule: user edits
// override engine values (same id), removed engine items stay removed, and an
// engine refresh only ADDS — it never silently clobbers what the team wrote.
// Every item carries a source tag: "engine" | "catalogo" | "tuyo".
// "catalogo" = derived here from the brand's own catalog prices, NOT learned
// by a DNA run. Kept distinct so provenance is never overstated.
import { useEffect, useMemo, useRef, useState } from "react";
import { DNA_CORE } from "@/lib/data";
import { fmtShortDate } from "@/lib/feed";
import { useBrandCatalog } from "@/lib/useBrandCatalog";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import { readScoped, writeScoped } from "@/lib/brandStore";

const STORE_KEY = "atelier-brand-model";

const LAYERS = [
  { id: "visual", title: "Lenguaje visual", ph: "ej: negro como base, gráfica rock/cine…" },
  { id: "producto", title: "Lenguaje de producto", ph: "ej: remeras gráficas hero, oversize urbano…" },
  { id: "comercial", title: "Lenguaje comercial", ph: "ej: banda core $25.000–$42.000…" },
  { id: "cliente", title: "Lenguaje de cliente", ph: "ej: mujer urbana 25–35, compra por la estampa…" },
  { id: "limites", title: "Límites creativos", ph: "ej: nada de logomanía ajena, nada de neón…" },
];

// The Brand Genome, not one DNA score (TRUST-ARCHITECTURE §2): each layer
// declares WHERE it's learned from and what still gates it. Two layers are
// live from the catalog; commercial is partial; customer needs Shopify;
// creative boundaries learn from the team's own keep/reject decisions.
const LAYER_GATE = {
  visual: { tone: "live", label: "aprendido del catálogo · editable" },
  producto: { tone: "live", label: "aprendido del catálogo · editable" },
  comercial: { tone: "partial", label: "bandas del catálogo — velocidad, margen, curva de talles y devoluciones necesitan Shopify" },
  cliente: { tone: "shopify", label: "necesita Shopify — búsquedas, combinaciones de compra, sensibilidad al precio" },
  limites: { tone: "designer", label: "se aprende de tus decisiones keep/reject · editable" },
};
const GATE_HINT = {
  cliente: "Conectá Shopify + analytics para aprender qué busca tu cliente, qué combina, a qué precio compra y qué repite. Hasta entonces, declaralo vos.",
  comercial: "Las bandas salen de tu catálogo real. Velocidad de venta, margen, curva de talles y tolerancia a devoluciones se aprenden al conectar Shopify.",
};

const money = (n) => "$" + Math.round(n).toLocaleString("es-AR");

// Everything the engine can prefill, keyed by stable ids so a re-run merges
// instead of duplicating. Bands come from real data on either path.
function engineItems(dna, catalogPrices) {
  const out = { visual: [], producto: [], comercial: [], cliente: [], limites: [] };
  if (dna) {
    for (const k of dna.keywords || []) out.visual.push({ id: `kw:${k.label}`, text: k.label, source: "engine" });
    for (const h of dna.palette || []) out.visual.push({ id: `pal:${h}`, text: h, swatch: h, source: "engine" });
    for (const s of dna.silhouettes || []) out.producto.push({ id: `sil:${s.label}`, text: s.label, source: "engine" });
    for (const m of dna.materials || []) out.producto.push({ id: `mat:${m.label}`, text: m.label, source: "engine" });
    for (const b of dna.priceArchitecture || []) {
      out.comercial.push({
        id: `band:${b.name}`,
        text: `banda ${b.name}: ${money(b.low)}–${money(b.high)}${b.share != null ? ` (${Math.round(b.share * 100)}% de la línea)` : ""}`,
        source: "engine",
      });
    }
  }
  if (!out.comercial.length && catalogPrices) {
    // Tertile bands over the ACTIVE brand's own catalog prices, served by the
    // engine (GET /brands/{id}/catalog). This fallback used to read the 36
    // hardcoded Complot prices and label them "de tu catálogo real" with
    // source "engine" — a false provenance on someone else's numbers, shown to
    // every brand (2026-07-24 audit). Source is now "catálogo", because that is
    // what it is: derived here from the catalog, not learned by a DNA run.
    const { min, p33, p67, max } = catalogPrices;
    out.comercial = [
      { id: "catband:entry", text: `banda entry: ${money(min)}–${money(p33)} · de tu catálogo`, source: "catalogo" },
      { id: "catband:core", text: `banda core: ${money(p33)}–${money(p67)} · de tu catálogo`, source: "catalogo" },
      { id: "catband:premium", text: `banda premium: ${money(p67)}–${money(max)} · de tu catálogo`, source: "catalogo" },
    ];
  }
  return out;
}

// Per brand: these are one brand's genome edits (2026-07-24 audit).
function loadStore(brandId) {
  const s = readScoped(STORE_KEY, brandId, null);
  if (s && s.v === 1 && s.layers) return s;
  return { v: 1, layers: {} };
}

function layerState(store, id) {
  return store.layers[id] || { items: [], removedEngine: [] };
}

// Merge: engine proposes, the team's version wins. Same id => user override.
function mergeLayer(store, id, eng) {
  const st = layerState(store, id);
  const userById = new Map(st.items.map((i) => [i.id, i]));
  const removed = new Set(st.removedEngine || []);
  const fromEngine = (eng[id] || []).filter((e) => !removed.has(e.id) && !userById.has(e.id));
  return [...fromEngine, ...st.items];
}

function Chip({ item, onEdit, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t && t !== item.text) onEdit(t); else setText(item.text);
  };

  if (editing) {
    return (
      <span className={`bm2-chip editing ${item.source}`}>
        <input
          ref={ref} className="bm2-chip-input" value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(item.text); setEditing(false); } }}
        />
      </span>
    );
  }
  return (
    <span className={`bm2-chip ${item.source}`}>
      {item.swatch && <i className="bm2-chip-sw" style={{ background: item.swatch }} />}
      <button className="bm2-chip-txt" title="editar" onClick={() => setEditing(true)}>{item.text}</button>
      <em className="bm2-chip-tag">{item.source === "catalogo" ? "catálogo" : item.source}</em>
      <button className="bm2-chip-x" title="sacar" onClick={onRemove}>×</button>
    </span>
  );
}

function AddChip({ placeholder, onAdd }) {
  const [text, setText] = useState("");
  const commit = () => {
    const t = text.trim();
    if (t) { onAdd(t); setText(""); }
  };
  return (
    <div className="bm2-add">
      <input
        value={text} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      <button onClick={commit}>+ agregar</button>
    </div>
  );
}

export default function BrandDNA() {
  const engine = useEngine();
  const brandId = useBrandId();
  const live = engine.status === "live";
  const dna = live ? engine.dna : null;
  const brandCatalog = useBrandCatalog();
  const eng = useMemo(() => engineItems(dna, brandCatalog.prices), [dna, brandCatalog.prices]);

  // localStorage only exists on the client — hydrate after mount.
  const [store, setStore] = useState(null);
  // Keyed on brandId: this effect READS brandId, so an empty dep list left the
  // previous brand's genome on screen after a switch — and `persist` would then
  // write that stale state into the NEW brand's bucket (owner audit P0,
  // 2026-07-24). Clearing first means a switch can never show, or save, the
  // wrong brand's DNA even for one frame.
  useEffect(() => {
    setStore(null);
    const s = loadStore(brandId);
    // Seed límites once from the brand's declared forbidden codes; after
    // that the list is entirely the team's — never re-seeded, never clobbered.
    if (!s.layers.limites?.seeded) {
      const existing = layerState(s, "limites");
      s.layers.limites = {
        ...existing,
        seeded: true,
        items: existing.items.length
          ? existing.items
          : (DNA_CORE?.forbidden || []).map((v, i) => ({ id: `lim:${i}:${v}`, text: v, source: "tuyo" })),
      };
      writeScoped(STORE_KEY, brandId, s);
    }
    setStore(s);
  }, [brandId]);

  const persist = (next) => {
    setStore(next);
    try { writeScoped(STORE_KEY, brandId, next); } catch { /* full/blocked */ }
  };

  const mutate = (layerId, fn) => {
    const st = layerState(store, layerId);
    const next = { ...store, layers: { ...store.layers, [layerId]: fn({ items: [...st.items], removedEngine: [...(st.removedEngine || [])], seeded: st.seeded }) } };
    persist(next);
  };

  const addItem = (layerId, text) =>
    mutate(layerId, (st) => ({ ...st, items: [...st.items, { id: `u:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, source: "tuyo" }] }));

  // Editing an engine chip makes it yours (source "tuyo", same id) — the
  // stored version overrides the engine's on every future merge.
  const editItem = (layerId, item, text) =>
    mutate(layerId, (st) => {
      const i = st.items.findIndex((x) => x.id === item.id);
      const edited = { ...item, text, source: "tuyo" };
      if (i >= 0) st.items[i] = edited; else st.items.push(edited);
      return st;
    });

  const removeItem = (layerId, item) =>
    mutate(layerId, (st) => {
      st.items = st.items.filter((x) => x.id !== item.id);
      const isEngineId = (eng[layerId] || []).some((e) => e.id === item.id);
      if (isEngineId && !st.removedEngine.includes(item.id)) st.removedEngine.push(item.id);
      return st;
    });

  const srcNote = (id) => {
    if (id === "visual" || id === "producto") return dna ? "detectado por el engine · editable" : "sin corrida del engine todavía — declaralo vos";
    if (id === "comercial") return dna?.priceArchitecture?.length ? "bandas reales de tu arquitectura de precios · editable" : "bandas de tu catálogo real · editable";
    if (id === "cliente") return "sin datos de clientes — se completa con resultados o lo declarás vos";
    return "lo declarás vos — el engine nunca lo pisa";
  };

  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Marca y conexión · ADN</div>
          <h1>ADN de marca</h1>
          <p className="bm2-lede">
            Cinco capas, no un puntaje — <b>el engine propone, vos editás, los resultados validan</b>. Cada capa dice de dónde aprende y qué la habilita.
            {live && engine.generatedAt && <span className="bm2-lineage"> · última corrida del engine: {fmtShortDate(engine.generatedAt)}</span>}
          </p>
        </div>
      </div>

      {!store ? (
        <div className="bm2-loading">cargando tu modelo…</div>
      ) : (
        <div className="bm2-grid">
          {LAYERS.map((l) => {
            const merged = mergeLayer(store, l.id, eng);
            return (
              <div className="bm2-card" key={l.id}>
                <div className="bm2-card-head">
                  <h3>{l.title} <i className={`bm2-gate ${LAYER_GATE[l.id].tone}`}>
                    {LAYER_GATE[l.id].tone === "live" ? "activa"
                      : LAYER_GATE[l.id].tone === "partial" ? "parcial"
                      : LAYER_GATE[l.id].tone === "shopify" ? "necesita Shopify"
                      : "aprende del equipo"}</i></h3>
                  <span className="bm2-src">{LAYER_GATE[l.id].label}</span>
                </div>
                {GATE_HINT[l.id] && <p className="bm2-gatehint">{GATE_HINT[l.id]}</p>}
                {merged.length === 0 ? (
                  <p className="bm2-empty">
                    {l.id === "cliente"
                      ? "sin datos de clientes — se completa con resultados o lo declarás vos"
                      : l.id === "limites"
                      ? "sin límites declarados todavía — sumá los tuyos"
                      : "nada detectado todavía — agregá lo que define tu marca"}
                  </p>
                ) : (
                  <div className="bm2-chips">
                    {merged.map((item) => (
                      <Chip
                        key={item.id}
                        item={item}
                        onEdit={(text) => editItem(l.id, item, text)}
                        onRemove={() => removeItem(l.id, item)}
                      />
                    ))}
                  </div>
                )}
                <AddChip placeholder={l.ph} onAdd={(t) => addItem(l.id, t)} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
