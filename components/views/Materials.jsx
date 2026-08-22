"use client";
// Materiales — the brand's own fabric sheet, server-owned (ROADMAP §3b).
//
// WHAT THIS SCREEN USED TO BE. A fabric library in `localStorage`
// (`atelier-fabrics-v1`), seeded from the engine's DNA material names and edited
// in the browser. It was the SECOND material store: `brand_materials` already
// held the brand's real sheet — imported through the Import Centre, with
// supplier, MOQ, price and lead time — and the two could not agree. A designer's
// fabric work was invisible to their colleagues, to the Dirección screen and to
// any generation, which is a live §12 violation, and §3b explicitly forbids a
// second store beside `brand_materials`.
//
// So the engine is now the only source. Two consequences, both deliberate:
//
// 1. **The extra attributes are gone from the authoritative record.** Stretch,
//    drape, opacity, certifications, swatch photos and colourways had no engine
//    columns. Inventing columns for them here would be guessing at a schema, and
//    keeping them in `localStorage` beside the server row would recreate exactly
//    the two-stores problem this change removes. Anything a previous session left
//    behind is shown at the bottom, READ-ONLY and labelled as stranded — not
//    deleted (that is the owner's data and the owner's call) and not presented as
//    if it were synced.
//
// 2. **Provenance is on every row.** A sheet a person confirmed a mapping for and
//    a row somebody typed are different kinds of fact, and a library that shows
//    them identically invites a merchandiser to quote a hand-typed MOQ to a
//    supplier.
//
// ⚠ THE SWATCH BLOCK ON EACH CARD IS A CSS WEAVE, NOT A PHOTO. The engine has no
// swatch column (see above), so there is no image to show. The block is flat
// paper with a hairline grid — it carries the material CODE and nothing else, so
// it cannot be mistaken for a picture of the cloth. Do not put a stock photo
// here: an archive card that shows an arbitrary fabric beside a real MOQ is the
// same lie as an invented column, drawn instead of typed.
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBrandId } from "@/components/EngineProvider";
import { readScoped } from "@/lib/brandStore";
import * as dir from "@/lib/direction";

// Read-only, and only to show what a previous version of this screen left in the
// browser. Nothing writes this key any more.
const LEGACY_FABRICS_KEY = "atelier-fabrics-v1";

const EMPTY = {
  name: "", material_code: "", composition: "", construction: "", finish: "",
  supplier_name: "", country: "", width_cm: "", weight_gsm: "", price: "",
  currency: "ARS", moq_units: "", lead_time_days: "", notes: "",
};

const PROVENANCE_LABEL = {
  imported: "de un archivo confirmado",
  "team-entered": "cargada a mano",
};

// Attributes the old local library had and the engine has no column for. Named
// explicitly so the stranded panel can say WHAT is stranded rather than showing a
// blob of JSON.
const STRANDED_FIELDS = [
  ["stretch", "elasticidad"], ["drape", "caída"], ["opacity", "opacidad"],
  ["stock", "estado de stock"], ["certifications", "certificaciones"],
  ["colors", "colores"], ["swatch", "foto de swatch"],
  ["minColor", "mínimo por color"],
];

// ⚠ THE STYLE BLOCK MUST USE `dangerouslySetInnerHTML`, never a plain text
// child. React escapes `>` and `"` when it serialises a style element's text on
// the server, and the browser does not unescape them inside a style element, so
// the server and client trees differ and React discards the whole page on
// hydration. This is the shipped-once defect every restyled screen guards
// against the same way; `tests/styleHydration.test.mjs` enforces it.
const CSS = `
/* ================= Materiales (mt2-) — the fabric archive =================
   Everything scoped under .mt2. The screen used to borrow .dir-*/.cc-* from
   app/globals.css, which is shared with Dirección; this namespace is styled
   entirely here so the two screens can move independently. */

.mt2{display:flex;flex-direction:column;gap:var(--s5)}

/* ---- header ---- */
.mt2-head{max-width:760px}
.mt2-eyebrow{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--editorial)}
.mt2-title{font-family:var(--serif);font-weight:600;font-size:36px;line-height:1.05;letter-spacing:-.01em;color:var(--ink);margin:8px 0 10px}
.mt2-lede{margin:0;font-size:14px;line-height:1.55;color:var(--ink-2)}

/* ---- the sheet's own numbers: one hairline strip, tabular ---- */
.mt2-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;margin-top:var(--s4)}
.mt2-stat{background:var(--surface);padding:13px 16px}
.mt2-stat b{display:block;font-family:var(--disp);font-size:21px;font-weight:600;line-height:var(--lh-flat);letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}
.mt2-stat span{display:block;font-family:var(--d);font-size:11px;letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--ink-3);margin-top:6px}
.mt2-stat.warn b{color:var(--warning)}

/* ---- caution strips: slim, left-bordered, never a box that shouts ---- */
.mt2-alert{border-left:3px solid var(--warning);background:var(--ochre-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:10px 13px;font-size:12px;line-height:1.55;color:var(--ink-2);margin-top:var(--s3)}
.mt2-alert.bad{border-left-color:var(--danger);background:var(--clay-wash)}
.mt2-alert b{color:var(--ink)}

/* ---- sections ---- */
.mt2-section{border-top:1px solid var(--hair);padding-top:var(--s5);display:flex;flex-direction:column;gap:var(--s3)}
.mt2-sec-head{max-width:78ch}
.mt2-sec-head h2{font-family:var(--disp);font-size:16px;font-weight:700;letter-spacing:-.01em;color:var(--ink);margin:0 0 4px}
.mt2-sec-head p{margin:0;font-size:12px;line-height:1.55;color:var(--ink-2)}

/* ---- filters: quiet text-tabs + one search field ---- */
.mt2-tools{display:flex;align-items:center;justify-content:space-between;gap:var(--s4);flex-wrap:wrap}
.mt2-tabs{display:flex;gap:var(--s4);flex-wrap:wrap}
.mt2-tab{font-size:13px;font-weight:500;color:var(--ink-3);background:none;border:none;border-bottom:2px solid transparent;padding:3px 0 6px;cursor:pointer;font-variant-numeric:tabular-nums}
.mt2-tab:hover{color:var(--ink)}
.mt2-tab.on{color:var(--ink);font-weight:700;border-bottom-color:var(--ink)}
.mt2-search{font-family:var(--ui);font-size:13px;color:var(--ink);background:var(--paper-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 12px;min-width:270px}
.mt2-search::placeholder{color:var(--ink-3)}
.mt2-search:focus{outline:none;border-color:var(--cobalt);background:var(--surface);box-shadow:0 0 0 2px var(--cobalt-wash)}

/* ---- the archive itself ---- */
.mt2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--s3)}
.mt2-card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;transition:border-color .14s}
.mt2-card:hover{border-color:var(--hair-2)}

/* The swatch block. Woven paper, NOT a photograph — there is no swatch column
   in the engine and a stock image here would read as this fabric. */
.mt2-swatch{position:relative;height:92px;background:var(--paper-2);border-bottom:1px solid var(--hair);background-image:repeating-linear-gradient(0deg,color-mix(in srgb,var(--hair-2) 70%,transparent) 0 1px,transparent 1px 6px),repeating-linear-gradient(90deg,color-mix(in srgb,var(--hair-2) 70%,transparent) 0 1px,transparent 1px 6px)}
.mt2-card.ghost .mt2-swatch{opacity:.55}
.mt2-swatch-code{position:absolute;left:12px;bottom:10px;font-family:var(--d);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2);background:var(--surface);border:1px solid var(--hair-2);border-radius:var(--r-xs);padding:2px 7px}
.mt2-swatch-code.missing{color:var(--ink-3);border-style:dashed;background:transparent}

.mt2-body{padding:var(--s3) 14px;display:flex;flex-direction:column;gap:var(--s2);flex:1}
.mt2-name{font-family:var(--disp);font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink);margin:0}
.mt2-sub{font-size:12px;line-height:1.5;color:var(--ink-2);margin:0}

/* Facts: label/value rows, hairline separated, numerals aligned. */
.mt2-facts{display:flex;flex-direction:column;margin:0;border-top:1px solid var(--hair)}
.mt2-fact{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s3);padding:7px 0;border-bottom:1px solid var(--hair)}
.mt2-fact:last-child{border-bottom:none}
.mt2-fact-k{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--ink-3)}
.mt2-fact-v{font-size:13px;color:var(--ink);font-variant-numeric:tabular-nums;text-align:right}
.mt2-fact-v.missing{color:var(--ink-3)}

/* Provenance pill: what KIND of fact this row is. */
.mt2-badge{align-self:flex-start;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);background:var(--paper-2);border-radius:999px;padding:3px 9px}
.mt2-badge.hand{color:var(--warning)}

/* Traceability caveats, on the card, never folded away. */
.mt2-flag{border-left:3px solid var(--warning);background:var(--ochre-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:8px 11px;font-size:12px;line-height:1.5;color:var(--ink-2)}
.mt2-flag-lead{display:block;font-family:var(--d);font-size:11px;font-weight:600;letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--warning);margin-bottom:3px}

/* ---- add a fabric by hand: the screen's one primary action ---- */
.mt2-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--s2);background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:var(--s4)}
.mt2-input{font-family:var(--ui);font-size:13px;color:var(--ink);background:var(--paper-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 11px;width:100%;min-width:0;font-variant-numeric:tabular-nums}
.mt2-input::placeholder{color:var(--ink-3)}
.mt2-input:focus{outline:none;border-color:var(--cobalt);background:var(--surface);box-shadow:0 0 0 2px var(--cobalt-wash)}
.mt2-btn{justify-self:start;font-size:13px;font-weight:600;color:#fff;background:var(--cobalt);border:1px solid var(--cobalt);border-radius:var(--r-sm);padding:9px 16px;cursor:pointer;white-space:nowrap}
.mt2-btn:hover:not(:disabled){background:var(--cobalt-ink);border-color:var(--cobalt-ink)}
.mt2-btn:disabled{opacity:.45;cursor:not-allowed}

/* ---- empty / loading: calm, centred, the copy unchanged ---- */
.mt2-empty{display:grid;place-items:center;align-content:center;min-height:280px;text-align:center;padding:var(--s5) 0}
.mt2-empty h2{font-family:var(--serif);font-weight:600;font-size:24px;line-height:1.15;color:var(--ink);margin:0 0 8px;max-width:26ch}
.mt2-empty p{margin:0;max-width:46ch;font-size:13px;line-height:1.6;color:var(--ink-2)}

.mt2-foot{font-size:12px;line-height:1.6;color:var(--ink-3);max-width:78ch;margin:0;padding-top:var(--s4);border-top:1px solid var(--hair)}

@media(max-width:720px){
  .mt2-title{font-size:30px}
  .mt2-search{min-width:0;width:100%}
  .mt2-tools{align-items:stretch}
}
`;

/** "" -> null, so an empty input never reaches the engine as a value. */
function orNull(value) {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

/** One label/value row. `missing` is its own look: a fabric with no MOQ is not
 *  a fabric with an MOQ of zero, and the two must not read alike. */
function Fact({ k, v }) {
  const missing = v == null || v === "";
  return (
    <div className="mt2-fact">
      <span className="mt2-fact-k">{k}</span>
      <span className={`mt2-fact-v${missing ? " missing" : ""}`}>
        {missing ? "—" : v}
      </span>
    </div>
  );
}

/** The style block travels with every return path, including the early ones. */
function Frame({ children }) {
  return (
    <section className="view on mt2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {children}
    </section>
  );
}

export default function Materials() {
  const brandId = useBrandId();
  const [materials, setMaterials] = useState([]);
  const [state, setState] = useState({ loading: true, error: null });
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [draft, setDraft] = useState(EMPTY);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState([]);

  const load = useCallback(async () => {
    if (!brandId) { setState({ loading: false, error: null }); return; }
    setState({ loading: true, error: null });
    try {
      const out = await dir.listMaterials(brandId);
      setMaterials(Array.isArray(out?.materials) ? out.materials : []);
      setState({ loading: false, error: null });
    } catch (e) {
      // A failure to READ is not "this brand has no fabrics". The two answers
      // look identical on screen unless the code keeps them apart.
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const rows = readScoped(LEGACY_FABRICS_KEY, brandId, null);
    setLegacy(Array.isArray(rows) ? rows : []);
  }, [brandId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The scope tabs filter on the row's OWN provenance value — the same field
    // the badge shows. They narrow the view; they never restate the fact.
    const inScope = scope === "all"
      ? materials : materials.filter((m) => m.provenance === scope);
    if (!q) return inScope;
    return inScope.filter((m) =>
      [m.name, m.material_code, m.supplier_name, m.composition]
        .filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [materials, query, scope]);

  const counts = useMemo(() => ({
    total: materials.length,
    imported: materials.filter((m) => m.provenance === "imported").length,
    entered: materials.filter((m) => m.provenance === "team-entered").length,
    // The two gaps that stop a fabric being checkable against a range. Named,
    // because "12 telas" says nothing about whether any can be bought.
    noMoq: materials.filter((m) => m.moq_units == null).length,
    noLead: materials.filter((m) => m.lead_time_days == null).length,
  }), [materials]);

  const create = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const price = orNull(draft.price);
      await dir.createMaterial(brandId, {
        name: draft.name.trim(),
        material_code: orNull(draft.material_code),
        composition: orNull(draft.composition),
        construction: orNull(draft.construction),
        finish: orNull(draft.finish),
        supplier_name: orNull(draft.supplier_name),
        country: orNull(draft.country),
        width_cm: orNull(draft.width_cm),
        weight_gsm: orNull(draft.weight_gsm),
        price,
        // No price means no currency: the schema refuses a price without one,
        // and a currency with no price is noise.
        currency: price ? (orNull(draft.currency) || "ARS") : null,
        moq_units: orNull(draft.moq_units) == null ? null : Number(draft.moq_units),
        lead_time_days: orNull(draft.lead_time_days) == null
          ? null : Number(draft.lead_time_days),
        notes: orNull(draft.notes),
      });
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setNotice(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [brandId, draft, load]);

  if (!brandId) {
    return (
      <Frame>
        <div className="mt2-empty">
          <h2>El material sheet lo guarda el motor.</h2>
          <p>
            Sin conexión no hay nada que mostrar — y una copia local sería el
            problema que esta pantalla vino a resolver.
          </p>
        </div>
      </Frame>
    );
  }
  if (state.loading) {
    return (
      <Frame>
        <div className="mt2-empty"><p>Leyendo el material sheet…</p></div>
      </Frame>
    );
  }

  return (
    <Frame>
      <header className="mt2-head">
        <div className="mt2-eyebrow">Materiales · el sheet de la marca</div>
        <h1 className="mt2-title">Materiales</h1>
        <p className="mt2-lede">
          El material sheet de la marca, como lo guarda el motor. Es de donde la
          Dirección de cada colección elige sus telas — por eso cada fila trae
          proveedor, mínimo de compra y tiempo de producción, y por eso no hay una
          segunda copia en este navegador.
        </p>

        {state.error && (
          <div className="mt2-alert bad">
            No pudimos leer el material sheet ({state.error}). Puede que haya telas
            y no las estemos viendo — esto <b>no</b> quiere decir que no existan.
          </div>
        )}

        {!state.error && counts.total > 0 && (
          <div className="mt2-stats">
            <div className="mt2-stat">
              <b>{counts.total}</b><span>tela(s)</span>
            </div>
            <div className="mt2-stat">
              <b>{counts.imported}</b><span>de archivo confirmado</span>
            </div>
            <div className="mt2-stat">
              <b>{counts.entered}</b><span>cargada(s) a mano</span>
            </div>
            {counts.noMoq > 0 && (
              <div className="mt2-stat warn">
                <b>{counts.noMoq}</b><span>sin MOQ</span>
              </div>
            )}
            {counts.noLead > 0 && (
              <div className="mt2-stat warn">
                <b>{counts.noLead}</b><span>sin tiempo de producción</span>
              </div>
            )}
          </div>
        )}

        {(counts.noMoq > 0 || counts.noLead > 0) && (
          <div className="mt2-alert">
            <span className="mt2-flag-lead">sin verificar contra un rango</span>
            Una tela sin MOQ o sin tiempo de producción no se puede verificar
            contra un rango: la Dirección va a decir «no lo podemos saber», que no
            es lo mismo que «está bien».
          </div>
        )}
      </header>

      <section className="mt2-section">
        <div className="mt2-sec-head">
          <h2>El sheet</h2>
          <p>
            Se carga entero desde el Centro de importación, con la asignación de
            columnas confirmada por una persona. Abajo se puede agregar una tela
            suelta a mano, que queda marcada como tal.
          </p>
        </div>

        <div className="mt2-tools">
          <div className="mt2-tabs">
            <button className={`mt2-tab${scope === "all" ? " on" : ""}`}
                    onClick={() => setScope("all")}>
              Todas {counts.total}
            </button>
            <button className={`mt2-tab${scope === "imported" ? " on" : ""}`}
                    onClick={() => setScope("imported")}>
              De archivo confirmado {counts.imported}
            </button>
            <button className={`mt2-tab${scope === "team-entered" ? " on" : ""}`}
                    onClick={() => setScope("team-entered")}>
              Cargadas a mano {counts.entered}
            </button>
          </div>
          <input className="mt2-search"
                 placeholder="Buscar por nombre, código, proveedor…" value={query}
                 onChange={(e) => setQuery(e.target.value)} />
        </div>

        {counts.total === 0 && !state.error ? (
          <div className="mt2-empty">
            <h2>El material sheet de esta marca está vacío.</h2>
            <p>
              Se carga desde el Centro de importación (una hoja de materiales), o
              se agrega una tela a mano abajo.
            </p>
          </div>
        ) : (
          <div className="mt2-grid">
            {filtered.map((m) => (
              <article className="mt2-card" key={m.id}>
                <div className="mt2-swatch">
                  {/* The code is the archive label, so it sits ON the block.
                      An absent one says so rather than going blank. */}
                  <span className={`mt2-swatch-code${m.material_code ? "" : " missing"}`}>
                    {m.material_code || "sin código"}
                  </span>
                </div>
                <div className="mt2-body">
                  <h3 className="mt2-name">{m.name}</h3>
                  <p className="mt2-sub">
                    {m.supplier_name || "sin proveedor"}
                    {m.composition && <> · {m.composition}</>}
                  </p>

                  <div className="mt2-facts">
                    <Fact k="Precio"
                          v={m.price != null ? `${m.price} ${m.currency || ""}`.trim() : null} />
                    <Fact k="MOQ" v={m.moq_units} />
                    <Fact k="Días de producción" v={m.lead_time_days} />
                  </div>

                  {/* Travels with the code everywhere, so nobody cites a code
                      we invented to a supplier. */}
                  {m.code_derived_from_name && (
                    <div className="mt2-flag"
                         title="El archivo no traía código; lo derivamos del nombre.">
                      <span className="mt2-flag-lead">código derivado</span>
                      El archivo no traía código; lo derivamos del nombre.
                    </div>
                  )}

                  <span className={`mt2-badge${m.provenance === "team-entered" ? " hand" : ""}`}>
                    {PROVENANCE_LABEL[m.provenance] || m.provenance}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt2-section">
        <div className="mt2-sec-head">
          <h2>Agregar una tela a mano</h2>
          <p>
            Para una tela suelta en medio de una colección. Queda marcada como
            cargada a mano — no dice que vino de un archivo que nadie confirmó. Un
            precio sin moneda lo rechaza el motor, y con razón.
          </p>
        </div>

        <div className="mt2-form">
          <input className="mt2-input" placeholder="Nombre *" value={draft.name}
                 onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="mt2-input" placeholder="Código (opcional)" value={draft.material_code}
                 onChange={(e) => setDraft({ ...draft, material_code: e.target.value })} />
          <input className="mt2-input" placeholder="Composición" value={draft.composition}
                 onChange={(e) => setDraft({ ...draft, composition: e.target.value })} />
          <input className="mt2-input" placeholder="Proveedor" value={draft.supplier_name}
                 onChange={(e) => setDraft({ ...draft, supplier_name: e.target.value })} />
          <input className="mt2-input" placeholder="Precio/m" type="number" value={draft.price}
                 onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          <input className="mt2-input" placeholder="Moneda" size={5} value={draft.currency}
                 onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
          <input className="mt2-input" placeholder="MOQ" type="number" value={draft.moq_units}
                 onChange={(e) => setDraft({ ...draft, moq_units: e.target.value })} />
          <input className="mt2-input" placeholder="Días de producción" type="number"
                 value={draft.lead_time_days}
                 onChange={(e) => setDraft({ ...draft, lead_time_days: e.target.value })} />
          <button className="mt2-btn" disabled={busy || !draft.name.trim()}
                  onClick={create}>
            {busy ? "Guardando…" : "Agregar al sheet"}
          </button>
        </div>

        {notice && <div className="mt2-alert bad">{notice}</div>}
      </section>

      {legacy.length > 0 && (
        <section className="mt2-section">
          <div className="mt2-sec-head">
            <h2>Telas que quedaron en este navegador</h2>
            <p>
              Las cargó una versión anterior de esta pantalla, que guardaba en el
              navegador. <b>Nadie más del equipo las ve</b> y la Dirección no las
              puede elegir. No las borramos ni las subimos solas: los atributos que
              el motor no tiene dónde guardar se perderían en la traducción, y
              decidir eso no nos corresponde.
            </p>
          </div>

          <div className="mt2-alert bad">
            {legacy.length} tela(s) sólo en este navegador. Para que cuenten, volvé
            a cargarlas arriba o subí la hoja completa por el Centro de importación.
          </div>

          <div className="mt2-grid">
            {legacy.map((m, i) => {
              const stranded = STRANDED_FIELDS
                .filter(([key]) => {
                  const v = m[key];
                  if (Array.isArray(v)) return v.length > 0;
                  return v != null && v !== "" && v !== "unknown";
                })
                .map(([, label]) => label);
              return (
                <article className="mt2-card ghost" key={m.id || i}>
                  <div className="mt2-swatch" />
                  <div className="mt2-body">
                    <h3 className="mt2-name">{m.name || "sin nombre"}</h3>
                    <p className="mt2-sub">
                      {m.proveedor || "sin proveedor"}
                      {m.comp && <> · {m.comp}</>}
                    </p>

                    <div className="mt2-facts">
                      <Fact k="Precio"
                            v={m.price ? `${m.price} ${m.currency || ""}`.trim() : null} />
                      <Fact k="MOQ" v={m.moq} />
                    </div>

                    {/* Named, not counted. "3 campos se perderían" tells nobody
                        whether the loss matters. */}
                    <div className="mt2-flag">
                      <span className="mt2-flag-lead">lo que no viaja</span>
                      {stranded.length ? stranded.join(" · ") : "nada"}
                    </div>

                    <span className="mt2-badge hand">sólo en este navegador</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <p className="mt2-foot">
        Esta pantalla no guarda nada en el navegador. Antes sí, y era una segunda
        copia del sheet que podía contradecir a la del motor — con la Dirección de
        la colección eligiendo de una y el costeo leyendo la otra.
      </p>
    </Frame>
  );
}
