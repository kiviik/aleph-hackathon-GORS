"use client";
// SALA DE REVISIÓN — three disciplines, one version, one ledger.
//
// 2026-08-07 (owner reference designs, `design/atelier-redesign/08-review.png`).
// This is a rebuild on a different data source, not a restyle, and the reason is
// the screen was reading the wrong object:
//
// The old Review ran on `studio_collections` items — the mutable JSONB blob
// Studio edits live. On the demo brand that array is EMPTY while the engine
// holds 10 concepts, 6 approved and 4 waiting, so the collection tabs said
// "4 esperando revisión" one line above a screen that said "no hay estilos para
// revisar". Two surfaces, two sources, one collection, and the user is the one
// who has to work out which is lying.
//
// It also approved by writing `approved: true` onto that item. The engine has
// had a disciplined, append-only approvals ledger since migration 0039 —
// creative / commercial / technical, per concept VERSION, with a policy per
// brand, rejections that are never overwritten, and a `single_actor_lanes`
// report for when one person signs everything. Nothing in the frontend called
// it. The reference screen is that feature, drawn.
//
// What this screen therefore refuses to do:
//   · decide readiness. `ready`, `missing`, `rejected` and `required` all come
//     from `GET /approvals/concept_version/{id}`. A local tally would be a
//     second opinion, and the engine's is the one that gates production.
//   · show three lanes when the brand requires two. `required` is policy; a
//     third lane greyed out tells a two-lane brand it is permanently
//     incomplete.
//   · name an approver it cannot verify. Signing needs a real session; without
//     one the bar says so instead of offering a button that 403s.
//   · attach an image that is not this version's own.
//
// WHAT WAS REMOVED, on purpose: pin annotations and free comments on the studio
// card. They lived in the same blob and had no way to reach the approval
// record. The lane REASON replaces them and is stronger — the engine refuses a
// rejection without one, it is stored beside the decision, and it survives in
// the history forever instead of being rewritten by the next save. Drawing-level
// notes belong in Studio, on the object Studio owns.
//
// 2026-08-13 — RESTYLE onto the `rv2-` namespace (owner reference set). The old
// `rw-` rules live in `app/atelier-ui.css`, which this change may not touch, so
// the screen carries its own complete stylesheet below. This is the screen where
// somebody signs something irreversible, so it is drawn tighter and quieter than
// its exploratory neighbours: hairline summary cells, mono labels on evidence,
// blockers as full-width strips nothing can collapse, and an approver line that
// gets WEAKER when the identity behind it was never verified. No datum, handler
// or disabled condition moved — only how they read.
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine } from "@/components/EngineProvider";
import { useIdentity } from "@/components/IdentityProvider";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import { listConcepts, listVersions, versionImage } from "@/lib/concepts";
import { getConceptCovers } from "@/lib/api";
import {
  LANE_LABEL, LANE_QUESTION, LANE_WHO, decide, getReadiness, laneState,
  lanesToShow, mayISign, verdict,
} from "@/lib/approvals";

const STATE_ICON = { approved: "check", rejected: "x", missing: "clock", unset: "doc" };
const STATE_LABEL = {
  approved: "Aprobado",
  rejected: "Cambios solicitados",
  missing: "Sin firmar",
  unset: "No requerida",
};

function when(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return null; }
}

/* ---------------------------------------------------------------- styles -- */

// ⚠ MOUNTED AS `dangerouslySetInnerHTML`, never as a `<style>{CSS}</style>`
// text child: React escapes `>` and `"` when it serialises a text child on the
// server, the browser does not unescape inside <style>, and the mismatch makes
// React throw the whole tree away on every load. See tests/styleHydration.
// ⚠ 11px IS THE FLOOR. Nothing below it, anywhere in this file.
const CSS = `
/* ============ Sala de revisión — rv2- ==============================
   Consequential screen, so: exact, quiet, evidence-forward. Blue only
   on things you can press; --editorial carries the eyebrow, --danger is
   reserved for what actually blocks. */

.rv2 { min-width: 0; container-type: inline-size; container-name: rv2; }

/* ---- header ---- */
.rv2-eyebrow {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s3);
}
.rv2-eyebrow b { font-weight: 600; }
.rv2-eyebrow span { color: var(--ink-3); }
.rv2-title {
  font-family: var(--serif); font-weight: 500; font-size: 34px;
  line-height: 1.1; letter-spacing: -.015em; color: var(--ink);
  margin: 0 0 var(--s2); max-width: 22ch;
}
.rv2-lede {
  font-size: 14px; line-height: 1.5; color: var(--ink-2);
  margin: 0 0 var(--s4); max-width: 66ch;
}

/* ---- the counts, as one card with hairline cells ---- */
.rv2-sumbar {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
  background: var(--hair); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
  overflow: hidden; margin: 0 0 var(--s4);
}
.rv2-sumcell { background: var(--surface); padding: 13px 16px; }
.rv2-sumcell span {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 6px;
}
.rv2-sumcell b {
  display: block; font-family: var(--disp); font-size: 21px; font-weight: 600;
  line-height: 1; letter-spacing: -.01em; font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.rv2-sumcell.pending b { color: var(--warning); }
.rv2-sumcell.approved b { color: var(--positive); }
.rv2-sumcell.blocked b { color: var(--danger); }

/* ---- the queue. HORIZONTAL: ten garments stacked push the review off
       the bottom of the page, which is the thing the screen exists for. */
.rv2-queue {
  display: flex; gap: var(--s3); overflow-x: auto;
  padding: 0 0 var(--s3); margin: 0 0 var(--s4);
  scrollbar-width: thin; scrollbar-color: var(--hair-2) transparent;
}
.rv2-queue::-webkit-scrollbar { height: 8px; }
.rv2-queue::-webkit-scrollbar-thumb { background: var(--hair-2); border-radius: 4px; }
.rv2-q {
  flex: none; width: 158px; text-align: left; padding: 10px;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
  transition: border-color .14s, box-shadow .14s;
}
.rv2-q:hover { border-color: var(--ink-3); }
.rv2-q.on { border-color: var(--cobalt); box-shadow: 0 0 0 2px var(--cobalt-wash); }
.rv2-q-shot {
  display: block; aspect-ratio: 4 / 5; border-radius: var(--r-sm);
  overflow: hidden; background: var(--paper-2); margin-bottom: 9px;
}
.rv2-q-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rv2-q-empty { display: grid; place-items: center; width: 100%; height: 100%; }
.rv2-q-empty svg { width: 18px; height: 18px; color: var(--ink-3); }
.rv2-q-name {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; font-family: var(--disp); font-size: 15px; font-weight: 700;
  line-height: 1.22; letter-spacing: -.01em; color: var(--ink);
}
.rv2-q-state {
  display: block; font-size: 12px; color: var(--ink-3);
  margin-top: 6px; font-variant-numeric: tabular-nums;
}

/* ---- garment | lanes ---- */
.rv2-main {
  display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr);
  gap: var(--s5); align-items: start;
}

.rv2-piece {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s4);
}
.rv2-shot {
  aspect-ratio: 4 / 5; border-radius: var(--r-sm);
  overflow: hidden; background: var(--paper-2);
}
.rv2-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* The honest placeholder: dashed, unglamorous, and it says why. It is never
   filled with another version's photograph. */
.rv2-shot.empty {
  display: grid; place-items: center; padding: var(--s5);
  border: 1px dashed var(--hair-2); background: var(--paper-2);
}
.rv2-noimg { text-align: center; max-width: 34ch; }
.rv2-noimg svg { width: 22px; height: 22px; color: var(--ink-3); }
.rv2-noimg b {
  display: block; margin: 10px 0 5px; font-family: var(--disp);
  font-size: 13px; font-weight: 700; color: var(--ink-2);
}
.rv2-noimg span { display: block; font-size: 12px; color: var(--ink-3); line-height: 1.5; }

/* ---- EVIDENCE. The whole argument of the product is that a decision
       shows what it was decided on, so this stays prominent. ---- */
.rv2-lbl {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
}
.rv2-facts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: var(--s3); margin: var(--s4) 0 0; padding: var(--s3) 0 0;
  border-top: 1px solid var(--hair);
}
.rv2-fact .rv2-lbl { margin-bottom: 5px; }
.rv2-fact b {
  display: block; font-size: 12px; font-weight: 600; line-height: 1.45;
  color: var(--ink); font-variant-numeric: tabular-nums;
}

/* ---- versions: append-only, so this picks the SUBJECT, not a preview ---- */
.rv2-vers { margin: var(--s4) 0 0; padding: var(--s3) 0 0; border-top: 1px solid var(--hair); }
.rv2-vers > .rv2-lbl { margin-bottom: 9px; }
.rv2-vers-row {
  display: flex; gap: var(--s2); overflow-x: auto; padding-bottom: 6px;
  scrollbar-width: thin; scrollbar-color: var(--hair-2) transparent;
}
.rv2-v {
  flex: none; min-width: 124px; text-align: left; padding: 9px 11px;
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface);
}
.rv2-v:hover { border-color: var(--ink-3); }
.rv2-v.on { border-color: var(--cobalt); background: var(--cobalt-wash); }
.rv2-v b {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 600;
  letter-spacing: .04em; color: var(--ink); font-variant-numeric: tabular-nums;
}
.rv2-v span { display: block; font-size: 11px; color: var(--ink-3); margin-top: 4px; line-height: 1.4; }
.rv2-v span.ok { color: var(--positive); font-weight: 600; }
.rv2-v span.mute { color: var(--warning); }

/* ---- the lanes ---- */
.rv2-lanes { display: flex; flex-direction: column; gap: var(--s3); }
.rv2-lane {
  background: var(--card); border: 1px solid var(--line); border-left-width: 3px;
  border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s4) 18px;
}
.rv2-lane.approved { border-left-color: var(--positive); }
.rv2-lane.rejected { border-left-color: var(--danger); }
.rv2-lane.missing { border-left-color: var(--warning); }
.rv2-lane.unset { border-left-color: var(--hair-2); }
.rv2-lane > header { display: flex; gap: var(--s3); align-items: flex-start; }
.rv2-lane h3 {
  margin: 0; font-family: var(--disp); font-size: 15px; font-weight: 700;
  letter-spacing: -.01em; color: var(--ink);
}
.rv2-lane header p { margin: 5px 0 0; font-size: 12px; color: var(--ink-3); line-height: 1.45; }

.rv2-verdict {
  margin-left: auto; flex: none;
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--d); font-size: 11px; font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase;
  padding: 5px 10px; border-radius: 999px;
  background: var(--paper-2); color: var(--ink-3); white-space: nowrap;
}
.rv2-verdict svg { width: 13px; height: 13px; }
.rv2-verdict.approved { background: color-mix(in srgb, var(--positive) 12%, #fff); color: var(--positive); }
.rv2-verdict.rejected { background: var(--clay-wash); color: var(--danger); }
.rv2-verdict.missing { background: var(--ochre-wash); color: var(--warning); }
.rv2-verdict.unset { background: var(--paper-2); color: var(--ink-3); }

/* A BLOCKER is a full-width strip with a danger rule down its left edge.
   Never truncated, never behind a disclosure: every one is visible. */
.rv2-reason {
  margin: var(--s3) 0 0; padding: 10px 13px;
  border-left: 3px solid var(--danger); background: var(--clay-wash);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
  font-size: 12.5px; line-height: 1.5; color: var(--ink);
}

/* Signed now, refused before — the objection and its answer are the useful
   part of a history. Warning, not danger: it is resolved, not open. */
.rv2-was {
  margin: var(--s3) 0 0; padding: 10px 13px;
  border-left: 3px solid var(--warning); background: var(--ochre-wash);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
}
.rv2-was > .rv2-lbl { margin-bottom: 6px; color: var(--warning); }
.rv2-was p { margin: 0 0 5px; font-size: 12.5px; line-height: 1.5; color: var(--ink-2); }
.rv2-was p:last-child { margin-bottom: 0; }
.rv2-was b { color: var(--ink); font-weight: 600; }

/* WHO SIGNED, and whether anyone could confirm it was them. An unverified
   signature is drawn WEAKER than a verified one and is never given the
   typography of a confirmation. */
.rv2-lane > footer {
  margin-top: var(--s3); padding-top: 10px; border-top: 1px solid var(--hair);
  display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline;
}
.rv2-who {
  font-family: var(--d); font-size: 11px; line-height: 1.55; letter-spacing: .02em;
  color: var(--ink-2); font-variant-numeric: tabular-nums;
}
.rv2-who.unverified { color: var(--ink-3); font-weight: 400; }
.rv2-who.mute { color: var(--ink-3); }
.rv2-when { font-style: normal; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.rv2-flag { font-weight: 600; color: var(--warning); }
.rv2-flag.bad { color: var(--danger); }

.rv2-sum {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 12px 14px; border-left: 3px solid var(--hair-2);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
  background: var(--paper-2); color: var(--ink-2);
  font-size: 12.5px; line-height: 1.5;
}
.rv2-sum svg { width: 16px; height: 16px; flex: none; margin-top: 1px; }
.rv2-sum.ready { border-left-color: var(--positive); background: color-mix(in srgb, var(--positive) 8%, #fff); color: var(--ink); }
.rv2-sum.blocked { border-left-color: var(--danger); background: var(--clay-wash); color: var(--ink); }
.rv2-sum.waiting { border-left-color: var(--warning); background: var(--ochre-wash); color: var(--ink); }

/* ---- signing ---- */
.rv2-sign {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s4) 18px;
}
.rv2-sign > .rv2-lbl { margin-bottom: 10px; }
.rv2-sign-no { margin: 0; font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }
.rv2-sign-hint {
  margin: 9px 0 0; font-family: var(--d); font-size: 11px;
  letter-spacing: .02em; color: var(--ink-3); line-height: 1.55;
}
.rv2-input {
  width: 100%; resize: vertical; padding: 9px 11px;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--paper-2); color: var(--ink);
  font-family: var(--ui); font-size: 13px; line-height: 1.5;
}
.rv2-input:focus {
  outline: none; border-color: var(--cobalt); background: var(--surface);
  box-shadow: 0 0 0 2px var(--cobalt-wash);
}
.rv2-lane-pick { display: flex; gap: 7px; margin-bottom: 10px; flex-wrap: wrap; }
.rv2-lane-pick button {
  font-family: var(--d); font-size: 11px; font-weight: 600;
  letter-spacing: .04em; text-transform: uppercase;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
}
.rv2-lane-pick button:hover { border-color: var(--ink-3); }
.rv2-lane-pick button.on { border-color: var(--cobalt); background: var(--cobalt-wash); color: var(--cobalt-ink); }
.rv2-notice {
  margin: 10px 0 0; padding: 9px 12px;
  border-left: 3px solid var(--warning); background: var(--ochre-wash);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
  font-size: 12.5px; line-height: 1.5; color: var(--ink);
}
.rv2-msg {
  margin: 0; padding: var(--s4) 18px;
  border: 1px solid var(--line); background: var(--surface);
  border-radius: var(--r); box-shadow: var(--shadow);
  font-size: 12.5px; line-height: 1.55; color: var(--ink-2);
}

/* ---- the ledger: hairline rows, mono timestamps ---- */
.rv2-hist { margin: 0; }
.rv2-hist > summary {
  cursor: pointer; list-style: none;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-radius: var(--r-sm);
  background: var(--surface); border: 1px solid var(--line);
  font-size: 12px; font-weight: 600; color: var(--cobalt);
}
.rv2-hist > summary::-webkit-details-marker { display: none; }
.rv2-hist > summary::before { content: "▸"; color: var(--ink-3); }
.rv2-hist[open] > summary::before { content: "▾"; }
.rv2-hist > summary:hover { border-color: var(--cobalt); }
.rv2-hist[open] > summary { margin-bottom: var(--s3); }
.rv2-hist-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--hair); }
.rv2-hist-row {
  font-size: 12px; color: var(--ink-2); line-height: 1.5;
  padding: 10px 0 10px 11px;
  border-bottom: 1px solid var(--hair); border-left: 3px solid transparent;
  font-variant-numeric: tabular-nums;
}
.rv2-hist-row.approve { border-left-color: var(--positive); }
.rv2-hist-row.reject { border-left-color: var(--danger); }
.rv2-hist-row b { color: var(--ink); font-weight: 600; }
.rv2-hist-row > span { display: block; margin-top: 4px; color: var(--ink-3); }

/* ---- the honest states: calm, centred, same words ---- */
.rv2-empty {
  display: grid; place-items: center; align-content: center;
  min-height: 320px; text-align: center;
}
.rv2-empty h1 {
  font-family: var(--serif); font-weight: 500; font-size: 26px;
  line-height: 1.15; letter-spacing: -.01em; color: var(--ink);
  margin: 0 0 var(--s2); max-width: 24ch;
}
.rv2-empty p { margin: 0; max-width: 54ch; font-size: 13px; line-height: 1.55; color: var(--ink-2); }
.rv2-empty .rv2-btn { margin-top: var(--s4); }

.rv2-btn {
  border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--surface); padding: 9px 14px;
  font-size: 12px; font-weight: 600; color: var(--ink); cursor: pointer;
}
.rv2-btn:hover { border-color: var(--ink-3); }
.rv2-btn.primary { background: var(--cobalt); border-color: var(--cobalt); color: #fff; }
.rv2-btn.primary:hover { background: var(--cobalt-ink); border-color: var(--cobalt-ink); }
.rv2-btn:disabled { opacity: .5; cursor: default; }

/* The work column is the viewport minus the sidebar and the rail, so these
   breakpoints are about THIS column, not the window. */
@container rv2 (max-width: 820px) {
  .rv2-main { grid-template-columns: minmax(0, 1fr); }
  .rv2-shot { aspect-ratio: 4 / 3; }
}
@container rv2 (max-width: 560px) {
  .rv2-sumbar { grid-template-columns: 1fr; }
  .rv2-title { font-size: 28px; }
}
`;

/* ------------------------------------------------------------------ lane -- */

function Lane({ discipline, state }) {
  return (
    <article className={`rv2-lane ${state.status}`}>
      <header>
        <div>
          <h3>{LANE_LABEL[discipline]}</h3>
          <p>{LANE_QUESTION[discipline]}</p>
        </div>
        <span className={`rv2-verdict ${state.status}`}>
          <Icon name={STATE_ICON[state.status]} />
          {STATE_LABEL[state.status]}
        </span>
      </header>

      {state.status === "rejected" && (
        <p className="rv2-reason">{state.reason || "Rechazada sin motivo registrado."}</p>
      )}

      {/* Signed NOW, refused before. Shown on the card, not buried in the
          history: whoever picks this up next has to know the objection existed
          and what answered it. */}
      {state.status === "approved" && state.overturned?.length > 0 && (
        <div className="rv2-was">
          <span className="rv2-lbl">
            {state.overturned.length === 1
              ? "Antes rechazada"
              : `Antes rechazada ${state.overturned.length} veces`}
          </span>
          {state.overturned.map((r, i) => (
            <p key={i}>
              <b>{r.by || "sin nombre"}{r.at ? ` · ${when(r.at)}` : ""}</b>
              {r.reason ? ` — ${r.reason}` : " — sin motivo registrado"}
            </p>
          ))}
        </div>
      )}

      <footer>
        {state.by ? (
          <span className={`rv2-who${state.verified === false ? " unverified" : ""}`}>
            {state.by}
            {state.at ? <em className="rv2-when"> · {when(state.at)}</em> : null}
            {/* Two different failures, never collapsed: nobody could confirm
                WHO signed, versus somebody signed a lane they did not hold. */}
            {state.verified === false && <b className="rv2-flag"> · identidad sin verificar</b>}
            {state.authorised === false && <b className="rv2-flag bad"> · firmó sin tener la firma</b>}
          </span>
        ) : (
          <span className="rv2-who mute">
            {state.status === "missing"
              ? `Esperando a ${LANE_WHO[discipline]}.`
              : "Esta marca no la exige para un concepto."}
          </span>
        )}
        {state.extra && <span className="rv2-who mute">Firma no exigida por la política</span>}
      </footer>
    </article>
  );
}

/* ---------------------------------------------------------------- screen -- */

export default function Review({ onNavigate }) {
  const engine = useEngine();
  const { activeId, active } = useCollection();
  const { me, authenticated } = useIdentity();
  const brandId = engine.brandId;

  const [concepts, setConcepts] = useState(null);
  const [covers, setCovers] = useState([]);
  const [error, setError] = useState("");
  const [conceptId, setConceptId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState(null);
  const [image, setImage] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [lane, setLane] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  /* -- the queue: this collection's concepts, from the engine ------------- */

  useEffect(() => {
    let dead = false;
    if (!brandId || !activeId) { setConcepts([]); setCovers([]); return () => {}; }
    setError("");
    (async () => {
      try {
        const [rows, cov] = await Promise.all([
          listConcepts(brandId, activeId),
          getConceptCovers(brandId, activeId, 60).catch(() => null),
        ]);
        if (dead) return;
        setConcepts(rows || []);
        setCovers(cov?.covers || []);
        setConceptId((current) =>
          (rows || []).some((c) => c.id === current) ? current : (rows?.[0]?.id || null));
      } catch (e) {
        if (!dead) { setConcepts([]); setError(String(e.message || e)); }
      }
    })();
    return () => { dead = true; };
  }, [brandId, activeId]);

  /* -- the selected concept's versions, and which one is under review ----- */

  useEffect(() => {
    let dead = false;
    if (!brandId || !conceptId) { setVersions([]); setVersionId(null); return () => {}; }
    (async () => {
      const rows = await listVersions(brandId, conceptId).catch(() => []);
      if (dead) return;
      setVersions(rows || []);
      const concept = (concepts || []).find((c) => c.id === conceptId);
      // The approved version if there is one — that IS the version the team
      // decided on — otherwise the newest. Never a guess in between.
      const approved = (rows || []).find((v) => v.id === concept?.approved_version_id);
      setVersionId(approved?.id || rows?.[rows.length - 1]?.id || null);
    })();
    return () => { dead = true; };
  }, [brandId, conceptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadReadiness = useCallback(async () => {
    if (!brandId || !versionId) { setReadiness(null); return; }
    try {
      setReadiness(await getReadiness(brandId, "concept_version", versionId));
    } catch {
      setReadiness(null);
    }
  }, [brandId, versionId]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  useEffect(() => {
    let dead = false;
    if (!brandId || !conceptId || !versionId) { setImage(null); return () => {}; }
    setImage(null);
    (async () => {
      const v = await versionImage(brandId, conceptId, versionId).catch(() => null);
      if (!dead) setImage(v?.image_data_uri || null);
    })();
    return () => { dead = true; };
  }, [brandId, conceptId, versionId]);

  const concept = (concepts || []).find((c) => c.id === conceptId) || null;
  const version = versions.find((v) => v.id === versionId) || null;
  const lanes = useMemo(() => lanesToShow(readiness), [readiness]);
  const summary = useMemo(() => verdict(readiness), [readiness]);
  const coverOf = useCallback(
    (id) => covers.find((c) => c.concept_id === id)?.image_data_uri || null, [covers]);

  // The lanes this person may actually sign. Offering the other two would be
  // offering a 403 — and the engine's refusal even says which lanes you hold,
  // because "you cannot approve this" with no follow-up is how people go and
  // borrow somebody else's token.
  const mine = useMemo(
    () => lanes.filter((d) => mayISign(me, d)), [lanes, me]);

  useEffect(() => {
    setLane((current) => (mine.includes(current) ? current : mine[0] || null));
  }, [mine]);

  // A different version is a different subject: a motive typed about v2 must
  // not be sitting in the box when v3 is what gets signed. Written across four
  // lines rather than one because the brand-switch guard in tests/ reads effect
  // bodies with a regex, and a single-line body runs on into the next function.
  useEffect(() => {
    setReason("");
    setNotice("");
  }, [versionId]);

  async function sign(decision) {
    if (!lane || !versionId) return;
    if (decision === "reject" && !reason.trim()) {
      setNotice("Un rechazo necesita un motivo: sin él, quien tiene que arreglarlo no sabe qué arreglar. El motor lo rechaza igual.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const next = await decide(brandId, "concept_version", versionId, {
        discipline: lane, decision, reason: reason.trim() || null,
      });
      setReadiness(next);
      setReason("");
      setNotice(decision === "approve"
        ? `Firmaste la ${LANE_LABEL[lane].toLowerCase()}. Queda en el ledger con tu nombre y la fecha.`
        : `Registrado como cambios solicitados en la ${LANE_LABEL[lane].toLowerCase()}. El motivo queda para siempre, incluso si después la aprobás.`);
    } catch (e) {
      const body = e?.body?.detail || e?.body;
      setNotice(typeof body === "object" && body?.message
        ? body.message
        : e?.status === 403
          ? "El motor no aceptó la firma: hace falta una sesión verificada con esa firma."
          : "El motor no confirmó la decisión. Nada quedó registrado.");
    } finally {
      setBusy(false);
    }
  }

  /* ---- chrome slots ----------------------------------------------------- */

  const unknowns = [];
  if (readiness) {
    for (const d of readiness.missing || []) {
      unknowns.push(`${LANE_LABEL[d]} — nadie la miró todavía; esperando a ${LANE_WHO[d]}.`);
    }
    for (const d of readiness.unverified_disciplines || []) {
      unknowns.push(`${LANE_LABEL[d]} se firmó sin identidad verificada: hay un nombre, no una sesión.`);
    }
    for (const d of readiness.unauthorised_disciplines || []) {
      unknowns.push(`${LANE_LABEL[d]} la firmó alguien que no tenía esa firma.`);
    }
    for (const [name, ls] of Object.entries(readiness.single_actor_lanes || {})) {
      unknowns.push(`${name} firmó ${ls.length} disciplinas sola. No está prohibido — queda dicho.`);
    }
  }

  const decisionActions = [];
  if (lane) {
    decisionActions.push({
      label: "Pedir cambios", icon: "x", disabled: busy,
      onClick: () => sign("reject"),
    });
    decisionActions.push({
      label: `Firmar la ${LANE_LABEL[lane].replace("Revisión ", "")}`,
      primary: true, icon: "check", disabled: busy,
      onClick: () => sign("approve"),
    });
  } else if (readiness?.ready && onNavigate) {
    decisionActions.push({
      label: "Ir a lanzamiento", primary: true, onClick: () => onNavigate("launch"),
    });
  }

  useChrome({
    read: readiness
      ? {
          interpretation: summary?.text || null,
          signals: [
            { icon: "doc", label: "Versión en revisión", text: version?.note || (version ? `v${versions.indexOf(version) + 1}` : "—") },
            { icon: "shield", label: "Firmas exigidas", text: (readiness.required || []).map((d) => LANE_LABEL[d].replace("Revisión ", "")).join(" · ") || "ninguna" },
            { icon: "clock", label: "Decisiones registradas", text: String((readiness.history || []).length) },
          ],
          against: (readiness.rejected || []).map(
            (r) => `${LANE_LABEL[r.discipline]}: ${r.reason || "sin motivo registrado"} (${r.by || "sin nombre"})`),
          unknowns,
          trace: [
            { icon: "doc", label: "Origen", text: "ledger de aprobaciones del motor, append-only" },
            { icon: "shield", label: "Política", text: "las disciplinas exigidas las fija la marca, no esta pantalla" },
          ],
        }
      : null,
    decision: decisionActions.length
      ? {
          note: lane
            ? `Firmás como ${me?.name || "vos"} en la ${LANE_LABEL[lane].toLowerCase()}. Queda en el ledger con tu nombre, la fecha y el motivo si pedís cambios.`
            : summary?.text || null,
          actions: decisionActions,
        }
      : null,
  }, [versionId, lane, busy, readiness?.ready, (readiness?.history || []).length, unknowns.length, me?.name]);

  /* ---- honest states ---------------------------------------------------- */

  const frame = (children) => (
    <section className="rv2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rv2-eyebrow"><b>{engine.brandName || "Atelier"}</b><span>·</span>Revisión</div>
      {children}
    </section>
  );

  if (!brandId) {
    return frame(
      <div className="rv2-empty">
        <h1>La sala de revisión vive en el motor</h1>
        <p>
          Las firmas son un registro auditable, no una casilla en un navegador. Sin
          conexión no hay nada que firmar ni que mostrar.
        </p>
      </div>,
    );
  }

  if (!activeId) {
    return frame(
      <div className="rv2-empty">
        <h1>Elegí una colección</h1>
        <p>Se revisan los conceptos de una colección por vez.</p>
      </div>,
    );
  }

  if (concepts === null) {
    return frame(<>
      <div className="ax-sk line w45" /><div className="ax-sk title" /><div className="ax-sk block" />
    </>);
  }

  if (error) {
    return frame(
      <div className="rv2-empty">
        <h1>No se pudieron leer los conceptos</h1>
        <p>{error}</p>
      </div>,
    );
  }

  if (!concepts.length) {
    return frame(
      <div className="rv2-empty">
        <h1>Todavía no hay conceptos para revisar</h1>
        <p>
          Un concepto llega acá cuando existe en el motor con al menos una versión.
          {" "}{active?.name || "Esta colección"} todavía no tiene ninguno.
        </p>
        {onNavigate && (
          <button className="rv2-btn primary" onClick={() => onNavigate("studio")}>
            Abrir el estudio de concepto
          </button>
        )}
      </div>,
    );
  }

  return frame(
    <>
      <h1 className="rv2-title">Sala de revisión</h1>
      <p className="rv2-lede">
        Creatividad, Comercial y Técnica evalúan exactamente la misma versión.
        Cada firma queda registrada por separado, y un rechazo no se borra cuando
        después se aprueba.
      </p>

      {/* THE COUNTS, and only the engine's. Every number here is a length of a
          list the readiness payload returned — nothing is tallied locally, so
          the bar cannot disagree with the lanes below it. */}
      {readiness && (
        <div className="rv2-sumbar">
          <div className="rv2-sumcell pending">
            <span>Esperando firma</span>
            <b>{(readiness.missing || []).length}</b>
          </div>
          <div className="rv2-sumcell approved">
            <span>Firmadas</span>
            <b>{(readiness.satisfied || []).length}</b>
          </div>
          <div className="rv2-sumcell blocked">
            <span>Rechazos abiertos</span>
            <b>{(readiness.rejected || []).length}</b>
          </div>
        </div>
      )}

      {/* THE QUEUE, horizontal. One card per concept with the state the ENGINE
          gives it — approved, or the count of versions waiting. A vertical list
          of ten garments pushes the actual review off the screen. */}
      <div className="rv2-queue">
        {concepts.map((c) => {
          const cover = coverOf(c.id);
          return (
            <button key={c.id} className={`rv2-q${c.id === conceptId ? " on" : ""}`}
                    onClick={() => setConceptId(c.id)}>
              <span className="rv2-q-shot">
                {cover
                  ? <img src={cover} alt={c.name} loading="lazy" />
                  : <span className="rv2-q-empty"><Icon name="doc" /></span>}
              </span>
              <b className="rv2-q-name">{c.name}</b>
              <span className="rv2-q-state">
                {c.approved_version_id ? "Versión aprobada" : `${c.n_versions} versión(es)`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rv2-main">
        {/* the garment, at the size you would judge it */}
        <section className="rv2-piece">
          <div className={`rv2-shot${image ? "" : " empty"}`}>
            {image
              ? <img src={image} alt={concept?.name || ""} />
              : <div className="rv2-noimg">
                  <Icon name="doc" />
                  <b>Esta versión no tiene imagen</b>
                  <span>
                    Existe como registro y como decisión. Atelier no le presta la
                    foto de otra versión para llenar el cuadro.
                  </span>
                </div>}
          </div>

          {/* THE EVIDENCE this decision cites. Mono labels, so the value is what
              reads and the label only names it. */}
          <div className="rv2-facts">
            <div className="rv2-fact">
              <span className="rv2-lbl">Concepto</span>
              <b>{concept?.name || "—"}</b>
            </div>
            <div className="rv2-fact">
              <span className="rv2-lbl">Creado por</span>
              <b>{concept?.created_by || "sin registrar"}</b>
            </div>
            <div className="rv2-fact">
              <span className="rv2-lbl">Aprobación previa</span>
              <b>{concept?.approved_at
                ? `${concept.approved_by || "sin nombre"} · ${when(concept.approved_at)}`
                : "ninguna"}</b>
            </div>
          </div>

          {/* Versions are append-only: choosing one changes WHICH object the
              three lanes are talking about, so it is a first-class control and
              not a comparison toy. */}
          <div className="rv2-vers">
            <span className="rv2-lbl">Versiones · se revisa una</span>
            <div className="rv2-vers-row">
              {versions.map((v, i) => (
                <button key={v.id} className={`rv2-v${v.id === versionId ? " on" : ""}`}
                        onClick={() => setVersionId(v.id)}>
                  <b>v{i + 1}</b>
                  <span>{v.note || v.kind}</span>
                  {v.id === concept?.approved_version_id && <span className="ok">aprobada</span>}
                  {!v.has_image && <span className="mute">sin imagen</span>}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* the three lanes */}
        <section className="rv2-lanes">
          {!readiness ? (
            <p className="rv2-msg">
              No se pudo leer el estado de aprobación de esta versión. No es que
              esté sin firmar — es que no lo sabemos, y decir lo primero sería
              inventar.
            </p>
          ) : (
            <>
              {lanes.map((d) => <Lane key={d} discipline={d} state={laneState(readiness, d)} />)}

              {summary && (
                <div className={`rv2-sum ${summary.tone}`}>
                  <Icon name={summary.tone === "ready" ? "check" : summary.tone === "blocked" ? "warn" : "clock"} />
                  <span>{summary.text}</span>
                </div>
              )}

              {/* Signing. The lane selector only offers what this person holds,
                  and when they hold none the screen says who to ask instead of
                  showing three buttons that will 403. */}
              <div className="rv2-sign">
                <span className="rv2-lbl">Tu firma</span>
                {!authenticated ? (
                  <p className="rv2-sign-no">
                    Estás sin sesión verificada. Una firma sin identidad no es una
                    aprobación — iniciá sesión desde el estado, arriba a la derecha.
                  </p>
                ) : !mine.length ? (
                  <p className="rv2-sign-no">
                    No tenés ninguna de las firmas que esta versión necesita
                    {(readiness.missing || []).length
                      ? `: falta ${(readiness.missing || []).map((d) => LANE_LABEL[d].toLowerCase()).join(" y ")}.`
                      : "."}
                  </p>
                ) : (
                  <>
                    {mine.length > 1 && (
                      <div className="rv2-lane-pick">
                        {mine.map((d) => (
                          <button key={d} className={d === lane ? "on" : ""} onClick={() => setLane(d)}>
                            {LANE_LABEL[d].replace("Revisión ", "")}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea className="rv2-input" rows={3} value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Motivo — obligatorio para pedir cambios, opcional al aprobar" />
                    <p className="rv2-sign-hint">
                      Firmás la {LANE_LABEL[lane || mine[0]].toLowerCase()} como {me?.name}.
                      Las otras firmas no se tocan.
                    </p>
                  </>
                )}
                {notice && <p className="rv2-notice">{notice}</p>}
              </div>

              {(readiness.history || []).length > 0 && (
                <details className="rv2-hist">
                  <summary>Historial completo · {(readiness.history || []).length} decisión(es)</summary>
                  <ul className="rv2-hist-list">
                    {[...(readiness.history || [])].reverse().map((h, i) => (
                      <li key={i} className={`rv2-hist-row ${h.decision}`}>
                        <b>{LANE_LABEL[h.discipline] || h.discipline}</b>
                        {" · "}{h.decision === "approve" ? "aprobó" : "pidió cambios"}
                        {" · "}{h.by || "sin nombre"}
                        {h.at ? <em className="rv2-when"> · {when(h.at)}</em> : null}
                        {h.reason && <span>{h.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      </div>
    </>,
  );
}
