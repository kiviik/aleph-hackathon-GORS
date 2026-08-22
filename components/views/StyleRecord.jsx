"use client";
// The Style record — the canonical product surface.
//
// From `design/atelier-redesign/03-product-tech-pack.png`: a product header, a
// discipline tab row, a working body, and a commitment footer. What this screen
// does NOT do is draw the reference's eleven tabs and wire six. Five have no
// engine contract, so they render as declared absences carrying the sentence of
// what they are waiting for (`lib/styleRecord.mjs`). A mockup that draws a BOM
// tab over a schema with no BOM lines is the failure this product exists to
// refuse, and it is the easiest one to commit while feeling productive.
//
// ⚠ THREE STATES EVERYWHERE. `undefined` = not asked · `null` = COULD NOT ASK ·
// `[]` = asked and there are none. `lib/api.js` preserves the distinction and
// `stateText()` gives each one its own sentence. "Sin filas" over a 500 is the
// most expensive lie a data screen tells, because it looks like an answer.
//
// ⚠ CSS via dangerouslySetInnerHTML, not a text child. A `<style>` with a
// string child made React discard and rebuild the whole tree on every load
// across 17 files (owner review 2026-08-14). Do not "simplify" this.
import { Fragment, useCallback, useEffect, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import { useTeam } from "@/components/IdentityProvider";
import AssetImage from "@/components/ui/AssetImage";
import Icon from "@/components/ui/Icon";
import {
  addBomLine,
  addBomLineFromDirection,
  addDrawingCallout,
  addFitComment,
  addSamplePhoto,
  addStyleDrawing,
  deleteBomLine,
  deleteDrawingCallout,
  deleteStyleDrawing,
  getMeasurementBlock,
  getStyle,
  getStyleAssets,
  getBomCandidates,
  getStyleBom,
  openSampleRevision,
  getStyleDrawings,
  getStyleQuotes,
  getStyleSamples,
  getStyles,
  getTechPacks,
  decideSampleRound,
  receiveSampleRound,
  requestSampleRound,
  resolveFitComment,
  setTechPackField,
  getDrawingMeasurements,
} from "@/lib/api";
import { assetUrl } from "@/lib/assets";
import { listMaterials } from "@/lib/direction";
import { ingestAsset } from "@/lib/concepts";
import { editedFieldPayload, fieldsEditable } from "@/lib/techPackFields";
import { LANE_LABEL, getReadiness, laneState } from "@/lib/approvals";
import {
  PROPOSED,
  REAL,
  TABS,
  calloutResolutionText,
  pomResolutionText,
  pomResolutionTone,
  changeSentences,
  directionOrigin,
  openedVersionsText,
  releaseDecision,
  revisionOutcomeText,
  scopeLabel,
  roundState,
  provenanceLabel,
  releaseSummary,
  resolve,
  stateText,
} from "@/lib/styleRecord.mjs";

const CSS = `
.sr{display:flex;flex-direction:column;min-height:100%}
.sr-head{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;
  padding:0 0 18px;border-bottom:1px solid var(--line)}
.sr-thumb{width:64px;height:80px;border-radius:4px;background:var(--paper-2);
  border:1px solid var(--line);object-fit:cover;display:block}
.sr-thumb.empty{display:grid;place-items:center;color:var(--ink-3)}
.sr-eyebrow{font-size:var(--fs-caption);letter-spacing:.14em;text-transform:uppercase;
  color:var(--oxblood);margin:0 0 4px}
.sr-name{font-family:var(--serif,Georgia,serif);font-size:30px;line-height:1.1;margin:0 0 6px}
.sr-meta{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;
  font-size:var(--fs-label);color:var(--ink-2)}
.sr-meta b{color:var(--ink);font-weight:600}
.sr-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;
  border:1px solid var(--line);background:var(--surface);font-size:var(--fs-caption)}
.sr-chip .dot{width:6px;height:6px;border-radius:99px;background:var(--ochre)}
.sr-chip.released .dot{background:var(--sage)}

.sr-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--line);
  margin:0 0 20px;padding-top:14px}
.sr-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;
  padding:9px 13px;font-size:var(--fs-body);color:var(--ink-2);cursor:pointer;
  white-space:nowrap;font-family:inherit}
.sr-tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--oxblood);font-weight:600}
.sr-tab:disabled{color:var(--ink-3);cursor:not-allowed}
.sr-tab .pend{font-size:9px;margin-left:6px;text-transform:uppercase;letter-spacing:.1em;
  color:var(--ink-3);border:1px solid var(--line);border-radius:99px;padding:1px 5px}

.sr-body{flex:1;min-height:0}
.sr-note{font-size:var(--fs-body);color:var(--ink-2);line-height:1.55;margin:0;
  padding:16px;border:1px dashed var(--line);border-radius:var(--r,6px);background:var(--surface)}
.sr-note.unavailable{border-style:solid;border-color:var(--clay);background:var(--clay-wash)}
.sr-note b{color:var(--ink)}

.sr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.sr-cell{border:1px solid var(--line);border-radius:var(--r,6px);background:var(--surface);
  overflow:hidden}
.sr-cell img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:var(--paper-2)}
.sr-cell .cap{padding:8px 10px;font-size:var(--fs-caption);color:var(--ink-2);
  display:flex;justify-content:space-between;gap:8px;align-items:center}

.sr-table{width:100%;border-collapse:collapse;font-size:var(--fs-body)}
.sr-table th{text-align:left;font-size:var(--fs-caption);text-transform:uppercase;
  letter-spacing:.1em;color:var(--ink-3);font-weight:600;padding:8px 10px;
  border-bottom:1px solid var(--line)}
.sr-table td{padding:9px 10px;border-bottom:1px solid var(--hair)}
.sr-prov{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;padding:2px 7px;
  border-radius:99px;border:1px solid var(--line);color:var(--ink-2);white-space:nowrap}
.sr-prov.ai_proposed{border-color:var(--ochre);background:var(--ochre-wash);color:var(--ink)}
.sr-prov.human_verified,.sr-prov.supplier_confirmed{border-color:var(--sage);color:var(--ink)}

.sr-foot{position:sticky;bottom:0;margin-top:22px;padding:14px 0 0;border-top:1px solid var(--line);
  display:flex;align-items:center;gap:14px;background:var(--paper)}
.sr-foot .blockers{display:flex;align-items:center;gap:8px;font-size:var(--fs-body);color:var(--ink-2)}
.sr-foot .spacer{flex:1}
.sr-btn{appearance:none;font-family:inherit;font-size:var(--fs-body);padding:9px 16px;
  border-radius:var(--r,6px);border:1px solid var(--line);background:var(--surface);
  color:var(--ink);cursor:pointer}
.sr-btn.primary{background:var(--action);border-color:var(--action);color:#fff}
.sr-btn:disabled{opacity:.5;cursor:not-allowed}

.sr-edit{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sr-input{font:inherit;font-size:var(--fs-body);padding:4px 8px;border:1px solid var(--line);
  border-radius:var(--r,6px);background:var(--paper);color:var(--ink);min-width:160px}
.sr-act{appearance:none;font-family:inherit;font-size:var(--fs-caption);padding:4px 10px;
  border-radius:99px;border:1px solid var(--line);background:var(--surface);
  color:var(--ink);cursor:pointer;white-space:nowrap}
.sr-act:hover{border-color:var(--action)}
.sr-act:disabled{opacity:.5;cursor:not-allowed}
.sr-editerr{margin:8px 0 0;font-size:var(--fs-caption);color:var(--clay)}

.sr-work{display:grid;grid-template-columns:264px minmax(0,1fr) 300px;gap:22px;align-items:start}
@media (max-width:1240px){.sr-work{grid-template-columns:minmax(0,1fr)}}
.sr-col-note{font-size:var(--fs-caption);color:var(--ink-3);letter-spacing:.1em;
  text-transform:uppercase;margin:0 0 10px}
.sr-hero{border:1px solid var(--line);border-radius:var(--r,6px);overflow:hidden;
  background:var(--surface);box-shadow:var(--shadow)}
.sr-hero img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:var(--paper-2)}
.sr-hero .empty{aspect-ratio:3/4;display:grid;place-items:center;color:var(--ink-3);
  background:var(--paper-2);font-size:var(--fs-caption);text-align:center;padding:16px}
.sr-lin{margin-top:14px;border:1px solid var(--line);border-radius:var(--r,6px);
  background:var(--surface);padding:13px 14px}
.sr-lin h3{font-size:var(--fs-body);margin:0 0 10px;font-weight:600}
.sr-lin dl{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;margin:0;
  font-size:var(--fs-caption)}
.sr-lin dt{color:var(--ink-3)}
.sr-lin dd{margin:0;color:var(--ink)}
.sr-rail{display:grid;gap:14px;position:sticky;top:12px}
.sr-panel{border:1px solid var(--line);border-radius:var(--r,6px);background:var(--surface);
  padding:14px 15px}
.sr-panel.refuse{border-color:var(--clay);background:var(--clay-wash)}
.sr-panel.ready{border-color:var(--sage)}
.sr-panel h3{margin:0 0 4px;font-size:var(--fs-body);font-weight:600}
.sr-panel .lede{margin:0 0 10px;font-size:var(--fs-caption);color:var(--ink-2);line-height:1.5}
.sr-reasons{list-style:none;margin:0;padding:0;display:grid;gap:9px;counter-reset:r}
.sr-reasons li{display:grid;grid-template-columns:auto 1fr;gap:9px;font-size:var(--fs-caption);
  line-height:1.45}
.sr-reasons .idx{font-family:var(--mono,ui-monospace,monospace);color:var(--ink-3)}
.sr-reasons b{color:var(--ink)}
.sr-lanes{display:grid;gap:7px;font-size:var(--fs-caption)}
.sr-lane{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.sr-lane .who{color:var(--ink-3)}
.sr-lane .st.signed{color:var(--sage)}
.sr-lane .st.rejected{color:var(--clay)}
.sr-lane .st.waiting{color:var(--ink-3)}
.sr-readmeter{display:flex;align-items:baseline;gap:8px;margin:0 0 10px}
.sr-readmeter .n{font-family:var(--disp,inherit);font-size:26px;line-height:1}
.sr-readmeter .of{font-size:var(--fs-caption);color:var(--ink-3)}
.sr-bar{height:5px;border-radius:99px;background:var(--paper-2);overflow:hidden;margin-bottom:12px}
.sr-bar i{display:block;height:100%;background:var(--sage)}
.sr-round{border:1px solid var(--line);border-radius:var(--r,6px);background:var(--surface);
  padding:14px 16px;margin:0 0 12px}
.sr-round.open{border-left:3px solid var(--ochre)}
.sr-round.approved{border-left:3px solid var(--sage)}
.sr-round.rejected{border-left:3px solid var(--clay)}
.sr-round-head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin:0 0 10px}
.sr-round-head .no{font-family:var(--disp,inherit);font-size:19px}
.sr-round-head .spacer{flex:1}
.sr-photos{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.sr-photos figure{margin:0;width:104px}
.sr-photos img{width:100%;aspect-ratio:3/4;object-fit:cover;border:1px solid var(--line);
  border-radius:4px;display:block;background:var(--paper-2)}
.sr-photos figcaption{font-size:var(--fs-caption);color:var(--ink-3);margin-top:3px}
.sr-fit{display:grid;grid-template-columns:auto auto 1fr auto;gap:8px 12px;
  align-items:baseline;font-size:var(--fs-body)}
.sr-fit .area{font-weight:600}
.sr-fit .sev{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;padding:2px 7px;
  border-radius:99px;border:1px solid var(--line);white-space:nowrap}
.sr-fit .sev.blocker{border-color:var(--clay);background:var(--clay-wash)}
.sr-fit .sev.major{border-color:var(--ochre);background:var(--ochre-wash)}
.sr-fit .meas{font-family:var(--mono,ui-monospace,monospace);font-size:var(--fs-caption);
  color:var(--ink-2)}
.sr-changes{display:grid;gap:7px;margin:0 0 14px;padding:12px 14px;
  border:1px solid var(--line);border-radius:var(--r,6px);background:var(--surface)}
.sr-changes .row{font-size:var(--fs-body);line-height:1.5}
.sr-changes .row.unmentioned{color:var(--ink-2)}
.sr-rollup{display:flex;flex-wrap:wrap;gap:18px;align-items:baseline;
  border:1px solid var(--line);border-radius:var(--r,6px);background:var(--surface);
  padding:14px 16px;margin:0 0 14px}
.sr-rollup.refused{border-color:var(--ochre);background:var(--ochre-wash)}
.sr-rollup .big{font-family:var(--disp,inherit);font-size:24px;line-height:1}
.sr-rollup .why{font-size:var(--fs-caption);color:var(--ink-2);flex:1 1 260px;line-height:1.45}
.sr-bomfoot{font-size:var(--fs-caption);color:var(--ink-3);margin:10px 0 0;line-height:1.5}
.sr-cands{border:1px solid var(--line);margin-top:14px}
.sr-cand{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;
         padding:9px 11px;border-bottom:1px solid var(--line);font-size:var(--fs-caption)}
.sr-cand:last-child{border-bottom:0}
.sr-cand .who{font-family:var(--mono,monospace);color:var(--ink-3)}
.sr-scope{font-size:var(--fs-caption);padding:1px 7px;border:1px solid var(--line);white-space:nowrap}
.sr-scope.other,.sr-scope.unknown{color:var(--ink-3)}
.sr-from{font-size:var(--fs-caption);color:var(--ink-3);font-family:var(--mono,monospace)}
.sr-miss{color:var(--ochre-ink,var(--ink));font-size:var(--fs-caption)}
.sr-draws{display:grid;gap:20px}
.sr-draw{display:grid;grid-template-columns:minmax(240px,380px) 1fr;gap:16px;
  border:1px solid var(--line);border-radius:var(--r,6px);background:var(--surface);padding:14px}
.sr-canvas{position:relative;user-select:none}
.sr-canvas img{width:100%;display:block;border:1px solid var(--hair);border-radius:4px;
  background:var(--paper-2)}
.sr-canvas.adding{cursor:crosshair}
.sr-pin{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;
  border-radius:99px;background:var(--action);color:#fff;display:grid;place-items:center;
  font-size:11px;font-weight:600;pointer-events:none;box-shadow:var(--shadow-1,0 1px 3px rgba(0,0,0,.25))}
.sr-draw-head{display:flex;align-items:baseline;gap:10px;margin:0 0 10px}
.sr-draw-head .view{font-size:var(--fs-caption);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sr-draw-head .spacer{flex:1}
.sr-co{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;
  padding:8px 0;border-bottom:1px solid var(--hair)}
.sr-co .n{width:20px;height:20px;border-radius:99px;border:1px solid var(--line);
  display:grid;place-items:center;font-size:11px;font-weight:600;color:var(--ink-2)}
.sr-co .res{font-size:var(--fs-caption);margin-top:2px}
.sr-co .res.ok{color:var(--sage)}
.sr-co .res.miss{color:var(--clay)}
.sr-co .res.unknown{color:var(--ink-3)}
.sr-co .note{font-size:var(--fs-caption);color:var(--ink-2);margin-top:4px;white-space:pre-wrap}
.sr-coform{display:grid;gap:8px;margin-top:10px;padding:10px;border:1px dashed var(--line);
  border-radius:var(--r,6px)}
.sr-upload{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}
.sr-select{font:inherit;font-size:var(--fs-body);padding:5px 8px;border:1px solid var(--line);
  border-radius:var(--r,6px);background:var(--paper);color:var(--ink)}
.sr-list{display:grid;gap:8px}
.sr-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;
  padding:11px 13px;border:1px solid var(--line);border-radius:var(--r,6px);
  background:var(--surface);cursor:pointer;text-align:left;font-family:inherit;font-size:var(--fs-body)}
.sr-row:hover{border-color:var(--oxblood)}
.sr-row .code{font-family:var(--mono,ui-monospace,monospace);font-size:var(--fs-caption);color:var(--ink-3)}
`;

/** Renders one of the three honest absences, or the children when ready. */
function Resolved({ value, noun, children }) {
  const { state, items } = resolve(value);
  if (state === "ready") return children(items);
  return (
    <p className={`sr-note${state === "unavailable" ? " unavailable" : ""}`}>
      {stateText(state, noun)}
    </p>
  );
}

function Meta({ label, children }) {
  return (
    <span>
      <span style={{ color: "var(--ink-3)" }}>{label} · </span>
      <b>{children ?? "—"}</b>
    </span>
  );
}

export default function StyleRecord({ styleId: styleIdProp, onNavigate }) {
  const engine = useEngine();
  const brandId = engine.brandId || null;

  const [styleId, setStyleId] = useState(styleIdProp || null);
  const [styles, setStyles] = useState(undefined);
  const [style, setStyle] = useState(undefined);
  const [packs, setPacks] = useState(undefined);
  const [assets, setAssets] = useState(undefined);
  const [colourways, setColourways] = useState(undefined);
  const [quotes, setQuotes] = useState(undefined);
  const [block, setBlock] = useState(undefined);
  const [drawings, setDrawings] = useState(undefined);
  // callout_id -> resolved measurement (0091)
  const [pomByCallout, setPomByCallout] = useState({});
  const [bom, setBom] = useState(undefined);
  const [materials, setMaterials] = useState(undefined);
  const [samples, setSamples] = useState(undefined);
  const [smpBusy, setSmpBusy] = useState(false);
  const [smpErr, setSmpErr] = useState(null);
  const [smpDraft, setSmpDraft] = useState(null);
  const [bomDraft, setBomDraft] = useState(null);
  const [bomBusy, setBomBusy] = useState(false);
  const [bomErr, setBomErr] = useState(null);
  // The Dirección's picked fabrics (engine 0085). undefined = NOT ASKED YET —
  // this read is lazy, because most visits to the BOM tab are to look at what
  // is already there, and one of the four refusal sentences shown to somebody
  // who never asked for candidates reads as an error in the page.
  const [candidates, setCandidates] = useState(undefined);
  // What the last "open a revision" actually did (engine 0087). Kept because
  // the two outcomes differ — a version was minted, or the corrections joined
  // a draft that was already open — and a designer who is told the wrong one
  // goes looking for a document that does not exist.
  const [revision, setRevision] = useState(null);
  // Approval lanes for the style's latest pack. undefined = not asked yet,
  // null = we could not ask — the rail says which, and never "sin firmas".
  const [readiness, setReadiness] = useState(undefined);
  const [tab, setTab] = useState("overview");
  // Construction tab working state: which drawing is in add-callout mode, the
  // half-placed callout awaiting its words, the upload's chosen view, and the
  // engine's refusal when it gives one.
  const [addOn, setAddOn] = useState(null);
  const [coDraft, setCoDraft] = useState(null);
  const [upView, setUpView] = useState("front");
  const [drawBusy, setDrawBusy] = useState(false);
  const [drawErr, setDrawErr] = useState(null);
  // Inline correction of one tech-pack field: which key is open, its working
  // value, and the engine's refusal when it gives one.
  const team = useTeam();
  const [editKey, setEditKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState(null);

  useEffect(() => { setStyleId(styleIdProp || null); }, [styleIdProp]);

  const loadList = useCallback(async () => {
    if (!brandId) return;
    setStyles(await getStyles(brandId));
  }, [brandId]);

  const loadStyle = useCallback(async () => {
    if (!brandId || !styleId) return;
    // Each resource is fetched independently and its own failure stays its own:
    // a quotes 500 must not blank the tech pack beside it.
    const [s, p, a, q, d, b, sm] = await Promise.all([
      getStyle(brandId, styleId),
      getTechPacks(brandId),
      getStyleAssets(brandId, styleId),
      getStyleQuotes(brandId, styleId),
      getStyleDrawings(brandId, styleId),
      getStyleBom(brandId, styleId),
      getStyleSamples(brandId, styleId),
    ]);
    setStyle(s); setAssets(a); setQuotes(q); setDrawings(d); setBom(b); setSamples(sm);
    // 0091 — resolve every measurement anchor on every drawing, at the block's
    // base size. Done here rather than per-render so a drawing with six
    // anchors is one request, not six.
    if (Array.isArray(d) && d.length) {
      Promise.all(d.map((dw) => getDrawingMeasurements(brandId, dw.id)))
        .then((rows) => {
          const byCallout = {};
          rows.forEach((r) => (r?.measurements || []).forEach((mm) => {
            byCallout[mm.callout_id] = mm;
          }));
          setPomByCallout(byCallout);
        })
        .catch(() => {});
    }
    // ⚠ Colourways ride on the style tree — `/styles/{id}/colourways` is
    // POST-only and answers 405, so there is nothing to fetch. `null` when the
    // style itself could not be read, so the tab says "could not ask" rather
    // than "none", which would be a claim we have no standing to make.
    setColourways(s === null ? null : (s?.colourways || []));
    setPacks(p === null ? null : (p || []).filter((x) => x.style_id === styleId));
    const blockId = s?.default_measurement_block_id
      || (p || []).find((x) => x.style_id === styleId)?.measurement_block_id;
    setBlock(blockId ? await getMeasurementBlock(brandId, blockId) : []);

    // The lanes hang off the newest pack. No pack, nothing to ask about.
    const latest = (p || []).filter((x) => x.style_id === styleId)[0];
    if (!latest) { setReadiness(null); return; }
    try { setReadiness(await getReadiness(brandId, "tech_pack", latest.id)); }
    catch { setReadiness(null); }
  }, [brandId, styleId]);

  useEffect(() => {
    if (!brandId) return;
    listMaterials(brandId).then((m) => setMaterials(Array.isArray(m) ? m
      : Array.isArray(m?.materials) ? m.materials : []))
      .catch(() => setMaterials(null));
  }, [brandId]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadStyle(); }, [loadStyle]);

  /* ---- the picker, when no Style is open ------------------------------- */
  if (!styleId) {
    return (
      <div className="sr">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <p className="sr-eyebrow">Producto</p>
        <h1 className="sr-name">Estilos</h1>
        <p className="sr-note" style={{ border: 0, padding: "0 0 18px", background: "none" }}>
          El registro canónico de una prenda: su linaje visual, su ficha técnica,
          sus colores, sus medidas y sus cotizaciones — en un solo hilo.
        </p>
        <Resolved value={styles} noun="estilos">
          {(items) => (
            <div className="sr-list">
              {items.map((s) => (
                <button key={s.id} className="sr-row" onClick={() => setStyleId(s.id)}>
                  <span>
                    <b>{s.name || s.style_code}</b>
                    <br />
                    <span className="code">{s.style_code}</span>
                  </span>
                  <span className="sr-chip"><span className="dot" />{s.lifecycle_status}</span>
                </button>
              ))}
            </div>
          )}
        </Resolved>
      </div>
    );
  }

  const pack = resolve(packs).items[0] || null;
  const summary = releaseSummary(pack);
  const cover = resolve(assets).items.find((a) => a.selection === "selected")
    || resolve(assets).items[0] || null;

  return (
    <div className="sr">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="sr-head">
        {cover?.url || cover?.content_url ? (
          <AssetImage className="sr-thumb" href={cover.url || cover.content_url} />
        ) : (
          <div className="sr-thumb empty"><Icon name="doc" /></div>
        )}
        <div>
          <p className="sr-eyebrow">Producto</p>
          <h1 className="sr-name">{style?.name || style?.style_code || "—"}</h1>
          <div className="sr-meta">
            <span className="code" style={{ fontFamily: "var(--mono,monospace)" }}>
              {style?.style_code || "—"}
            </span>
            <Meta label="Versión de ficha">{pack ? `v${pack.version}` : null}</Meta>
            <Meta label="Temporada">{style?.season}</Meta>
            <Meta label="Categoría">{style?.category}</Meta>
            {style?.lifecycle_status && (
              <span className={`sr-chip${pack?.status === "released" ? " released" : ""}`}>
                <span className="dot" />{pack?.status || style.lifecycle_status}
              </span>
            )}
          </div>
        </div>
        <button className="sr-btn" onClick={() => setStyleId(null)}>Todos los estilos</button>
      </header>

      <nav className="sr-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            disabled={t.status === PROPOSED}
            title={t.status === PROPOSED ? t.needs : t.source}
            className="sr-tab"
            onClick={() => t.status === REAL && setTab(t.key)}
          >
            {t.label}
            {t.status === PROPOSED && <span className="pend">sin motor</span>}
          </button>
        ))}
      </nav>

      <div className="sr-body">
        {tab === "overview" && (
          <Resolved value={style === undefined ? undefined : style ? [style] : null} noun="este estilo">
            {([s]) => {
              // Reference 05: the garment held between visual intent and the
              // factory document — lineage left, the facts centre, the release
              // decision right. Every panel reads an engine answer; a panel
              // with no answer says so rather than filling itself.
              const decision = releaseDecision(pack);
              const lineageCover = resolve(assets).items.find(
                (a) => a.intent === "production_directed") || cover;
              return (
                <div className="sr-work">
                  <div>
                    <p className="sr-col-note">Intención visual</p>
                    <div className="sr-hero">
                      <AssetImage
                        href={lineageCover?.url || lineageCover?.content_url}
                        absentText="Sin imagen enlazada a este estilo todavía"
                        style={{ aspectRatio: "3/4", width: "100%" }}
                      />
                    </div>
                    <div className="sr-lin">
                      <h3>Linaje de diseño</h3>
                      <dl>
                        <dt>Origen</dt>
                        <dd>{lineageCover
                          ? (lineageCover.operation === "ingest" ? "Imagen subida"
                            : "Generación del estudio")
                          : "sin declarar"}</dd>
                        <dt>Intención</dt>
                        {/* 0080: null intent is reported as null, never as
                            "exploración" — the row predates the question. */}
                        <dd>{lineageCover?.intent === "production_directed"
                          ? "Dirigida a producción"
                          : lineageCover?.intent === "exploratory" ? "Exploración"
                          : "sin registrar"}</dd>
                        <dt>Modelo</dt>
                        <dd>{lineageCover?.model || "sin registrar"}</dd>
                        <dt>Subió</dt>
                        <dd>{lineageCover?.created_by || "sin registrar"}
                          {lineageCover && lineageCover.created_by_verified === false
                            ? " · identidad no verificada" : ""}</dd>
                      </dl>
                      {resolve(assets).items.length > 1 && (
                        <button className="sr-act" style={{ marginTop: 10 }}
                          onClick={() => setTab("lineage")}>
                          Ver las {resolve(assets).items.length} imágenes →
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="sr-col-note">Hechos del producto</p>
                    <table className="sr-table">
                      <tbody>
                        {[["Código", s.style_code], ["Nombre", s.name],
                          ["Categoría", s.category], ["Subcategoría", s.subcategory],
                          ["Temporada", s.season], ["Composición", s.composition],
                          ["Proveedor", s.supplier_name], ["Continuidad", s.carryover_type],
                          ["Estado", s.lifecycle_status], ["Notas", s.notes]].map(([k, v]) => (
                            <tr key={k}>
                              <th style={{ width: 190 }}>{k}</th>
                              <td>{v || <span style={{ color: "var(--ink-3)" }}>sin declarar</span>}</td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <aside className="sr-rail">
                    <section className={`sr-panel${
                      decision.state === "refused" ? " refuse"
                        : decision.state === "ready" ? " ready" : ""}`}>
                      <h3>{decision.state === "refused"
                        ? `Atelier no libera la v${decision.version}`
                        : decision.state === "ready"
                          ? `La v${decision.version} pasa el contrato`
                          : decision.state === "none" ? "Sin ficha técnica"
                          : "El motor no dio veredicto"}</h3>
                      <p className="lede">
                        {decision.state === "refused"
                          ? "La ficha actual no pasa el contrato de campos. Estas son las razones que dio el motor, en su orden."
                          : decision.state === "ready"
                            ? "El motor la considera cotizable. La liberación sigue siendo una decisión humana."
                            : decision.state === "none"
                              ? "Esta prenda todavía no tiene ficha. Se crea desde una fila del rango."
                              : "Esta ficha no trae auditoría, así que no sabemos si es cotizable — y no lo vamos a suponer."}
                      </p>
                      {decision.open.length > 0 && (
                        <ol className="sr-reasons">
                          {decision.open.slice(0, 6).map((f, i) => (
                            <li key={f.key}>
                              <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                              <span><b>{f.field || f.key}</b>{f.why ? ` — ${f.why}` : ""}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {decision.open.length > 6 && (
                        <p className="lede" style={{ margin: "10px 0 0" }}>
                          y {decision.open.length - 6} más — la lista completa está en la ficha.
                        </p>
                      )}
                    </section>

                    <section className="sr-panel">
                      <h3>Firmas de revisión</h3>
                      {/* ⚠ The reference calls this out and so do we: these
                          signatures are recorded, and they do NOT gate the
                          engine's release contract. Two different questions. */}
                      <p className="lede">
                        Quedan registradas. No son lo que abre la liberación —
                        eso lo decide el contrato de campos de arriba.
                      </p>
                      {readiness === undefined ? (
                        <p className="lede">Consultando firmas…</p>
                      ) : readiness === null ? (
                        <p className="lede">No pudimos consultar las firmas.</p>
                      ) : (
                        <div className="sr-lanes">
                          {(readiness.required || []).map((d) => {
                            const st = laneState(readiness, d);
                            return (
                              <div key={d} className="sr-lane">
                                <span className="who">{LANE_LABEL[d] || d}</span>
                                <span className={`st ${st.status === "signed" ? "signed"
                                  : st.status === "rejected" ? "rejected" : "waiting"}`}>
                                  {st.status === "signed"
                                    ? `Aprobó ${st.by || "—"}`
                                    : st.status === "rejected" ? "Rechazada"
                                    : "Sin firmar"}
                                </span>
                              </div>
                            );
                          })}
                          {!(readiness.required || []).length && (
                            <span className="who">Esta marca no exige firmas para fichas.</span>
                          )}
                        </div>
                      )}
                    </section>
                  </aside>
                </div>
              );
            }}
          </Resolved>
        )}

        {tab === "lineage" && (
          <Resolved value={assets} noun="imágenes de este estilo">
            {(items) => (
              <div className="sr-grid">
                {items.map((a) => (
                  <figure key={a.id} className="sr-cell" style={{ margin: 0 }}>
                    <AssetImage href={a.url || a.content_url || ""} />
                    <figcaption className="cap">
                      {/* 0080: a doodle is not a commitment, and the row says which. */}
                      <span>{a.intent === "production_directed" ? "Dirigida a producción"
                           : a.intent === "exploratory" ? "Exploración"
                           : "Intención no registrada"}</span>
                      {a.parent_asset_id && <span title="deriva de otra imagen">↳</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Resolved>
        )}

        {tab === "techpack" && (
          <Resolved value={packs} noun="fichas técnicas para este estilo">
            {([p]) => {
              const editable = fieldsEditable(p.status);
              const save = async (key) => {
                setEditBusy(true); setEditErr(null);
                try {
                  // ⚠ The engine has no `human_edited` provenance and the
                  // router 422s everything except human attestations — so an
                  // edit here is signed by its editor as `human_verified`
                  // (lib/techPackFields.editedFieldPayload, tested).
                  await setTechPackField(brandId, p.id, key,
                    editedFieldPayload(editValue, team.me?.name));
                  setEditKey(null);
                  await loadStyle();
                } catch (e) {
                  // The engine's refusal is the message — a released pack
                  // answers 409 with its own sentence.
                  setEditErr(typeof e?.payload === "string" ? e.payload
                    : e?.payload?.detail || e?.message || "no se pudo guardar");
                }
                setEditBusy(false);
              };
              return (
                <>
                  {editErr && <p className="sr-editerr">{editErr}</p>}
                  <table className="sr-table">
                    <thead>
                      <tr><th>Campo</th><th>Valor</th><th>Procedencia</th><th /></tr>
                    </thead>
                    <tbody>
                      {Object.entries(p.fields || {}).map(([k, f]) => (
                        <tr key={k}>
                          <th>{k}</th>
                          <td>
                            {editKey === k ? (
                              <span className="sr-edit">
                                <input className="sr-input" value={editValue} autoFocus
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Escape") setEditKey(null); }} />
                              </span>
                            ) : (
                              f?.value ?? <span style={{ color: "var(--ink-3)" }}>falta</span>
                            )}
                          </td>
                          <td>
                            <span className={`sr-prov ${f?.provenance || ""}`}>
                              {provenanceLabel(f?.provenance)}
                            </span>
                          </td>
                          <td>
                            {editKey === k ? (
                              <span className="sr-edit">
                                <button className="sr-act" disabled={editBusy}
                                  onClick={() => save(k)}>Guardar y verificar</button>
                                <button className="sr-act" disabled={editBusy}
                                  onClick={() => setEditKey(null)}>Cancelar</button>
                              </span>
                            ) : (
                              <button className="sr-act" disabled={!editable || editBusy}
                                title={editable
                                  ? "Corregí el valor: queda firmado por vos como verificado"
                                  : "Esta versión es inmutable — una corrección abre una revisión en la ficha"}
                                onClick={() => {
                                  setEditKey(k); setEditErr(null);
                                  setEditValue(typeof f?.value === "object"
                                    ? JSON.stringify(f.value) : String(f?.value ?? ""));
                                }}>Corregir</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            }}
          </Resolved>
        )}

        {tab === "colourways" && (
          <Resolved value={colourways} noun="colores">
            {(items) => (
              <table className="sr-table">
                <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td>{c.colour_code}</td><td>{c.name || "—"}</td>
                      <td>{c.lifecycle_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Resolved>
        )}

        {tab === "measurements" && (
          <Resolved value={block === undefined ? undefined : block && block.id ? [block] : block}
                    noun="un bloque de medidas para este estilo">
            {([b]) => (
              <table className="sr-table">
                <thead>
                  <tr><th>Punto de medida</th>{(b.sizes || []).map((s) => <th key={s}>{s}</th>)}</tr>
                </thead>
                <tbody>
                  {(b.poms || []).map((p) => (
                    <tr key={p.name}>
                      <th>{p.name}</th>
                      {(b.sizes || []).map((s) => <td key={s}>{p.per_size?.[s] ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Resolved>
        )}

        {tab === "samples" && (() => {
          const rounds = samples?.rounds || [];
          const latest = rounds[rounds.length - 1] || null;
          const act = async (fn) => {
            setSmpBusy(true); setSmpErr(null);
            try { await fn(); await loadStyle(); }
            catch (e) {
              // The engine's refusals ARE the workflow here — "this sample has
              // not been received" is the sentence a designer needs.
              setSmpErr(typeof e?.payload === "string" ? e.payload
                : e?.payload?.detail || e?.message || "no se pudo");
            }
            setSmpBusy(false);
          };
          const uploadPhoto = async (round, file, view) => {
            if (!file) return;
            await act(async () => {
              const dataUri = await new Promise((ok, bad) => {
                const r = new FileReader();
                r.onload = () => ok(r.result);
                r.onerror = () => bad(new Error("no se pudo leer la foto"));
                r.readAsDataURL(file);
              });
              // Pixels through the one door, then the round links the row.
              const asset = await ingestAsset(brandId, {
                data_uri: dataUri, style_id: styleId,
                client_key: `sample:${round.id}:${crypto.randomUUID?.() || Date.now()}`,
              });
              await addSamplePhoto(brandId, round.id,
                { asset_id: asset.id, view });
            });
          };
          return (
            <>
              {smpErr && <p className="sr-editerr">{smpErr}</p>}

              {/* ⚠ WHAT OPENING A REVISION DID, AND WHAT IT DID NOT DO
                  (engine 0087). The caveat is not decoration: the document has
                  promised and the garment has not proved, so the sentence that
                  refuses the word "resuelto" travels with the good news. */}
              {revision && (() => {
                const out = revisionOutcomeText(revision);
                return out && (
                  <div className="sr-changes">
                    <span className="row"><b>{out.head}</b></span>
                    <span className="row unmentioned">{out.caveat}</span>
                  </div>
                );
              })()}

              {/* What the newest round says about the previous one. The
                  unmentioned line deliberately refuses the word "arreglado". */}
              {changeSentences(samples?.changed_since_previous).length > 0 && (
                <div className="sr-changes">
                  <span className="sr-col-note" style={{ margin: 0 }}>
                    Ronda {samples.changed_since_previous.to_round} frente a la{" "}
                    {samples.changed_since_previous.from_round}
                  </span>
                  {changeSentences(samples.changed_since_previous).map((c, i) => (
                    <span key={i} className={`row ${c.tone}`}>{c.text}</span>
                  ))}
                </div>
              )}

              {samples?.carried_over?.length > 0 && (
                <div className="sr-changes">
                  <span className="sr-col-note" style={{ margin: 0 }}>
                    Sin resolver ({samples.carried_over.length})
                  </span>
                  {samples.carried_over.map((c) => (
                    <span key={c.id} className="row">
                      <b>{c.body_area}</b> — {c.comment}
                      {c.assigned_to ? ` · a cargo: ${c.assigned_to}` : ""}
                    </span>
                  ))}
                </div>
              )}

              <Resolved value={samples === undefined ? undefined
                : samples === null ? null : rounds}
                noun="rondas de muestra para este estilo">
                {(items) => (
                  <div>
                    {[...items].reverse().map((r) => {
                      const st = roundState(r);
                      return (
                        <section key={r.id} className={`sr-round ${st.state}`}>
                          <div className="sr-round-head">
                            <span className="no">Ronda {r.round_no}</span>
                            <span className="sr-chip">{r.kind}</span>
                            <span style={{ color: "var(--ink-2)",
                              fontSize: "var(--fs-caption)" }}>{st.text}</span>
                            <span className="spacer" />
                            {/* WHICH SPEC this round was cut from. Null is
                                null — never "the latest", which is not what
                                the factory held. */}
                            <span style={{ fontSize: "var(--fs-caption)",
                              color: "var(--ink-3)" }}>
                              {r.tech_pack_id ? "contra una ficha registrada"
                                : "sin ficha registrada para esta ronda"}
                            </span>
                          </div>

                          {r.photos.length > 0 && (
                            <div className="sr-photos">
                              {r.photos.map((ph) => (
                                <figure key={ph.id}>
                                  <AssetImage href={ph.url} alt={ph.view} />
                                  <figcaption>{ph.view}</figcaption>
                                </figure>
                              ))}
                            </div>
                          )}

                          {r.comments.length > 0 && (
                            <div className="sr-fit">
                              {r.comments.map((c) => (
                                <Fragment key={c.id}>
                                  <span className="area">{c.body_area}</span>
                                  <span className={`sev ${c.severity}`}>{c.severity}</span>
                                  <span>
                                    {c.comment}
                                    {(c.spec_value || c.measured_value) && (
                                      <div className="meas">
                                        {/* Both as a person gave them. No delta
                                            is shown: the engine computed none. */}
                                        ficha {c.spec_value ?? "—"} · medido{" "}
                                        {c.measured_value ?? "—"}
                                        {c.pom_name ? ` · ${c.pom_name}` : ""}
                                      </div>
                                    )}
                                  </span>
                                  <span>
                                    {/* Intent, beside resolution and never
                                        instead of it: a version opened for this
                                        correction is a promise on paper. */}
                                    {openedVersionsText(c) && (
                                      <div className="sr-from">{openedVersionsText(c)}</div>
                                    )}
                                    {c.resolved_in_round_id ? (
                                      <span style={{ color: "var(--sage)",
                                        fontSize: "var(--fs-caption)" }}>
                                        resuelto en una ronda posterior
                                      </span>
                                    ) : latest && latest.round_no > r.round_no ? (
                                      <button className="sr-act" disabled={smpBusy}
                                        title="Marca que ESTA ronda posterior lo resolvió"
                                        onClick={() => act(() => resolveFitComment(
                                          brandId, c.id,
                                          { resolved_in_round_id: latest.id }))}>
                                        Resuelto en la {latest.round_no}
                                      </button>
                                    ) : null}
                                  </span>
                                </Fragment>
                              ))}
                            </div>
                          )}

                          <div className="sr-edit" style={{ marginTop: 12 }}>
                            {!r.received_at && (
                              <button className="sr-act" disabled={smpBusy}
                                onClick={() => act(() => receiveSampleRound(brandId, r.id))}>
                                Registrar que llegó
                              </button>
                            )}
                            {r.received_at && r.verdict === "pending" && (
                              <>
                                {["approved", "rejected", "resample"].map((v) => (
                                  <button key={v} className="sr-act" disabled={smpBusy}
                                    onClick={() => act(() => decideSampleRound(
                                      brandId, r.id, { verdict: v }))}>
                                    {{ approved: "Aprobar", rejected: "Rechazar",
                                       resample: "Pedir otra" }[v]}
                                  </button>
                                ))}
                              </>
                            )}
                            {r.received_at && (
                              <label className="sr-act" style={{ cursor: "pointer" }}>
                                Subir foto
                                <input type="file" accept="image/*" style={{ display: "none" }}
                                  disabled={smpBusy}
                                  onChange={(e) => { uploadPhoto(r, e.target.files?.[0], "front");
                                    e.target.value = ""; }} />
                              </label>
                            )}
                            <button className="sr-act" disabled={smpBusy}
                              onClick={() => { setSmpErr(null); setSmpDraft({
                                round_id: r.id, body_area: "overall",
                                severity: "minor", comment: "", spec_value: "",
                                measured_value: "", assigned_to: "" }); }}>
                              Anotar calce
                            </button>
                            {/* The third transition (engine 0087). Offered only
                                when this round actually has something open —
                                the engine refuses an empty revision, and a
                                button that always 409s teaches a designer to
                                ignore the ones that work. The other refusals
                                (no ficha registrada, corrección de otra ronda)
                                arrive as the engine's own sentence above. */}
                            {r.comments.some((c) => !c.resolved_in_round_id) && (
                              <button className="sr-act" disabled={smpBusy}
                                title="Abre la versión de ficha que responde estas correcciones. No las resuelve."
                                onClick={() => act(async () => {
                                  setRevision(await openSampleRevision(brandId, r.id));
                                })}>
                                Abrir versión de ficha
                              </button>
                            )}
                          </div>

                          {smpDraft?.round_id === r.id && (
                            <div className="sr-coform">
                              <span className="sr-edit">
                                <select className="sr-select" value={smpDraft.body_area}
                                  onChange={(e) => setSmpDraft({ ...smpDraft, body_area: e.target.value })}>
                                  {["neck", "shoulder", "chest", "bust", "waist", "hip",
                                    "sleeve", "cuff", "armhole", "back", "front", "hem",
                                    "length", "rise", "thigh", "leg", "collar", "pocket",
                                    "closure", "overall"].map((a) => (
                                      <option key={a} value={a}>{a}</option>))}
                                </select>
                                <select className="sr-select" value={smpDraft.severity}
                                  onChange={(e) => setSmpDraft({ ...smpDraft, severity: e.target.value })}>
                                  {["blocker", "major", "minor"].map((v) => (
                                    <option key={v} value={v}>{v}</option>))}
                                </select>
                                <select className="sr-select" value={smpDraft.assigned_to}
                                  onChange={(e) => setSmpDraft({ ...smpDraft, assigned_to: e.target.value })}>
                                  <option value="">— sin asignar —</option>
                                  {["supplier", "pattern_maker", "design", "internal"].map((v) => (
                                    <option key={v} value={v}>{v}</option>))}
                                </select>
                              </span>
                              <textarea className="sr-input" rows={2}
                                placeholder="Qué observaste en la prenda"
                                value={smpDraft.comment}
                                onChange={(e) => setSmpDraft({ ...smpDraft, comment: e.target.value })} />
                              <span className="sr-edit">
                                <input className="sr-input" placeholder="Valor de ficha (opcional)"
                                  value={smpDraft.spec_value}
                                  onChange={(e) => setSmpDraft({ ...smpDraft, spec_value: e.target.value })} />
                                <input className="sr-input" placeholder="Valor medido (opcional)"
                                  value={smpDraft.measured_value}
                                  onChange={(e) => setSmpDraft({ ...smpDraft, measured_value: e.target.value })} />
                              </span>
                              <span className="sr-edit">
                                <button className="sr-act" disabled={smpBusy || !smpDraft.comment.trim()}
                                  onClick={() => act(async () => {
                                    await addFitComment(brandId, r.id, {
                                      body_area: smpDraft.body_area,
                                      severity: smpDraft.severity,
                                      comment: smpDraft.comment,
                                      spec_value: smpDraft.spec_value || null,
                                      measured_value: smpDraft.measured_value || null,
                                      assigned_to: smpDraft.assigned_to || null,
                                    });
                                    setSmpDraft(null);
                                  })}>Guardar</button>
                                <button className="sr-act" disabled={smpBusy}
                                  onClick={() => setSmpDraft(null)}>Cancelar</button>
                              </span>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </Resolved>

              <div className="sr-edit" style={{ marginTop: 14 }}>
                {["proto", "fit", "pp", "top", "size_set"].map((k) => (
                  <button key={k} className="sr-act" disabled={smpBusy}
                    onClick={() => act(() => requestSampleRound(brandId, styleId, {
                      kind: k, tech_pack_id: pack?.id || null }))}>
                    Pedir {k}
                  </button>
                ))}
              </div>
              <p className="sr-bomfoot">
                Cada ronda queda atada a la ficha con la que se pidió, así se
                puede leer qué cambió entre una muestra y la siguiente. Atelier
                no mide nada: los valores de ficha y medidos son los que carga
                una persona.
              </p>
            </>
          );
        })()}

        {tab === "bom" && (() => {
          const rollup = bom?.rollup || null;
          const save = async () => {
            setBomBusy(true); setBomErr(null);
            try {
              if (bomDraft.direction_fabric_id) {
                // ⚠ THE MATERIAL IS NOT SENT. It comes from the pick, which is
                // the whole point of the transition — a material_id typed here
                // could disagree with the fabric the Dirección actually chose.
                await addBomLineFromDirection(brandId, styleId, {
                  direction_fabric_id: bomDraft.direction_fabric_id,
                  component: bomDraft.component,
                  uom: bomDraft.uom,
                  consumption: bomDraft.consumption || null,
                  waste_pct: bomDraft.waste_pct || null,
                  placement: bomDraft.placement || null,
                });
              } else {
                await addBomLine(brandId, styleId, {
                  component: bomDraft.component,
                  material_id: bomDraft.material_id || null,
                  description: bomDraft.description || "",
                  placement: bomDraft.placement || null,
                  uom: bomDraft.uom,
                  consumption: bomDraft.consumption || null,
                  waste_pct: bomDraft.waste_pct || null,
                });
              }
              setBomDraft(null);
              setCandidates(undefined);
              await loadStyle();
            } catch (e) {
              // The engine's refusal IS the message — "a line a factory
              // cannot read" is better copy than anything written here.
              setBomErr(typeof e?.payload === "string" ? e.payload
                : e?.payload?.detail || e?.message || "no se pudo agregar");
            }
            setBomBusy(false);
          };
          const remove = async (line) => {
            setBomBusy(true); setBomErr(null);
            try { await deleteBomLine(brandId, line.id); await loadStyle(); }
            catch (e) { setBomErr(e?.message || "no se pudo quitar"); }
            setBomBusy(false);
          };
          return (
            <>
              {bomErr && <p className="sr-editerr">{bomErr}</p>}
              {rollup && (
                <div className={`sr-rollup${rollup.material_cost === null ? " refused" : ""}`}>
                  <span>
                    <span className="sr-col-note" style={{ margin: 0 }}>Costo de materiales</span>
                    <div className="big">
                      {/* ⚠ The ENGINE's total or nothing. A client-side sum of
                          the priced lines would be smaller than the truth and
                          would look exactly like a good number. */}
                      {rollup.material_cost === null ? "sin total"
                        : `${rollup.currency || ""} ${rollup.material_cost}`}
                    </div>
                  </span>
                  <span className="why">
                    {(rollup.why_none
                      || `${rollup.priced_lines} de ${rollup.lines} líneas con precio`)
                      .replace(/\.?$/, ".")}
                    {rollup.net_only_lines?.length
                      ? ` Línea(s) ${rollup.net_only_lines.join(", ")} sin merma declarada: la cifra es NETA, no lo que hay que comprar.`
                      : ""}
                  </span>
                </div>
              )}
              <Resolved value={bom === undefined ? undefined
                : bom === null ? null : (bom.lines || [])}
                noun="líneas de BOM para este estilo">
                {(items) => (
                  <table className="sr-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Componente</th><th>Material</th>
                        <th>Consumo</th><th>Merma</th><th>Bruto</th>
                        <th>Costo</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((l) => (
                        <tr key={l.id}>
                          <td>{l.line_no}</td>
                          <td>{l.component}</td>
                          <td>
                            <b>{l.material_name || l.description}</b>
                            {l.material_code && (
                              <div style={{ fontFamily: "var(--mono,monospace)",
                                fontSize: "var(--fs-caption)", color: "var(--ink-3)" }}>
                                {l.material_code}
                                {l.supplier_name ? ` · ${l.supplier_name}` : ""}
                              </div>
                            )}
                            {l.placement && (
                              <div style={{ fontSize: "var(--fs-caption)",
                                color: "var(--ink-2)" }}>{l.placement}</div>
                            )}
                            {/* Which pick proposed this line, read through the
                                link every time — so withdrawing substitution
                                permission in Dirección changes what this says
                                without anybody editing the BOM. Absent when the
                                pick is gone, because the column cannot tell
                                "never proposed" from "proposed and deleted". */}
                            {(() => {
                              const from = directionOrigin(l);
                              return from && (
                                <div className="sr-from">
                                  {from.text}
                                  {from.substitution ? ` · ${from.substitution}` : ""}
                                </div>
                              );
                            })()}
                          </td>
                          <td>{l.consumption ?? <span style={{ color: "var(--ink-3)" }}>falta</span>} {l.uom}</td>
                          <td>{l.waste_pct === null
                            ? <span style={{ color: "var(--ink-3)" }}>sin declarar</span>
                            : `${l.waste_pct}%`}</td>
                          <td>{l.gross_consumption ?? "—"}
                            {l.gross_is_net && (
                              <div style={{ fontSize: "var(--fs-caption)",
                                color: "var(--ink-3)" }}>neta</div>
                            )}</td>
                          <td>{l.cost !== null
                            ? `${l.currency || ""} ${l.cost}`
                            : <span className="sr-miss">{l.missing}</span>}</td>
                          <td>
                            <button className="sr-act" disabled={bomBusy}
                              onClick={() => remove(l)}>Quitar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Resolved>

              {/* ⚠ THE FIRST TRANSITION ON SCREEN (engine 0085). Until now a
                  designer picked a jersey in Dirección and then re-found the
                  same row by name in a materials sheet. Every pick is listed,
                  including the ones the Dirección meant for other categories,
                  because filtering would make her own direction look narrower
                  than it is — the label says which is which and she decides. */}
              {candidates === undefined ? (
                <button className="sr-act" style={{ marginTop: 14 }}
                  disabled={bomBusy}
                  onClick={async () => {
                    setBomErr(null);
                    setCandidates(await getBomCandidates(brandId, styleId));
                  }}>
                  Telas de Dirección
                </button>
              ) : candidates && candidates.ok === false ? (
                // The engine's sentence, not ours: "this style is in no
                // collection" and "this collection has no direction" are
                // different facts, and an empty list would read as "she picked
                // nothing", which is the one thing that is not true.
                <p className="sr-bomfoot" style={{ marginTop: 14 }}>
                  {candidates.message}
                </p>
              ) : candidates ? (
                <div className="sr-cands">
                  <div className="sr-cand" style={{ gridTemplateColumns: "1fr auto" }}>
                    <span className="who">
                      Dirección v{candidates.direction_version?.version_number}
                      {" · "}
                      {candidates.direction_version?.governs
                        ? "aprobada, gobierna la colección"
                        : `${candidates.direction_version?.status} — todavía no aprobada`}
                    </span>
                    <button className="sr-act" onClick={() => setCandidates(undefined)}>
                      Ocultar
                    </button>
                  </div>
                  {(candidates.candidates || []).length === 0 && (
                    <div className="sr-cand"><span>Esta dirección todavía no tiene telas elegidas.</span></div>
                  )}
                  {(candidates.candidates || []).map((c) => (
                    <div className="sr-cand" key={c.direction_fabric_id}>
                      <span>
                        <b>{c.material_name || c.material_code}</b>
                        <div className="who">
                          {c.material_code}
                          {c.supplier_name ? ` · ${c.supplier_name}` : ""}
                          {c.unit_price ? ` · ${c.currency || ""} ${c.unit_price}`
                            : " · sin precio en la hoja"}
                        </div>
                        {c.substitution_allowed && (
                          <div className="who">
                            admite reemplazo{c.substitution_note ? `: ${c.substitution_note}` : ""}
                          </div>
                        )}
                      </span>
                      <span className={`sr-scope ${c.category_scope === "matches" ? "match"
                        : c.category_scope === "unscoped" ? "quiet"
                        : c.category_scope === "other_categories" ? "other" : "unknown"}`}>
                        {scopeLabel(c.category_scope)}
                      </span>
                      <button className="sr-act" disabled={bomBusy || c.already_on_bom}
                        onClick={() => { setBomErr(null); setBomDraft({
                          direction_fabric_id: c.direction_fabric_id,
                          material_label: c.material_name || c.material_code,
                          component: "shell", material_id: "", description: "",
                          placement: "", uom: "m", consumption: "", waste_pct: "" }); }}>
                        {c.already_on_bom ? "ya está en el BOM" : "Usar"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {bomDraft ? (
                <div className="sr-coform" style={{ marginTop: 14 }}>
                  <span className="sr-edit">
                    <select className="sr-select" value={bomDraft.component}
                      onChange={(e) => setBomDraft({ ...bomDraft, component: e.target.value })}>
                      {["shell", "lining", "trim", "thread", "closure", "label",
                        "packaging", "other"].map((c) => (
                          <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {bomDraft.direction_fabric_id ? (
                      // Locked: the material is the pick's, read through the
                      // link. Offering a picker here would let the line drift
                      // from the fabric the Dirección actually chose.
                      <span className="sr-from">
                        {bomDraft.material_label} · de Dirección
                      </span>
                    ) : (
                      <select className="sr-select" value={bomDraft.material_id}
                        onChange={(e) => setBomDraft({ ...bomDraft, material_id: e.target.value })}>
                        <option value="">— sin material del catálogo —</option>
                        {(Array.isArray(materials) ? materials : []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.price ? "" : " (sin precio)"}
                          </option>
                        ))}
                      </select>
                    )}
                    <select className="sr-select" value={bomDraft.uom}
                      onChange={(e) => setBomDraft({ ...bomDraft, uom: e.target.value })}>
                      {["m", "cm", "unit", "g", "kg", "pair"].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </span>
                  {!bomDraft.material_id && !bomDraft.direction_fabric_id && (
                    <input className="sr-input" placeholder="Descripción — qué es esta línea"
                      value={bomDraft.description}
                      onChange={(e) => setBomDraft({ ...bomDraft, description: e.target.value })} />
                  )}
                  <span className="sr-edit">
                    <input className="sr-input" placeholder="Consumo por prenda"
                      value={bomDraft.consumption}
                      onChange={(e) => setBomDraft({ ...bomDraft, consumption: e.target.value })} />
                    <input className="sr-input" placeholder="Merma % (dejalo vacío si no se midió)"
                      value={bomDraft.waste_pct}
                      onChange={(e) => setBomDraft({ ...bomDraft, waste_pct: e.target.value })} />
                    <input className="sr-input" placeholder="Ubicación (opcional)"
                      value={bomDraft.placement}
                      onChange={(e) => setBomDraft({ ...bomDraft, placement: e.target.value })} />
                  </span>
                  <span className="sr-edit">
                    <button className="sr-act" disabled={bomBusy} onClick={save}>
                      Agregar línea
                    </button>
                    <button className="sr-act" disabled={bomBusy}
                      onClick={() => setBomDraft(null)}>Cancelar</button>
                  </span>
                </div>
              ) : (
                <button className="sr-act" style={{ marginTop: 14 }}
                  onClick={() => { setBomErr(null); setBomDraft({
                    component: "shell", material_id: "", description: "",
                    placement: "", uom: "m", consumption: "", waste_pct: "" }); }}>
                  Agregar línea
                </button>
              )}
              <p className="sr-bomfoot">
                Cada línea CITA un material de la hoja: el precio vive allá, así
                que reimportar la hoja mueve el costo sin tocar el BOM. La merma
                vacía no es 0% — se informa el consumo neto y se dice que lo es.
                Una tela traída de Dirección llega con su material y su
                proveedor; el consumo lo declarás vos, y hasta que lo hagas esta
                prenda no tiene costo de materiales.
              </p>
            </>
          );
        })()}

        {tab === "construction" && (() => {
          const uploadDrawing = async (file) => {
            if (!file) return;
            setDrawBusy(true); setDrawErr(null);
            try {
              const dataUri = await new Promise((ok, bad) => {
                const r = new FileReader();
                r.onload = () => ok(r.result);
                r.onerror = () => bad(new Error("no se pudo leer el archivo"));
                r.readAsDataURL(file);
              });
              // Pixels go through the one door: the ledger first (an ingest,
              // keyed so a retry cannot mint a second row), the drawing after.
              const asset = await ingestAsset(brandId, {
                data_uri: dataUri,
                client_key: `drawing:${styleId}:${crypto.randomUUID?.() || Date.now()}`,
                style_id: styleId,
              });
              await addStyleDrawing(brandId, styleId, {
                asset_id: asset.id, view: upView, title: file.name || "",
              });
              await loadStyle();
            } catch (e) {
              setDrawErr(typeof e?.payload === "string" ? e.payload
                : e?.payload?.detail || e?.message || "no se pudo subir el dibujo");
            }
            setDrawBusy(false);
          };
          const placeCallout = (drawing, ev) => {
            const box = ev.currentTarget.getBoundingClientRect();
            setCoDraft({
              drawingId: drawing.id,
              x: Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)),
              y: Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)),
              label: "", field_key: "", note: "",
            });
            setAddOn(null);
          };
          const saveCallout = async () => {
            setDrawBusy(true); setDrawErr(null);
            try {
              await addDrawingCallout(brandId, coDraft.drawingId, {
                x: coDraft.x.toFixed(5), y: coDraft.y.toFixed(5),
                label: coDraft.label,
                field_key: coDraft.field_key || null,
                note: coDraft.note || null,
              });
              setCoDraft(null);
              await loadStyle();
            } catch (e) {
              setDrawErr(typeof e?.payload === "string" ? e.payload
                : e?.payload?.detail || e?.message || "no se pudo guardar el callout");
            }
            setDrawBusy(false);
          };
          // ⚠ An image the brand already has BECOMES the drawing — it is not
          // converted into one. A generated garment image is a reference the
          // designer chose; the numbers on it still come from the measurement
          // block through the callouts, never from the picture.
          const attachExisting = async (assetId) => {
            if (!assetId) return;
            setDrawBusy(true); setDrawErr(null);
            try {
              await addStyleDrawing(brandId, styleId, {
                asset_id: assetId, view: upView, title: "",
              });
              await loadStyle();
            } catch (e) {
              // The engine refuses a 3D render here (A24.0) and says why —
              // surface its sentence rather than a generic failure.
              setDrawErr(typeof e?.payload === "string" ? e.payload
                : e?.payload?.detail || e?.message || "no se pudo usar esa imagen");
            }
            setDrawBusy(false);
          };
          const removeCallout = async (c) => {
            setDrawBusy(true); setDrawErr(null);
            try { await deleteDrawingCallout(brandId, c.id); await loadStyle(); }
            catch (e) { setDrawErr(e?.message || "no se pudo quitar"); }
            setDrawBusy(false);
          };
          const removeDrawing = async (d) => {
            if (!window.confirm(
              "¿Quitar este dibujo? Sus callouts se van con él; la imagen queda en la biblioteca.")) return;
            setDrawBusy(true); setDrawErr(null);
            try { await deleteStyleDrawing(brandId, d.id); await loadStyle(); }
            catch (e) { setDrawErr(e?.message || "no se pudo quitar"); }
            setDrawBusy(false);
          };
          const fieldKeys = Object.keys(pack?.fields || {});
          const uploader = (
            <div className="sr-upload">
              <select className="sr-select" value={upView} disabled={drawBusy}
                onChange={(e) => setUpView(e.target.value)}>
                <option value="front">Delantero</option>
                <option value="back">Trasero</option>
                <option value="side">Lateral</option>
                <option value="detail">Detalle</option>
              </select>
              <label className="sr-act" style={{ cursor: "pointer" }}>
                {drawBusy ? "Subiendo…" : "Subir dibujo técnico"}
                <input type="file" accept="image/*" style={{ display: "none" }}
                  disabled={drawBusy}
                  onChange={(e) => { uploadDrawing(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {/* ⚠ THE ENGINE REFUSES TO GENERATE FLATS, and that stands:
                  tech_pack.py — "an orthographic technical drawing is not an
                  image-generation feature and pretending otherwise produces
                  inspiration boards with dimension lines."

                  What follows is NOT that. It does not make a flat; it lets a
                  designer point at an image this brand ALREADY generated and
                  say "this one is the drawing". The choice is hers and the
                  asset keeps its own provenance — its prompt, model and
                  parentage travel with it, so a pack can always answer where
                  its drawing came from. Until this existed the only route was
                  a file from disk, which is why a brand that generates inside
                  Atelier still had to leave to get a drawing in. */}
              {(assets || []).length > 0 && (
                <label className="sr-act" style={{ cursor: "pointer" }}>
                  Usar una imagen de la marca
                  <select
                    style={{ display: "none" }}
                    disabled={drawBusy}
                    onChange={(e) => { attachExisting(e.target.value); e.target.value = ""; }}
                  >
                    <option value="">—</option>
                    {(assets || []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.operation}
                        {a.model ? ` · ${a.model}` : ""}
                        {a.created_at ? ` · ${String(a.created_at).slice(0, 10)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--ink-3)" }}>
                Un dibujo hecho por una persona — Atelier no genera planos.
              </span>
            </div>
          );
          return (
            <>
              {drawErr && <p className="sr-editerr">{drawErr}</p>}
              <Resolved value={drawings} noun="dibujos técnicos de este estilo">
                {(items) => (
                  <div className="sr-draws">
                    {items.map((d) => (
                      <section key={d.id} className="sr-draw">
                        <div>
                          <div className="sr-draw-head">
                            <span className="view">{{ front: "Delantero", back: "Trasero",
                              side: "Lateral", detail: "Detalle" }[d.view] || d.view}</span>
                            <span style={{ fontSize: "var(--fs-caption)", color: "var(--ink-2)" }}>
                              {d.title}
                            </span>
                          </div>
                          <div
                            className={`sr-canvas${addOn === d.id ? " adding" : ""}`}
                            onClick={addOn === d.id ? (ev) => placeCallout(d, ev) : undefined}
                          >
                            <AssetImage
                              href={`/brands/${brandId}/assets/${d.asset_id}/content`}
                              alt={`Dibujo técnico: ${d.title || d.view}`}
                            />
                            {(d.callouts || []).map((c) => (
                              <span key={c.id} className="sr-pin"
                                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
                                {c.number}
                              </span>
                            ))}
                            {coDraft?.drawingId === d.id && (
                              <span className="sr-pin" style={{
                                left: `${coDraft.x * 100}%`, top: `${coDraft.y * 100}%`,
                                background: "var(--ochre)" }}>?</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="sr-draw-head">
                            <span className="view">Callouts</span>
                            <span className="spacer" />
                            <button className="sr-act" disabled={drawBusy}
                              onClick={() => { setAddOn(addOn === d.id ? null : d.id); setCoDraft(null); }}>
                              {addOn === d.id ? "Cancelar" : "Agregar callout"}
                            </button>
                            <button className="sr-act" disabled={drawBusy}
                              onClick={() => removeDrawing(d)}>Quitar dibujo</button>
                          </div>
                          {addOn === d.id && (
                            <p className="sr-note" style={{ padding: 10 }}>
                              Tocá el punto del dibujo que el callout explica.
                            </p>
                          )}
                          {(d.callouts || []).length === 0 && addOn !== d.id && !coDraft && (
                            <p className="sr-note" style={{ padding: 10 }}>
                              Sin callouts todavía. Un dibujo sin callouts es una
                              imagen; los callouts son lo que la fábrica lee.
                            </p>
                          )}
                          {(d.callouts || []).map((c) => {
                            const res = calloutResolutionText(c);
                            const pom = pomByCallout[c.id];
                            return (
                              <div key={c.id} className="sr-co">
                                <span className="n">{c.number}</span>
                                <span>
                                  <b>{c.label || <span style={{ color: "var(--ink-3)" }}>sin rótulo</span>}</b>
                                  {pom && (
                                    <div className={`res ${pomResolutionTone(pom)}`}>
                                      {pomResolutionText(pom)}
                                    </div>
                                  )}
                                  {res && (
                                    <div className={`res ${c.resolved === true ? "ok"
                                      : c.resolved === false ? "miss" : "unknown"}`}>
                                      {res}
                                    </div>
                                  )}
                                  {c.note && <div className="note">{c.note}</div>}
                                </span>
                                <button className="sr-act" disabled={drawBusy}
                                  onClick={() => removeCallout(c)}>Quitar</button>
                              </div>
                            );
                          })}
                          {coDraft?.drawingId === d.id && (
                            <div className="sr-coform">
                              <input className="sr-input" placeholder="Rótulo — qué es esto"
                                value={coDraft.label} autoFocus
                                onChange={(e) => setCoDraft({ ...coDraft, label: e.target.value })} />
                              <input className="sr-input" list="sr-fieldkeys"
                                placeholder="Campo de la ficha al que apunta (opcional)"
                                value={coDraft.field_key}
                                onChange={(e) => setCoDraft({ ...coDraft, field_key: e.target.value })} />
                              <datalist id="sr-fieldkeys">
                                {fieldKeys.map((k) => <option key={k} value={k} />)}
                              </datalist>
                              <textarea className="sr-input" rows={3}
                                placeholder="Nota de construcción (opcional) — cómo se hace, no cuánto mide: los valores viven en la ficha"
                                value={coDraft.note}
                                onChange={(e) => setCoDraft({ ...coDraft, note: e.target.value })} />
                              <span className="sr-edit">
                                <button className="sr-act" disabled={drawBusy}
                                  onClick={saveCallout}>Guardar callout</button>
                                <button className="sr-act" disabled={drawBusy}
                                  onClick={() => setCoDraft(null)}>Cancelar</button>
                              </span>
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                    {uploader}
                  </div>
                )}
              </Resolved>
              {/* `Resolved` already said "consultado: no hay" — the empty
                  state still owns the door in. */}
              {resolve(drawings).state === "empty" && uploader}
            </>
          );
        })()}

        {tab === "quotes" && (
          <Resolved value={quotes === undefined ? undefined : quotes?.quotes ?? quotes}
                    noun="cotizaciones para este estilo">
            {(items) => (
              <table className="sr-table">
                <thead>
                  <tr><th>Proveedor</th><th>Precio</th><th>MOQ</th><th>Plazo</th><th>Origen</th></tr>
                </thead>
                <tbody>
                  {items.map((q) => (
                    <tr key={q.quote_id || q.id}>
                      <td>{q.supplier_name || "—"}</td>
                      <td>{q.unit_cost ?? "—"} {q.currency || ""}</td>
                      <td>{q.moq_units ?? "—"}</td>
                      <td>{q.lead_time_days ? `${q.lead_time_days} d` : "—"}</td>
                      {/* A20.5: quotes reach a Style by two routes and the row says which. */}
                      <td>{q.origin?.scope === "slot"
                        ? `fila ${q.origin.slot_code || ""}` : "estilo"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Resolved>
        )}
      </div>

      <footer className="sr-foot">
        <span className="blockers">
          <Icon name={summary.unverified ? "warn" : "shield"} />
          {/* ⚠ COUNTS, NOT A VERDICT. `can_be_quoted` is the ENGINE's answer and
              this must not compute a second opinion beside it. `null` means it
              did not say — which is not the same as "no". */}
          {summary.total === 0 ? "Sin ficha técnica todavía"
            : summary.unverified > 0
              ? `${summary.unverified} campo(s) propuestos por IA, sin verificar`
              : `${summary.total} campos, ninguno pendiente de verificación`}
          {summary.canBeQuoted === null && summary.total > 0
            && " · el motor no dijo si es cotizable"}
        </span>
        <span className="spacer" />
        <button
          className="sr-btn primary"
          disabled={summary.canBeQuoted !== true}
          onClick={() => pack && onNavigate?.(`techpack:${pack.id}`)}
          title={summary.canBeQuoted === true
            ? "Abrir la ficha para liberarla"
            : "El motor no la considera cotizable todavía"}
        >
          Abrir ficha técnica
        </button>
      </footer>
    </div>
  );
}
