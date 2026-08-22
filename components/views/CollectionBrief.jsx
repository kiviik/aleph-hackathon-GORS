"use client";
// BRIEF — the creative contract that governs the collection.
//
// 2026-08-06/07 (owner reference designs, `design/atelier-redesign/04-brief.png`).
// What changed and why:
//
// The old screen was the engine's PATCH body drawn as a form: eight labelled
// inputs, greyed out whenever the version was approved — which is almost always,
// because a brief spends its life approved and its editing life in a draft. So
// the screen a team actually opened was a disabled form, and a disabled form
// says "you may not edit this" when what it should say is "this is what we
// agreed, and here is what argues against it".
//
// The new screen has two modes and they are different objects:
//
//   READ  — the contract. The creative direction at the size of a statement,
//           the three things it commits to, the evidence FOR beside the evidence
//           AGAINST, and the commercial numbers as one horizontal band. No
//           inputs at all, because there is nothing here that may be typed into.
//   EDIT  — the form, reachable only when the SERVER says this version is still
//           editable (draft or in_review). One button opens it.
//
// THE TRAP THIS FIXES, and it cost a session to find: offering an input on an
// approved version is not merely useless, it is a silent write failure. The
// engine answers 409, the field keeps the typed value on screen, and nobody
// learns the change did not happen. `actions().editable` is the same predicate
// RangeSlots uses; nothing here decides it locally.
//
// WHAT IT STILL REFUSES TO DO, unchanged: no local draft. A brief is one of the
// objects ROADMAP §12 says may never be authoritative in a browser, so an
// unreachable engine leaves this screen empty and SAYING so. Nothing on it is
// synthesised — a field the engine did not send is rendered as its absence, in
// words, and the absences that would change a decision (no evidence against, no
// margin target, an unverified approver) are named rather than left blank.
//
// The reference also shows "debe sentirse / no debe sentirse / códigos a
// preservar / permiso para explorar". Those columns are NOT built, on purpose:
// `CollectionBriefVersion` has no such fields, and inventing four dimensions in
// the UI would put four boxes on screen that no concept, plan or approval can
// ever read. Same rule as the range board's missing role column — a migration
// first, a redesign second.
//
// 2026-08-14 — TYPESET AS A DOCUMENT, not as a panel of widgets. A brief is the
// thing a team APPROVED, so it now reads like one: an eyebrow, a display title,
// status and version as quiet pills, and numbered sections in white cards with
// prose at a reading measure. Nothing was added to it and nothing was taken
// away — the same fields, the same handlers, the same absences named in the
// same words. What changed is that the numbers the engine computed are set as
// numerals and the ones it never sent still say "sin definir" at label size,
// which is the only way a reader can tell those two apart at a glance.
//
// The classes moved `bx-` → `cb2-` because the old ones live in
// `app/atelier-ui.css`, shared with screens this pass did not touch; restyling
// them there would have retinted half the app. The whole `cb2-` stylesheet is
// in this file, immediately below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import { useIdentity } from "@/components/IdentityProvider";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import * as brief from "@/lib/collectionBrief";
import {
  asLines, fromCsv, fromLines, pct, toCsv, toLines,
} from "@/lib/collectionBrief.mjs";

const STATUS_LABEL = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobado",
  superseded: "Reemplazado",
  revising: "Aprobado · con una revisión en curso",
  empty: "Sin brief",
};

// The eyebrow above the statement. It says what this version IS before anyone
// reads what it says, because "brief" and "brief aprobado" govern differently.
const STATUS_EYEBROW = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Brief aprobado",
  superseded: "Versión reemplazada",
};

const POSITION_LABEL = {
  supports: "apoya",
  contradicts: "contradice",
  context: "contexto",
};

const EVIDENCE_TYPE_LABEL = {
  observation: "Observación propia",
  competitor_item: "Ítem de competidora",
  outcome: "Resultado medido",
  product: "Producto del catálogo",
  trend: "Señal de tendencia",
};

/* ------------------------------------------------------------- helpers -- */

const text = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

// asLines / toLines / toCsv / fromLines / fromCsv / pct live in
// lib/collectionBrief.mjs with the other rules — dependency-free and unit
// tested, because "what a stored JSON list looks like on screen" is a rule,
// not a rendering detail.

function dateText(iso) {
  if (!iso) return null;
  try {
    const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(iso);
  }
}

/* -------------------------------------------------------------- styles -- */

// ⚠ MOUNTED AS `dangerouslySetInnerHTML`, never as `<style>{CSS}</style>`:
// React escapes `>` and `"` when it serialises a text child on the server, the
// browser does not unescape inside <style>, and the mismatch makes React throw
// the whole tree away on every load. See tests/styleHydration.
//
// ⚠ THE NAMESPACE MOVED, `bx-` → `cb2-`. The old classes are styled in
// `app/atelier-ui.css`, which this pass may not touch, so every class below is
// declared here — a namespace with no stylesheet is the exact failure
// tests/stylesheetCoverage exists for.
//
// ⚠ 11px IS THE FLOOR. Nothing below it, anywhere in this file.
const CSS = `
/* ============ Brief — cb2- =========================================
   A brief is a document a team APPROVED, so it is set as one: an eyebrow,
   a display title, and numbered sections in white cards with prose at a
   reading measure. Blue only on things you can press; --editorial carries
   the eyebrows; a missing number stays missing rather than becoming a 0. */

.cb2 { min-width: 0; container-type: inline-size; container-name: cb2; }

.cb2-crumb {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s4);
}
.cb2-crumb b { font-weight: 600; }
.cb2-crumb span { color: var(--ink-3); }

/* ---- header ---- */
.cb2-head {
  display: flex; gap: var(--s5) var(--s6); align-items: flex-start;
  justify-content: space-between; flex-wrap: wrap; margin: 0 0 var(--s5);
}
.cb2-head-main { min-width: 0; flex: 1 1 460px; }
.cb2-head-side {
  flex: 0 1 290px; min-width: 0;
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3);
}

/* Version and status as quiet pills: they qualify the document, they are
   not the document. Approved is the only one that gets a colour. */
.cb2-pills { display: flex; flex-wrap: wrap; gap: var(--s2); margin: 0 0 var(--s3); }
.cb2-pill {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  font-family: var(--d); font-size: 11px; font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase;
  padding: 5px 10px; border-radius: 999px;
  background: var(--paper-2); color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.cb2-pill.approved { background: color-mix(in srgb, var(--positive) 11%, #fff); color: var(--positive); }
.cb2-pill.review { background: var(--ochre-wash); color: var(--warning); }
.cb2-pill.ver { color: var(--ink-2); }

.cb2-title {
  font-family: var(--serif); font-weight: 500; font-size: 36px;
  line-height: 1.08; letter-spacing: -.015em; color: var(--ink);
  margin: 0 0 var(--s2); max-width: 20ch;
}
.cb2-lede { font-size: 14px; line-height: 1.6; color: var(--ink-2); margin: 0; max-width: 62ch; }

/* ---- who approved it, and whether anyone could confirm it was them.
       An unverified signature is drawn WEAKER and never as a confirmation. */
.cb2-signed {
  margin: 0; font-family: var(--d); font-size: 11px; line-height: 1.7;
  letter-spacing: .02em; color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.cb2-signed b { font-weight: 600; color: var(--ink); }
.cb2-signed.unsigned { color: var(--ink-3); }
.cb2-flag {
  display: inline-flex; align-items: center; gap: 5px; margin-left: 8px;
  text-transform: uppercase; letter-spacing: .06em;
}
.cb2-flag svg { width: 13px; height: 13px; }
.cb2-flag.ok { color: var(--positive); font-weight: 600; }
.cb2-flag.warn { color: var(--ink-3); font-weight: 400; }

.cb2-frozen {
  display: flex; gap: 8px; align-items: flex-start; margin: 0;
  font-size: 12px; line-height: 1.55; color: var(--ink-3); max-width: 40ch;
}
.cb2-frozen svg { width: 14px; height: 14px; flex: none; margin-top: 2px; }

.cb2-btn {
  border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--surface); padding: 9px 14px;
  font-size: 12px; font-weight: 600; color: var(--ink); cursor: pointer;
}
.cb2-btn:hover { border-color: var(--ink-3); }
.cb2-btn.primary {
  background: var(--cobalt); border-color: var(--cobalt); color: #fff;
}
.cb2-btn.primary:hover { background: color-mix(in srgb, var(--cobalt) 84%, #000); border-color: color-mix(in srgb, var(--cobalt) 84%, #000); }
.cb2-btn:disabled { opacity: .5; cursor: default; }

/* ---- messages ---- */
.cb2-notice, .cb2-wait {
  margin: 0 0 var(--s4); padding: 10px 13px;
  border-left: 3px solid var(--warning); background: var(--ochre-wash);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
  font-size: 13px; line-height: 1.55; color: var(--ink);
}
.cb2-wait { display: flex; gap: 8px; align-items: flex-start; }
.cb2-wait svg { width: 15px; height: 15px; flex: none; margin-top: 2px; }

/* ---- the numbered sections ---- */
.cb2-sec {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
  padding: var(--s5); margin: 0 0 var(--s4);
}
.cb2-sec-head { margin: 0 0 var(--s4); }
.cb2-eyebrow {
  display: flex; align-items: baseline; gap: 8px;
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-3); margin: 0 0 6px;
}
.cb2-num { font-style: normal; font-weight: 600; color: var(--editorial); font-variant-numeric: tabular-nums; }
.cb2-count { margin-left: auto; font-weight: 600; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.cb2-h {
  margin: 0; font-family: var(--disp); font-size: 16px; font-weight: 700;
  letter-spacing: -.01em; line-height: 1.25; color: var(--ink);
}
.cb2-prose { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink-2); max-width: 72ch; }
.cb2-quiet { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-3); max-width: 64ch; }
.cb2-missing { font-size: 12px; color: var(--ink-3); }

/* THE STATEMENT — the one sentence the collection is judged against. */
.cb2-say {
  margin: 0; padding-left: var(--s4); border-left: 2px solid var(--hair-2);
  font-family: var(--serif); font-weight: 500; font-size: 22px;
  line-height: 1.4; letter-spacing: -.01em; color: var(--ink); max-width: 48ch;
}
.cb2-say.empty {
  font-family: inherit; font-size: 14px; line-height: 1.6; letter-spacing: 0;
  color: var(--ink-3); border-left-color: var(--line); max-width: 72ch;
}

.cb2-pillars {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--s5);
}
.cb2-pillar { min-width: 0; }
.cb2-pillar-l {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
  margin: 0 0 8px;
}
.cb2-pillar p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink); max-width: 44ch; }

/* ---- evidence, FOR beside AGAINST: stacked, the contradicting half lands
       below the fold, and it is the half nobody must be able to skip. ---- */
.cb2-two {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s4); align-items: start; margin: 0 0 var(--s4);
}
.cb2-two .cb2-sec { margin: 0; height: 100%; }
.cb2-scroll { max-height: 360px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--hair-2) transparent; }
.cb2-scroll::-webkit-scrollbar { width: 8px; }
.cb2-scroll::-webkit-scrollbar-thumb { background: var(--hair-2); border-radius: 4px; }
.cb2-evs { list-style: none; margin: 0; padding: 0; }
.cb2-ev { padding: var(--s3) 0; border-top: 1px solid var(--hair); }
.cb2-ev:first-child { border-top: none; padding-top: 0; }
.cb2-ev:last-child { padding-bottom: 0; }
.cb2-ev-main p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink); max-width: 60ch; }
.cb2-ev.note .cb2-ev-main p { color: var(--ink-2); }
.cb2-ev-id {
  display: block; margin-top: 5px; font-family: var(--d); font-size: 11px;
  letter-spacing: .02em; color: var(--ink-3);
}
.cb2-ev-src {
  display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 7px;
  font-family: var(--d); font-size: 11px; letter-spacing: .02em;
  color: var(--ink-3); font-variant-numeric: tabular-nums;
}
.cb2-pin { display: inline-flex; align-items: center; gap: 5px; color: var(--positive); }
.cb2-pin.warn { color: var(--warning); }
.cb2-pin svg { width: 12px; height: 12px; }
.cb2-foot {
  margin: var(--s4) 0 0; padding-top: var(--s3); border-top: 1px solid var(--hair);
  font-size: 12px; line-height: 1.5; color: var(--ink-3);
}

/* ---- the commercial commitments: one hairline-separated strip. A number
       the engine does not hold says so, at label size, and never as a 0. ---- */
.cb2-targets {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(152px, 1fr));
  row-gap: var(--s5);
}
.cb2-target { min-width: 0; padding: 0 var(--s4); border-left: 1px solid var(--hair); }
.cb2-target:first-child { padding-left: 0; border-left: none; }
.cb2-target-l {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
  margin: 0 0 9px;
}
.cb2-target-v {
  display: block; font-family: var(--disp); font-size: 21px; font-weight: 600;
  line-height: 1.05; letter-spacing: -.01em; color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.cb2-target-t {
  display: block; font-family: var(--d); font-size: 13px; font-weight: 500;
  line-height: 1.45; color: var(--ink); font-variant-numeric: tabular-nums;
}
.cb2-target-x { display: block; font-size: 12px; line-height: 1.45; color: var(--ink-3); }

.cb2-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s5); }
.cb2-list { min-width: 0; }
.cb2-list ul { list-style: none; margin: 0; padding: 0; }
.cb2-list li {
  font-size: 14px; line-height: 1.6; color: var(--ink);
  padding: 9px 0; border-top: 1px solid var(--hair); max-width: 60ch;
}
.cb2-list li:first-child { border-top: none; padding-top: 0; }

/* ---- version history: hairline rows, the live one carries a quiet pill ---- */
.cb2-hist { margin: 0; }
.cb2-hist-row {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px var(--s4);
  padding: 10px 0; border-top: 1px solid var(--hair);
  font-size: 12px; line-height: 1.5; color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.cb2-hist-row:first-child { border-top: none; }
.cb2-hist-v {
  font-family: var(--d); font-size: 12px; font-weight: 600;
  letter-spacing: .04em; color: var(--ink);
}
.cb2-hist-meta { color: var(--ink-3); }
.cb2-hist-row .cb2-pill { margin-left: auto; }

/* ---- the form. Only ever reachable when the SERVER says so. ---- */
.cb2-editor {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s5);
}
.cb2-form { display: flex; flex-direction: column; gap: var(--s6); }
.cb2-fieldset { min-width: 0; }
.cb2-fieldset > .cb2-eyebrow { margin-bottom: var(--s3); }
.cb2-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(212px, 1fr)); gap: var(--s4); }
.cb2-grid.one { grid-template-columns: minmax(0, 1fr); }
.cb2-field { display: block; min-width: 0; }
.cb2-field > span {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
  margin: 0 0 6px;
}
.cb2-input {
  width: 100%; resize: vertical; padding: 9px 11px;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--paper-2); color: var(--ink);
  font-family: inherit; font-size: 14px; line-height: 1.5;
}
.cb2-input:focus {
  outline: none; border-color: var(--cobalt); background: var(--surface);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cobalt) 15%, #fff);
}
.cb2-hint { display: block; margin-top: 5px; font-size: 12px; font-style: normal; line-height: 1.5; color: var(--ink-3); }
.cb2-editor-foot {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3);
  margin-top: var(--s5); padding-top: var(--s4); border-top: 1px solid var(--hair);
}
.cb2-editor-foot span { font-size: 12px; line-height: 1.5; color: var(--ink-3); max-width: 54ch; }

/* ---- the composer's opening move: Atelier drafts, a person decides ---- */
.cb2-proposal { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3); margin: 0 0 var(--s4); }
.cb2-proposal-note {
  margin: 0 0 var(--s4); padding: var(--s4) var(--s4) var(--s4) var(--s4);
  border-left: 3px solid var(--sage); background: var(--card);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
  font-size: 14px; line-height: 1.6; color: var(--ink-2); max-width: 72ch;
}
.cb2-proposal-note b { color: var(--ink); }
.cb2-unanswerable { list-style: none; margin: var(--s2) 0 0; padding: 0; }
.cb2-unanswerable li { font-size: 13px; line-height: 1.6; color: var(--ink-2); padding: 4px 0; }
.cb2-muted { font-size: 12px; line-height: 1.5; color: var(--ink-3); }

/* ---- the honest states: calm, centred, the same words ---- */
.cb2-empty {
  display: grid; place-items: center; align-content: center;
  min-height: 320px; text-align: center;
}
.cb2-empty h1 {
  font-family: var(--serif); font-weight: 500; font-size: 26px;
  line-height: 1.15; letter-spacing: -.01em; color: var(--ink);
  margin: 0 0 var(--s2); max-width: 26ch;
}
.cb2-empty p { margin: 0; max-width: 58ch; font-size: 14px; line-height: 1.6; color: var(--ink-2); }

.cb2-sk { background: var(--paper-2); border-radius: var(--r-sm); animation: cb2-pulse 1.5s ease-in-out infinite; }
.cb2-sk.line { height: 12px; margin: 0 0 9px; }
.cb2-sk.line.w45 { width: 45%; }
.cb2-sk.line.w90 { width: 90%; }
.cb2-sk.title { height: 34px; width: 55%; margin: 0 0 16px; }
.cb2-sk.block { height: 190px; margin: 0 0 12px; }
@keyframes cb2-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }

/* The work column is the window minus the sidebar and the rail, so these
   breakpoints are about THIS column. */
@container cb2 (max-width: 860px) {
  .cb2-two { grid-template-columns: minmax(0, 1fr); }
}
@container cb2 (max-width: 560px) {
  .cb2-title { font-size: 28px; }
  .cb2-target { padding-left: 0; border-left: none; }
}
`;

/* ---------------------------------------------------------------- read -- */

function Missing({ children }) {
  return <span className="cb2-missing">{children}</span>;
}

// A numbered editorial section: mono eyebrow, then the heading. The number is
// typographic, not data — nothing here counts anything the engine did not send.
function Section({ n, eyebrow, title, count, children }) {
  return (
    <section className="cb2-sec">
      <div className="cb2-sec-head">
        <span className="cb2-eyebrow">
          <i className="cb2-num">{n}</i>{eyebrow}
          {count != null && <b className="cb2-count">{count}</b>}
        </span>
        <h2 className="cb2-h">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Pillar({ label, value, missing }) {
  return (
    <div className="cb2-pillar">
      <span className="cb2-pillar-l">{label}</span>
      {value ? <p>{value}</p> : <p><Missing>{missing}</Missing></p>}
    </div>
  );
}

// `kind` decides the typography, not the meaning: a computed percentage is a
// numeral at 21px, a date or a list is 13px mono. A value the engine did not
// send is the missing sentence — never a zero somebody could plan against.
function Cell({ label, value, missing, kind }) {
  return (
    <div className="cb2-target">
      <span className="cb2-target-l">{label}</span>
      {value
        ? <b className={kind === "text" ? "cb2-target-t" : "cb2-target-v"}>{value}</b>
        : <span className="cb2-target-x">{missing}</span>}
    </div>
  );
}

function EvidenceRow({ link }) {
  const kind = EVIDENCE_TYPE_LABEL[link.evidence_type] || link.evidence_type;
  return (
    <li className={`cb2-ev ${link.position}`}>
      <div className="cb2-ev-main">
        {link.relevance
          ? <p>{link.relevance}</p>
          : <p><Missing>
              Citada sin decir qué argumenta. Un id no es un argumento: quien la
              agregó sabía por qué, y no quedó escrito.
            </Missing></p>}
        <span className="cb2-ev-id">{link.evidence_id}</span>
      </div>
      <div className="cb2-ev-src">
        <span>{kind}</span>
        {link.observed_at && <span>{dateText(link.observed_at)}</span>}
        {link.evidence_snapshot_id
          ? <span className="cb2-pin"><Icon name="shield" /> contenido copiado</span>
          : <span className="cb2-pin warn"><Icon name="warn" /> sin copia fijada</span>}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- edit -- */

function Field({ label, value, onChange, textarea, rows = 3, hint, type, placeholder }) {
  return (
    <label className="cb2-field">
      <span>{label}</span>
      {textarea ? (
        <textarea className="cb2-input" value={value ?? ""} rows={rows}
                  placeholder={placeholder}
                  onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="cb2-input" value={value ?? ""} type={type || "text"}
               placeholder={placeholder}
               onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <i className="cb2-hint">{hint}</i>}
    </label>
  );
}

function BriefForm({ form, set, disabled }) {
  return (
    <div className="cb2-form">
      <section className="cb2-fieldset">
        <span className="cb2-eyebrow"><i className="cb2-num">01</i>Identidad</span>
        <div className="cb2-grid">
          <Field label="Temporada" value={form.season} onChange={set("season")} />
          <Field label="Drop / entrega" value={form.drop_name} onChange={set("drop_name")} />
          <Field label="Mercados" value={toCsv(form.markets)}
                 onChange={(v) => set("markets")(fromCsv(v))}
                 placeholder="AR, UY" hint="separados por coma" />
          <Field label="Canales" value={toCsv(form.channels)}
                 onChange={(v) => set("channels")(fromCsv(v))}
                 placeholder="ecommerce, retail" hint="separados por coma" />
          <Field label="Entrega desde" type="date" value={form.delivery_start || ""}
                 onChange={(v) => set("delivery_start")(v || null)} />
          <Field label="Entrega hasta" type="date" value={form.delivery_end || ""}
                 onChange={(v) => set("delivery_end")(v || null)} />
        </div>
      </section>

      <section className="cb2-fieldset">
        <span className="cb2-eyebrow"><i className="cb2-num">02</i>El argumento</span>
        <div className="cb2-grid one">
          <Field label="Dirección creativa" value={form.creative_direction}
                 onChange={set("creative_direction")} textarea rows={3}
                 hint="la frase que gobierna: es lo que se lee primero en la pantalla de arriba" />
          <div className="cb2-grid">
            <Field label="Cliente" value={form.customer} onChange={set("customer")} textarea />
            <Field label="Ocasión" value={form.occasion} onChange={set("occasion")} textarea />
          </div>
          <Field label="Objetivo comercial" value={form.commercial_objective}
                 onChange={set("commercial_objective")} textarea rows={2} />
        </div>
      </section>

      <section className="cb2-fieldset">
        <span className="cb2-eyebrow"><i className="cb2-num">03</i>Compromisos comerciales</span>
        <div className="cb2-grid">
          <Field label="Margen objetivo (%)" value={form.margin_target ?? ""}
                 onChange={(v) => set("margin_target")(v === "" ? null : v)}
                 hint="lo calcula el motor con decimales exactos, no con floats" />
          <Field label="Newness objetivo (%)" value={form.newness_target ?? ""}
                 onChange={(v) => set("newness_target")(v === "" ? null : v)} />
          <Field label="Carryover objetivo (%)" value={form.carryover_target ?? ""}
                 onChange={(v) => set("carryover_target")(v === "" ? null : v)} />
        </div>
      </section>

      <section className="cb2-fieldset">
        <span className="cb2-eyebrow"><i className="cb2-num">04</i>Lo que puede salir mal</span>
        <div className="cb2-grid">
          <Field label="Restricciones" value={toLines(form.constraints)}
                 onChange={(v) => set("constraints")(fromLines(v))} textarea
                 hint="una por línea" />
          <Field label="Riesgos" value={toLines(form.risks)}
                 onChange={(v) => set("risks")(fromLines(v))} textarea
                 hint="una por línea" />
          <Field label="Supuestos" value={toLines(form.assumptions)}
                 onChange={(v) => set("assumptions")(fromLines(v))} textarea
                 hint="una por línea" />
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- screen -- */

export default function CollectionBrief({ onNavigate }) {
  const engine = useEngine();
  const { activeId, active, loading: collLoading } = useCollection();
  const { me, authenticated } = useIdentity();
  const brandId = useBrandId();

  const [state, setState] = useState({ loading: true, brief: null, error: null });
  const [form, setForm] = useState(brief.toForm(null));
  // The drafted brief (see the composer below). `proposalTried` keeps "we
  // asked and got nothing" distinct from "nobody asked yet".
  const [proposal, setProposal] = useState(null);
  const [proposalTried, setProposalTried] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // Ask the engine for the drafted brief and PUT IT IN THE FORM. It is a
  // starting point a person edits, not an answer — nothing is written until
  // Guardar, exactly as before.
  const loadProposal = useCallback(async () => {
    if (!brandId || !activeId) return;
    setBusy(true);
    try {
      const got = await brief.getBriefProposal(brandId, activeId);
      setProposalTried(true);
      if (!got) return;
      setProposal(got);
      // `brief_content` is already shaped for the same payload the composer
      // posts, so accepting the draft unedited stays one call down the normal
      // versioning path.
      setForm((current) => ({ ...current, ...brief.toForm(got.brief_content) }));
    } finally {
      setBusy(false);
    }
  }, [brandId, activeId]);

  // ⚠ A LATE RESPONSE COULD PUT ANOTHER COLLECTION'S BRIEF INTO THE EDIT FORM
  // (owner bug hunt, 2026-08-13). This had no cancellation and wrote TWO
  // things — the rendered brief and `form`, the editable draft. So: collection
  // A's request stalls, the user switches to B, B renders, then A lands and
  // replaces both. `CollectionHeader` keeps saying B because it has its own
  // guard. The user clicks Editar and saves, and `editVersion` / `newVersion`
  // use the ids from the STALE payload — the edit commits to collection A's
  // brief version, under a header naming B.
  //
  // The `[activeId]` effect below clears edit mode, but it fires on the switch,
  // BEFORE the late response arrives, so it cannot help. This is worse than the
  // provider's version of the same bug: that one showed the wrong data, this
  // one writes it.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    if (!brandId || !activeId) {
      setState({ loading: false, brief: null, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      const got = await brief.getBrief(brandId, activeId);
      if (mine !== generation.current) return;   // a newer collection won
      setState({ loading: false, brief: got, error: null });
      setForm(brief.toForm(got?.latest));
    } catch (e) {
      if (mine !== generation.current) return;
      // Honest: the brief lives on the server, so an unreachable server means
      // we do not know what it says — not that it is empty.
      setState({ loading: false, brief: null, error: String(e.message || e) });
    }
  }, [brandId, activeId]);

  useEffect(() => { load(); }, [load]);
  // A different collection is a different contract: never carry the previous
  // one's edit mode (or its unsaved text) across the switch.
  useEffect(() => { setEditing(false); setNotice(""); }, [activeId]);

  const latest = state.brief?.latest || null;
  const acts = brief.actions(latest, { canApprove: !!me?.can_approve });
  const status = state.brief?.status || "empty";
  // The pill's tint, from the SERVER's status. Only "approved" earns a colour:
  // a draft that looks approved is the whole failure this screen guards against.
  const statusTone = latest?.status === "approved" ? "approved"
    : latest?.status === "in_review" ? "review" : "draft";

  const evidence = latest?.evidence || [];
  const supports = evidence.filter((e) => e.position === "supports");
  const contextual = evidence.filter((e) => e.position === "context");
  const against = evidence.filter((e) => e.position === "contradicts");
  // The free-text field is a second, weaker channel for the same thing: it
  // carries no source and no snapshot. Shown WITH the links, and visibly
  // without provenance, rather than in a separate box that reads as equal.
  const againstNotes = asLines(latest?.contradictory_evidence);
  const unsnapshotted = evidence.filter((e) => !e.evidence_snapshot_id);

  const constraints = asLines(latest?.constraints);
  const risks = asLines(latest?.risks);
  const assumptions = asLines(latest?.assumptions);

  async function run(fn, ok, { close = false } = {}) {
    setBusy(true); setNotice("");
    try {
      await fn();
      await load();
      if (close) setEditing(false);
      setNotice(ok);
    } catch (e) {
      setNotice(`El motor rechazó la acción: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  /* ---- the two chrome slots ------------------------------------------- */

  const unknowns = useMemo(() => {
    if (!latest) return [];
    const out = [];
    if (!against.length && !againstNotes.length) {
      out.push("Nadie registró evidencia en contra. Un brief que sólo cita lo que lo apoya no fue puesto a prueba.");
    }
    if (!text(latest.margin_target)) out.push("Margen objetivo — sin número, el plan de rango no tiene contra qué medirse.");
    if (!latest.delivery_start && !latest.delivery_end) out.push("Ventana de entrega — sin fechas no hay lead time que verificar.");
    if (!text(latest.customer)) out.push("Cliente — para quién es esta colección.");
    if (unsnapshotted.length) {
      out.push(`${unsnapshotted.length} cita(s) sin copia del contenido: el motor no aprueba un brief que las lleve.`);
    }
    if (latest.approved_by && !latest.approved_by_verified) {
      out.push("Quién aprobó no está verificado: el nombre lo escribió el cliente, no una sesión iniciada.");
    }
    return out;
  }, [latest, against.length, againstNotes.length, unsnapshotted.length]);

  const decisionActions = [];
  if (acts.submittable) {
    decisionActions.push({
      label: "Enviar a revisión", primary: true, icon: "arrow",
      disabled: busy || !text(latest?.season),
      title: text(latest?.season) ? undefined : "Un brief sin temporada no puede revisarse",
      onClick: () => run(() => brief.submitVersion(brandId, latest.id), "Enviado a revisión."),
    });
  }
  if (acts.approvable) {
    decisionActions.push({
      label: "Pedir cambios", icon: "x", disabled: busy,
      onClick: () => run(() => brief.requestChanges(brandId, latest.id),
                         "Devuelto a borrador con tu pedido de cambios."),
    });
    decisionActions.push({
      label: "Aprobar y congelar", primary: true, icon: "check", disabled: busy,
      onClick: () => run(() => brief.approveVersion(brandId, latest.id),
                         "Aprobado y congelado."),
    });
  }
  if (acts.immutable) {
    decisionActions.push({
      label: `Abrir la v${(latest?.version_number || 0) + 1}`, icon: "doc", disabled: busy,
      onClick: () => run(
        () => brief.newVersion(brandId, state.brief.id, brief.toBody(form)),
        `Se abrió la v${(latest?.version_number || 0) + 1} como borrador. Esta versión sigue diciendo lo que dice.`),
    });
    if (onNavigate) {
      decisionActions.push({
        label: "Continuar al rango", primary: true, disabled: busy,
        onClick: () => onNavigate("lineplan"),
      });
    }
  }

  const decisionNote = acts.approvable
    ? "Aprobar congela esta versión: los conceptos creados desde ahora citan esta redacción, con su evidencia y su fecha."
    : acts.submittable
      ? "Enviar a revisión no compromete nada todavía — abre la firma de quien puede aprobar."
      : acts.immutable
        ? "Esta versión está congelada. Abrir la siguiente no la cambia: crea la próxima como borrador."
        : null;

  useChrome({
    read: latest
      ? {
          interpretation: evidence.length
            ? `Este brief cita ${evidence.length} pieza(s) de evidencia: ${supports.length} a favor, ${against.length} en contra, ${contextual.length} de contexto. Las que contradicen no bloquean la aprobación — quedan registradas junto a ella.`
            : "Este brief no cita evidencia. Es una declaración de intención, y Atelier la muestra como tal: nada de lo que dice está respaldado por algo que se pueda volver a mirar.",
          signals: [
            { icon: "doc", label: "Estado", text: STATUS_LABEL[status] || status },
            { icon: "bookmark", label: "Versión", text: `v${latest.version_number} de ${state.brief.versions?.length || 1}` },
            ...(text(latest.season) ? [{ icon: "clock", label: "Temporada", text: [text(latest.season), text(latest.drop_name)].filter(Boolean).join(" · ") }] : []),
            ...(asLines(latest.markets).length ? [{ icon: "globe", label: "Mercados", text: toCsv(latest.markets) }] : []),
            ...(risks.length ? [{ icon: "target", label: "Riesgos registrados", text: String(risks.length) }] : []),
          ],
          against: [...against.map((e) => e.relevance || `${e.evidence_type} · ${e.evidence_id}`), ...againstNotes],
          unknowns,
          trace: [
            { icon: "doc", label: "Origen", text: "objeto versionado del motor" },
            { icon: "shield", label: "Evidencia fijada", text: `${evidence.length - unsnapshotted.length} de ${evidence.length} con copia del contenido` },
            ...(latest.approved_at ? [{ icon: "check", label: "Aprobado", text: dateText(latest.approved_at) }] : []),
          ],
          owner: latest.approved_by
            ? { name: latest.approved_by,
                role: latest.approved_by_verified ? "aprobó · identidad verificada" : "aprobó · sin verificar" }
            : null,
        }
      : null,
    decision: decisionActions.length
      ? { note: decisionNote, actions: decisionActions }
      : null,
    // NEVER put `onNavigate` here. Shell defines `navigate` inside its render,
    // so it is a new function identity every time: as a dependency it changes
    // on every render, the effect re-sets the chrome slots, that re-renders the
    // shell, and the browser logs "Maximum update depth exceeded" — a real
    // infinite loop, found by opening the console on the running page. Neither
    // lint nor the 203 tests said a word. The deps are VALUES, always.
  }, [latest?.id, status, busy, editing, evidence.length, unknowns.length, decisionActions.length]);

  /* ---- states the screen must be honest about -------------------------- */

  const frame = (children) => (
    <section className="cb2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cb2-crumb"><b>{engine.brandName || "Atelier"}</b><span>·</span>Brief</div>
      {children}
    </section>
  );

  if (collLoading || state.loading) {
    return frame(<>
      <div className="cb2-sk line w45" /><div className="cb2-sk title" />
      <div className="cb2-sk block" /><div className="cb2-sk line w90" />
    </>);
  }

  if (!brandId) {
    return frame(
      <div className="cb2-empty">
        <h1>El brief vive en el motor</h1>
        <p>
          Sin conexión no se puede leer ni editar. Esta pantalla no guarda una copia
          en el navegador a propósito: un contrato que dos personas ven distinto no
          es un contrato.
        </p>
      </div>,
    );
  }

  if (!activeId) {
    return frame(
      <div className="cb2-empty">
        <h1>Elegí una colección</h1>
        <p>Cada colección tiene su propio brief, y gobierna sólo a la suya.</p>
      </div>,
    );
  }

  if (state.error) {
    return frame(
      <div className="cb2-empty">
        <h1>No se pudo leer el brief</h1>
        <p>{state.error}</p>
      </div>,
    );
  }

  /* ---- no brief yet: the composer -------------------------------------- */

  if (!state.brief) {
    return frame(
      <>
        <div className="cb2-head">
          <div className="cb2-head-main">
            <h1 className="cb2-title">Esta colección todavía no tiene brief</h1>
            <p className="cb2-lede">
              <b>No se guarda nada hasta que toques Guardar</b> — mirar una colección
              no deja un borrador vacío atrás.
            </p>
          </div>
        </div>

        {/* ⚠ ATELIER CONTESTA PRIMERO (owner review 2026-08-10). El motor ya
            puede escribir la mayor parte de esto con los datos de la marca:
            temporada y fechas del plan vigente, mercados y canales del último
            brief APROBADO, margen del margen realmente LOGRADO, novedad y
            continuidad de la mezcla real del rango anterior, restricciones de
            los MOQ declarados por tus proveedores. Cuatro campos nunca se
            proponen — cliente, ocasión, objetivo comercial y dirección
            creativa — porque son tu criterio, y un párrafo plausible ahí se
            convierte en el estándar contra el que se mide todo lo que sigue. */}
        {proposal === null && !proposalTried && (
          <div className="cb2-proposal">
            <button className="cb2-btn primary" disabled={busy}
                    onClick={loadProposal}>
              Que Atelier lo redacte con mis datos
            </button>
            <span className="cb2-muted">
              lo revisás y lo editás — no se guarda nada
            </span>
          </div>
        )}

        {proposal && (
          <div className="cb2-proposal-note">
            <b>Atelier completó {proposal.answered} campo(s)</b> con tus propios
            registros. {proposal.basis?.[0] ? <span className="cb2-muted">({proposal.basis[0]})</span> : null}
            <div>
              Estas cuatro son tuyas y no las propone:
              <ul className="cb2-unanswerable">
                {(proposal.unanswerable || []).map((u) => (
                  <li key={u.field}>
                    <b>{u.field}</b> — {u.why}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {proposalTried && !proposal && (
          <p className="cb2-quiet">
            No pudimos redactar una propuesta con los datos de esta marca todavía.
            El formulario queda abierto — escribilo a mano.
          </p>
        )}

        <div className="cb2-editor">
          <BriefForm form={form} set={set} />
          <div className="cb2-editor-foot">
            <button className="cb2-btn primary"
                    disabled={busy || !text(form.season)}
                    onClick={() => run(
                      () => brief.createBrief(brandId, activeId, brief.toBody(form)),
                      "Brief guardado como borrador v1.")}>
              Guardar el brief
            </button>
            <span>
              {text(form.season)
                ? "Se crea como borrador v1. Aprobarlo es un paso aparte."
                : "Poné al menos una temporada para poder guardar."}
            </span>
          </div>
        </div>
        {notice && <p className="cb2-notice">{notice}</p>}
      </>,
    );
  }

  /* ---- edit mode: only ever reachable when the SERVER says so ----------- */

  if (editing && acts.editable) {
    return frame(
      <>
        <div className="cb2-head">
          <div className="cb2-head-main">
            <div className="cb2-pills">
              <span className={`cb2-pill ${statusTone}`}>
                {STATUS_EYEBROW[latest.status] || latest.status}
              </span>
              <span className="cb2-pill ver">versión {latest.version_number}</span>
            </div>
            <h1 className="cb2-title">Editando el brief</h1>
            <p className="cb2-lede">
              Se guarda sobre esta misma versión mientras siga siendo borrador o
              esté en revisión. Una vez aprobada, editar crea la siguiente.
            </p>
          </div>
        </div>

        <div className="cb2-editor">
          <BriefForm form={form} set={set} />
          <div className="cb2-editor-foot">
            <button className="cb2-btn primary" disabled={busy}
                    onClick={() => run(
                      () => brief.editVersion(brandId, latest.id, brief.toBody(form)),
                      "Guardado en el motor.", { close: true })}>
              Guardar
            </button>
            <button className="cb2-btn" disabled={busy}
                    onClick={() => { setForm(brief.toForm(latest)); setEditing(false); setNotice(""); }}>
              Descartar cambios
            </button>
            <span>Lo que no toques queda como estaba: el motor recibe el contenido completo.</span>
          </div>
        </div>
        {notice && <p className="cb2-notice">{notice}</p>}
      </>,
    );
  }

  /* ---- read mode: the contract ----------------------------------------- */

  const title = text(latest.drop_name) || text(latest.season) || active?.name || "esta colección";

  return frame(
    <>
      <div className="cb2-head">
        <div className="cb2-head-main">
          <div className="cb2-pills">
            <span className={`cb2-pill ${statusTone}`}>
              {STATUS_EYEBROW[latest.status] || latest.status}
            </span>
            <span className="cb2-pill ver">versión {latest.version_number}</span>
          </div>
          <h1 className="cb2-title">Por qué existe {title}</h1>
          <p className="cb2-lede">
            Este brief gobierna el rango, los conceptos y las aprobaciones de{" "}
            {active?.name || "la colección"}.
          </p>
        </div>
        <div className="cb2-head-side">
          {latest.approved_by ? (
            // ⚠ An UNVERIFIED approver is drawn weaker and is never given the
            // typography of a confirmation: the name was typed, not signed.
            <p className={`cb2-signed${latest.approved_by_verified ? "" : " unsigned"}`}>
              Aprobó <b>{latest.approved_by}</b>
              {latest.approved_at ? ` · ${dateText(latest.approved_at)}` : ""}
              <span className={`cb2-flag ${latest.approved_by_verified ? "ok" : "warn"}`}>
                <Icon name={latest.approved_by_verified ? "shield" : "warn"} />
                {latest.approved_by_verified ? "identidad verificada" : "sin verificar"}
              </span>
            </p>
          ) : (
            <p className="cb2-signed unsigned">
              Sin aprobar todavía
              <span className="cb2-flag warn"><Icon name="lock" /> no gobierna nada aún</span>
            </p>
          )}
          {acts.editable && (
            <button className="cb2-btn" onClick={() => { setForm(brief.toForm(latest)); setEditing(true); }}>
              Editar esta versión
            </button>
          )}
          {acts.immutable && (
            // Not a disabled input, not a lock icon on a field: a sentence.
            <p className="cb2-frozen">
              <Icon name="lock" />
              <span>
                Congelada. Para cambiarla se abre la v{latest.version_number + 1}, y
                ésta sigue diciendo lo que dijo.
              </span>
            </p>
          )}
        </div>
      </div>

      {notice && <p className="cb2-notice">{notice}</p>}

      {acts.awaitingSomeoneElse && (
        <p className="cb2-wait">
          <Icon name="clock" />
          <span>
            En revisión, esperando a alguien con permiso de aprobación.
            {!authenticated && " Iniciá sesión para firmar con tu nombre real."}
          </span>
        </p>
      )}

      {/* THE STATEMENT. The one sentence the whole collection is judged
          against, at the size of a statement rather than inside a textarea. */}
      <Section n="01" eyebrow="El argumento" title="La dirección creativa">
        {text(latest.creative_direction)
          ? <blockquote className="cb2-say">{latest.creative_direction}</blockquote>
          : <blockquote className="cb2-say empty">
              Sin dirección creativa escrita. El resto del brief puede estar
              completo y aun así nadie sabría qué hace que una prenda pertenezca
              a esta colección.
            </blockquote>}
      </Section>

      <Section n="02" eyebrow="Los tres compromisos"
               title="Cliente, ocasión y objetivo comercial">
        <div className="cb2-pillars">
          <Pillar label="Cliente" value={text(latest.customer)}
                  missing="Sin cliente definido — para quién es esto." />
          <Pillar label="Ocasión" value={text(latest.occasion)}
                  missing="Sin ocasión definida — cuándo se usa." />
          <Pillar label="Objetivo comercial" value={text(latest.commercial_objective)}
                  missing="Sin objetivo comercial — qué tiene que lograr." />
        </div>
      </Section>

      {/* A FAVOR beside EN CONTRA, side by side, each scrolling inside itself.
          Stacked, the contradicting evidence lands below the fold on any brief
          with more than three citations — and the whole reason `contradicts` is
          first-class in the engine is that it must not be the part nobody
          reaches. */}
      <div className="cb2-two">
        <Section n="03" eyebrow="Evidencia" title="Evidencia que sostiene el brief"
                 count={supports.length + contextual.length}>
          <div className="cb2-scroll">
            {supports.length + contextual.length ? (
              <ul className="cb2-evs">
                {supports.map((e) => <EvidenceRow key={e.id} link={e} />)}
                {contextual.map((e) => <EvidenceRow key={e.id} link={e} />)}
              </ul>
            ) : (
              <p className="cb2-quiet">
                Sin evidencia enlazada. Se agrega desde Oportunidades o desde el
                Brief de mercado, y queda fijada al contenido que se leyó: si el
                crawl vuelve a pasar y el precio cambia, lo que este brief
                argumentó no cambia con él.
              </p>
            )}
          </div>
        </Section>

        <Section n="04" eyebrow="Evidencia" title="Lo que contradice"
                 count={against.length + againstNotes.length}>
          <div className="cb2-scroll">
            {against.length || againstNotes.length ? (
              <ul className="cb2-evs">
                {against.map((e) => <EvidenceRow key={e.id} link={e} />)}
                {againstNotes.map((note, i) => (
                  <li className="cb2-ev note" key={`n${i}`}>
                    <div className="cb2-ev-main"><p>{note}</p></div>
                    <div className="cb2-ev-src">
                      <span className="cb2-pin warn"><Icon name="warn" /> nota sin fuente</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cb2-quiet">
                Nadie registró evidencia en contra. No prueba que no exista —
                prueba que el brief todavía no fue puesto a prueba.
              </p>
            )}
          </div>
          <p className="cb2-foot">Un brief aprobado no prueba que la oportunidad vaya a funcionar.</p>
        </Section>
      </div>

      {/* The commercial commitments as ONE horizontal band. Six numbers do not
          need six cards, and a missing one says "sin definir" instead of
          showing a zero somebody could plan against. */}
      <Section n="05" eyebrow="Compromisos comerciales"
               title="Los números contra los que se mide">
        <div className="cb2-targets">
          <Cell label="Margen objetivo" value={pct(latest.margin_target)} missing="sin definir" />
          <Cell label="Newness" value={pct(latest.newness_target)} missing="sin definir" />
          <Cell label="Carryover" value={pct(latest.carryover_target)} missing="sin definir" />
          <Cell label="Entrega" kind="text"
                value={latest.delivery_start || latest.delivery_end
                  ? `${dateText(latest.delivery_start) || "?"} → ${dateText(latest.delivery_end) || "?"}`
                  : null}
                missing="sin ventana" />
          <Cell label="Mercados" kind="text" value={toCsv(latest.markets)} missing="sin definir" />
          <Cell label="Canales" kind="text" value={toCsv(latest.channels)} missing="sin definir" />
        </div>
      </Section>

      <Section n="06" eyebrow="Lo que puede salir mal"
               title="Restricciones, riesgos y supuestos">
        {(constraints.length || risks.length || assumptions.length) ? (
          <div className="cb2-lists">
            {[["Restricciones", constraints], ["Riesgos", risks], ["Supuestos", assumptions]]
              .filter(([, list]) => list.length)
              .map(([label, list]) => (
                <section className="cb2-list" key={label}>
                  <span className="cb2-pillar-l">{label}</span>
                  <ul>{list.map((line, i) => <li key={i}>{line}</li>)}</ul>
                </section>
              ))}
          </div>
        ) : (
          <p className="cb2-quiet">
            Sin restricciones, riesgos ni supuestos registrados. Es un campo vacío,
            no una colección sin riesgos.
          </p>
        )}
      </Section>

      {state.brief.versions?.length > 1 && (
        // Hairline rows: a version history is a ledger, and the version that
        // governs right now is the one marked — the others are what it replaced.
        <Section n="07" eyebrow="Append-only" title="Historial de versiones">
          <div className="cb2-hist">
            {state.brief.versions.map((v) => (
              <div className="cb2-hist-row" key={v.id}>
                <b className="cb2-hist-v">v{v.version_number}</b>
                <span className="cb2-hist-meta">{STATUS_LABEL[v.status] || v.status}</span>
                {v.approved_by && <span className="cb2-hist-meta">{v.approved_by}</span>}
                <span className="cb2-hist-meta">{dateText(v.approved_at || v.created_at) || ""}</span>
                {v.id === latest.id && <span className="cb2-pill">en pantalla</span>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>,
  );
}
