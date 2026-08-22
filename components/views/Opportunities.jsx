"use client";
// Oportunidades — catalogue gaps, computed AND evidenced by the engine.
//
// ⚠ THIS SCREEN NO LONGER COMPUTES ANYTHING. Owner review 2026-08-11: it showed
// "Sweaters" evidenced by three pairs of socks and a T-shirt, "Faldas" by tops,
// "Jeans" by shorts and a skirt — because the gaps were computed here, in the
// browser, by `findWhitespace` and a category rule table that had no underwear
// rule in it. A knitted sock tagged `knit` matched Sweaters and nothing ranked
// earlier caught it. His instruction: block the screen or move it to the server,
// because as it stood it turned bad classification into confident product advice.
//
// The 08-10 pass gated the local cards against the engine. That could not work:
// the engine judged the rows it selected while the card drew the rows the
// browser selected, so the verdict certified a different set than the one on
// screen. Now the engine computes the gap and returns the rows it counted, and
// this file renders them. Selection and evidence are the same set by
// construction — which is not a stronger check, it is the removal of the
// disagreement the check was measuring.
//
// ⚠ NO DEMO FALLBACK AND NO LOCAL RECOMPUTE. Failure renders "could not ask",
// never a card. Same rule as the World screen, for the same reason.
import { useEffect, useMemo, useState } from "react";
import { useEngine } from "@/components/EngineProvider";
import ExportButton from "@/components/ExportButton";
import { getOpportunities, mintRecommendation } from "@/lib/api";
import { stampHandoff } from "@/lib/handoff.mjs";
import { readScoped, removeScoped, writeScoped } from "@/lib/brandStore";
import AddEvidence from "@/components/AddEvidence";

const BRIEF_KEY = "atelier-design-brief"; // consumed by the Design Studio (see Feed)
const DISMISS_KEY = "atelier-ws-dismissed";

const TONE = {
  make: ["var(--sage)", "#EDF3EF"],
  explore: ["var(--cobalt)", "var(--cobalt-wash)"],
  watch: ["var(--ochre)", "#F6EFE0"],
};

// Per brand: a dismissal is a judgement about ONE brand's gaps.
function loadDismissed(brandId) {
  return new Set(readScoped(DISMISS_KEY, brandId, []) || []);
}

// Imagery-first strip: the real competitor references, visible by default.
// referrerPolicy="no-referrer" dodges hotlink/referer blocks that made some
// shops' CDNs silently 403 the images. If every thumb still fails, fall back
// to a quiet chip strip — never fake, never blank.
function ThumbStrip({ sample }) {
  const [failed, setFailed] = useState({});
  const withImg = sample.filter((s) => s.image_url);
  const allFailed = withImg.length === 0 || withImg.every((_, i) => failed[i]);

  if (allFailed) {
    return (
      <div className="ws3-chips" title="Las tiendas bloquean estas imágenes fuera de su sitio; las referencias siguen siendo reales">
        {sample.map((s, i) => (
          <a key={i} className="ws3-chip" href={s.url} target="_blank" rel="noreferrer">
            {s.competitor} · {s.currency} {s.price?.toLocaleString("es-AR")}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="ws3-strip">
      {withImg.map((s, i) =>
        failed[i] ? null : (
          <a key={i} className="ws3-thumb" href={s.url} target="_blank" rel="noreferrer" title={s.title}>
            <img
              src={s.image_url}
              alt={s.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailed((f) => ({ ...f, [i]: true }))}
            />
            <span className="ws3-thumb-cap">{s.competitor} · {s.currency} {s.price?.toLocaleString("es-AR")}</span>
          </a>
        )
      )}
    </div>
  );
}

// Compact "vos vs rivales" bar pair — lengths proportional to the real counts.
function CountBars({ mine, rivals }) {
  const max = Math.max(mine, rivals, 1);
  return (
    <div className="ws3-bars">
      <div className="ws3-bar-row">
        <span className="ws3-bar-l">vos</span>
        <span className="ws3-track"><i className="ws3-fill mine" style={{ width: `${(mine / max) * 100}%` }} /></span>
        <span className="ws3-bar-n">{mine}</span>
      </div>
      <div className="ws3-bar-row">
        <span className="ws3-bar-l">rivales</span>
        <span className="ws3-track"><i className="ws3-fill rivals" style={{ width: `${(rivals / max) * 100}%` }} /></span>
        <span className="ws3-bar-n">{rivals}</span>
      </div>
    </div>
  );
}

export default function Opportunities({ onNavigate }) {
  const engine = useEngine();
  const [data, setData] = useState(null);     // null = loading
  const [failed, setFailed] = useState(false); // request failed != no opportunities
  const [dismissed, setDismissed] = useState(() => (typeof window !== "undefined" ? loadDismissed(engine.brandId) : new Set()));
  const [open, setOpen] = useState({}); // evidence toggles
  const [sortBy, setSortBy] = useState("score"); // "score" | "cat"

  useEffect(() => {
    let off = false;
    if (!engine.brandId) { setData({ opportunities: [], withheld: [] }); return; }
    setData(null);
    getOpportunities(engine.brandId).then((body) => {
      if (off) return;
      setFailed(body === null);   // null = the request failed, NOT "no gaps"
      setData(body || { opportunities: [], withheld: [] });
    });
    return () => { off = true; };
  }, [engine.brandId]);

  const opps = useMemo(
    () => (data?.opportunities || []).filter((o) => !dismissed.has(o.key)),
    [data, dismissed]
  );
  const withheld = data?.withheld || [];

  const sorted = useMemo(
    () => (sortBy === "cat" ? [...opps].sort((a, b) => a.category.localeCompare(b.category, "es")) : opps),
    [opps, sortBy] // the engine already returns score-desc
  );

  function dismiss(key) {
    const next = new Set(dismissed); next.add(key);
    setDismissed(next);
    writeScoped(DISMISS_KEY, engine.brandId, [...next]);
  }

  // ⚠ THE LINEAGE WAS BEING THROWN AWAY (owner review 2026-08-11). This wrote
  // an ephemeral localStorage brief and nothing else, so a concept designed
  // from a validated opportunity could never afterwards prove WHICH opportunity
  // caused it — and the chain the tech pack depends on (forecast →
  // recommendation → concept → pack) had no first link. The card was validated
  // and the design was an orphan.
  //
  // Minting first fixes that: `POST /recommendations` freezes an immutable
  // judgement with the versions and cutoff it was computed under, and returns
  // an id the rest of the chain can cite. The `ws-<bucket>` key resolves
  // SERVER-side to the engine's own canonical category, so this cannot widen
  // the subject on the way through.
  //
  // ⚠ A FAILED MINT DOES NOT SILENTLY PROCEED. Designing with no citable
  // recommendation is exactly the orphan this fixes, so it is named on the card
  // rather than hidden — the designer decides whether to go anyway.
  const [minting, setMinting] = useState(null);   // key being minted
  const [mintFailed, setMintFailed] = useState({});

  async function design(o) {
    setMinting(o.key);
    const rec = await mintRecommendation(engine.brandId, {
      candidateKey: o.key, title: o.title, category: o.category,
    });
    setMinting(null);
    if (!rec?.id) {
      setMintFailed((f) => ({ ...f, [o.key]: true }));
      return;
    }
    // Stamped with the active brand. `atelier-design-brief` is a GLOBAL key,
    // so without this the handoff could be picked up under a DIFFERENT brand —
    // pick a gap under A, switch to B, open Studio, design A's opportunity
    // against B's DNA and palette. Studio refuses what it cannot attribute.
    localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff({
      // The first link in the chain, and the reason this is not a loose note.
      recommendation_id: rec.id,
      opportunity_key: o.key,
      recommendation_stance: rec.stance || null,
      trend: `Hueco: ${o.category}`,
      summary: o.title,
      rationale: o.brief.note,
      colors: [],
      fabric: o.brief.fabric,
      typology: o.brief.typology,
      sources: o.ars_brands.length ? o.ars_brands : o.brands,
      urls: o.sample.map((s) => s.url).filter(Boolean),
      image: o.sample[0]?.image_url,
      qty: null,
      priceHint: o.brief.price_hint,
    }, { brandId: engine.brandId, collectionNeutral: true })));
    onNavigate?.("studio");
  }

  const loading = data === null;

  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Inteligencia · Huecos de catálogo</div>
          <h1>Oportunidades</h1>
          <p>
            Dónde los competidores <b>ofrecen</b> en profundidad y tu marca casi no —
            un hueco de <b>surtido</b> (oferta observada, no demanda: un crawl prueba que
            lo publican, no que se vende). Lo calcula el motor sobre sus propias filas, y
            las referencias que ves debajo de cada hueco <b>son</b> los productos que
            contó: una sola función de categoría clasifica los dos lados.
            Sin pronósticos: los conteos son cosas reales. El <b>score</b> es la única
            excepción — es una priorización calculada (profundidad rival × apertura del
            hueco × mercado local × empuje de tendencia), no una medición.
          </p>
          {data?.panel?.note && (
            <p className="ws-panel-note">
              <b>Panel:</b>{" "}
              {Object.entries(data.panel.crawled_per_retailer || {})
                .map(([r, n]) => `${r} ${n}`).join(" · ")}
              {" — "}{data.panel.note}
            </p>
          )}
        </div>
        <div className="ws-count">
          <b>{opps.length}</b> {opps.length === 1 ? "hueco" : "huecos"}
        </div>
      </div>

      {loading && <div className="ws-empty">Analizando el catálogo de referencia contra el set de competidores…</div>}

      {/* ⚠ WITHHELD CATEGORIES ARE NAMED. Removing them silently would be its
          own dishonesty — the reader would see a shorter list and conclude
          those categories are covered. The engine's sentence is shown verbatim,
          because it names the items whose own titles contradicted the heading. */}
      {!loading && withheld.length > 0 && (
        <div className="ws-empty" style={{ borderLeft: "3px solid var(--ochre)" }}>
          <b>{withheld.length} {withheld.length === 1 ? "categoría retenida" : "categorías retenidas"}</b>
          {" "}— la evidencia que las respalda no es de esa categoría, así que no
          se muestran como oportunidad. Un puntaje exacto sobre un conjunto
          equivocado se cita con una autoridad que la evidencia no tiene.
          <ul style={{ marginTop: 10, paddingLeft: 18 }}>
            {withheld.map((w) => (
              <li key={w.category} style={{ marginBottom: 6 }}>
                <b>{w.category}</b> — {w.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && failed && (
        <div className="ws-empty">
          No pudimos consultar el motor. Esto <b>no</b> quiere decir que no haya
          huecos — quiere decir que la consulta falló. Esta pantalla no calcula
          huecos por su cuenta: hacerlo fue exactamente el defecto que la puso en
          duda, así que preferimos no mostrar nada antes que mostrar algo sin
          verificar.
          <div style={{ marginTop: 12 }}>
            <button className="ws-btn" onClick={() => onNavigate?.("competitors")}>Ir a Competitors →</button>
          </div>
        </div>
      )}

      {!loading && !failed && !opps.length && (
        <div className="ws-empty">
          {data?.reason ? (
            <>
              {data.reason}
              <div style={{ marginTop: 12 }}>
                <button className="ws-btn" onClick={() => onNavigate?.(
                  (data.catalog?.products || 0) === 0 ? "integrations" : "competitors")}>
                  {(data.catalog?.products || 0) === 0 ? "Conectar tu tienda →" : "Ir a Competitors →"}
                </button>
              </div>
            </>
          ) : withheld.length ? (
            "Todos los huecos encontrados quedaron retenidos por evidencia incoherente — ver arriba."
          ) : (
            "Sin huecos abiertos: cubrís en profundidad cada categoría donde los competidores tienen fondo. (O descartaste todos — reseteá abajo.)"
          )}
          {dismissed.size > 0 && (
            <div style={{ marginTop: 12 }}>
              <button className="ws-btn ghost" onClick={() => { setDismissed(new Set()); removeScoped(DISMISS_KEY, engine.brandId); }}>
                Restaurar {dismissed.size} descartado{dismissed.size > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && opps.length > 1 && (
        <div className="ws3-sort">
          <span className="ws3-sort-l">Ordenar</span>
          <button className={sortBy === "score" ? "on" : ""} onClick={() => setSortBy("score")}>por score</button>
          <button className={sortBy === "cat" ? "on" : ""} onClick={() => setSortBy("cat")}>por categoría</button>
          <span style={{ marginLeft: "auto" }}>
            <ExportButton filename="oportunidades" rows={sorted} columns={[
              { key: "category", header: "categoria" },
              { key: "title", header: "oportunidad" },
              { key: "score", header: "score" },
              { key: "verdict", header: "veredicto", get: (r) => r.verdict?.label || "" },
              { key: "rivals", header: "productos_rivales" },
              { key: "brands", header: "marcas", get: (r) => (r.brands || []).length },
              { key: "ars_rivals", header: "locales" },
              { key: "trend", header: "tendencia", get: (r) => r.trend?.name || "" },
              { key: "title_agreement", header: "coincidencia_titulos",
                get: (r) => (r.title_agreement?.measurable
                  ? `${r.title_agreement.agreeing}/${r.title_agreement.speaking}` : "no medible") },
            ]} />
          </span>
        </div>
      )}

      <div className="ws-cards">
        {sorted.map((o) => {
          const [tc, tw] = TONE[o.verdict.tone] || TONE.explore;
          const isOpen = open[o.key];
          const ta = o.title_agreement;
          return (
            <div key={o.key} className="ws-card">
              <div className="ws-card-top">
                <span className="ws-pill" style={{ color: tc, background: tw }}>{o.verdict.label}</span>
                <span
                  className="ws3-dial"
                  title={`Score ${o.score} — profundidad rival × apertura del hueco × mercado local × empuje de tendencia`}
                  style={{ background: `conic-gradient(${tc} ${o.score * 3.6}deg, var(--hair) 0)` }}
                >
                  <b>{o.score}</b>
                </span>
              </div>

              <h3 className="ws-title">{o.title}</h3>

              {/* What the rivals actually sell there — the engine's own rows */}
              <ThumbStrip sample={o.sample} />

              {/* §3 product-opportunity brief: internal (gated) + external + brand
                  logic + commercial target + risk. Not "this is trending". */}
              <div className="ws-brief">
                <div className="ws-brief-row gated">
                  <b>Interna</b><i className="ws-lock">🔒 Shopify</i>
                  búsquedas sin resultado, alto interés/baja cobertura, ganadores para extender — al conectar ventas
                </div>
                <div className="ws-brief-row">
                  <b>Externa</b>
                  {o.rivals} productos en {o.brands.length} {o.brands.length === 1 ? "marca" : "marcas"}
                  {o.trend ? ` · empuja "${o.trend.name}"` : ""}
                  {o.ars_rivals > 0 ? ` · ${o.ars_rivals} local` : " · sólo internacional"}
                </div>
                <div className="ws-brief-row">
                  <b>Lógica de marca</b>
                  {o.yours > 0
                    ? `extendés tu categoría (${o.yours} propio${o.yours > 1 ? "s" : ""}) sin duplicar`
                    : "categoría sin cobertura propia — territorio nuevo para la marca"}
                </div>
                <div className="ws-brief-row">
                  <b>Objetivo comercial</b>
                  {o.brief.price_hint || "—"} · test chico primero, después escalás o cortás
                </div>
                <div className="ws-brief-row risk"><b>Riesgo</b>{o.risk}</div>
              </div>

              {/* Evidence tree — the counts that produced this gap */}
              <div className="ws-tree">
                <CountBars mine={o.yours} rivals={o.rivals} />
                <div className="ws-branch">
                  <span className="ws-k">Marcas rivales</span>
                  <span className="ws-v">
                    {o.brands.length} {o.brands.length === 1 ? "marca" : "marcas"} en la categoría
                  </span>
                </div>
                <div className="ws-branch">
                  <span className="ws-k">Rivales locales (ARS)</span>
                  <span className="ws-v">
                    {o.ars_rivals > 0
                      ? <>{o.ars_rivals} de {o.ars_brands.join(", ")}{o.ars_avg_label ? ` · prom. ${o.ars_avg_label}` : ""}</>
                      : <span className="ws-muted">ninguno — sólo marcas internacionales (dirección, no precio)</span>}
                  </span>
                </div>
                {o.trend && (
                  <div className="ws-branch">
                    <span className="ws-k">Tendencia que empuja</span>
                    <span className="ws-v">{o.trend.name} · fit {Math.round(o.trend.fit * 100)}</span>
                  </div>
                )}
                {/* ⚠ THE PANEL, ON THE CARD. The score used to treat every crawled
                    product as an equal market vote, so a retailer we harvested 60
                    products from outvoted one we harvested 20 from — measuring our
                    own crawl budget. Each shop now weighs once, by the share of its
                    OWN crawled assortment in this category, and the card says how
                    many shops that is. */}
                <div className="ws-branch">
                  <span className="ws-k">Panel</span>
                  <span className="ws-v">
                    {o.retailers_carrying} {o.retailers_carrying === 1 ? "tienda" : "tiendas"} la trabajan
                    {" · "}{(o.prevalence * 100).toFixed(1)}% del surtido crawleado, promedio por tienda
                  </span>
                </div>
                {/* ⚠ A COUNT WITH NO DATE READS AS CURRENT. */}
                <div className="ws-branch">
                  <span className="ws-k">Evidencia</span>
                  <span className="ws-v">
                    {o.evidence_window?.age_days != null ? (
                      <>
                        lo más nuevo, hace {o.evidence_window.age_days} día{o.evidence_window.age_days === 1 ? "" : "s"}
                        {o.evidence_window.dated_items < o.evidence_window.total_items
                          ? ` · ${o.evidence_window.dated_items} de ${o.evidence_window.total_items} con fecha`
                          : ""}
                        {o.evidence_window.stale
                          ? <b style={{ color: "var(--ochre)" }}> · lectura vieja</b> : ""}
                      </>
                    ) : (
                      <span className="ws-muted">{o.evidence_window?.note || "sin fechas"}</span>
                    )}
                  </span>
                </div>
                {/* ⚠ THE BASIS, ON THE CARD. The engine reads each reference's own
                    TITLE — the one field the shop's category label did not write —
                    and reports how many name this category. A card that shows its
                    own agreement is a card whose basis can be argued with; the
                    categories that failed this are listed above, not here. */}
                <div className="ws-branch">
                  <span className="ws-k">Coincidencia de títulos</span>
                  <span className="ws-v">
                    {ta?.measurable
                      ? <>{ta.agreeing} de {ta.speaking} títulos dicen «{o.category}»
                          {ta.silent ? ` · ${ta.silent} sin nombrar prenda` : ""}</>
                      : <span className="ws-muted">
                          muy pocos títulos nombran una prenda ({ta?.speaking || 0}) — no se mide
                        </span>}
                  </span>
                </div>
              </div>

              <button className="ws-ev-toggle" onClick={() => setOpen((s) => ({ ...s, [o.key]: !s[o.key] }))}>
                {isOpen ? "− ocultar detalle" : `+ detalle · links y nota de ${o.sample.length} de ${o.evidence_total} referencias`}
              </button>
              {isOpen && (
                <div className="ws-evidence">
                  {o.sample.map((s, i) => (
                    <a key={i} className="ws-ref" href={s.url} target="_blank" rel="noreferrer">
                      {s.image_url && <img src={s.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />}
                      <span className="ws-ref-t">{s.title}</span>
                      <span className="ws-ref-m">{s.competitor} · {s.currency} {s.price?.toLocaleString("es-AR")}</span>
                    </a>
                  ))}
                  <p className="ws-note">{o.brief.note}</p>
                </div>
              )}

              <div className="ws-actions">
                {/* The handoff that does NOT go through localStorage: this
                    writes a server-side evidence link on the collection's
                    brief, pinned to what was observed and when. */}
                <AddEvidence evidence={{
                  evidence_type: "opportunity",
                  evidence_id: o.key,
                  relevance: `${o.rivals} productos rivales en ${o.brands.length} marca(s); ${o.yours} tuyos`,
                  observed_at: o.sample[0]?.published_at || null,
                  // The CONTENT of the reading, so the snapshot preserves what
                  // this card actually said and not merely that it existed.
                  payload: {
                    category: o.category, competitor_products: o.rivals,
                    rival_brands: o.brands, your_products: o.yours,
                    verdict: o.verdict?.label || null,
                    title_agreement: o.title_agreement || null,
                  },
                }} />
                <button className="ws-btn primary" disabled={minting === o.key}
                  onClick={() => design(o)}>
                  {minting === o.key ? "Registrando la recomendación…" : "✦ Diseñar para este hueco →"}
                </button>
                <button className="ws-btn" onClick={() => onNavigate?.("collections")}>◫ Generar cápsula →</button>
                <button className="ws-btn ghost" onClick={() => dismiss(o.key)}>Pasá</button>
              </div>
              {mintFailed[o.key] && (
                <div className="ws-note" style={{ color: "var(--clay)", marginTop: 8 }}>
                  No pudimos registrar la recomendación en el motor, así que el
                  diseño no podría citar de qué oportunidad salió. Preferimos no
                  arrancar un concepto huérfano: reintentá cuando el motor
                  responda.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
