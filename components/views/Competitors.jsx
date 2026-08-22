"use client";
// COMPETIDORES — what the watched brands are actually doing.
//
// 2026-08-07 rebuild. The old screen was the worst-looking surface in the
// product and the reason was not styling:
//
//   · the brand initials tile was an unsized `.lg` div, so it rendered as a
//     full-width black or oxblood BAR across each card — the same failure mode
//     as the unsized icon in the status pill (see atelier-ui.css, `.ax svg`);
//   · half the copy was in English inside a Spanish product ("Change feed",
//     "Where you sit · median framing", "Metric", "products");
//   · and structurally: the entire BODY was `CMP_BRANDS_DATA`, a static sample,
//     styled exactly like intelligence, with one ochre box asking the reader to
//     remember it was illustrative. The real crawled layer was a small strip at
//     the top that only appears when a market run exists — so on a brand with
//     no run, 100% of what you saw was invented, formatted to look measured.
//
// That last one is the actual bug. This product's whole argument is that it
// does not give confident wrong answers, and a screen of plausible competitor
// numbers is precisely a confident wrong answer with a disclaimer on it.
//
// So the screen is INVERTED. The crawl is the screen; when there is no crawl,
// the screen says so and stays empty. The sample space is still reachable —
// deleting it would lose a good illustration of what the crawl produces — but
// it is collapsed, labelled as an example of ANOTHER brand's shape, and never
// rendered as this brand's evidence.
//
// The one interpretation this screen is allowed to make, and it is the same one
// the brief's evidence rows make: a competitor's catalogue is OFFER, never
// demand. Twenty new products is twenty new products; nobody knows if one sold.
import { useEffect, useMemo, useState } from "react";

import { CMP_BRANDS_DATA, CMP_GROUPS, CMP_BRANDS, CMP_TABLE } from "@/lib/data";
import { getCompetitorItems, refreshCompetitors } from "@/lib/api";
import { useEngine } from "@/components/EngineProvider";
import ExportButton from "@/components/ExportButton";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";

const GROUP_TABS = ["direct", "aspirational", "emerging", "retailer"];

const fitClass = (fit) => (fit >= 0.75 ? "hi" : fit >= 0.5 ? "md" : "");

/* ------------------------------------------------------- the real layer -- */

function Watchlist({ items, competitors, filter, setFilter, busy, onRefresh, error }) {
  const shown = filter === "all" ? items : items.filter((i) => i.competitor === filter);
  return (
    <section className="cp-real">
      <header>
        <div>
          <span className="ax-label">Crawleado · real</span>
          <h2>New arrivals de tu watchlist</h2>
          <p>Puntuados contra tu ADN de marca. La cifra es afinidad, no calidad.</p>
        </div>
        <button className="ax-btn" disabled={busy} onClick={onRefresh}>
          {busy ? "Crawleando…" : "Refrescar"}
        </button>
      </header>

      {error && <p className="cp-err"><Icon name="warn" />{error}</p>}

      <div className="cp-filters">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          Todas · {items.length}
        </button>
        {competitors.map((c) => (
          <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
        <span className="cp-grow">
          <ExportButton
            filename={`watchlist${filter === "all" ? "" : "-" + filter}`}
            rows={shown}
            columns={[
              { key: "competitor", header: "competidor" },
              { key: "title", header: "titulo" },
              { key: "price", header: "precio" },
              { key: "currency", header: "moneda" },
              { key: "dna_fit", header: "adn_fit",
                get: (r) => (r.dna_fit != null ? Math.round(r.dna_fit * 100) : "") },
              { key: "fit_reasons", header: "match",
                get: (r) => (r.fit_reasons || []).join("; ") },
              { key: "url", header: "url" },
            ]}
          />
        </span>
      </div>

      {/* A REGION with a height. A watchlist grows by whatever the crawl found,
          and a page that grows with it is a page nobody reaches the end of. */}
      <div className="cp-scroll">
        <div className="cp-grid">
          {shown.map((it) => (
            <a key={it.id} className="cp-item" href={it.url} target="_blank" rel="noreferrer">
              <span className="cp-shot">
                {/* The placeholder is ALWAYS rendered, underneath. A competitor
                    catalogue url can 404, hotlink-block or expire between the
                    crawl and now, and `onError` hiding the img over an empty box
                    leaves five grey rectangles that look like a broken product
                    rather than a picture the shop took down. */}
                <span className="cp-noimg"><Icon name="doc" /></span>
                {it.image_url && (
                  <img src={it.image_url} alt={it.title} loading="lazy"
                       onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                )}
                {it.dna_fit != null && (
                  <span className={`cp-fit ${fitClass(it.dna_fit)}`}>
                    {Math.round(it.dna_fit * 100)} ADN
                  </span>
                )}
              </span>
              <span className="cp-who">{it.competitor} · {it.currency} {it.price}</span>
              <b>{it.title}</b>
              {it.fit_reasons?.length > 0 && (
                <span className="cp-why">{it.fit_reasons.slice(0, 4).join(" · ")}</span>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- the sample, named -- */

function SampleSpace() {
  const [group, setGroup] = useState("direct");
  const [brand, setBrand] = useState(null);

  const inGroup = CMP_BRANDS_DATA.filter((b) => b.group === group);
  const selName = brand && inGroup.find((b) => b.nm === brand) ? brand : inGroup[0]?.nm;
  const sel = inGroup.find((b) => b.nm === selName) || inGroup[0];

  return (
    <details className="cp-sample">
      <summary>
        Ver un ejemplo de cómo se lee un espacio de competidores
      </summary>

      <p className="cp-sample-note">
        <Icon name="warn" />
        <span>
          <b>Esto NO es tu marca.</b> Es una watchlist de muestra, con marcas y
          movimientos ilustrativos, para mostrar la forma que toma la lectura
          cuando hay crawl. Ningún número de acá salió de una corrida.
        </span>
      </p>

      <div className="cp-tabs">
        {GROUP_TABS.map((g) => {
          const n = CMP_BRANDS_DATA.filter((b) => b.group === g).length;
          return (
            <button key={g} className={g === group ? "on" : ""}
                    onClick={() => { setGroup(g); setBrand(null); }}>
              {CMP_GROUPS[g]} · {n}
            </button>
          );
        })}
      </div>

      {!inGroup.length ? (
        <p className="cp-empty">
          En el ejemplo no hay marcas en <b>{CMP_GROUPS[group]}</b>.
        </p>
      ) : (
        <>
          <div className="cp-cards">
            {inGroup.map((c) => (
              <button key={c.nm} className={`cp-card${c.nm === selName ? " on" : ""}`}
                      onClick={() => setBrand(c.nm)}>
                <span className="cp-card-h">
                  {/* SIZED. This is the tile that was rendering as a full-width
                      bar: a coloured div with no dimensions fills whatever box
                      it lands in. */}
                  <i style={{ background: c.c }}>{c.init}</i>
                  <span className="cp-card-nm">
                    <b>{c.nm}</b>
                    <small>{c.seg}</small>
                  </span>
                  <span className={`cp-conf ${String(c.change.conf).toLowerCase()}`}>
                    {c.change.conf}
                  </span>
                </span>
                <span className="ax-label mute">{c.change.type}</span>
                <span className="cp-headline">{c.change.headline}</span>
                <span className="cp-detail">{c.change.detail}</span>
              </button>
            ))}
          </div>

          <div className="cp-lower">
            <section>
              <span className="ax-label">Movimientos · {sel.nm}</span>
              <ul className="cp-tl">
                {sel.timeline.map((t, i) => (
                  <li key={i}>
                    <i />
                    <div>
                      <span className="cp-tl-d">{t.d}</span>
                      <b>{t.t}<em style={{ background: t.bc, color: t.tc }}>{t.badge}</em></b>
                      <span className="cp-tl-p">{t.p}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <span className="ax-label" style={{ display: "block", margin: "18px 0 9px" }}>
                Cobertura del ejemplo
              </span>
              <ul className="cp-cov">
                {inGroup.map((b) => (
                  <li key={b.nm}>
                    <b>{b.nm}</b>
                    <span>{b.crawl} · {b.covered} productos · {b.depth} · {b.conf}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <span className="ax-label">Dónde caés · contra la mediana</span>
              <div className="cp-tablewrap">
                <table className="cp-table">
                  {/* CMP_BRANDS[0] is already "Vos": appending "· vos" printed
                      "VOS · VOS". The column is marked by its fill, not by
                      saying it twice. */}
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      {CMP_BRANDS.map((b, i) => (
                        <th key={b} className={i === 0 ? "you" : ""}>{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CMP_TABLE.map((row) => (
                      <tr key={row.r}>
                        <td>{row.r}</td>
                        {row.vals.map((v, i) => (
                          <td key={i} className={i === 0 ? "you" : ""}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </details>
  );
}

/* ---------------------------------------------------------------- screen -- */

export default function Competitors({ onNavigate }) {
  const engine = useEngine();
  const live = engine.status === "live" && !!engine.brandId;

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!live) { setItems([]); return; }
    getCompetitorItems(engine.brandId).then((r) => {
      // null = the request failed. It must never read as "no arrivals": those
      // are different facts and one of them is our problem, not the market's.
      if (r === null) {
        setError("No pudimos consultar la watchlist — el motor no respondió.");
        setItems([]);
      } else {
        setError("");
        setItems(r);
      }
    });
  }, [live, engine.brandId]);

  const competitors = useMemo(
    () => [...new Set(items.map((i) => i.competitor))], [items]);

  async function refresh() {
    setBusy(true); setError("");
    try {
      await refreshCompetitors(engine.brandId);
      const r = await getCompetitorItems(engine.brandId);
      if (r === null) throw new Error("el motor no respondió al leer la watchlist");
      setItems(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const strong = items.filter((i) => (i.dna_fit ?? 0) >= 0.75).length;

  useChrome({
    read: {
      interpretation: live
        ? (items.length
            ? `El crawl trajo ${items.length} producto(s) nuevos de ${competitors.length} marca(s). ${strong} tienen afinidad alta con tu ADN — afinidad quiere decir que se parecen a lo que hacés, no que funcionen.`
            : "La watchlist está conectada y todavía no devolvió productos nuevos. Es un dato: nadie de tu lista publicó algo desde la última corrida.")
        : "Esta marca no tiene corrida de mercado, así que no hay watchlist crawleada. Atelier no rellena el hueco con un panorama de competidores inventado.",
      signals: live
        ? [
            { icon: "grid", label: "Productos crawleados", text: String(items.length) },
            { icon: "target", label: "Marcas en la lista", text: String(competitors.length) },
            ...(engine.mode ? [{ icon: "globe", label: "Corrida", text: engine.mode }] : []),
          ]
        : [],
      unknowns: [
        "Oferta observada, no demanda. Que una competidora sume veinte productos no dice que se hayan vendido — el catálogo público no trae ventas ni stock.",
        ...(live ? [] : ["Qué están publicando tus competidoras: hace falta una corrida de mercado para saberlo."]),
      ],
      trace: [
        { icon: "doc", label: "Origen", text: "catálogos públicos de las marcas de la watchlist" },
        { icon: "shield", label: "Puntuación", text: "afinidad con el ADN de la marca, calculada por el motor" },
      ],
    },
  }, [live, items.length, competitors.length, strong, engine.mode]);

  return (
    <section className="cp">
      <div className="ax-crumb">
        <b>{engine.brandName || "Atelier"}</b><span>·</span>Competidores
      </div>
      <h1 className="ax-h1">Competidores</h1>
      <p className="ax-lede">
        Lo que publican las marcas que seguís, tal como lo devuelve el crawl:
        surtido, precios y novedades. Es oferta observada — nunca demanda.
      </p>

      {live ? (
        <Watchlist items={items} competitors={competitors} filter={filter}
                   setFilter={setFilter} busy={busy} onRefresh={refresh}
                   error={error} />
      ) : (
        <div className="cp-none">
          <Icon name="lock" />
          <div>
            <b>Sin corrida de mercado no hay watchlist.</b>
            <p>
              Esta pantalla muestra productos reales, crawleados de los catálogos
              públicos de las marcas que seguís. Hasta que haya una corrida,
              queda vacía a propósito: un panorama de competidores plausible es
              exactamente el tipo de respuesta segura y equivocada que este
              producto existe para no dar.
            </p>
            {onNavigate && (
              <button className="ax-btn" onClick={() => onNavigate("integrations")}>
                Ver conexiones y corridas
              </button>
            )}
          </div>
        </div>
      )}

      <SampleSpace />
    </section>
  );
}
