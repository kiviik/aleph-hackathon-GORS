"use client";
// Buscador visual — el precedente de diseño, en dos ámbitos:
//   EN TU ARCHIVO  — qué tan cerca ya estuviste de esta prenda (riesgo de
//                    repetirte), con puntajes por atributo inspeccionables.
//   EN EL MERCADO  — qué venden HOY los competidores crawleados que se le
//                    parece (imágenes reales, precios reales, link al
//                    original). Coincidencia léxica/por atributos, con las
//                    palabras que matchearon a la vista — nunca un oráculo.
// Todo termina en una acción: usar la prenda como referencia en el Studio.
import { useEffect, useMemo, useState } from "react";
import { CATALOG, ars, vsResults, vsOverlap, vsMarketRank } from "@/lib/catalog";
import { colName } from "@/lib/signals";
import { getCompetitorItems } from "@/lib/api";
import { useEngine } from "@/components/EngineProvider";
import { stampHandoff } from "@/lib/handoff.mjs";
import Thumbnail from "@/components/Thumbnail";

const BRIEF_KEY = "atelier-design-brief"; // read by DesignStudio on mount

const REGIONS = [["whole", "Todo"], ["silhouette", "Silueta"], ["fabric", "Tejido"], ["colour", "Color"], ["price", "Precio"]];
const scoreCol = (v) => (v >= 80 ? "var(--sage)" : v >= 55 ? "var(--ochre)" : "var(--clay)");

// Stamped: Studio refuses a handoff whose brand it cannot verify.
function seedStudio(brief, onNavigate, brandId) {
  try { localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff(brief, { brandId, collectionNeutral: true }))); } catch { /* full */ }
  onNavigate?.("studio");
}

export default function VisualSearch({ onNavigate }) {
  const engine = useEngine();
  const live = engine.status === "live";
  const [source, setSource] = useState(null);
  const [region, setRegion] = useState("whole");
  const [market, setMarket] = useState(null); // null = not loaded, [] = loaded empty
  const [compare, setCompare] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    if (live && engine.brandId) getCompetitorItems(engine.brandId).then((r) => setMarket(Array.isArray(r) ? r : []));
  }, [live, engine.brandId]);

  const src = source;
  const results = useMemo(() => vsResults(src, region), [src, region]);
  const overlap = src ? vsOverlap(src) : null;
  const marketHits = useMemo(() => vsMarketRank(src, market || [], colName).slice(0, 8), [src, market]);

  const toggleCompare = (style) =>
    setCompare((c) => (c.includes(style) ? c.filter((x) => x !== style) : [...c, style].slice(0, 4)));
  const compareItems = compare.map((s) => CATALOG.find((p) => p.style === s));
  const compRows = [
    ["Tipología", (p) => p.g], ["Categoría", (p) => p.cat], ["Tejido", (p) => p.f],
    ["Color líder", (p) => colName(p.colors[0])], ["Precio", (p) => ars(p.price)],
  ];

  const studioFromCatalog = (p) => seedStudio({
    trend: p.n,
    summary: `Precedente de tu archivo: ${p.n} (${p.cat}, ${p.f}, ${ars(p.price)}).`,
    rationale: "Buscador visual — sucesor de una prenda propia.",
    colors: p.colors, fabric: p.f, typology: p.g, sources: ["tu catálogo"],
    urls: p.url ? [p.url] : [], image: p.img,
  }, onNavigate, engine.brandId);

  const studioFromMarket = (r) => seedStudio({
    trend: r.it.title,
    summary: `Referencia real de ${r.it.competitor}${r.it.price ? ` (${r.it.currency} ${r.it.price})` : ""} — encontrada por cercanía a ${src.n}.`,
    rationale: `Coincide en: ${r.matched.join(", ")}.`,
    colors: src.colors, fabric: src.f, typology: src.g,
    sources: [r.it.competitor], urls: r.it.url ? [r.it.url] : [], image: r.it.image_url,
  }, onNavigate, engine.brandId);

  return (
    <section className="view on">
      <style dangerouslySetInnerHTML={{ __html: `
        .vx{display:grid;grid-template-columns:295px 1fr;gap:18px;align-items:start}
        @media(max-width:900px){.vx{grid-template-columns:1fr}}
        .vx-rail{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px}
        .vx-pickgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;max-height:340px;overflow-y:auto;padding-right:2px}
        .vx-pick{border:1.5px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;background:none;padding:0;position:relative}
        .vx-pick:hover{border-color:var(--cobalt)}
        .vx-pick .mtile{width:100%;aspect-ratio:3/4;border-radius:0}
        .vx-pick .mtile img{width:100%;height:100%;object-fit:cover}
        .vx-pick span{position:absolute;left:0;right:0;bottom:0;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(transparent,rgba(20,18,12,.75));padding:14px 5px 4px;text-align:left;line-height:1.15}
        .vx-src{display:flex;gap:11px;align-items:center;margin-bottom:4px}
        .vx-src .im{width:74px;height:92px;border-radius:10px;overflow:hidden;flex:none}
        .vx-src .im .mtile{width:100%;height:100%;border-radius:0}
        .vx-src .im .mtile img{width:100%;height:100%;object-fit:cover}
        .vx-src .nm{font-size:13.5px;font-weight:700;color:var(--ink)}
        .vx-src .sub{font-size:11px;color:var(--ink-3);margin:2px 0 5px}
        .vx-attrs{display:flex;gap:4px;flex-wrap:wrap}
        .vx-attrs span{font-size:11px;font-weight:700;letter-spacing:.03em;background:var(--paper-2);border:1px solid var(--line);border-radius:999px;padding:2px 7px;color:var(--ink-2)}
        .vx-change{background:none;border:none;cursor:pointer;font-size:11px;color:var(--cobalt);padding:6px 0 0}
        .vx-chips{display:flex;gap:5px;flex-wrap:wrap}
        .vx-chip{border:1px solid var(--line);background:var(--paper-2);border-radius:999px;font-size:11px;font-weight:600;padding:5px 11px;cursor:pointer;color:var(--ink-2)}
        .vx-chip.on{background:var(--night);color:#fff;border-color:var(--night)}
        .vx-risk{border:1px solid var(--line);border-left-width:3px;border-radius:10px;padding:9px 12px;margin-top:6px}
        .vx-risk .lvl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
        .vx-risk .det{font-size:11.5px;color:var(--ink-2);margin-top:2px}
        .vx-note{font-size:11px;color:var(--ink-3);margin-top:7px;line-height:1.45}
        .vx-lane{display:flex;align-items:baseline;gap:9px;margin:2px 0 10px}
        .vx-lane h3{font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2);margin:0}
        .vx-lane .hint{font-size:11px;color:var(--ink-3)}
        .vx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:11px;margin-bottom:22px}
        .vx-card{background:var(--card);border:1px solid var(--line);border-radius:13px;overflow:hidden}
        .vx-fig{position:relative;aspect-ratio:4/5;background:var(--paper-2)}
        .vx-fig .mtile{width:100%;height:100%;border-radius:0}
        .vx-fig .mtile img{width:100%;height:100%;object-fit:cover}
        .vx-pct{position:absolute;top:8px;left:8px;font-size:11px;font-weight:800;background:rgba(20,18,12,.78);color:#fff;border-radius:999px;padding:3px 9px}
        .vx-cmp{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:999px;border:none;background:rgba(255,255,255,.92);font-size:13px;font-weight:800;cursor:pointer;color:var(--ink-2)}
        .vx-cmp.on{background:var(--night);color:#fff}
        .vx-body{padding:10px 12px 11px}
        .vx-nm{font-size:12.5px;font-weight:650;color:var(--ink);line-height:1.25}
        .vx-meta{font-size:11px;color:var(--ink-3);margin:2px 0 7px}
        .vx-bars .row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
        .vx-bars .l{font-size:11px;color:var(--ink-3);width:44px;flex:none}
        .vx-bars .bar{flex:1;height:3.5px;border-radius:99px;background:var(--paper-2);overflow:hidden}
        .vx-bars .bar i{display:block;height:100%;border-radius:99px}
        .vx-bars .v{font-size:11px;color:var(--ink-2);width:20px;text-align:right;font-weight:700}
        .vx-why{font-size:11px;color:var(--ink-3);margin-top:6px;line-height:1.4}
        .vx-match{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
        .vx-match span{font-size:11px;font-weight:700;background:var(--paper-2);border:1px solid var(--line);border-radius:999px;padding:2px 7px;color:var(--ink-2)}
        .vx-acts{display:flex;gap:6px;margin-top:9px;align-items:center}
        .vx-studio{flex:1;border:none;border-radius:8px;background:var(--cobalt);color:#fff;font-size:11px;font-weight:700;padding:7px 8px;cursor:pointer}
        .vx-studio:hover{opacity:.88}
        .vx-out{font-size:11px;font-weight:700;color:var(--cobalt);text-decoration:none;flex:none}
        .vx-honest{border:1.5px dashed var(--line);border-radius:12px;padding:16px;font-size:11.5px;color:var(--ink-3);margin-bottom:22px}
        .vx-hero{border:1.5px dashed var(--line);border-radius:14px;padding:44px 26px;text-align:center;color:var(--ink-3)}
        .vx-hero h3{color:var(--ink);font-size:15px;margin:8px 0 6px}
        .vx-hero p{font-size:12px;max-width:460px;margin:0 auto;line-height:1.5}
        .vx-tray{position:sticky;bottom:12px;display:flex;gap:8px;align-items:center;background:var(--night);border-radius:12px;padding:10px 14px;margin-top:14px;flex-wrap:wrap}
        .vx-tray .lb{font-size:11px;color:rgba(255,255,255,.65);font-weight:700}
        .vx-tray .ch{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.12);color:#fff;border-radius:999px;font-size:11px;padding:4px 10px}
        .vx-tray .ch button{background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:12px}
        .vx-tray .go{margin-left:auto;border:none;border-radius:9px;background:#fff;color:var(--ink);font-size:11.5px;font-weight:800;padding:8px 13px;cursor:pointer}
        .vx-tray .go:disabled{opacity:.4;cursor:default}
        .vx-table{background:var(--card);border:1px solid var(--line);border-radius:13px;overflow-x:auto;margin-top:12px}
        .vx-table table{width:100%;border-collapse:collapse;font-size:12px}
        .vx-table th,.vx-table td{padding:9px 13px;text-align:left;border-bottom:1px solid var(--line)}
        .vx-table th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
        .vx-table .ref{background:var(--paper-2)}
        .vx-table tr:last-child td{border-bottom:none}
      ` }} />

      <div className="vh">
        <div>
          <div className="eyebrow">Precedente de diseño · archivo + mercado</div>
          <h1>Buscador visual</h1>
          <p>Elegí una prenda y Atelier te muestra qué tan cerca ya estuviste en tu propio archivo — y qué venden hoy los competidores que se le parece. Cada puntaje es inspeccionable; nada es un oráculo.</p>
        </div>
        <span className={`dq ${src ? "high" : "med"}`}><span className="d" />{src ? `${CATALOG.length} prendas propias · ${market?.length || 0} del mercado` : "elegí una prenda"}</span>
      </div>

      <div className="vx">
        <div className="vx-rail">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Prenda de origen</div>
          {src ? (
            <>
              <div className="vx-src">
                <div className="im"><Thumbnail color={src.colors[0]} fabric={src.f} img={src.img} /></div>
                <div>
                  <div className="nm">{src.n}</div>
                  <div className="sub">{src.cat} · {ars(src.price)}</div>
                  <div className="vx-attrs">{[src.g, src.f, colName(src.colors[0])].map((a) => <span key={a}>{a}</span>)}</div>
                  <button className="vx-change" onClick={() => setSource(null)}>← cambiar prenda</button>
                </div>
              </div>

              <div className="eyebrow" style={{ margin: "14px 0 7px" }}>Buscar por</div>
              <div className="vx-chips">
                {REGIONS.map(([k, l]) => <button key={k} className={`vx-chip${region === k ? " on" : ""}`} onClick={() => setRegion(k)}>{l}</button>)}
              </div>
              <div className="vx-note">Atelier puntúa solo lo que el catálogo registra — tipología, tejido, color y precio. Escote, construcción y proporción no están etiquetados, así que no se puntúan.</div>

              <div className="eyebrow" style={{ margin: "14px 0 5px" }}>Riesgo de repetirte</div>
              <div className="vx-risk" style={{ borderLeftColor: overlap.level[1] }}>
                <div className="lvl" style={{ color: overlap.level[1] }}>{overlap.level[0]}</div>
                <div className="det">
                  {overlap.near.length
                    ? `${overlap.near.length} prenda${overlap.near.length === 1 ? "" : "s"} tuya${overlap.near.length === 1 ? "" : "s"} comparte${overlap.near.length === 1 ? "" : "n"} tipología y tejido — un sucesor puede repetir el archivo.`
                    : "Ninguna prenda tuya comparte tipología y tejido — es una dirección nueva en tu línea."}
                </div>
              </div>
              <div className="vx-note">La superposición se mide <b>dentro de tu catálogo</b>, no en el mercado — marca repetición, no saturación.</div>
            </>
          ) : (
            <>
              <div className="vx-note" style={{ marginTop: 0, marginBottom: 9 }}>Tocá cualquier prenda de tu catálogo real ({CATALOG.length}):</div>
              <div className="vx-pickgrid">
                {CATALOG.map((p) => (
                  <button className="vx-pick" key={p.style} onClick={() => setSource(p)} title={p.n}>
                    <Thumbnail color={p.colors[0]} fabric={p.f} img={p.img} />
                    <span>{p.n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          {src ? (
            <>
              <div className="vx-lane">
                <h3>En tu archivo</h3>
                <span className="hint">{results.length} precedentes · ordenados por {REGIONS.find(([k]) => k === region)[1].toLowerCase()}</span>
              </div>
              <div className="vx-grid">
                {results.slice(0, 8).map((r) => (
                  <div className="vx-card" key={r.p.style}>
                    <div className="vx-fig">
                      <Thumbnail color={r.p.colors[0]} fabric={r.p.f} img={r.p.img} />
                      <span className="vx-pct">{r.head}%</span>
                      <button className={`vx-cmp${compare.includes(r.p.style) ? " on" : ""}`} title="Comparar" onClick={() => toggleCompare(r.p.style)}>
                        {compare.includes(r.p.style) ? "✓" : "+"}
                      </button>
                    </div>
                    <div className="vx-body">
                      <div className="vx-nm">{r.p.n}</div>
                      <div className="vx-meta">{r.p.cat} · {ars(r.p.price)}</div>
                      <div className="vx-bars">
                        {[["Silueta", r.sc.garment], ["Tejido", r.sc.fabric], ["Color", r.sc.colour], ["Precio", r.sc.price]].map(([l, v]) => (
                          <div className="row" key={l}>
                            <span className="l">{l}</span>
                            <span className="bar"><i style={{ width: `${v}%`, background: scoreCol(v) }} /></span>
                            <span className="v">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="vx-why">{r.why}</div>
                      <div className="vx-acts">
                        <button className="vx-studio" onClick={() => studioFromCatalog(r.p)}>Usar en Studio →</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="vx-lane">
                <h3>En el mercado</h3>
                <span className="hint">
                  {market === null
                    ? "prendas reales de tu set competitivo"
                    : `${marketHits.length} de ${market.length} prendas crawleadas coinciden`}
                </span>
              </div>
              {!live ? (
                <div className="vx-honest">El ámbito mercado necesita el engine conectado — las prendas de competidores salen del crawl real, no se inventan. Prendé el engine y esta franja se llena sola.</div>
              ) : market === null ? (
                <div className="vx-honest">Cargando el set competitivo…</div>
              ) : marketHits.length === 0 ? (
                <div className="vx-honest">Ninguna prenda crawleada coincide léxicamente con <b>{src.n}</b>. Eso también es dato: nadie del set está nombrando esta combinación hoy.</div>
              ) : (
                <div className="vx-grid">
                  {marketHits.map((r) => (
                    <div className="vx-card" key={r.it.url || r.it.title}>
                      <div className="vx-fig">
                        <Thumbnail color={src.colors[0]} fabric={src.f} img={r.it.image_url} />
                      </div>
                      <div className="vx-body">
                        <div className="vx-nm">{r.it.title}</div>
                        <div className="vx-meta">
                          {r.it.competitor}
                          {r.it.price > 0 && <> · {r.it.currency === "ARS" ? ars(r.it.price) : `${r.it.currency} ${r.it.price}`}</>}
                        </div>
                        <div className="vx-match">{r.matched.map((m) => <span key={m}>{m}</span>)}</div>
                        <div className="vx-acts">
                          <button className="vx-studio" onClick={() => studioFromMarket(r)}>Usar en Studio →</button>
                          {r.it.url && <a className="vx-out" href={r.it.url} target="_blank" rel="noreferrer">original ↗</a>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="vx-hero">
              <div style={{ fontSize: 26 }}>⌖</div>
              <h3>Elegí una prenda para empezar</h3>
              <p>Atelier encuentra sus precedentes más cercanos en tu archivo (con puntajes por atributo que podés inspeccionar) y las prendas reales del mercado que se le parecen — cada una lista para usarse como referencia en el Studio.</p>
            </div>
          )}
        </div>
      </div>

      {compare.length > 0 && (
        <div className="vx-tray">
          <span className="lb">{compare.length} para comparar</span>
          {compareItems.map((p) => (
            <span className="ch" key={p.style}>{p.n}<button onClick={() => toggleCompare(p.style)}>×</button></span>
          ))}
          <button className="go" onClick={() => setShowCompare((s) => !s)} disabled={compare.length < 2}>
            {showCompare ? "Ocultar" : `Comparar ${compare.length} →`}
          </button>
        </div>
      )}

      {showCompare && compare.length >= 2 && (
        <div className="vx-table">
          <table>
            <thead>
              <tr><th>Atributo</th>{src && <th className="ref">{src.n.split(" ").slice(0, 2).join(" ")} (origen)</th>}{compareItems.map((p) => <th key={p.style}>{p.n.split(" ").slice(0, 2).join(" ")}</th>)}</tr>
            </thead>
            <tbody>
              {compRows.map(([l, fn]) => (
                <tr key={l}><td style={{ fontWeight: 700 }}>{l}</td>{src && <td className="ref">{fn(src)}</td>}{compareItems.map((p) => <td key={p.style}>{fn(p)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
