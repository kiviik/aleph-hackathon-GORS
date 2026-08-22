"use client";
// FICHA TÉCNICA — the human verification desk the release contract requires.
//
// The engine has refused to release an unverified pack since 2026-08-09, and
// until today there was nowhere to be the person who verifies. The owner's
// diagnosis, and it is exact: "a document waiting for a desk."
//
// ⚠ THE PACK ID IS AUTHORITATIVE. As of engine 0074 the Style thread EXISTS —
// `POST /slots/{id}/materialize` writes `slot.style_id` and packs carry it —
// but only for materialised slots, and this desk still keys on the pack id.
// This screen still shows NO critical path, NO supplier performance and NO
// cross-season quote comparison: those become honest per-Style once packs
// VERSION on the thread (STYLE-DECISIONS D5), not merely carry it. A desk
// that implied them earlier would be lying in the direction that costs money.
//
// Six field states, and two of them must never look alike: imported ·
// calculated · ai_proposed · human_edited · human_verified · missing.
// `ai_proposed` resembling `human_verified` is the exact confusion the release
// gate exists to prevent, so they get different colour, weight AND wording.
//
// ⚠ THE SHAPE, 2026-08-18. The substance above was right and the arrangement
// was a stack of tables you scrolled past — the owner's standing critique of
// this whole frontend: "Atelier explains a collection more than it lets a team
// see and manipulate it." The approved reference
// (`design/atelier-redesign/03-product-tech-pack.png`) is a three-region
// working surface: sections with completion state on the left, the selected
// section as the working area in the centre, one contextual inspector on the
// right. Nothing was removed to get there — the release gate, the refusals,
// the version history, the approval lanes and the delivery ledger are all
// still here, moved out of one scroll into document tabs and a desk.
//
// ⚠ AND THE SECTIONS ARE NOT THE REFERENCE'S. It draws eight anchored
// construction callouts (Neckline · Shoulder · Sleeve · Drape & knot · …) and
// the engine has no table behind them — `design/atelier-redesign/README.md`
// files them under PROPOSED itself. `lib/techPackSections.mjs` groups the keys
// the engine really writes, a section with nothing in it does not render, and
// an unknown key is filed under a named "otros" rather than dropped.
import { useCallback, useEffect, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import { useTeam } from "@/components/IdentityProvider";
import {
  getMeasurementBlocks, getSuppliers, getTechPack, getTechPackRecipients,
  getTechPacks, proposeTechPack, recordTechPackAcknowledgement,
  recordTechPackNotice, recordTechPackSend, refreshTechPack, releaseTechPack,
  reviseTechPack, setTechPackField,
} from "@/lib/api";
import {
  ACK_ACTION, NOTICE_ACTION, PANEL_INTRO, SEND_ACTION, ackText, countsText,
  noticeText, sentText, staleText,
} from "@/lib/techPackDelivery.mjs";
import { groupByStyle, historyFor, verifiedCount }
  from "@/lib/techPackVersions";
import { editedFieldPayload, proposalSentence, splitProposals }
  from "@/lib/techPackFields";
import {
  NO_MATERIAL_ROW, NO_TOLERANCES, SUGGEST_LABEL, canInsertDraft, checkForField,
  deriveSections, draftSeed, linkedMaterial, railSummary, stateLabel,
} from "@/lib/techPackSections.mjs";
import {
  LANE_LABEL, LANE_WHO, decide, getReadiness, laneState, lanesToShow, mayISign,
  verdict,
} from "@/lib/approvals";

const TIER = {
  blocking: { label: "Bloqueante", cls: "bad" },
  sample_round: { label: "Riesgo de muestra", cls: "warn" },
  cost_variance: { label: "Riesgo de costo", cls: "mild" },
};

// The two the router accepts over HTTP. `imported` and `calculated` are 422s
// on purpose: a human must not be able to launder a machine value into a
// verified one by re-posting it unchanged.
const WRITABLE = ["human_verified", "supplier_confirmed"];

const PROV_LABEL = {
  imported: "importado",
  calculated: "calculado",
  ai_proposed: "propuesto por IA",
  human_edited: "editado por una persona",
  human_verified: "verificado por una persona",
  supplier_confirmed: "confirmado por el proveedor",
};

const CSS = `
.tp{max-width:1340px;margin:0 auto;padding:26px 30px 120px}
.tp-eyebrow{font-family:var(--d);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--editorial)}
.tp-title{font-family:var(--serif);font-size:34px;font-weight:600;letter-spacing:-.015em;margin:7px 0 5px;color:var(--ink)}
.tp-sub{margin:0;color:var(--ink-2);font-size:13.5px}
.tp-mono{font-family:var(--m,ui-monospace,Menlo,monospace);font-size:12px;color:var(--ink-3)}

.tp-bar{display:flex;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin:20px 0 6px;flex-wrap:wrap}
.tp-st{background:var(--surface);padding:12px 15px;flex:1 1 150px;min-width:150px}
.tp-st b{display:block;font-family:var(--disp);font-size:21px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}
.tp-st span{display:block;font-family:var(--d);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);margin-top:5px}
.tp-st b.no{color:var(--danger)} .tp-st b.yes{color:var(--positive)}
.tp-st b.none{color:var(--ink-3);font-weight:500;font-size:17px}

.tp-read{border-left:3px solid var(--danger);background:var(--clay-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:13px 16px;margin:18px 0 6px}
.tp-read b{display:block;font-size:14px;color:var(--ink);margin-bottom:3px}
.tp-read p{margin:0;font-size:13px;line-height:1.55;color:var(--ink-2)}
.tp-read.ok{border-left-color:var(--positive);background:var(--surface)}

.tp-h2{font-family:var(--disp);font-size:16px;font-weight:700;letter-spacing:-.01em;margin:30px 0 4px;color:var(--ink)}
.tp-h2note{margin:0 0 12px;font-size:12.5px;color:var(--ink-2)}

/* Version history. Quiet by design — it is context for the document above it,
   not a second decision surface. The row you are on is marked rather than
   hidden, so the history reads as one sequence including the present. */
.tp-hist ul{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:var(--r-xs);overflow:hidden}
.tp-hist li{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 13px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2)}
.tp-hist li:first-child{border-top:none}
.tp-hist li.now{background:var(--paper-2)}
.tp-hist-when{color:var(--ink-3)}
.tp-hist-note{flex:1 1 100%;font-size:12.5px;color:var(--ink-2);font-style:italic}
.tp-hist-now{margin-left:auto;font-family:var(--d);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)}
.tp-hist li .tp-act{margin-left:auto}

/* Approval lanes. Same restraint as the history: a lane is a fact about who
   signed, not a call to action, so nothing here competes with the release
   button above it. The missing state is deliberately NOT red — an unsigned
   lane on a draft is the normal state, not a fault.
   (No backticks in here: this whole block lives inside a JS template
   literal, and one would end the string.) */
.tp-lanes{margin-top:6px}
.tp-lane-list{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:var(--r-xs);overflow:hidden}
.tp-lane{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 13px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2)}
.tp-lane:first-child{border-top:none}
.tp-lane-name{font-weight:600;color:var(--ink);min-width:96px;text-transform:capitalize}
.tp-lane-who{color:var(--ink-3)}
.tp-lane.approved .tp-lane-who{color:var(--positive)}
.tp-lane.rejected{background:var(--clay-wash)}
.tp-lane.unset{opacity:.62}
.tp-lane-warn{font-family:var(--d);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--danger)}
.tp-lane-reason{flex:1 1 100%;font-size:12.5px;font-style:italic;color:var(--ink-2)}
.tp-lane .tp-act{margin-left:auto}

/* The document tabs. The desk is one of four views of the same pack; the
   other three are context (history, signatures, deliveries) that used to sit
   below the fields as three more tables to scroll past. The count stays
   visible at zero on purpose: a category that disappears when empty is one
   nobody notices reappearing. */
.tp-tabs{display:flex;gap:6px;margin:0 0 10px;flex-wrap:wrap}
.tp-tab{font-family:var(--d);font-size:11.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:none;color:var(--ink-2);cursor:pointer}
.tp-tab.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.tp-tab-n{font-variant-numeric:tabular-nums;opacity:.7;margin-left:5px}

/* ------------------------------------------------------------------ desk -- */
/* Three regions, and the centre one is minmax(0,1fr) rather than 1fr: a grid
   track defaults to min-content and a long field value would push the whole
   page sideways. Nothing in this app may scroll horizontally. */
.tp-desk{display:grid;grid-template-columns:214px minmax(0,1fr) 320px;gap:16px;align-items:start;margin-top:6px}
@media (max-width:1140px){.tp-desk{grid-template-columns:1fr}}

.tp-rail{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;position:sticky;top:14px}
.tp-rail-h{font-family:var(--d);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);padding:11px 13px 8px}
.tp-rail ol{list-style:none;margin:0;padding:0}
.tp-rail li{border-top:1px solid var(--hair)}
.tp-sec{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;padding:9px 12px;cursor:pointer;font:inherit;font-size:13px;color:var(--ink-2)}
.tp-sec:hover{background:var(--paper-2)}
.tp-sec.on{background:var(--action-wash);border-left-color:var(--action);color:var(--ink);font-weight:600}
.tp-sec-n{font-family:var(--m,ui-monospace,Menlo,monospace);font-size:11px;color:var(--ink-3);min-width:14px}
.tp-sec-l{flex:1;min-width:0}
.tp-sec-c{font-family:var(--m,ui-monospace,Menlo,monospace);font-size:10.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.tp-dot{width:11px;height:11px;border-radius:50%;flex:none;border:1.5px solid var(--ink-3)}
.tp-dot.verified{background:var(--positive);border-color:var(--positive)}
.tp-dot.clean{background:transparent;border-color:var(--ink-3)}
.tp-dot.open{background:var(--inferred);border-color:var(--inferred)}
.tp-dot.blocking{background:var(--danger);border-color:var(--danger)}
.tp-rail-f{padding:10px 13px;border-top:1px solid var(--line);font-size:11.5px;line-height:1.5;color:var(--ink-2)}

.tp-canvas{min-width:0}
.tp-canvas-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 3px}
.tp-canvas-h h2{font-family:var(--disp);font-size:17px;font-weight:700;letter-spacing:-.01em;margin:0;color:var(--ink)}
.tp-scroll{overflow-x:auto;max-width:100%}

.tp-flist{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.tp-flist li{border-top:1px solid var(--hair)}
.tp-flist li:first-child{border-top:none}
.tp-f{padding:11px 13px;border-left:3px solid transparent}
.tp-f.on{background:var(--action-wash);border-left-color:var(--action)}
.tp-f-top{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.tp-f-k{font-weight:600;font-size:13px;color:var(--ink);background:none;border:0;padding:0;cursor:pointer;font-family:inherit;text-align:left}
.tp-f-k:hover{text-decoration:underline}
.tp-f-v{flex:1 1 100%;font-size:13px;color:var(--ink);word-break:break-word;margin-top:3px}
.tp-f-v.none{color:var(--ink-3);font-style:italic}

.tp-why{color:var(--ink-3);font-size:11.5px;margin-top:3px;max-width:46ch;line-height:1.45}
.tp-ask{font-size:12.5px;color:var(--ink-2);line-height:1.5}
.tp-zh{color:var(--ink-3);font-size:12px;margin-top:2px}
.tp-ev{color:var(--ink-3);font-size:11px;font-family:var(--m,ui-monospace,Menlo,monospace);margin-top:3px;word-break:break-word}

.tp-tbl{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.tp-tbl th{text-align:left;font-family:var(--d);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);padding:9px 13px;border-bottom:1px solid var(--line);font-weight:600}
.tp-tbl td{padding:11px 13px;border-bottom:1px solid var(--hair);vertical-align:top;font-size:13px;color:var(--ink)}
.tp-tbl tr:last-child td{border-bottom:0}

.tp-chip{display:inline-block;font-family:var(--d);font-size:10.5px;letter-spacing:.04em;padding:2px 7px;border-radius:var(--r-xs);white-space:nowrap;font-weight:600}
.tp-chip.bad{background:var(--clay-wash);color:#8E2B1F}
.tp-chip.warn{background:var(--ochre-wash);color:#8A6410}
.tp-chip.mild{background:var(--paper-2);color:var(--ink-2)}

/* ⚠ ai_proposed and human_verified are deliberately unalike: different colour,
   different weight, different word. Their resemblance is the risk.
   The imported state takes --observed, the token this design system reserves
   for evidence the world supplied rather than anything Atelier inferred.
   (No backticks in this block: it lives inside a JS template literal.) */
.tp-prov{display:inline-block;font-family:var(--d);font-size:10.5px;padding:2px 7px;border-radius:var(--r-xs);white-space:nowrap;background:var(--paper-2);color:var(--ink-2)}
.tp-prov.imported{background:var(--observed-wash);color:var(--observed-ink)}
.tp-prov.human_verified{background:#E7F5ED;color:#0F6B3C;font-weight:700}
.tp-prov.supplier_confirmed{background:#E7F5ED;color:#0F6B3C;font-weight:700}
.tp-prov.ai_proposed{background:var(--inferred-wash);color:#8A6410;font-weight:400;font-style:italic}
.tp-prov.missing{background:var(--clay-wash);color:#8E2B1F}

.tp-act{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 11px;font-family:var(--d);font-size:11.5px;cursor:pointer;white-space:nowrap}
.tp-act:hover{background:var(--paper-2)}
.tp-act[disabled]{opacity:.45;cursor:default}
.tp-act.press{background:var(--action);border-color:var(--action);color:#fff}
.tp-act.press:hover{background:var(--action-ink)}

/* ---------------------------------------------------------- inspector -- */
.tp-insp{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);position:sticky;top:14px;min-width:0}
.tp-insp-h{padding:12px 14px 10px;border-bottom:1px solid var(--line)}
.tp-insp-h b{display:block;font-family:var(--disp);font-size:15px;font-weight:700;color:var(--ink);word-break:break-word}
.tp-blk{padding:12px 14px;border-bottom:1px solid var(--hair)}
.tp-blk:last-child{border-bottom:0}
.tp-blk-h{font-family:var(--d);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);margin:0 0 5px}
.tp-blk p{margin:0;font-size:12.5px;line-height:1.5;color:var(--ink-2)}
.tp-blk .val{font-size:13px;color:var(--ink);word-break:break-word}
.tp-abs{font-size:12px;line-height:1.5;color:var(--ink-3);font-style:italic}

/* The AI draft. Amber, because --inferred is what this system reserves for
   anything Atelier proposed — and set apart from the rest of the panel, so
   nobody reads it as one more fact about the garment. */
.tp-draft{background:var(--inferred-wash);border:1px solid var(--inferred);border-radius:var(--r-xs);padding:11px 12px}
.tp-draft .val{font-size:13px;color:var(--ink);font-style:italic}
.tp-draft p{margin:6px 0 0;font-size:11.5px;line-height:1.45;color:#7A5A10}
.tp-draft .tp-act{margin-top:9px}

.tp-dock{position:sticky;bottom:0;margin-top:26px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 15px;box-shadow:var(--shadow)}
.tp-dock .grow{flex:1;min-width:180px;font-size:12.5px;color:var(--ink-2)}
.tp-btn{border:none;border-radius:999px;padding:8px 15px;font-family:var(--d);font-size:12.5px;font-weight:600;cursor:pointer}
.tp-btn.p{background:var(--action);color:#fff}
.tp-btn.s{background:var(--paper-2);color:var(--ink);border:1px solid var(--line)}
.tp-btn[disabled]{opacity:.45;cursor:default}

.tp-empty{border:1px dashed var(--line);border-radius:var(--r);padding:34px;text-align:center;background:var(--surface)}
.tp-empty b{display:block;font-family:var(--disp);font-size:17px;color:var(--ink);margin-bottom:6px}
.tp-empty p{margin:0 auto;max-width:56ch;font-size:13px;line-height:1.6;color:var(--ink-2)}
.tp-refusal{border-left:3px solid var(--danger);background:var(--clay-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:12px 15px;margin:14px 0;font-size:13px;color:var(--ink-2)}
.tp-refusal b{color:var(--ink)}
.tp-refusal ul{margin:7px 0 0;padding-left:18px} .tp-refusal li{margin:2px 0}

/* Entregas a fábrica. Reuses the lane list; these are the send-form controls.
   The count line is quiet amber, not red: a stale holder is work to do, not
   an outage. */
.tp-send{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:10px}
.tp-send label{display:block;font-family:var(--d);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.tp-send select,.tp-send input{display:block;font:inherit;font-size:12.5px;padding:5px 8px;margin-top:3px;border:1px solid var(--line);border-radius:var(--r-xs);background:var(--paper);color:var(--ink)}
.tp-del-counts{display:inline-block;font-family:var(--d);font-size:11px;padding:3px 9px;border-radius:var(--r-xs);background:var(--ochre-wash);color:#8A6410;margin:0 0 8px}

.tp-edit{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.tp-input{font:inherit;font-size:12.5px;padding:4px 8px;border:1px solid var(--line);
  border-radius:var(--r-xs);background:var(--paper);color:var(--ink);min-width:190px;flex:1 1 200px}
.tp-hint{font-size:11px;color:var(--ink-3);margin-top:4px;max-width:60ch;line-height:1.45}
.tp-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:7px}
`;

function Prov({ value }) {
  const v = value || "missing";
  return <span className={`tp-prov ${v}`}>{PROV_LABEL[v] || v}</span>;
}

/** A value as text, without pretending an absent one is an empty string. */
function asText(value) {
  if (value == null) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function TechPack({ packId, onNavigate }) {
  const engine = useEngine();
  const team = useTeam();
  const brandId = engine.brandId || null;

  // undefined = not asked yet · null = could not ask · value = an answer.
  // ⚠ Three states, never two. A screen that renders "could not ask" as "none
  // exist" is the defect this codebase has now fixed on four other screens.
  const [list, setList] = useState(undefined);
  const [pack, setPack] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [toast, setToast] = useState("");
  const [blocks, setBlocks] = useState(undefined);
  // undefined = not asked · null = could not ask · object = the engine answered.
  const [readiness, setReadiness] = useState(undefined);
  // Which view of the document: the desk, or one of the three contexts.
  const [docTab, setDocTab] = useState("desk");
  // The desk's own state. Both fall back rather than being synced by an
  // effect — a selection effect keyed on the pack is how a brand switch ends
  // up rendering one brand's section against another brand's fields.
  const [sectionId, setSectionId] = useState(null);
  const [focus, setFocus] = useState(null);       // {kind:"field"|"flag", key}
  const [aiOnly, setAiOnly] = useState(false);
  // key of the field open for correction, and its working value
  const [editing, setEditing] = useState(null);
  const [draftValue, setDraftValue] = useState("");
  // The delivery ledger (0079). undefined = not asked · null = could not ask.
  const [recipients, setRecipients] = useState(undefined);
  const [supplierDir, setSupplierDir] = useState(undefined);
  const [sendSupplierId, setSendSupplierId] = useState("");
  const [sendChannel, setSendChannel] = useState("");

  const load = useCallback(async () => {
    if (!brandId) return;
    if (packId) {
      const [p, b] = await Promise.all([
        getTechPack(brandId, packId), getMeasurementBlocks(brandId),
      ]);
      setPack(p); setBlocks(b);
      // The version history needs the brand's other versions of this style.
      // Fetched SEPARATELY and defensively: it is additive context, and a
      // failure here must not take the document itself down with it.
      try { setList(await getTechPacks(brandId)); }
      catch { setList(null); }
      // Same rule for the approval lanes. `null` here means "could not ask",
      // which the panel says out loud rather than drawing empty lanes that
      // would read as "nobody has signed".
      try { setReadiness(await getReadiness(brandId, "tech_pack", packId)); }
      catch { setReadiness(null); }
      // The delivery ledger and the supplier directory, same defensive rule:
      // additive context whose failure must not take the document down.
      setRecipients(await getTechPackRecipients(brandId, packId));
      setSupplierDir(await getSuppliers(brandId));
    } else {
      setList(await getTechPacks(brandId));
    }
  }, [brandId, packId]);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  async function run(fn, okMsg) {
    setBusy(true); setRefusal(null);
    try {
      await fn();
      await load();
      if (okMsg) flash(okMsg);
    } catch (e) {
      // A refusal is not an error to hide — it is the gate proving it exists,
      // and it names what is still unresolved.
      setRefusal(e.payload || e.message || "la operación falló");
    }
    setBusy(false);
  }

  if (!brandId) {
    return (
      <section className="tp">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tp-empty"><b>Sin marca activa</b>
          <p>Elegí una marca arriba para ver sus fichas técnicas.</p></div>
      </section>
    );
  }

  // ---------------------------------------------------------------- list --
  if (!packId) {
    return (
      <section className="tp">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tp-eyebrow">Colecciones · Desarrollo</div>
        <h1 className="tp-title">Fichas técnicas</h1>
        <p className="tp-sub">
          El documento que una fábrica necesita para cotizar. El motor se niega a
          liberarlo hasta que una persona con nombre verifique cada campo
          requerido — esta es esa mesa de trabajo.
        </p>

        {list === undefined ? (
          <div className="tp-empty"><b>Consultando el motor…</b>
            <p>Todavía no sabemos cuántas fichas hay. Esto no es un cero.</p></div>
        ) : list === null ? (
          <div className="tp-empty"><b>No pudimos consultar el motor.</b>
            <p>No quiere decir que no haya fichas — quiere decir que no pudimos
               preguntar. Antes de afirmar que esta marca no tiene ninguna,
               preferimos decirte que la consulta falló.</p></div>
        ) : list.length === 0 ? (
          <div className="tp-empty"><b>Esta marca todavía no tiene fichas técnicas.</b>
            <p>Se crean desde una fila del Plan de rango: la ficha nace de un
               slot, hereda su categoría, cantidad, precio objetivo, MOQ y
               entrega, y queda esperando verificación humana.</p></div>
        ) : (
          // ONE ROW PER STYLE, not per version. The engine returns every
          // version (ordered style_number, version DESC) and this table used to
          // render them flat — so a revised style appeared twice, as if the
          // brand had two fichas for one garment, and the released document was
          // not distinguishable from the draft superseding it.
          <div className="tp-scroll">
          <table className="tp-tbl">
            <thead><tr><th>Estilo</th><th>Estado</th><th>Campos</th><th>Verificados</th><th /></tr></thead>
            <tbody>
              {groupByStyle(list).map((g) => {
                // The version a person should land on: the one still being
                // worked, which is the latest. The RELEASED one is named
                // separately below — never merged into this.
                const open = g.latest;
                const n = Object.keys(open.fields || {}).length;
                const v = verifiedCount(open);
                return (
                  <tr key={g.style_number}>
                    <td><b>{g.name || g.style_number}</b>
                      <div className="tp-ev">
                        {g.style_number} · v{open.version}
                        {g.count > 1 && <> · {g.count} versiones</>}
                      </div></td>
                    <td>
                      {/* Both facts, side by side. "Liberada v1 · Revisión v2"
                          is the real state of a garment being revised, and
                          showing only one of them hides either the signed-off
                          document or the work in progress. */}
                      {g.hasRelease && (
                        <span className="tp-chip mild">Liberada v{g.released.version}</span>
                      )}
                      {g.revisionInFlight && (
                        <span className="tp-chip warn">Revisión v{open.version}</span>
                      )}
                      {!g.hasRelease && (
                        <span className="tp-chip warn">
                          {open.status === "superseded" ? "Superada" : "Borrador"}
                        </span>
                      )}
                    </td>
                    <td>{n}</td>
                    <td>{v === 0 ? <span className="tp-prov missing">0 verificados</span> : v}</td>
                    <td><button className="tp-act"
                      onClick={() => onNavigate?.(`techpack:${open.id}`)}>Abrir →</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    );
  }

  // -------------------------------------------------------------- detail --
  if (pack === undefined) {
    return (
      <section className="tp">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tp-empty"><b>Abriendo la ficha…</b><p>&nbsp;</p></div>
      </section>
    );
  }
  if (pack === null) {
    return (
      <section className="tp">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tp-empty"><b>No pudimos abrir esta ficha.</b>
          <p>La consulta al motor falló. No sabemos si la ficha existe.</p>
          <p style={{ marginTop: 10 }}>
            <button className="tp-act" onClick={load}>Reintentar</button>
          </p></div>
      </section>
    );
  }

  const fields = pack.fields || {};
  const audit = pack.audit || {};
  const summary = audit.summary || {};
  const flags = Array.isArray(audit.flags) ? audit.flags : [];
  const open = flags.filter((f) => f.status !== "present");
  const entries = Object.entries(fields);
  const split = splitProposals(fields);
  const verified = split.verifiedCount;
  const released = pack.status === "released";
  const editable = !released && pack.status !== "superseded";
  const canRelease = summary.can_be_quoted === true;

  const provCount = entries.reduce((acc, [, v]) => {
    const k = v?.provenance || "missing";
    acc[k] = (acc[k] || 0) + 1; return acc;
  }, {});

  // ---- the desk's three regions, derived once ---------------------------- //
  const { sections, totals } = deriveSections(pack);
  // The AI-only mode narrows the rail to sections a model wrote into. The
  // pack-wide count beneath it never disappears, which is the point.
  const railSections = aiOnly
    ? sections.filter((s) => s.proposedCount > 0) : sections;
  const active = railSections.find((s) => s.id === sectionId)
    || railSections[0] || null;
  const shownFields = active
    ? (aiOnly ? active.fields.filter(([, v]) => v?.provenance === "ai_proposed")
              : active.fields)
    : [];

  // What the inspector is about. Falls back to the section's first field, then
  // its first open point — a panel with nothing selected is a panel nobody
  // reads, and there is always something real to put in it.
  const focusIn = focus && (
    (focus.kind === "field" && active?.fields.some(([k]) => k === focus.key))
    || (focus.kind === "flag" && active?.flags.some((f) => f.key === focus.key)))
    ? focus
    : shownFields.length ? { kind: "field", key: shownFields[0][0] }
    : active?.flags.length ? { kind: "flag", key: active.flags[0].key }
    : null;

  const focusEntry = focusIn?.kind === "field" ? fields[focusIn.key] : null;
  const focusFlag = focusIn
    ? (focusIn.kind === "flag"
        ? active.flags.find((f) => f.key === focusIn.key)
        : (() => {
            const check = checkForField(focusIn.key);
            return check
              ? [...active.flags, ...active.passed].find((f) => f.key === check)
              : null;
          })())
    : null;

  const linked = linkedMaterial(fields);
  const category = fields.category?.value;
  const block = Array.isArray(blocks)
    ? blocks.find((b) => b.category === category && b.status === "active") : null;

  const history = historyFor(Array.isArray(list) ? list : [], pack.style_number);
  const deliveryTab = released || pack.status === "superseded";

  const startEdit = (key, seed) => {
    setEditing(key);
    setDraftValue(seed);
  };

  return (
    <section className="tp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="tp-eyebrow">Colecciones · Desarrollo · Ficha técnica</div>
      <h1 className="tp-title">{pack.name || pack.style_number}</h1>
      <p className="tp-sub">
        <span className="tp-mono">{pack.style_number} · v{pack.version} · {
          released ? "liberada" : pack.status === "superseded" ? "superada" : "borrador"
        }</span>
        {pack.slot_code ? <> — posición de rango <span className="tp-mono">{pack.slot_code}</span></> : null}
      </p>

      <div className="tp-bar">
        <div className="tp-st">
          <b className={canRelease ? "yes" : "no"}>{canRelease ? "SÍ" : "NO"}</b>
          <span>una fábrica puede cotizarlo</span>
        </div>
        <div className="tp-st"><b>{entries.length}</b><span>campos</span></div>
        <div className="tp-st">
          <b className={verified === 0 ? "no" : undefined}>{verified}</b>
          <span>verificados por una persona</span>
        </div>
        <div className="tp-st"><b>{summary.by_tier?.blocking ?? "—"}</b><span>bloqueantes</span></div>
        <div className="tp-st"><b>{summary.by_tier?.sample_round ?? "—"}</b><span>riesgo de muestra</span></div>
        <div className="tp-st"><b>{summary.checks_run ?? "—"}</b><span>chequeos corridos</span></div>
      </div>
      <p className="tp-mono" style={{ margin: "0 0 4px" }}>
        {Object.entries(provCount).map(([k, n]) => `${n} ${PROV_LABEL[k] || k}`).join(" · ")}
      </p>

      {/* ⚠ "Incompleta" would be FALSE — every field here has a value. The
          honest reading is populated-but-unverified, which is a different
          state and a different instruction to the reader. */}
      <div className={`tp-read${canRelease ? " ok" : ""}`}>
        <b>{released ? "Ficha liberada." : canRelease
          ? "Esta ficha puede liberarse." : "Esta ficha no puede liberarse."}</b>
        <p>
          {released
            ? "Quedó inmutable. Una corrección abre una revisión nueva; esta versión no se toca."
            : verified === 0
              ? `Los ${entries.length} campos tienen valor, pero ninguno fue verificado por una persona con nombre. Poblada no es verificada.`
              : `${verified} de ${entries.length} campos verificados. Faltan ${summary.by_tier?.blocking ?? "?"} bloqueantes.`}
        </p>
      </div>

      {/* STYLE-DECISIONS D4: the pack's design pin and the concept's approved
          version are INDEPENDENT, and when they disagree the screen says so —
          it never reconciles them. A released pack is what a factory cut
          from; the warning is the fix, not a newer image. */}
      {pack.design_sync && pack.design_sync.in_sync === false && (
        <div className="tp-read">
          <b>Esta ficha describe un diseño que ya no es el aprobado.</b>
          <p>
            El concepto tiene una versión aprobada más nueva. La ficha conserva
            su versión a propósito — una fábrica puede estar cotizando contra
            este documento. Si el diseño nuevo es el que va a producción, abrí
            una revisión de la ficha; no se reescribe la historia.
          </p>
        </div>
      )}

      {refusal && (
        <div className="tp-refusal">
          <b>El motor se negó a liberar.</b>
          {typeof refusal === "string" ? <p style={{ margin: "6px 0 0" }}>{refusal}</p> : (
            <>
              {refusal.error && <p style={{ margin: "6px 0 0" }}>{String(refusal.error)}</p>}
              {Array.isArray(refusal.blocking) && refusal.blocking.length > 0 && (
                <ul>{refusal.blocking.map((b) => <li key={String(b)}>{String(b)}</li>)}</ul>
              )}
            </>
          )}
        </div>
      )}

      {/* Four views of one document. The desk is the work; the other three are
          context that used to be three more tables below the fields. */}
      <div className="tp-tabs" role="tablist" style={{ marginTop: 22 }}>
        {[["desk", "Ficha", entries.length],
          ["history", "Historial", history.length],
          ["approvals", "Aprobaciones", null],
          ...(deliveryTab ? [["delivery", "Entregas a fábrica",
                              (recipients?.recipients || []).length]] : [])]
          .map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={docTab === id}
                    className={`tp-tab${docTab === id ? " on" : ""}`}
                    onClick={() => setDocTab(id)}>
              {label}{n === null ? null : <span className="tp-tab-n">{n}</span>}
            </button>
          ))}
      </div>

      {/* ================================================================== */}
      {docTab === "desk" && (sections.length === 0 ? (
        <div className="tp-empty"><b>Esta ficha no tiene campos ni chequeos.</b>
          <p>No es un error de esta pantalla: el motor devolvió un documento
             vacío. Releer las fuentes vuelve a armarlo desde la fila de rango.</p>
        </div>
      ) : (
        <div className="tp-desk">
          {/* ---------------------------------------------------- left rail -- */}
          <nav className="tp-rail" aria-label="Secciones de la ficha">
            <div className="tp-rail-h">Secciones · {railSections.length}</div>
            <ol>
              {railSections.map((s, i) => (
                <li key={s.id}>
                  <button className={`tp-sec${active?.id === s.id ? " on" : ""}`}
                          onClick={() => { setSectionId(s.id); setFocus(null); }}
                          title={`${s.label} — ${stateLabel(s.state)}`}>
                    <span className="tp-sec-n">{i + 1}</span>
                    <span className="tp-sec-l">{s.label}</span>
                    <span className="tp-sec-c">
                      {s.verifiedCount}/{s.fieldCount}
                    </span>
                    {/* The dot never speaks alone: the state's word is in the
                        button title and spelled out in the canvas header. */}
                    <span className={`tp-dot ${s.state}`}
                          aria-label={stateLabel(s.state)} />
                  </button>
                </li>
              ))}
            </ol>
            <div className="tp-rail-f">
              {railSummary(totals)}
              {/* ⚠ THE POINT IS THE LABEL, NOT THE FILTER. A machine's proposal
                  sitting unannounced among verified facts is this product's
                  defining failure mode; the count is shown even at zero so the
                  category never quietly disappears and reappears unnoticed. */}
              <p style={{ margin: "8px 0 0" }}>{proposalSentence(split)}</p>
              <button className={`tp-act${aiOnly ? " press" : ""}`}
                      style={{ marginTop: 8 }}
                      aria-pressed={aiOnly}
                      onClick={() => { setAiOnly(!aiOnly); setFocus(null); }}>
                Sugerencias IA · no verificadas
                <span className="tp-tab-n">{split.proposedCount}</span>
              </button>
            </div>
          </nav>

          {/* ------------------------------------------------------ canvas -- */}
          <div className="tp-canvas">
            {!active ? (
              <div className="tp-empty">
                <b>Ningún campo de esta ficha fue propuesto por un modelo.</b>
                <p>No dice nada sobre el resto: un valor <span className="tp-mono">imported</span> o{" "}
                   <span className="tp-mono">calculated</span> es una afirmación
                   sobre su origen, no una verificación.</p>
                <p style={{ marginTop: 10 }}>
                  <button className="tp-act" onClick={() => setAiOnly(false)}>
                    Ver todas las secciones
                  </button>
                </p>
              </div>
            ) : (
              <>
                <div className="tp-canvas-h">
                  <h2>{active.label}</h2>
                  {/* "0 de 0 verificados" is a sentence about nothing. A
                      section that is only open checks says that instead. */}
                  <span className="tp-mono">
                    {active.fieldCount === 0
                      ? "sin campos con valor"
                      : `${active.verifiedCount} de ${active.fieldCount} verificados`}
                    {" · "}{stateLabel(active.state)}
                  </span>
                </div>
                <p className="tp-h2note">
                  Verificar es un acto con nombre: queda registrado como tuyo. El
                  motor rechaza <span className="tp-mono">imported</span> y{" "}
                  <span className="tp-mono">calculated</span> por HTTP, así que
                  nadie puede convertir un valor de máquina en uno verificado
                  reenviándolo igual.
                </p>

                {shownFields.length === 0 ? (
                  <div className="tp-empty">
                    <b>Esta sección no tiene ningún campo con valor.</b>
                    <p>Lo que falta está abajo, como lo reporta la auditoría —
                       una ausencia se declara, no se rellena.</p>
                  </div>
                ) : (
                  <ul className="tp-flist">
                    {shownFields.map(([key, v]) => {
                      const isVerified = WRITABLE.includes(v?.provenance);
                      const on = focusIn?.kind === "field" && focusIn.key === key;
                      return (
                        <li key={key}>
                          <div className={`tp-f${on ? " on" : ""}`}>
                            <div className="tp-f-top">
                              <button className="tp-f-k"
                                      onClick={() => setFocus({ kind: "field", key })}>
                                {key.replaceAll("_", " ")}
                              </button>
                              <Prov value={v?.provenance} />
                              <span className="tp-f-v">
                                {asText(v?.value) ?? "—"}
                              </span>
                            </div>
                            {v?.note ? <div className="tp-why">{v.note}</div> : null}
                            <div className="tp-ev">{v?.source || "—"}</div>

                            {/* ⚠ TWO DIFFERENT ACTS, NEVER ONE BUTTON. "This
                                value is wrong" and "I certify this value is
                                correct" are not the same statement, and
                                collapsing them is how a corrected value quietly
                                acquires an attestation nobody made. */}
                            {editing === key ? (
                              <div className="tp-edit">
                                <input className="tp-input" value={draftValue} autoFocus
                                  onChange={(e) => setDraftValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                                <button className="tp-act press" disabled={busy}
                                  onClick={() => run(async () => {
                                    // One tested payload for every manual edit:
                                    // the engine has no `human_edited`, so an
                                    // edit is also the editor's attestation
                                    // (lib/techPackFields).
                                    await setTechPackField(brandId, pack.id, key,
                                      editedFieldPayload(draftValue, team.me?.name));
                                    setEditing(null);
                                  }, `${key} corregido y verificado`)}>Guardar y verificar</button>
                                <button className="tp-act" disabled={busy}
                                  onClick={() => setEditing(null)}>Cancelar</button>
                              </div>
                            ) : (
                              <div className="tp-actions">
                                <button className="tp-act" disabled={busy || released || isVerified}
                                  title={released ? "Una ficha liberada es inmutable"
                                    : isVerified ? "Ya verificado" : "El valor es correcto: lo firmás como tuyo"}
                                  onClick={() => run(
                                    () => setTechPackField(brandId, pack.id, key, {
                                      value: v?.value, provenance: "human_verified",
                                      note: `verificado por ${team.me?.name || "el equipo"}`,
                                    }), `${key} verificado`)}>
                                  {isVerified ? "✓ verificado" : "Verificar valor actual"}
                                </button>
                                <button className="tp-act" disabled={busy || released}
                                  title="El valor está mal: corregilo y queda firmado por vos"
                                  onClick={() => startEdit(key, asText(v?.value) ?? "")}>
                                  Corregir y verificar
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* The section's open points, as the audit reports them. Every
                    row is one of the engine's own checks on THIS document —
                    not a generic checklist. */}
                <h2 className="tp-h2">
                  Lo que la fábrica va a preguntar — {active.flags.length} en esta sección
                </h2>
                <p className="tp-h2note">
                  De los {summary.checks_run ?? "?"} chequeos que el motor corre
                  sobre este documento, {open.length} siguen abiertos en toda la
                  ficha. Elegí uno para leer la pregunta textual del proveedor.
                </p>
                {active.flags.length === 0 ? (
                  <p className="tp-abs">
                    Ningún chequeo abierto en esta sección.
                    {active.passedChecks > 0
                      ? ` Los ${active.passedChecks} que corren acá pasaron — pasar un chequeo no es que una persona lo haya verificado.`
                      : " El motor no corre ningún chequeo sobre estos campos, así que no hay nada que pasar ni que fallar acá."}
                  </p>
                ) : (
                  <ul className="tp-flist">
                    {active.flags.map((f) => {
                      const t = TIER[f.tier] || { label: f.tier, cls: "mild" };
                      const on = focusIn?.kind === "flag" && focusIn.key === f.key;
                      return (
                        <li key={f.key}>
                          <div className={`tp-f${on ? " on" : ""}`}>
                            <div className="tp-f-top">
                              <button className="tp-f-k"
                                      onClick={() => setFocus({ kind: "flag", key: f.key })}>
                                {f.field}
                              </button>
                              <span className={`tp-chip ${t.cls}`}>{t.label}</span>
                              <span className={`tp-prov ${f.status === "missing" ? "missing" : ""}`}>
                                {f.status}
                              </span>
                            </div>
                            <div className="tp-why">{f.why}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* MEDIDAS DE TALLE BASE. Only under the section it belongs to
                    — it is the working area for that section, and it was a
                    permanent table on every pack before. */}
                {active.id === "medidas" && (
                  <>
                    <h2 className="tp-h2">Medidas de talle base</h2>
                    {blocks === undefined ? (
                      <p className="tp-h2note">Consultando los bloques de medidas…</p>
                    ) : !block ? (
                      // ⚠ NOT a decorative empty section. Without a base-size
                      // chart the pack cannot be released, and the way out is a
                      // real action, not a shrug.
                      <div className="tp-empty">
                        <b>No hay bloque de medidas para «{String(category || "esta categoría")}».</b>
                        <p>La ficha no puede liberarse sin medidas de talle base: es uno de
                           los siete bloqueantes. Un bloque se importa por categoría, se
                           valida entero — cada talle, cada punto — y recién entonces la
                           ficha puede decir «importado del estándar de la marca».</p>
                        <p style={{ marginTop: 10 }}>
                          <button className="tp-act"
                            onClick={() => onNavigate?.("materials")}>Ir a Materiales →</button>
                        </p>
                      </div>
                    ) : !fields.pom_list ? (
                      <div className="tp-empty">
                        <b>El bloque existe, pero esta ficha se armó antes que él.</b>
                        <p>El armado corre UNA vez, al crear la ficha — así que un paquete
                           anterior al bloque no tiene la tabla de medidas y no puede
                           obtenerla solo. Releer las fuentes la trae, y no toca ningún
                           campo que una persona ya haya firmado.</p>
                        <p style={{ marginTop: 10 }}>
                          <button className="tp-act" disabled={busy}
                            onClick={() => run(() => refreshTechPack(brandId, pack.id),
                              "fuentes releídas")}>Releer fuentes</button>
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="tp-h2note">
                          <span className="tp-mono">{block.name || block.category}</span> · talle
                          base <b>{block.base_size}</b> · {(block.sizes || []).join(" · ")} ·
                          unidad {block.unit} — importado del estándar de la marca, no inventado
                          por esta pantalla.
                        </p>
                        <div className="tp-scroll">
                          <table className="tp-tbl">
                            <thead><tr>
                              <th>Punto de medida</th><th>Talle base {block.base_size}</th>
                              <th>Tolerancia</th><th>Graduación</th><th>Procedencia</th>
                            </tr></thead>
                            <tbody>
                              {(block.poms || []).map((pom) => (
                                <tr key={pom.name}>
                                  <td><b>{pom.name}</b></td>
                                  <td>{String(pom.per_size?.[block.base_size] ?? "—")} {block.unit}</td>
                                  <td>{pom.tolerance == null
                                    ? <span className="tp-prov missing">sin tolerancia</span>
                                    : `± ${pom.tolerance} ${block.unit}`}</td>
                                  <td className="tp-ev">{(block.sizes || [])
                                    .map((sz) => `${sz}: ${pom.per_size?.[sz] ?? "—"}`).join(" · ")}</td>
                                  <td><Prov value={fields.pom_list?.provenance} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {block.source_note && <p className="tp-hint">{block.source_note}</p>}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* --------------------------------------------------- inspector -- */}
          <aside className="tp-insp" aria-label="Inspector">
            {!focusIn ? (
              <div className="tp-blk">
                <p className="tp-abs">Elegí un campo o un punto abierto de esta
                   sección para ver su procedencia, la pregunta del proveedor y
                   lo que hay vinculado.</p>
              </div>
            ) : (
              <>
                <div className="tp-insp-h">
                  <b>{focusIn.kind === "field"
                    ? focusIn.key.replaceAll("_", " ")
                    : (focusFlag?.field || focusIn.key)}</b>
                  <div className="tp-ev" style={{ marginTop: 4 }}>
                    {active.label}
                  </div>
                </div>

                {/* 1 · the specification itself */}
                <div className="tp-blk">
                  <p className="tp-blk-h">Especificación</p>
                  {focusEntry ? (
                    <>
                      <p className="val">{asText(focusEntry.value) ?? "—"}</p>
                      {focusEntry.note && (
                        <p style={{ marginTop: 6 }}>{focusEntry.note}</p>
                      )}
                    </>
                  ) : (
                    <p className="tp-abs">
                      Este punto no tiene valor en la ficha. Vacío se conserva
                      vacío: no se deduce de otro campo ni de otro talle.
                    </p>
                  )}
                </div>

                {/* 2 · provenance */}
                <div className="tp-blk">
                  <p className="tp-blk-h">Procedencia</p>
                  {focusEntry ? (
                    <>
                      <Prov value={focusEntry.provenance} />
                      <p className="tp-ev">{focusEntry.source || "sin fuente registrada"}</p>
                    </>
                  ) : (
                    <p className="tp-abs">Sin valor, no hay procedencia. Un campo
                       vacío con procedencia diría «esto lo sabemos y es nada».</p>
                  )}
                </div>

                {/* 3 · THE AI DRAFT, AND THE HUMAN ACT THAT INSERTS IT.
                    ⚠ The reference's own governance rule: AI "never inserts: a
                    person clicks Insert draft", and this product's release gate
                    enforces the same thing one layer down. Two clicks, not one:
                    "Insertar borrador" only loads the model's text into the
                    editable field in the working area — the value is not the
                    pack's until the person presses "Guardar y verificar", which
                    signs it in their name. */}
                <div className="tp-blk">
                  <p className="tp-blk-h">Borrador de IA</p>
                  {canInsertDraft(focusEntry, pack.status) ? (
                    <div className="tp-draft">
                      <div className="val">{asText(focusEntry.value)}</div>
                      <p>
                        Lo escribió un modelo y nadie lo verificó. El motor no
                        libera la ficha mientras siga así. Insertarlo lo abre
                        para editar en el campo — recién queda en la ficha
                        cuando lo guardás y lo firmás con tu nombre.
                      </p>
                      <button className="tp-act press" disabled={busy}
                        onClick={() => startEdit(focusIn.key,
                                                 draftSeed(focusEntry) ?? "")}>
                        Insertar borrador
                      </button>
                    </div>
                  ) : focusEntry?.provenance === "ai_proposed" ? (
                    <p className="tp-abs">
                      Hay una propuesta de un modelo, y esta versión ya no se
                      toca. Una corrección abre una revisión nueva.
                    </p>
                  ) : (
                    <p className="tp-abs">
                      Ningún modelo propuso nada acá.
                      {focusEntry ? " El valor tiene otra procedencia." : ""}
                    </p>
                  )}
                </div>

                {/* 4 · the engine's own supplier question */}
                <div className="tp-blk">
                  <p className="tp-blk-h">Lo que la fábrica va a preguntar</p>
                  {focusFlag ? (
                    <>
                      <p className="tp-ask">{focusFlag.they_will_ask?.en}</p>
                      {focusFlag.they_will_ask?.zh && (
                        <p className="tp-zh">{focusFlag.they_will_ask.zh}</p>
                      )}
                      <p style={{ marginTop: 7 }}>{focusFlag.why}</p>
                      {focusFlag.note && (
                        <p style={{ marginTop: 5 }}>{focusFlag.note}</p>
                      )}
                      {focusFlag.suggest && (
                        <>
                          <p className="tp-ev" style={{ marginTop: 8 }}>
                            {focusFlag.suggest}
                          </p>
                          <p className="tp-abs" style={{ marginTop: 4 }}>
                            {SUGGEST_LABEL}
                          </p>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="tp-abs">
                      El motor no corre ningún chequeo sobre este campo. Es
                      contenido de la ficha, no materia de auditoría: una fábrica
                      no rebota un paquete por nombrar su categoría.
                    </p>
                  )}
                </div>

                {/* 5 · LINKED COMPONENTS — the real link, and the labelled
                    absence. ⚠ There is no BOM table in this engine; the
                    reference files component lines under PROPOSED itself. What
                    exists is one resolved row: the plan's material reference. */}
                <div className="tp-blk">
                  <p className="tp-blk-h">Componentes vinculados</p>
                  {linked.reference ? (
                    <>
                      <p className="val">{asText(linked.reference.value)}</p>
                      <p className="tp-ev">{linked.reference.source}</p>
                      {linked.sourceRow ? (
                        <p style={{ marginTop: 6 }}>
                          Resolvió contra <span className="tp-mono">{linked.sourceRow}</span> y
                          aportó {linked.contributed.length}{" "}
                          {linked.contributed.length === 1 ? "campo" : "campos"}:{" "}
                          {linked.contributed.map(([k]) => k.replaceAll("_", " ")).join(", ")}.
                        </p>
                      ) : (
                        <p className="tp-abs" style={{ marginTop: 6 }}>
                          La referencia no resolvió contra ninguna fila de la
                          ficha de materiales, así que no aportó ningún campo.
                        </p>
                      )}
                      <p className="tp-abs" style={{ marginTop: 6 }}>
                        No hay lista de componentes con consumo y desperdicio: el
                        motor no tiene tabla de BOM.
                      </p>
                    </>
                  ) : (
                    <p className="tp-abs">{NO_MATERIAL_ROW}</p>
                  )}
                </div>

                {/* 6 · tolerances */}
                <div className="tp-blk">
                  <p className="tp-blk-h">Tolerancias</p>
                  {active.id === "medidas" && fields.tolerances ? (
                    <>
                      <p className="val">{asText(fields.tolerances.value)}</p>
                      <p className="tp-ev">{fields.tolerances.source}</p>
                    </>
                  ) : active.id === "medidas" ? (
                    <p className="tp-abs">
                      El bloque de esta categoría no declara tolerancia en ningún
                      punto. Una tolerancia por defecto es una discusión en QC
                      con la firma de nadie.
                    </p>
                  ) : (
                    <p className="tp-abs">{NO_TOLERANCES}</p>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      ))}

      {/* ================================================== HISTORIAL ===== */}
      {/* The engine has stored every version since 0058 and `GET /tech-packs`
          already returned them all; this desk simply never showed them, so a
          released document and the draft revising it looked like two unrelated
          fichas. Nothing here is computed: every row is a version that exists,
          and every date is the one the engine recorded. */}
      {docTab === "history" && (
        <div className="tp-hist">
          {history.length < 2 ? (
            // One version is not a history. Saying "1 versión" would be noise.
            <p className="tp-h2note">
              Esta ficha tiene una sola versión, así que todavía no hay historial
              que leer. La primera revisión crea la segunda.
            </p>
          ) : (
            <ul>
              {history.map((v) => {
                const isNow = v.id === pack.id;
                return (
                  <li key={v.id} className={isNow ? "now" : undefined}>
                    <span className="tp-mono">v{v.version}</span>
                    <span className={`tp-chip ${v.status === "released" ? "mild" : "warn"}`}>
                      {v.status === "released" ? "Liberada"
                        : v.status === "superseded" ? "Superada"
                        : v.status === "in_review" ? "En revisión" : "Borrador"}
                    </span>
                    <span className="tp-hist-when">
                      {v.released_at ? `liberada ${v.released_at.slice(0, 10)}`
                        : v.created_at ? `creada ${v.created_at.slice(0, 10)}`
                        : "sin fecha registrada"}
                    </span>
                    {/* The release note is the reason a person gave. It is the
                        only part of a version history that explains anything,
                        so it is shown rather than summarised away. */}
                    {v.release_note && (
                      <span className="tp-hist-note">{v.release_note}</span>
                    )}
                    {isNow
                      ? <span className="tp-hist-now">estás acá</span>
                      : <button className="tp-act"
                          onClick={() => onNavigate?.(`techpack:${v.id}`)}>Ver →</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ================================================ APROBACIONES ==== */}
      {/* (engine 0070) `approvals.py` was generic from the start and wired into
          Revisión only; the tech pack — the one document a factory cuts against
          — was not even a subject type.

          ⚠ THIS REPORTS, IT DOES NOT GATE. Release is governed by the preflight
          audit above and consults none of this. Saying so on screen matters: a
          lane panel next to a release button implies the button is waiting on
          it, and today it is not. */}
      {docTab === "approvals" && (
        <div className="tp-lanes">
          {readiness === undefined ? (
            <p className="tp-h2note">Consultando quién firmó…</p>
          ) : readiness === null ? (
            <p className="tp-h2note">
              No pudimos preguntar por las firmas. No quiere decir que no haya
              ninguna — quiere decir que la consulta falló.
            </p>
          ) : (
            <>
              <p className="tp-h2note">
                {verdict(readiness)?.text}
                {" "}
                <b>No condiciona la liberación:</b> esta ficha se libera cuando el
                motor la considera cotizable, con firmas o sin ellas.
              </p>
              <ul className="tp-lane-list">
                {lanesToShow(readiness).map((lane) => {
                  const st = laneState(readiness, lane);
                  const canSign = mayISign(team.me, lane) && !released;
                  return (
                    <li key={lane} className={`tp-lane ${st.status}`}>
                      <span className="tp-lane-name">{LANE_LABEL[lane] || lane}</span>
                      <span className="tp-lane-who">
                        {st.status === "approved" ? `firmada por ${st.by || "—"}`
                          : st.status === "rejected" ? `rechazada por ${st.by || "—"}`
                          : st.status === "unset" ? "no requerida"
                          : `falta — ${LANE_WHO[lane] || "sin asignar"}`}
                      </span>
                      {/* An approval nobody was entitled to give is not the same
                          as a missing one, and the engine reports the difference
                          rather than hiding it. */}
                      {st.status === "approved" && st.authorised === false && (
                        <span className="tp-lane-warn">firmó sin tener la disciplina</span>
                      )}
                      {st.status === "approved" && st.verified === false && (
                        <span className="tp-lane-warn">nombre declarado, no verificado</span>
                      )}
                      {st.reason && <span className="tp-lane-reason">{st.reason}</span>}
                      {canSign && st.status !== "approved" && (
                        <button className="tp-act" disabled={busy}
                          onClick={() => run(
                            () => decide(brandId, "tech_pack", pack.id,
                                         { discipline: lane, decision: "approve" }),
                            `Firmaste la aprobación ${LANE_LABEL[lane] || lane}.`)}>
                          Firmar →
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ================================================== ENTREGAS ====== */}
      {/* (engine 0079) ⚠ THE ENGINE SENDS NOTHING — there is no mailer, and a
          screen saying "enviado" while nothing left would be the exact false
          confidence this product refuses. This panel is a LEDGER of what a
          person already sent by their own channel, and an acknowledgement on it
          is a RELAYED CLAIM ("me confirmaron por WhatsApp"), never a read
          receipt. All copy comes from lib/techPackDelivery.mjs, where a test
          reads every sentence. */}
      {docTab === "delivery" && deliveryTab && (
        <div className="tp-del">
          <p className="tp-h2note">{PANEL_INTRO}</p>
          {recipients === undefined ? (
            <p className="tp-h2note">Consultando el registro de entregas…</p>
          ) : recipients === null ? (
            <p className="tp-h2note">
              No pudimos consultar el registro de entregas. No quiere decir que
              no haya — quiere decir que la consulta falló.
            </p>
          ) : (
            <>
              {countsText(recipients) && (
                <span className="tp-del-counts">{countsText(recipients)}</span>
              )}
              {(recipients.recipients || []).length === 0 ? (
                <p className="tp-h2note">
                  Ningún envío registrado para esta versión. Si ya la mandaste
                  por tu canal, registralo acá — lo que no queda registrado, la
                  próxima liberación no lo puede avisar.
                </p>
              ) : (
                <ul className="tp-lane-list">
                  {(recipients.recipients || []).map((r) => (
                    <li key={r.supplier_id} className="tp-lane">
                      <span className="tp-lane-name">{r.supplier || r.supplier_id}</span>
                      <span className="tp-lane-who">{sentText(r)}</span>
                      {staleText(r) && (
                        <span className="tp-lane-warn">{staleText(r)}</span>
                      )}
                      <span className="tp-lane-reason">
                        {ackText(r)}
                        {noticeText(r) ? ` · ${noticeText(r)}` : ""}
                      </span>
                      {/* Registered acts, per holder. An ack without a send
                          would still be recorded by the engine; the screen
                          only offers the acts that advance this holder. */}
                      {r.sent_at && !r.acknowledged_at && (
                        <button className="tp-act" disabled={busy}
                          title="El proveedor te confirmó por fuera; queda registrado como un relato tuyo, no como un acuse del sistema"
                          onClick={() => run(
                            () => recordTechPackAcknowledgement(brandId, pack.id,
                              { supplierId: r.supplier_id }),
                            "confirmación relatada registrada")}>
                          {ACK_ACTION}
                        </button>
                      )}
                      {r.holds_stale && !r.notice_sent_at && (
                        <button className="tp-act" disabled={busy}
                          title="Registrás que le avisaste que existe una versión más nueva — avisada no es confirmada"
                          onClick={() => run(
                            () => recordTechPackNotice(brandId, pack.id,
                              { supplierId: r.supplier_id }),
                            "aviso registrado")}>
                          {NOTICE_ACTION}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {/* Only the current released document gets new sends: mailing a
                  superseded pack is the mistake the stale flags exist to
                  catch, so this screen does not offer to record one. */}
              {released && (
                supplierDir === undefined ? (
                  <p className="tp-h2note">Consultando los proveedores…</p>
                ) : supplierDir === null ? (
                  <p className="tp-h2note">
                    No pudimos consultar los proveedores, así que no se puede
                    registrar un envío ahora.
                  </p>
                ) : supplierDir.length === 0 ? (
                  <p className="tp-h2note">
                    Para registrar un envío primero hace falta el proveedor en
                    el directorio.{" "}
                    <button className="tp-act"
                      onClick={() => onNavigate?.("suppliers")}>Ir a Proveedores →</button>
                  </p>
                ) : (
                  <div className="tp-send">
                    <label>Proveedor
                      <select value={sendSupplierId}
                              onChange={(e) => setSendSupplierId(e.target.value)}>
                        <option value="">elegir…</option>
                        {supplierDir.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>Canal (opcional)
                      <input value={sendChannel} placeholder="mail, WhatsApp…"
                             onChange={(e) => setSendChannel(e.target.value)} />
                    </label>
                    <button className="tp-act" disabled={busy || !sendSupplierId}
                      title="No manda nada: registra un envío que vos ya hiciste por tu canal"
                      onClick={() => run(async () => {
                        await recordTechPackSend(brandId, pack.id, {
                          supplierId: sendSupplierId,
                          channel: sendChannel.trim() || null,
                        });
                        setSendSupplierId(""); setSendChannel("");
                      }, "envío registrado — Atelier no transmitió nada")}>
                      {SEND_ACTION}
                    </button>
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}

      {/* ⚠ THE ABSENCES, KEPT LABELLED. Three things this desk does not show,
          named rather than quietly missing — the reference set's own rule, and
          the reason none of them can be inferred from what is here. */}
      <p className="tp-hint" style={{ marginTop: 22 }}>
        Esta mesa no muestra ruta crítica, ni desempeño del proveedor, ni
        comparación de cotizaciones entre temporadas. No es un pendiente de esta
        pantalla: se vuelven honestas recién cuando las fichas versionan sobre el
        hilo del Estilo, y una mesa que las insinuara antes mentiría en la
        dirección que cuesta plata.
      </p>

      <div className="tp-dock">
        <span className="grow">
          {toast || (released
            ? "Liberada e inmutable."
            : "Intentar liberar con campos sin verificar es útil: la negativa dice exactamente qué falta.")}
        </span>
        <button className="tp-btn s" disabled={busy || !editable}
          title="Vuelve a leer la fila de rango, el material y el bloque de medidas. No toca nada firmado."
          onClick={() => run(() => refreshTechPack(brandId, pack.id), "fuentes releídas")}>
          Releer fuentes
        </button>
        <button className="tp-btn s" disabled={busy || !editable}
          onClick={() => run(() => proposeTechPack(brandId, pack.id),
            "propuesta generada — sigue sin estar verificada")}>
          Proponer campos faltantes
        </button>
        <button className="tp-btn p" disabled={busy || released}
          onClick={() => run(() => releaseTechPack(brandId, pack.id), "ficha liberada")}>
          Intentar liberar
        </button>
        {released && (
          <button className="tp-btn s" disabled={busy}
            onClick={() => run(() => reviseTechPack(brandId, pack.id), "revisión abierta")}>
            Abrir revisión
          </button>
        )}
      </div>
    </section>
  );
}
