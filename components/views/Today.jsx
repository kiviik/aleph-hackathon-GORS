"use client";
// HOY — the front door. One question at a time.
//
// 2026-08-06 (owner reference designs). What changed and why:
//
// The old screen answered "what data exists?" — three KPI tiles, then a grid of
// equal cards, each a label/value table with Aprobar/Rechazar at the bottom.
// Nothing on it said which decision mattered most, what happens if you say yes,
// or what argues against it. The new screen answers "what should I decide next,
// and why?": ONE decision at full size with its evidence, its contradiction and
// its consequence, and the rest collapsed to a line each.
//
// WHAT IT STILL REFUSES TO DO, unchanged from the first version: it renders only
// server-owned decision cases. No margin, confidence, probability, owner, budget
// or deadline is synthesised here. A field the engine did not send does not
// appear — and where its absence matters (no economic impact yet, no owner) the
// screen SAYS the absence instead of hiding it. An empty section is information.
//
// The one thing to be careful with if you extend this: the hero image is a real
// catalog photograph or it is nothing. Fuzzy-matching a proposal's headline to a
// catalog product to get a picture would attach someone else's garment to a
// decision — a confident wrong answer, in the product whose whole argument is
// that it does not give those.
import { useEffect, useMemo, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import WeeklyPlan from "@/components/WeeklyPlan";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import {
  getBrandCatalog,
  getBrandIntegrations,
  getConceptCovers,
  getDecisionCases,
  getPlan,
  getSalesSummary,
  postCaseEvent,
} from "@/lib/api";
import { getPortfolio } from "@/lib/commandCentre";
// ⚠ WITH the .mjs extension. `lib/` holds both kinds and the resolver only
// finds an extensionless import when a `.js` twin exists (which is why
// `@/lib/approvals` works and this would not). Dropping it costs a runtime
// ReferenceError that no unit test sees, because the tests import the module
// directly — only the browser catches it.
import { readForCase } from "@/lib/todayRead.mjs";
import {
  MANUAL_FIRST, REFUSALS, STATE_LABEL, absences, isColdStart,
} from "@/lib/coldStart.mjs";

const CASE_LABEL = {
  reorder: "Reposición",
  reduce: "Reducción",
  price: "Precio",
  extend: "Extensión",
  new_product: "Producto nuevo",
  markdown: "Markdown",
  transfer: "Transferencia",
  cancel: "Cancelación",
};

// The engine's case statuses, all of them: `proposed` (the default) plus the
// four `EVENT_STATUS` transitions in `api/app/decision_cases.py`. A status
// arriving that is not here falls through to the raw string rather than to a
// blank — a label map may guess, control flow may not.
const STATUS_LABEL = {
  proposed: "Propuesta",
  approved: "Aprobada",
  rejected: "Rechazada",
  executed: "Ejecutada",
  measured: "Medida",
};

// Which question each case type is really asking. Used as the decision headline
// above the subject, exactly as the references frame it — a decision screen
// should ask a question, not name a noun.
const CASE_QUESTION = {
  new_product: "¿Entra esta propuesta a la colección?",
  reorder: "¿Reponemos este producto?",
  reduce: "¿Reducimos esta posición?",
  price: "¿Movemos el precio?",
  extend: "¿Extendemos esta línea?",
  markdown: "¿Aplicamos markdown?",
  transfer: "¿Transferimos stock?",
  cancel: "¿Cancelamos esta posición?",
};

const NUMBER_WORD = ["Ninguna", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis"];

// ⚠ ENGINE FIELD NAMES ARE NOT PRODUCT LANGUAGE. This screen renders whatever
// shape the engine puts in `evidence`, and the recursive branch below printed
// each key verbatim — so the owner's decision card read
//   "name: Oversized Chic · stage: Emerging · velocity: 0 · velocityBasis: published"
// Plumbing, printed as evidence, on the one screen meant to carry a decision
// (owner review 2026-08-14).
//
// Only `_` was replaced before, which does nothing for camelCase, so anything
// the engine names in camelCase leaked intact. Known keys get Spanish; the
// rest are at least split into words. Nothing is DROPPED — hiding a field we
// failed to translate would be worse than showing it awkwardly, because the
// evidence is the point of the card.
const FIELD_LABELS = {
  // The evidence kinds themselves, which render as the chip's heading.
  fit: "encaje",
  trend: "tendencia",
  name: "nombre",
  stage: "etapa",
  velocity: "velocidad",
  velocityBasis: "medida sobre",
  velocity_basis: "medida sobre",
  score: "puntaje",
  count: "cantidad",
  share_pct: "participación",
  category: "categoría",
  price: "precio",
  currency: "moneda",
  source: "fuente",
  store: "tienda",
};

// Values that are enum tokens, not prose. Same rule: translate what we know,
// pass through what we do not.
const VALUE_LABELS = {
  published: "lo publicado",
  collected: "lo recolectado",
  // Trend lifecycle stages, which the engine emits in English.
  Emerging: "emergente",
  Growing: "en crecimiento",
  Peaking: "en pico",
  Declining: "en baja",
};

const humanKey = (key) => FIELD_LABELS[key]
  || key.replaceAll("_", " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

function fmt(value) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return VALUE_LABELS[value] || value;
  if (Array.isArray(value)) return value.map(fmt).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => {
        const t = fmt(v);
        return t ? `${humanKey(k)}: ${t}` : null;
      })
      .filter(Boolean)
      .join(" · ");
  }
  return null;
}

function rows(record) {
  return Object.entries(record || {})
    .map(([key, value]) => {
      const text = fmt(value);
      return text ? { key: humanKey(key), text } : null;
    })
    .filter(Boolean);
}

function whenText(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- styles -- */
// Restyled 2026-08-13 to the "morning brief" reference. The shared `ax-*`
// rules live in app/atelier-ui.css, which other views also use — so this
// screen's markup moved to a `td2-` namespace and is styled entirely here
// (the TeamBrief pattern). The old ax- rules for this view are now unused,
// not edited.
const css = `
.td2-hoy{min-width:0}

/* ---- page header: mono eyebrow, serif display title, quiet subtitle ---- */
.td2-crumb{display:flex;align-items:center;gap:8px;font-family:var(--d);font-size:var(--fs-caption);letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--editorial);font-weight:500}
.td2-crumb b{font-weight:600}
.td2-crumb span{color:var(--ink-3)}
.td2-h1{margin:10px 0 0;font-family:var(--serif);font-size:var(--fs-display);font-weight:600;line-height:1.05;letter-spacing:-.01em;color:var(--ink);max-width:22ch}
.td2-lede{margin:8px 0 0;font-size:var(--fs-body-lg);color:var(--ink-2);line-height:var(--lh-body);max-width:64ch}

/* ---- warning / missing-data bands: ochre wash, mono lead-in ---- */
.td2-start{margin:var(--s5) 0 0;border:1px solid var(--line);border-radius:var(--r-sm);padding:var(--s4);background:var(--card)}
.td2-start h2{font-family:var(--d);font-size:16px;margin:0 0 4px}
.td2-start .sub{font-size:12.5px;color:var(--ink-3);line-height:1.5;margin:0 0 var(--s4)}
.td2-start .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.td2-startcard{border:1px solid var(--line);border-radius:var(--r-sm);padding:12px;display:flex;flex-direction:column;gap:6px}
.td2-startcard b{font-size:13px}
.td2-startcard p{margin:0;font-size:12px;line-height:1.5;color:var(--ink-3)}
.td2-startcard button{margin-top:auto;align-self:flex-start;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);padding:6px 10px;font-size:11.5px;font-weight:600;color:var(--ink);cursor:pointer}
.td2-absence{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line);font-size:12.5px}
.td2-absence .state{font-family:var(--mono,monospace);font-size:11px;color:var(--ink-3);white-space:nowrap}
.td2-refuse{margin:var(--s4) 0 0;padding:0;list-style:none;font-size:12px;color:var(--ink-3);line-height:1.7}
.td2-refuse li::before{content:"— "}
.td2-linkish{border:0;background:none;padding:0;font:inherit;color:var(--ink);text-decoration:underline;cursor:pointer}
.td2-band{display:flex;align-items:flex-start;gap:10px;margin:var(--s4) 0 0;padding:11px 14px;border-radius:var(--r-sm);background:var(--ochre-wash);font-size:12.5px;line-height:1.5;color:var(--ink)}
.td2-band svg{width:16px;height:16px;flex:none;color:var(--warning);margin-top:2px}
.td2-band b{font-family:var(--d);font-size:var(--fs-caption);font-weight:600;letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--warning)}
.td2-band.err svg,.td2-band.err b{color:var(--danger)}
.td2-band.fact{background:var(--paper-2)}
.td2-band.fact svg{color:var(--ink-2)}

/* ---- the main decision card ---- */
.td2-hero{margin:var(--s5) 0 0;display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1fr);background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.td2-hero-img{position:relative;background:var(--paper-2)}
.td2-hero-img::before{content:"";display:block;padding-top:125%}
.td2-hero-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.td2-hero-tag{position:absolute;left:12px;bottom:12px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-family:var(--d);font-size:var(--fs-caption);letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--ink-2)}
.td2-hero-noimg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center;padding:var(--s5)}
.td2-hero-noimg svg{width:24px;height:24px;color:var(--ink-3)}
.td2-hero-noimg b{font-size:var(--fs-body);font-weight:600;color:var(--ink-2)}
.td2-hero-noimg span{font-size:var(--fs-label);color:var(--ink-3);line-height:1.55;max-width:32ch}

.td2-hero-body{padding:var(--s5);min-width:0}
.td2-eyebrow{font-family:var(--d);font-size:var(--fs-caption);letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--editorial);font-weight:500}
.td2-eyebrow.mute{color:var(--ink-3)}
.td2-hero-body h2{margin:12px 0 0;font-family:var(--serif);font-size:28px;font-weight:600;line-height:1.15;letter-spacing:-.01em;color:var(--ink)}
.td2-hero-subject{margin:8px 0 var(--s4);font-size:15px;color:var(--ink-2);line-height:var(--lh-body)}

/* evidence chips: bordered mini-cards, 11px mono label over 13px value */
.td2-ev{margin:0 0 var(--s3)}
.td2-ev > .td2-eyebrow{display:block;margin-bottom:9px}
.td2-chips{display:flex;flex-wrap:wrap;gap:8px}
.td2-chip{border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 14px;min-width:0;max-width:100%}
.td2-chip-k{display:flex;align-items:center;gap:6px;font-family:var(--d);font-size:var(--fs-caption);letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--ink-3)}
.td2-chip-k svg{width:13px;height:13px;flex:none;color:var(--ink-3)}
.td2-chip-v{display:block;margin-top:4px;font-size:var(--fs-body);font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.td2-chip-src{display:block;margin-top:6px;font-family:var(--d);font-size:var(--fs-caption);color:var(--ink-3)}

/* bands inside the card sit flush with its rhythm */
.td2-hero-body .td2-band{margin:0 0 var(--s3)}

.td2-rec{margin-top:var(--s3);padding-top:var(--s4);border-top:1px solid var(--hair)}
.td2-rec .td2-eyebrow{display:block;margin-bottom:5px}
.td2-rec b{font-size:13.5px;font-weight:600;line-height:var(--lh-body)}

/* ---- the queue: compact rows, hairline-separated, quiet hover ---- */
.td2-minis{margin:var(--s4) 0 0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.td2-mini{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:12px var(--s4);background:none;border:0;border-top:1px solid var(--hair);cursor:pointer}
.td2-mini:first-child{border-top:0}
.td2-mini:hover{background:var(--paper-2)}
.td2-mini-n{width:56px;height:56px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--paper-2);border-radius:var(--r-xs);font-family:var(--d);font-size:var(--fs-body);color:var(--ink-2);font-variant-numeric:tabular-nums}
.td2-mini-main{flex:1;min-width:0}
.td2-mini-main b{display:block;font-size:13.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.td2-mini-main span{display:block;font-size:11.5px;color:var(--ink-3);margin-top:3px}
.td2-mini-flag{display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-caption);font-weight:600;color:var(--warning);border:1px solid var(--hair-2);border-radius:999px;padding:4px 10px;flex:none;white-space:nowrap}
.td2-mini-flag svg{width:12px;height:12px;flex:none}
.td2-mini-go{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--cobalt);font-weight:600;flex:none}
.td2-mini-go svg{width:14px;height:14px;flex:none}

/* ---- footer trust line ---- */
.td2-foot{margin:var(--s5) 0 0;font-size:11.5px;color:var(--ink-3);text-align:center}

/* ---- skeleton ---- */
.td2-sk{background:var(--paper-2);border-radius:var(--r-xs);animation:td2-pulse 1.5s ease-in-out infinite}
.td2-sk.line{height:12px;margin:0 0 9px}
.td2-sk.line.w45{width:45%}.td2-sk.line.w70{width:70%}.td2-sk.line.w90{width:90%}
.td2-sk.title{height:34px;width:55%;margin:0 0 16px}
.td2-sk.block{height:220px;margin:0 0 12px;border-radius:var(--r)}
@keyframes td2-pulse{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion: reduce){.td2-sk{animation:none}}

@media (max-width: 1180px){
  .td2-hero{grid-template-columns:minmax(0,1fr)}
  .td2-hero-img::before{padding-top:72%}
  .td2-h1{font-size:32px}
  .td2-hero-body h2{font-size:23px}
  .td2-mini-flag{display:none}
}
`;

/* ------------------------------------------------------------------ hero -- */

function Hero({ item, index, total, image, runMode }) {
  const evidence = rows(item.evidence);
  const against = rows(item.uncertainty);
  const impact = rows(item.expected_impact);
  const recommendation = rows(item.recommendation);

  return (
    <article className="td2-hero">
      {/* The garment first, and large. The decision is ABOUT a thing you can
          look at; putting the argument first and a thumbnail beside it is what
          made this read as a form rather than a studio. */}
      <div className={`td2-hero-img${image ? "" : " empty"}`}>
        {image ? (
          <>
            <img src={image.url} alt={image.title} loading="lazy" />
            {image.note && <span className="td2-hero-tag">{image.note}</span>}
          </>
        ) : (
          <div className="td2-hero-noimg">
            <Icon name="doc" />
            <b>Sin imagen conectada</b>
            <span>
              Es una propuesta, todavía no un producto del catálogo ni un concepto
              dibujado. Atelier no le atribuye la foto de otra prenda para llenar
              el espacio.
            </span>
          </div>
        )}
      </div>

      <div className="td2-hero-body">
        <span className="td2-eyebrow">
          Decisión {index + 1} de {total} · {CASE_LABEL[item.type] || item.type}
        </span>

        <h2>{CASE_QUESTION[item.type] || "¿Avanzamos con esto?"}</h2>
        <p className="td2-hero-subject">{item.headline}</p>

        {evidence.length > 0 && (
          <div className="td2-ev">
            <span className="td2-eyebrow mute">Evidencia</span>
            <div className="td2-chips">
              {evidence.map((line) => (
                <div className="td2-chip" key={line.key}>
                  <span className="td2-chip-k"><Icon name="trend" /> {line.key}</span>
                  <span className="td2-chip-v">{line.text}</span>
                  <span className="td2-chip-src">
                    Motor{runMode ? ` · ${runMode}` : ""} · {whenText(item.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {against.length > 0 && (
          <div className="td2-band">
            <Icon name="warn" />
            <span><b>Señal en contra</b> · {against.map((l) => l.text).join(" · ")}</span>
          </div>
        )}

        {impact.length > 0 ? (
          <div className="td2-band fact">
            <Icon name="coin" />
            <span>Si avanzás: {impact.map((l) => l.text).join(" · ")}</span>
          </div>
        ) : (
          // The absence IS the message. A blank space here reads as "no risk";
          // the sentence reads as "we have not earned a number yet".
          <div className="td2-band">
            <Icon name="lock" />
            <span>Impacto económico todavía no calculado — falta demanda propia conectada.</span>
          </div>
        )}

        {recommendation.length > 0 && (
          <div className="td2-rec">
            <span className="td2-eyebrow">Recomendación registrada</span>
            <b>{recommendation.map((l) => `${l.key}: ${l.text}`).join(" · ")}</b>
          </div>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------- compact -- */

function CompactRow({ item, n, onOpen }) {
  const against = rows(item.uncertainty);
  return (
    <button className="td2-mini" onClick={() => onOpen(n)}>
      <span className="td2-mini-n">{n + 1}</span>
      <span className="td2-mini-main">
        <b>{item.headline}</b>
        <span>{CASE_QUESTION[item.type] || CASE_LABEL[item.type] || item.type}</span>
      </span>
      {against.length > 0 && (
        <span className="td2-mini-flag"><Icon name="warn" /> {against.length} señal(es) en contra</span>
      )}
      <span className="td2-mini-go">Revisar <Icon name="arrow" /></span>
    </button>
  );
}

/* ---------------------------------------------------------------- screen -- */

export default function Today({ onNavigate }) {
  const engine = useEngine();
  const connected = Boolean(engine.connected && engine.brandId);
  const brand = engine.brandName || "tu marca";

  const [cases, setCases] = useState(null);
  const [sales, setSales] = useState(null);
  // Which connectors this brand actually has on. Only used to tell "asked and
  // there is nothing" apart from "nobody has been asked" — see lib/coldStart.
  const [integrations, setIntegrations] = useState(null);
  const [plan, setPlan] = useState(null);
  const [catalog, setCatalog] = useState(null);
  // The brand's own renders, keyed by concept name. A `new_product` case names
  // the garment it proposes; when the studio has already drawn something by
  // that exact name, that IS the garment under decision.
  const [renders, setRenders] = useState([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!engine.brandId) return;
    const [nextCases, nextSales, nextPlan] = await Promise.all([
      getDecisionCases(engine.brandId),
      getSalesSummary(engine.brandId),
      getPlan(engine.brandId),
    ]);
    setCases(nextCases);
    setSales(nextSales);
    setPlan(nextPlan);
  };

  useEffect(() => {
    if (!connected) {
      setCases([]); setSales(null); setPlan(null); setCatalog(null);
      setRenders([]); setIntegrations(null);
      return;
    }
    refresh();
    // Catalog and renders are fetched ONLY to resolve a case's subject to a
    // real picture. Neither ever contributes a number to this screen.
    getBrandCatalog(engine.brandId).then(setCatalog).catch(() => setCatalog(null));
    getBrandIntegrations(engine.brandId).then(setIntegrations)
      .catch(() => setIntegrations(null));
    getPortfolio(engine.brandId)
      .then((p) => Promise.all(
        (p?.items || []).slice(0, 6).map((row) => getConceptCovers(engine.brandId, row.collection_id, 24))))
      .then((all) => setRenders(all.filter(Boolean).flatMap((r) => r.covers || [])))
      .catch(() => setRenders([]));
  }, [connected, engine.brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(
    // See the note in the first version: the engine has no `modified` STATUS,
    // only a `modified` event, so filtering on it here would be dead code.
    () => (cases || []).filter((item) => item.status === "proposed"),
    [cases],
  );
  const decided = useMemo(
    () => (cases || []).filter((item) => item.status !== "proposed"),
    [cases],
  );

  useEffect(() => { setActive(0); }, [cases]);

  const current = open[active] || null;

  // EXACT match or nothing, on either of two identities the engine actually
  // records: the catalogue product id a case names, or a concept whose NAME is
  // the case's headline — the studio and the feed use the same string, so that
  // is an identity, not a resemblance. Anything fuzzier (same silhouette, same
  // colour, "looks about right") would attach a garment nobody drew to a
  // decision somebody has to make, which is the one wrong answer this product
  // must never give.
  const image = useMemo(() => {
    if (!current) return null;
    const headline = (current.headline || "").trim().toLowerCase();
    const render = renders.find((r) => (r.name || "").trim().toLowerCase() === headline);
    if (render) {
      return { url: render.image_data_uri, title: render.name,
               note: render.approved ? "Concepto aprobado" : "Concepto sin aprobar" };
    }
    const key = String(current.subject_key || "").replace(/^prod-/, "");
    const hit = (catalog?.products || []).find((p) => String(p.id) === key);
    return hit?.image_url ? { url: hit.image_url, title: hit.title, note: "Producto del catálogo" } : null;
  }, [current, catalog, renders]);

  async function decide(kind) {
    if (!current) return;
    setBusy(true); setError("");
    try {
      await postCaseEvent(engine.brandId, current.id, kind, { source: "today", evidence_seen: true });
      await refresh();
    } catch {
      setError("No se pudo guardar la decisión. Nada cambió; probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const loading = connected && cases === null;
  const hasSales = !!sales?.has_sales;
  // Computed once: the header copy and the first-run panel must agree, and
  // they disagreed when each decided for itself.
  const cold = isColdStart({ catalog, sales, cases });

  /* ---- the two chrome slots. Both describe THIS decision, or stay empty. -- */

  // ⚠ THE RAIL'S CONTENT IS A TESTED POLICY, NOT A LITERAL (owner assessment
  // point 3, 2026-08-17: "it mistakes interpretation for intelligence"). It
  // used to open with "Atelier registró una recomendación para esta propuesta:
  // test qty 25" — a wordier paraphrase of `Hero`'s own "Recomendación
  // registrada" two columns to the left — beside "Tipo · Producto nuevo",
  // which the card header already said. `lib/todayRead.mjs` holds the two
  // rules and the reasoning; it lives there because inline it was invisible to
  // the suite, which is why the restatement survived a design pass.
  const read = readForCase(current, {
    hasSales,
    engineMode: engine.mode,
    whenText,
  });

  useChrome({
    read,
    decision: current
      ? {
          note: `Queda registrada en el ledger de ${brand}, con su evidencia y su fecha.`,
          actions: [
            { label: "Rechazar", icon: "x", disabled: busy, onClick: () => decide("rejected") },
            { label: "Aprobar", primary: true, disabled: busy, onClick: () => decide("approved") },
          ],
        }
      : null,
  }, [current?.id, busy, brand, hasSales, engine.mode]);

  /* ------------------------------------------------------------- render -- */

  // Before the engine has ANSWERED, this screen knows nothing — the skeleton,
  // not the outage claim. "El motor no responde" on first paint was the same
  // premature verdict the status chip used to make, and it is also what the
  // SERVER renders (effects never run there), so every page load opened on a
  // false outage banner for a beat.
  if (!engine.resolved) {
    return (
      <section className="td2-hoy">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="td2-sk line w45" />
        <div className="td2-sk title" />
        <div className="td2-sk block" />
        <div className="td2-sk line w90" /><div className="td2-sk line w70" />
      </section>
    );
  }

  if (!connected) {
    return (
      <section className="td2-hoy">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="td2-crumb"><b>Hoy</b></div>
        <h1 className="td2-h1">El motor no responde</h1>
        <p className="td2-lede">
          Hoy no puede fabricar una bandeja de decisiones sin el motor. El resto del
          estudio sigue disponible, pero esta pantalla queda vacía antes que inventar
          urgencias.
        </p>
      </section>
    );
  }

  // Skeleton, not a layout swap: the frame that will hold the answer is drawn
  // first so navigating feels like one workspace updating.
  if (loading) {
    return (
      <section className="td2-hoy">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="td2-sk line w45" />
        <div className="td2-sk title" />
        <div className="td2-sk block" />
        <div className="td2-sk line w90" /><div className="td2-sk line w70" />
      </section>
    );
  }

  return (
    <section className="td2-hoy">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="td2-crumb">
        <b>{brand}</b><span>·</span>Hoy
      </div>

      <h1 className="td2-h1">
        {open.length === 0
          ? "No hay decisiones esperándote"
          : `${NUMBER_WORD[open.length] || open.length} ${open.length === 1 ? "decisión necesita" : "decisiones necesitan"} tu criterio`}
      </h1>
      <p className="td2-lede">
        {open.length === 0
          ? hasSales
            ? "El plan está conectado y no encontró ninguna acción que requiera aprobación ahora."
            : cold
              // ⚠ On a brand that has nothing yet, "conectá ventas" is the
              // wrong first sentence: it puts the one thing she may not be able
              // to do today above the four she can, and it contradicts the
              // panel right below it. Caught by looking at the rendered screen.
              ? "Todavía no hay nada conectado, y hay trabajo real para hacer igual."
              : "Conectá ventas para que Atelier pueda convertir señales en decisiones comprobables."
          : "Ordenadas por antigüedad. El impacto y la urgencia se ordenan solos cuando haya ventas conectadas."}
      </p>

      {error && <div className="td2-band err"><Icon name="warn" /><span>{error}</span></div>}

      {/* ⚠ THE FIRST-RUN BLOCK (reference screen 06, SOLO-DESIGNER gap 4).
          It appears only when the brand is genuinely at the start — a failed
          request never counts as empty, or a working brand would meet this the
          moment the network hiccups. Manual work is listed FIRST because it is
          the base product, not a fallback; the absences come after, each in the
          state it is really in; and the refusals are stated up front so the
          first impression of Atelier is what it will not fake. */}
      {cold && (
        <section className="td2-start">
          <h2>Empezá por lo que ya tenés</h2>
          <p className="sub">
            Nada de esto necesita datos conectados. Un brief, una dirección y
            una ficha técnica son trabajo real desde el primer día — no una
            versión degradada de la que viene después.
          </p>
          <div className="cards">
            {MANUAL_FIRST.map((item) => (
              <div className="td2-startcard" key={item.key}>
                <b>{item.title}</b>
                <p>{item.text}</p>
                <button type="button" onClick={() => onNavigate?.(item.view)}>
                  Abrir
                </button>
              </div>
            ))}
          </div>

          {absences({ catalog, sales, integrations }).map((a) => (
            <div className="td2-absence" key={a.key}>
              <span>
                <b>{a.title}</b> — {a.text}
              </span>
              <span className="state">
                {STATE_LABEL[a.state]}
                {a.action && (
                  <>
                    {" · "}
                    <button type="button" className="td2-linkish"
                      onClick={() => onNavigate?.(a.action.view)}>
                      {a.action.label}
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}

          <ul className="td2-refuse">
            <li style={{ listStyle: "none", marginBottom: 2 }}>
              <b>Lo que Atelier no va a inventar mientras tanto:</b>
            </li>
            {REFUSALS.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </section>
      )}

      {!hasSales && open.length > 0 && (
        <div className="td2-band">
          <Icon name="lock" />
          <span>
            <b>Todavía no hay demanda propia para priorizar.</b> Atelier puede mostrar
            evidencia de oferta y encaje de marca, pero no margen, probabilidad de éxito
            ni reposición hasta recibir ventas reales.
          </span>
        </div>
      )}

      {current && (
        <Hero item={current} index={active} total={open.length} image={image} runMode={engine.mode} />
      )}

      {open.length > 1 && (
        <div className="td2-minis">
          {open.map((item, i) => (i === active ? null : (
            <CompactRow key={item.id} item={item} n={i} onOpen={setActive} />
          )))}
        </div>
      )}

      {decided.length > 0 && (
        <p className="td2-foot">
          {decided.length} {decided.length === 1 ? "caso ya decidido permanece" : "casos ya decididos permanecen"} en el ledger del motor.
        </p>
      )}

      <WeeklyPlan />
    </section>
  );
}
