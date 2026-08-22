"use client";
import { useMemo, useState } from "react";
import {
  CATALOG, catStatusInfo, styleDiag, catInterp, catalogIntel,
  primaryAction, CAT_SORTERS,
} from "@/lib/catalog";
import { colName } from "@/lib/signals";
import Thumbnail from "@/components/Thumbnail";
import { useEngine } from "@/components/EngineProvider";
import { engineAssetUrl } from "@/lib/api";
import { useBrandCatalog } from "@/lib/useBrandCatalog";

const stColor = (st) => (st >= 70 ? "var(--sage)" : st >= 45 ? "var(--ochre)" : "var(--clay)");
const benchColor = (v) => (v >= 10 ? "var(--sage)" : v <= -10 ? "var(--clay)" : "var(--ink)");
const flagColor = (sev) => (sev === "clay" ? "var(--clay)" : sev === "ochre" ? "var(--ochre)" : "var(--sage)");

// Identity fields (name/photo/price/category/fabric) are REAL scraped data and
// lead the card. Seeded sell-through/returns/benchmark are SAMPLE analytics —
// demoted behind a per-card toggle, clearly labeled, off by default.
function Cards({ rows }) {
  const [demoOpen, setDemoOpen] = useState({});
  return (
    <div className="cat-grid">
      {rows.map((p) => {
        const si = catStatusInfo(p.status);
        const d = styleDiag(p);
        const act = primaryAction(p);
        const open = !!demoOpen[p.style];
        return (
          <div className="cat-card" key={p.style}>
            <div className="cc-img">
              <Thumbnail color={p.colors[0]} fabric={p.f} img={p.img} />
              <span className="cc-status" style={{ background: si[2], color: si[1] }}>{si[0]}</span>
              <span className="cc-colordots">{p.colors.map((c) => <span key={c} style={{ background: c }} />)}</span>
            </div>
            <div className="cc-body">
              <div className="cc-top"><span className="cc-sku">{p.style}</span><span className="cc-season">{p.season}</span></div>
              <div className="cc-name">{p.n}</div>
              <div className="cc-meta">{p.cat} · {p.gd} · {p.f}</div>
              <div className="cc-meta">AR$ {p.price.toLocaleString("es-AR")} · {p.colorways.length} colourways · {p.skuCount} SKUs</div>
              <button
                className={`bm2-demo-toggle${open ? " on" : ""}`}
                onClick={() => setDemoOpen((s) => ({ ...s, [p.style]: !s[p.style] }))}
              >
                {open ? "− métricas de muestra (demo)" : "+ métricas de muestra (demo)"}
              </button>
              {open && (
                <div className="bm2-demo-metrics">
                  <span className="bm2-demo-tag">MUESTRA — no son ventas reales</span>
                  <div className="cc-stats">
                    <div className="ccs"><span className="ccs-v" style={{ color: stColor(p.st) }}>{p.st}%</span><span className="ccs-l">Sell-thru · wk{p.weeks}</span></div>
                    <div className="ccs"><span className="ccs-v" style={{ color: benchColor(p.benchVar) }}>{p.benchVar >= 0 ? "+" : ""}{p.benchVar}</span><span className="ccs-l">vs benchmark</span></div>
                    <div className="ccs"><span className="ccs-v" style={{ color: p.returns > 15 ? "var(--clay)" : "var(--ink)" }}>{p.returns}%</span><span className="ccs-l">Returns</span></div>
                  </div>
                  {d.flags.length > 0 && <div className="cc-interp" style={{ color: flagColor(d.flags[0].sev) }}>{d.flags[0].t}</div>}
                  <div className="cc-interp">{catInterp(p)}</div>
                </div>
              )}
              <button className="cc-action" style={{ "--ac": act.col }} disabled
                title="Derivado de métricas de muestra — no es una acción operativa hasta conectar ventas">
                {act.label} <i className="ct-sample" style={{ display: "inline", marginLeft: 6 }}>muestra</i>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Table({ rows }) {
  return (
    <div className="cat-table-wrap">
      <table className="cat-table">
        <thead><tr><th>Product</th><th>Season</th><th>Wk</th>
          <th>Sell-thru <i className="ct-sample">muestra</i></th>
          <th>vs bench <i className="ct-sample">muestra</i></th>
          <th>Stock <i className="ct-sample">muestra</i></th>
          <th>Returns <i className="ct-sample">muestra</i></th>
          <th>Status <i className="ct-sample">muestra</i></th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const si = catStatusInfo(p.status);
            return (
              <tr key={p.style}>
                <td><div className="ct-prod"><div className="ct-thumb"><Thumbnail color={p.colors[0]} fabric={p.f} img={p.img} /></div><div><div className="ct-name">{p.n}</div><div className="ct-code">{p.style} · {p.cat}</div></div></div></td>
                <td className="ct-mono">{p.season}</td>
                <td className="ct-mono">{p.weeks}</td>
                <td className="ct-mono" style={{ color: stColor(p.st), fontWeight: 700 }}>{p.st}%</td>
                <td className="ct-mono" style={{ color: p.benchVar >= 10 ? "var(--sage)" : p.benchVar <= -10 ? "var(--clay)" : "var(--ink-2)" }}>{p.benchVar >= 0 ? "+" : ""}{p.benchVar}</td>
                <td className="ct-mono">{p.units}</td>
                <td className="ct-mono" style={{ color: p.returns > 15 ? "var(--clay)" : "var(--ink-2)" }}>{p.returns}%</td>
                <td><span className="ct-status" style={{ background: si[2], color: si[1] }}>{si[0]}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Matrix({ rows }) {
  const cellColor = (st) => (st >= 80 ? "var(--sage)" : st >= 55 ? "#9DBE8E" : st >= 45 ? "var(--ochre)" : "var(--clay)");
  return (
    <div className="cat-matrix-wrap">
      <div className="cm-legend">
        <span>Cada celda: <b>sell-through %</b> sobre <b>unidades restantes</b> — <b>ambos de muestra</b>, no son ventas reales.</span>
        <span className="cm-key"><i style={{ background: "var(--sage)" }} />≥80<i style={{ background: "#9DBE8E" }} />55+<i style={{ background: "var(--ochre)" }} />45+<i style={{ background: "var(--clay)" }} />&lt;45</span>
      </div>
      {rows.map((p) => {
        const sizes = p.colorways[0].sizes;
        return (
          <div className="cm-style" key={p.style}>
            <div className="cm-style-head"><span className="cm-name">{p.n}</span><span className="cm-code">{p.style} · {p.st}% overall</span></div>
            <table className="cat-matrix">
              <thead><tr><th className="cm-rowhead">Colourway</th>{sizes.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {p.colorways.map((cw) => (
                  <tr key={cw.hex}>
                    <td className="cm-rowhead"><span className="cm-chip" style={{ background: cw.hex }} />{colName(cw.hex)}</td>
                    {cw.skus.map((k) => (
                      <td className="cm-cell" key={k.sku} style={{ background: cellColor(k.st) }} title={`${k.size}: ${k.sold} sold / ${k.stock} left · ${k.st}%`}>
                        <span className="cm-st">{k.st}</span><span className="cm-sub">{k.stock}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function SampleCatalog() {
  const [filter, setFilter] = useState({ cat: "All", gd: "All", status: "All", q: "", season: "All" });
  const [mode, setMode] = useState("visual"); // visual | exceptions
  const [view, setView] = useState("cards"); // cards | table | matrix
  const [sort, setSort] = useState("recommended");
  const [exc, setExc] = useState("all");

  const intel = useMemo(() => catalogIntel(), []);
  const cats = ["All", ...new Set(CATALOG.map((p) => p.cat))];
  const genders = ["All", "Women", "Men", "Kids"];
  const statuses = ["All", "win", "ok", "warn"];
  const seasons = ["All", ...new Set(CATALOG.map((p) => p.season))];

  const set = (patch) => setFilter((f) => ({ ...f, ...patch }));

  let rows = CATALOG.filter((p) =>
    (filter.cat === "All" || p.cat === filter.cat) &&
    (filter.gd === "All" || p.gd === filter.gd) &&
    (filter.season === "All" || p.season === filter.season) &&
    (filter.status === "All" || p.status === filter.status) &&
    (!filter.q || p.n.toLowerCase().includes(filter.q.toLowerCase()) || p.style.toLowerCase().includes(filter.q.toLowerCase()))
  );
  if (mode === "exceptions") {
    const isStockout = (p) => intel.stockoutRisk.includes(p);
    const isReturn = (p) => p.returns > 15;
    const isWeak = (p) => p.status === "warn";
    rows = rows.filter((p) => isStockout(p) || isReturn(p) || isWeak(p));
    if (exc === "stockout") rows = rows.filter(isStockout);
    else if (exc === "returns") rows = rows.filter(isReturn);
    else if (exc === "weak") rows = rows.filter((p) => isWeak(p) && !isStockout(p));
  }
  rows = rows.slice().sort(CAT_SORTERS[sort] || CAT_SORTERS.recommended);

  const excCount = new Set([...intel.atRisk, ...intel.returnExc, ...intel.stockoutRisk]).size;

  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Producto y datos · Catálogo</div>
          <h1>Catálogo</h1>
          <p>
            Identidad de producto real del catálogo de la marca. <b>Velocidad de venta,
            variación vs benchmark, stock y devoluciones son MUESTRA</b> — se generan de
            forma determinista para poder diseñar la pantalla y no salen de ventas
            reales. Se vuelven reales al conectar ventas.
          </p>
        </div>
      </div>

      <div className="cat-intel">
        <div className="ci-head"><span className="ci-tag">CATALOG INTELLIGENCE</span><span className="ci-sub">Calculado sobre métricas de MUESTRA — no accionable hasta conectar ventas</span></div>
        <div className="ci-row ci-row-4">
          <button className="ci-item" onClick={() => { setMode("exceptions"); setExc("all"); }}><span className="ci-n" style={{ color: "var(--clay)" }}>{intel.atRisk.length}</span><span className="ci-l">products requiring action</span></button>
          <button className="ci-item" onClick={() => { setMode("exceptions"); setExc("stockout"); }}><span className="ci-n" style={{ color: "var(--ember-ink)" }}>{intel.stockoutRisk.length}</span><span className="ci-l">stockout exposure</span></button>
          <button className="ci-item" onClick={() => { setMode("exceptions"); setExc("returns"); }}><span className="ci-n" style={{ color: "var(--clay)" }}>{intel.returnExc.length}</span><span className="ci-l">return exceptions</span></button>
          <button className="ci-item" onClick={() => { setMode("visual"); setSort("bench"); set({ status: "win" }); }}><span className="ci-n" style={{ color: "var(--cobalt)" }}>{intel.extend.length}</span><span className="ci-l">extension candidates</span></button>
        </div>
        <div className="ci-foot"><span>{intel.heroes.length} hero styles</span><span className="ci-foot-sep">·</span><button className="ci-foot-link" onClick={() => { setMode("visual"); setSort("bench"); set({ status: "win" }); }}>view top performers →</button></div>
      </div>

      <div className="cat-toolbar">
        <div className="cat-search">
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input placeholder="Search style or code…" value={filter.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <div className="cat-filters">
          <div className="cat-modes">
            <button className={`cmode${mode === "visual" ? " on" : ""}`} onClick={() => setMode("visual")}>All</button>
            <button className={`cmode${mode === "exceptions" ? " on" : ""}`} onClick={() => { setMode("exceptions"); setExc("all"); }}>Exceptions{excCount ? ` · ${excCount}` : ""}</button>
          </div>
          <div className="cat-views">
            <button className={`cview${view === "cards" ? " on" : ""}`} onClick={() => setView("cards")} title="Cards">▦</button>
            <button className={`cview${view === "table" ? " on" : ""}`} onClick={() => setView("table")} title="Table">▤</button>
            <button className={`cview${view === "matrix" ? " on" : ""}`} onClick={() => setView("matrix")} title="Size & colour matrix">⊞</button>
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} title="Sort">
            <option value="recommended">Recommended</option><option value="urgent">Most urgent</option><option value="bench">Best vs benchmark</option>
            <option value="sthi">Highest sell-through</option><option value="stlo">Lowest sell-through</option><option value="returns">Highest returns</option><option value="stock">Most stock</option>
          </select>
          <select value={filter.season} onChange={(e) => set({ season: e.target.value })} title="Season">{seasons.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={filter.cat} onChange={(e) => set({ cat: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={filter.gd} onChange={(e) => set({ gd: e.target.value })}>{genders.map((g) => <option key={g}>{g}</option>)}</select>
          {mode !== "exceptions" && (
            <div className="cat-segs">
              {statuses.map((s) => <button key={s} className={`cseg${filter.status === s ? " on" : ""}`} onClick={() => set({ status: s })}>{s === "All" ? "All" : catStatusInfo(s)[0]}</button>)}
            </div>
          )}
        </div>
      </div>

      {mode === "exceptions" && (
        <div className="cat-excsub">
          {[["all", "All exceptions"], ["stockout", "Stockout"], ["returns", "High returns"], ["weak", "Weak demand"]].map(([k, l]) => (
            <button key={k} className={`excsub${exc === k ? " on" : ""}`} onClick={() => setExc(k)}>{l}</button>
          ))}
        </div>
      )}

      {rows.length ? (
        view === "table" ? <Table rows={rows} /> : view === "matrix" ? <Matrix rows={rows} /> : <Cards rows={rows} />
      ) : (
        <div className="cat-empty">
          <h3>{mode === "exceptions" ? "No exceptions right now" : "No styles match these filters"}</h3>
          <p>{mode === "exceptions" ? "Every style is performing within range." : "Try widening the filters."}</p>
          <button className="btn ghost" onClick={() => { setMode("visual"); setFilter({ cat: "All", gd: "All", status: "All", q: "", season: "All" }); }}>{mode === "exceptions" ? "Back to all products" : "Clear filters"}</button>
        </div>
      )}
    </section>
  );
}

function ConnectedCatalog({ catalog, brandName }) {
  const products = catalog.products || [];
  const refs = catalog.visualArchive || [];

  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Producto y datos · Catálogo</div>
          <h1>Catálogo · {brandName}</h1>
          <p>
            <b>{catalog.total} productos estructurados</b> ·{" "}
            <b>{refs.length} referencias visuales</b>. Una captura sirve para
            entender lenguaje y silueta; no se convierte en SKU, precio o venta
            hasta que la marca comparte esos campos.
          </p>
        </div>
      </div>

      {refs.length > 0 && (
        <>
          <div className="ci-head" style={{ marginBottom: 12 }}>
            <span className="ci-tag">ARCHIVO VISUAL</span>
            <span className="ci-sub">
              Evidencia suministrada · separada del catálogo estructurado
            </span>
          </div>
          <div className="cat-grid" style={{ marginBottom: 28 }}>
            {refs.map((ref) => (
              <article className="cat-card" key={ref.id}>
                <div className="cc-img">
                  <Thumbnail img={engineAssetUrl(ref.image_url)} />
                  <span className="cc-status"
                        style={{ background: "var(--paper-2)", color: "var(--ink)" }}>
                    {ref.purpose}
                  </span>
                </div>
                <div className="cc-body">
                  <div className="cc-top">
                    <span className="cc-sku">REFERENCIA VISUAL</span>
                    <span className="cc-season">v{ref.direction_version}</span>
                  </div>
                  <div className="cc-name">{ref.title || "Referencia sin título"}</div>
                  <div className="cc-meta">
                    {ref.collection_name} · derechos: {ref.rights}
                  </div>
                  {ref.source && <div className="cc-meta">{ref.source}</div>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="ci-head" style={{ marginBottom: 12 }}>
        <span className="ci-tag">PRODUCT MASTER</span>
        <span className="ci-sub">
          Estilos, variantes y SKUs confirmados por archivo o integración
        </span>
      </div>
      {products.length > 0 ? (
        <div className="cat-grid">
          {products.map((product) => (
            <article className="cat-card" key={product.id}>
              <div className="cc-img">
                <Thumbnail img={engineAssetUrl(product.image_url)} />
              </div>
              <div className="cc-body">
                <div className="cc-top">
                  <span className="cc-sku">{product.id}</span>
                  <span className="cc-season">{product.category || "sin categoría"}</span>
                </div>
                <div className="cc-name">{product.title}</div>
                <div className="cc-meta">
                  {product.product_type || "tipo no informado"}
                  {product.price != null ? ` · precio ${product.price}` : " · precio no informado"}
                </div>
                <div className="cc-meta">
                  Ventas: {product.units_sold == null ? "no compartidas" : product.units_sold}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="cat-empty">
          <h3>Hay archivo visual, pero todavía no hay productos estructurados</h3>
          <p>
            GEEL ya puede usarse para Dirección y Studio. Para análisis por
            producto, talles o ventas hace falta el CSV con nombres, variantes y SKUs.
          </p>
        </div>
      )}
    </section>
  );
}

export default function Catalog() {
  const engine = useEngine();
  const catalog = useBrandCatalog();

  if (!engine.connected) return <SampleCatalog />;
  if (catalog.loading) {
    return (
      <section className="view on">
        <div className="cat-empty">
          <h3>Leyendo el catálogo de {engine.brandName}…</h3>
        </div>
      </section>
    );
  }
  return <ConnectedCatalog catalog={catalog} brandName={engine.brandName} />;
}
