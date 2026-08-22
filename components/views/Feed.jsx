"use client";
// Proposals — the decision feed, redesigned around what a designer actually
// reads: a REAL picture of the trend (og:image from the pages the engine
// cited), a verdict, and one reason. Numbers are evidence, not headline.
// Primary action: "Diseñar similar" — seeds the Design Studio with the
// proposal. Every decision is stored: the taste log.
import { useEffect, useMemo, useState } from "react";
import { buildCandidates, tasteSummary, REJECT_REASONS } from "@/lib/feed";
import { buildProductProposals } from "@/lib/proposals";
import { readScoped, writeScoped } from "@/lib/brandStore";
import { useBrandCatalog } from "@/lib/useBrandCatalog";
import { signalOf, STANCE_LABEL } from "@/lib/trust";
import { getCompetitorItems, getDecisions, getOpportunities, getSimilarDecisions, mintRecommendation, postDecision, previewStances } from "@/lib/api";
import { migrateLegacyAccepted, promoteToPipeline, setDecisionStatus, syncPending } from "@/lib/ledger";
import { stampHandoff } from "@/lib/handoff.mjs";
import { recordDecision } from "@/lib/decisionFlow.mjs";
import { useEngine } from "@/components/EngineProvider";
import { appFetch } from "@/lib/auth";

const LEAD_KEY = "atelier-lead-weeks";
const BRIEF_KEY = "atelier-design-brief";  // consumed by the Design Studio
const DECISIONS_KEY = "atelier-decisions"; // durable outbox — read by Results/Pipeline

// ⚠ NOTHING HERE IS BLUE. A verdict chip is a READING, not a button, and this
// screen's whole argument is that the thing you press is the thing that changes
// something. `explore` used to be a solid --cobalt badge sitting directly above
// three real buttons, which made the loudest element on the card the one you
// cannot click. Blue now belongs to "Diseñar" alone.
const TONE = {
  make: { col: "var(--surface)", bg: "var(--sage)" },
  explore: { col: "var(--editorial)", bg: "var(--ember-wash)" },
  watch: { col: "var(--warning)", bg: "var(--ochre-wash)" },
  hold: { col: "var(--danger)", bg: "var(--clay-wash)" },
};
const STAGE_CHIP = { Emerging: "var(--ink)", Accelerating: "var(--sage)", Peaking: "var(--warning)", Declining: "var(--ink-3)" };

// ⚠ THE STYLESHEET IS A MODULE-LEVEL CONSTANT, MOUNTED WITH
// `dangerouslySetInnerHTML` — never `<style>{CSS}</style>`. React escapes `>`
// and `"` when it serialises a text child on the server and the browser does
// not unescape inside <style>, so the client's text differs from the server's,
// hydration fails and React discards the whole tree on every single load
// (tests/styleHydration.test.mjs, written after five screens shipped that way).
//
// 2026-08-14 — RESTYLE onto `fd2-`. The old `fp2-`/`fpp-`/`trust-`/`bm2-` rules
// live in app/globals.css, which this change may not touch and which three
// other views also read, so the screen carries its own complete stylesheet and
// borrows no shared class. Image-forward: a proposal is a garment, so the
// photograph (or the honest placeholder that says why there isn't one) is a
// full-height column of the card rather than a thumbnail above the text. No
// datum, no handler and no disabled condition moved — only how they read, and
// the one claim that was never checked (see `mayQuoteQuantity`).
//
// 2026-08-14 — PROGRESSIVE DISCLOSURE. Owner review: the architecture reads
// right, the page does not — it measured ~5.5k px (11.5k on a one-column
// viewport, 1.228 px per card) and "necesita más agrupación progresiva". Two
// blocks were 63% of every card: the six-dimension table (405 px) and the
// trust record (374 px). Both now sit behind ONE disclosure per card whose
// label counts its own contents.
//
// ⚠ COLLAPSING IS NOT DROPPING, and on this screen that distinction is the
// product. What a reader must be able to refuse a card WITHOUT clicking
// anything stayed on the face of it: the stance, the engine's stance and its
// disagreement, `abstainReason`, the four gate chips with their `why`
// tooltips, "No sabemos", and the withheld-quantity sentence — which was
// actually PROMOTED out of the old "análisis completo" panel, because a refused
// card that says nothing about quantity until you expand it reads as a card
// with no view rather than one holding a number back.
const CSS = `
/* ============ Propuestas — fd2- ==================================
   Evidence quiet, imagery loud, exactly one blue thing per card. */

.fd2 { min-width: 0; }

/* ---- header ---- */
.fd2-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: var(--s5); margin: 0 0 var(--s5); flex-wrap: wrap;
}
.fd2-eyebrow {
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s3);
}
.fd2-title {
  font-family: var(--serif); font-weight: 500; font-size: 36px;
  line-height: 1.08; letter-spacing: -.015em; color: var(--ink);
  margin: 0 0 var(--s2);
}
.fd2-lede {
  font-size: 14px; line-height: 1.55; color: var(--ink-2);
  margin: 0; max-width: 62ch;
}

/* lead time: a real control, so it may be blue when it is on. */
.fd2-lead { display: flex; flex-direction: column; gap: 7px; flex: none; }
.fd2-lead-l {
  font-family: var(--d); font-size: 11px; letter-spacing: .06em;
  text-transform: uppercase; color: var(--ink-3);
}
.fd2-sw {
  display: inline-flex; gap: 2px; padding: 3px; background: var(--paper-2);
  border: 1px solid var(--line); border-radius: var(--r-sm);
}
.fd2-sw button {
  border: none; background: none; color: var(--ink-2); cursor: pointer;
  font-family: var(--d); font-size: 12px; padding: 5px 11px;
  border-radius: var(--r-xs); font-variant-numeric: tabular-nums;
}
.fd2-sw button:hover { color: var(--ink); }
.fd2-sw button.on { background: var(--cobalt); color: var(--surface); font-weight: 600; }

/* ---- taste log strip ---- */
.fd2-taste {
  display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap;
  padding: 11px var(--s4); margin: 0 0 var(--s5);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
}
.fd2-taste-t {
  font-family: var(--d); font-size: 11px; letter-spacing: .06em;
  text-transform: uppercase; color: var(--editorial); font-weight: 600;
}
.fd2-taste-empty { font-size: 13px; color: var(--ink-3); }
.fd2-taste-body { font-size: 13px; color: var(--ink-2); }
.fd2-taste-body b { color: var(--ink); font-variant-numeric: tabular-nums; }
.fd2-taste-src {
  margin-left: auto; font-family: var(--d); font-size: 11px;
  color: var(--ink-3); white-space: nowrap;
}
.fd2-pending { margin-left: var(--s2); color: var(--warning); font-weight: 700; }

/* ---- the card ---------------------------------------------------
   Image (or the honest placeholder) left, the reading right. */
.fd2-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: var(--s4); margin: 0 0 var(--s5);
}
.fd2-grid.radar { opacity: .92; }
.fd2-card {
  display: grid; grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow); overflow: hidden;
  margin: 0 0 var(--s4);
}
.fd2-grid .fd2-card { margin: 0; }
.fd2-card.hero { grid-template-columns: minmax(0, 340px) minmax(0, 1fr); }
.fd2-card.closed { opacity: .72; }

.fd2-fig {
  position: relative; background: var(--paper-2); min-height: 250px;
  border-right: 1px solid var(--line);
}
.fd2-fig.hero { min-height: 360px; }
/* A crawled garment is a product shot on a white sweep — it wants the
   surface behind it, not the paper. */
.fd2-fig.product { background: var(--surface); }
.fd2-fig img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; display: block;
}
/* No stock photograph stands in for a garment nobody crawled. */
.fd2-noimg {
  position: absolute; inset: 0; display: grid; place-content: center;
  justify-items: center; gap: 7px; padding: var(--s4); text-align: center;
}
.fd2-noimg span {
  font-family: var(--disp); font-size: 14px; font-weight: 700; line-height: 1.25;
  color: var(--ink); background: var(--surface); padding: 5px 10px;
  border-radius: var(--r-xs);
}
.fd2-noimg small {
  font-family: var(--d); font-size: 11px; color: var(--ink-2);
  background: var(--surface); padding: 3px 9px; border-radius: 99px;
}
.fd2-imgsrc {
  position: absolute; left: var(--s2); bottom: var(--s2); max-width: calc(100% - var(--s4));
  font-family: var(--d); font-size: 11px; color: var(--ink-2);
  background: var(--surface); border: 1px solid var(--hair);
  padding: 2px 8px; border-radius: 99px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.fd2-stage {
  position: absolute; left: var(--s2); top: var(--s2);
  font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  color: var(--surface); padding: 2px 8px; border-radius: 99px;
}
.fd2-gap {
  position: absolute; right: var(--s2); top: var(--s2);
  font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  color: var(--editorial); background: var(--ember-wash);
  padding: 2px 8px; border-radius: 99px;
}

.fd2-body {
  padding: var(--s4); min-width: 0; display: flex; flex-direction: column;
  gap: 10px; align-items: stretch;
}
.fd2-verdictrow { display: flex; gap: var(--s2); flex-wrap: wrap; }
.fd2-verdict {
  font-family: var(--d); font-size: 11px; font-weight: 600; letter-spacing: .05em;
  text-transform: uppercase; padding: 4px 10px; border-radius: 99px;
}
.fd2-name {
  font-family: var(--disp); font-size: 16px; font-weight: 700; line-height: 1.25;
  letter-spacing: -.01em; color: var(--ink); margin: 0;
}
.fd2-summary { font-size: 13.5px; line-height: 1.55; color: var(--ink-2); margin: 0; }
.fd2-why { font-size: 13.5px; line-height: 1.55; color: var(--ink-2); margin: 0; }
.fd2-why b { color: var(--ink); font-weight: 600; }

/* ---- the six dimensions ---- */
.fd2-dims {
  width: 100%; display: grid; gap: 1px; background: var(--hair);
  border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden;
}
.fd2-dim {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px var(--s2);
  background: var(--surface); padding: 7px 10px;
}
.fd2-dim-k {
  font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  color: var(--ink-3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.fd2-sig {
  font-style: normal; font-family: var(--d); font-size: 11px;
  padding: 0 6px; border-radius: 99px; background: var(--paper-2); color: var(--ink-3);
}
.fd2-sig.supply { background: var(--paper-2); color: var(--ink-2); }
.fd2-sig.attention { background: var(--ochre-wash); color: var(--warning); }
.fd2-sig.demand { background: var(--ember-wash); color: var(--editorial); }
.fd2-sig.satisfaction { background: var(--ochre-wash); color: var(--warning); }
.fd2-sig.opportunity { background: var(--ember-wash); color: var(--editorial); }
.fd2-sig.meta { background: var(--paper-2); color: var(--ink-3); }
.fd2-dim-lv {
  font-family: var(--d); font-size: 12px; font-weight: 600; text-align: right;
  color: var(--ink-2); white-space: nowrap;
}
.fd2-dim-lv.hi { color: var(--positive); }
.fd2-dim-lv.mid { color: var(--warning); }
.fd2-dim-lv.lo { color: var(--danger); }
.fd2-dim-lv.na { color: var(--ink-3); }
.fd2-dim-n { grid-column: 1 / -1; font-size: 12px; line-height: 1.45; color: var(--ink-2); }
.fd2-lineage {
  grid-column: 1 / -1; background: var(--surface); padding: 7px 10px;
  font-family: var(--d); font-size: 11px; color: var(--ink-3); line-height: 1.5;
}

/* ---- trust: the stance, the engine's stance, the gates ---- */
.fd2-trust {
  width: 100%; display: flex; flex-direction: column; gap: var(--s2);
  padding: var(--s3); background: var(--paper);
  border: 1px solid var(--line); border-radius: var(--r-sm);
}
.fd2-stance {
  font-family: var(--d); font-size: 11px; font-weight: 600; letter-spacing: .05em;
  text-transform: uppercase; color: var(--ink-2);
}
.fd2-stance.make { color: var(--positive); }
.fd2-stance.explore { color: var(--editorial); }
.fd2-stance.watch { color: var(--warning); }
.fd2-server {
  border-left: 2px solid var(--hair-2); padding-left: 10px;
  display: flex; flex-direction: column; gap: 3px;
}
.fd2-server.make { border-left-color: var(--positive); }
.fd2-server.explore { border-left-color: var(--editorial); }
.fd2-server.watch { border-left-color: var(--warning); }
.fd2-server-head { font-size: 12px; color: var(--ink); }
.fd2-server-head b { font-weight: 700; }
.fd2-server-basis { font-family: var(--d); font-size: 11px; line-height: 1.55; color: var(--ink-3); }
.fd2-server-diff {
  font-size: 12px; line-height: 1.5; color: var(--warning);
  background: var(--ochre-wash); border-radius: var(--r-xs); padding: 6px 8px;
}
.fd2-abstain { font-size: 12px; line-height: 1.5; color: var(--ink-2); }
.fd2-gates { display: flex; flex-wrap: wrap; gap: var(--s1); }
.fd2-gate {
  font-family: var(--d); font-size: 11px; padding: 2px 8px; border-radius: 99px;
  border: 1px solid var(--hair-2); background: var(--surface); color: var(--ink-3);
  cursor: help;
}
.fd2-gate.ok { color: var(--positive); border-color: var(--positive); }
.fd2-gate.no { color: var(--danger); border-color: var(--hair-2); }
.fd2-rows { display: flex; flex-direction: column; gap: 5px; }

/* Evidence rows: 12px reading, 11px mono label. Used by the trust record,
   the full analysis and the memory row alike, so one row is one shape. */
.fd2-row {
  display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: var(--s2);
  font-size: 12px; line-height: 1.5; color: var(--ink-2);
}
.fd2-row b {
  font-family: var(--d); font-size: 11px; font-weight: 500; letter-spacing: .04em;
  text-transform: uppercase; color: var(--ink-3);
}
.fd2-row.contra b { color: var(--danger); }
.fd2-k {
  font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  text-transform: uppercase; color: var(--ink-3);
}
/* A withheld quantity is not a greyed-out number — it is a sentence saying
   nobody has earned one yet, and it reads as the absence it is. */
.fd2-noqty { color: var(--ink-3); font-style: italic; }

/* ---- the one disclosure per card ---------------------------------
   ⚠ ONE per card, and QUIET. The old toggle was uppercase --cobalt, and with
   eight cards on screen that is eight blue calls to action competing with the
   one button that actually changes something. It is pressable, so blue would
   be *allowed* — it is just wrong at this frequency. 12.5px ink-2 with a
   chevron reads as "there is more here" without asking to be clicked.
   The label always names what is inside and how many rows: never a bare "más",
   because a reader has to know whether opening it is worth the scroll. */
.fd2-disc {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; padding: 2px 0; cursor: pointer;
  font-family: var(--d); font-size: 12.5px; color: var(--ink-2); text-align: left;
}
.fd2-disc:hover { color: var(--ink); }
.fd2-disc:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 3px; }
.fd2-chev {
  display: inline-block; font-size: 11px; line-height: 1; color: var(--ink-3);
  transition: transform .15s ease;
}
.fd2-chev.open { transform: rotate(180deg); }
/* The disclosure's contents, stacked: the dimensions table keeps its own box,
   the rows get theirs. */
.fd2-drawer { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.fd2-analysis, .fd2-evidence {
  width: 100%; display: flex; flex-direction: column; gap: 7px;
  padding: var(--s3); background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--r-sm);
}
.fd2-ev-row { font-size: 12px; line-height: 1.5; color: var(--ink-2); }
.fd2-ev-row b {
  font-family: var(--d); font-size: 11px; font-weight: 500; letter-spacing: .04em;
  text-transform: uppercase; color: var(--ink-3);
}
.fd2-ev-row.noqty { color: var(--ink-3); font-style: italic; }
.fd2-ev-link {
  font-family: var(--d); font-size: 11px; color: var(--cobalt);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fd2-ev-link:hover { text-decoration: underline; }

/* ---- colourways ---- */
.fd2-colorways { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.fd2-cw-l {
  font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  text-transform: uppercase; color: var(--ink-3);
}
.fd2-cw {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px;
  color: var(--ink-2); cursor: help;
}
.fd2-cw i {
  width: 14px; height: 14px; border-radius: 99px; display: block;
  border: 1px solid var(--hair-2);
}
.fd2-cw em { font-style: normal; color: var(--ink-3); }

/* ---- actions. ONE solid blue thing; the rest are quiet outlines. ---- */
.fd2-acts { display: flex; gap: var(--s2); flex-wrap: wrap; margin-top: auto; padding-top: var(--s1); }
.fd2-design {
  background: var(--cobalt); color: var(--surface); border: 1px solid var(--cobalt);
  border-radius: var(--r-sm); padding: 9px 14px; font-size: 13px; font-weight: 600;
  cursor: pointer;
}
.fd2-design:hover { filter: brightness(.94); }
.fd2-design:disabled { opacity: .4; cursor: not-allowed; filter: none; }
.fd2-save, .fd2-pass {
  background: var(--surface); color: var(--ink); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 9px 14px; font-size: 13px; cursor: pointer;
}
.fd2-save:hover, .fd2-pass:hover { border-color: var(--hair-2); }
.fd2-pass { color: var(--ink-2); }
.fd2-reasons { display: flex; gap: var(--s1); flex-wrap: wrap; }
.fd2-reason {
  background: var(--surface); color: var(--ink-2); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 6px 11px; font-size: 12px; cursor: pointer;
}
.fd2-reason:hover { border-color: var(--danger); color: var(--danger); }
.fd2-reason.cancel { color: var(--ink-3); border-style: dashed; }
.fd2-reason.cancel:hover { color: var(--ink); border-color: var(--hair-2); }

/* ---- honest states ---- */
.fd2-empty {
  display: grid; justify-items: center; gap: 7px; text-align: center;
  padding: var(--s7) var(--s5); margin-top: var(--s5);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
}
.fd2-empty-ic {
  width: 34px; height: 34px; display: grid; place-items: center;
  border-radius: 99px; background: var(--paper-2); color: var(--positive);
  font-size: 15px;
}
.fd2-empty h4 {
  font-family: var(--serif); font-weight: 500; font-size: 22px;
  line-height: 1.2; color: var(--ink); margin: 5px 0 0;
}
.fd2-empty p { font-size: 13px; line-height: 1.55; color: var(--ink-2); margin: 0; max-width: 52ch; }
.fd2-btn {
  margin-top: var(--s2); background: var(--surface); color: var(--cobalt);
  border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.fd2-btn:hover { border-color: var(--cobalt); }
.fd2-none {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--s2);
  padding: var(--s4); margin: 0 0 var(--s5);
  background: var(--surface); border: 1px dashed var(--hair-2);
  border-radius: var(--r); font-size: 13px; line-height: 1.55; color: var(--ink-2);
}
.fd2-none b { display: block; font-family: var(--disp); font-size: 15px; color: var(--ink); }
.fd2-radar-h {
  font-family: var(--d); font-size: 11px; letter-spacing: .05em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.6;
  padding: 0 0 var(--s3); margin: var(--s5) 0 var(--s3);
  border-bottom: 1px solid var(--line);
}

.fd2-toast {
  position: fixed; left: 50%; bottom: var(--s5); transform: translate(-50%, 14px);
  background: var(--ink); color: var(--surface); font-size: 13px;
  padding: 10px var(--s4); border-radius: 99px; box-shadow: var(--shadow);
  opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s; z-index: 60;
}
.fd2-toast.show { opacity: 1; transform: translate(-50%, 0); }

@media (max-width: 900px) {
  .fd2-card, .fd2-card.hero { grid-template-columns: 1fr; }
  .fd2-fig { border-right: none; border-bottom: 1px solid var(--line); min-height: 220px; }
  .fd2-title { font-size: 30px; }
  .fd2-taste-src { margin-left: 0; }
}
`;

// Six-dimension readout (spec 2026-07-19): no absolute certainty on cards.
const LV_TONE = {
  alta: "hi", alto: "hi", "en ventana": "hi",
  media: "mid", medio: "mid", estimado: "mid",
  baja: "lo", bajo: "lo", limitada: "lo", fuera: "lo",
};
function Dims({ dims, lineage }) {
  return (
    <div className="fd2-dims">
      {dims.map((d) => {
        const sig = signalOf(d.k); // §5 — each dim declares what it measures
        return (
          <div className="fd2-dim" key={d.k}>
            <span className="fd2-dim-k">{d.k}
              <i className={`fd2-sig ${sig.tone}`} title={`Mide ${sig.label} — ${sig.help}`}>{sig.label}</i>
            </span>
            <span className={`fd2-dim-lv ${LV_TONE[d.level] || "na"}`}>{d.level}</span>
            <span className="fd2-dim-n">{d.note}</span>
          </div>
        );
      })}
      {lineage && <div className="fd2-lineage">{lineage}</div>}
    </div>
  );
}

// The ENGINE's reading of this candidate, on ITS evidence, shown BEFORE anyone
// clicks (owner audit 2026-07-24, third pass). Until this existed the server's
// verdict only arrived after the decision, so a card could invite an accept the
// engine was always going to refuse — and now that accepts fail closed, that
// would have been a surprise at the worst moment.
//
// Advisory by construction: it comes from /recommendations/preview, which
// stores nothing. The decision still cites a freshly minted, frozen judgement.
function serverBasis(s) {
  const parts = [];
  const n = (s.adopters || []).length;
  parts.push(n ? `${n} ${n === 1 ? "competidor" : "competidores"} con esta categoría`
                : "sin adopción observada en tu crawl");
  // A learned fit and a model estimate are not the same kind of claim, so the
  // card names which one it is holding.
  parts.push(!s.fit_real ? "sin gusto calibrado ni corrida que cubra este candidato"
    : s.fit_source === "learned"
      ? `gusto propio del equipo · ${Math.round(s.fit)}/100`
      : `estimación del motor · ${Math.round(s.fit)}/100`);
  parts.push(s.freshness_days == null ? "sin datos propios"
                                      : `evidencia de hace ${s.freshness_days} días`);
  return parts.join(" · ");
}

// ⚠ THE VERDICT STAYS ON THE FACE OF THE CARD; ONLY ITS WORKING GOES AWAY.
// The engine's stance is the one that governs, so it is never behind a
// disclosure — and neither is the sentence that fires when the card and the
// engine disagree, which is the whole reason the engine's line is here.
// What moved (2026-08-14, "excesivamente larga") is `serverBasis`: three
// clauses of arithmetic that justify the stance rather than state it. It is
// rendered as the first row of the drawer, verbatim.
function ServerStance({ server, localStance }) {
  if (!server) return null;
  const s = STANCE_LABEL[server.stance] || STANCE_LABEL.insufficient;
  const disagrees = localStance && server.stance !== localStance;
  return (
    <div className={`fd2-server ${s.tone}`}>
      <div className="fd2-server-head"><b>El motor</b> · {s.text}</div>
      {disagrees && (
        <div className="fd2-server-diff">
          Esta tarjeta lee “{(STANCE_LABEL[localStance] || {}).text || localStance}”
          con datos del navegador. Manda el motor: es el que decide qué entra en producción.
        </div>
      )}
    </div>
  );
}

// The stance that GOVERNS — the engine's when it has spoken, the local reading
// only until then. Every "can this become a bet?" question reads this, so the
// button never promises what the server will refuse.
const governingStance = (p) => p.server?.stance || p.trust?.stance;

// ⚠ A QUANTITY IS A COMMERCIAL COMMITMENT AND IT MAY NOT OUTRUN THE GATES.
// `qty` is `testQuantity(fit, stage)` — computed from a LEXICAL fit that the
// same object flags `fitReal: false` — and both readouts printed it with no
// check at all. So a card headed "Dirección — no recomendable aún", showing
// ✕ marca and ✕ comercial, still told the designer to buy 40–60 units.
//
// Everything else on this exact flow already refuses to say that: the save
// button's own label and tooltip ("se guarda como investigación, sin apuesta ni
// cantidad de test"), `designProduct`, which puts `qty` in the Studio brief only
// when the decision was RECORDED as an accept, and the engine, which records a
// failed-gate accept as `watch` with no quantity. The reading on the card was
// the last surface still promising it — and it is the one the designer reads
// BEFORE deciding, which makes it the worst place to be wrong.
//
// Gated on the SAME stance the button reads, so the card and the button can
// never disagree: the engine's verdict once it has spoken (it governs — "manda
// el motor"), the locally computed gates until then.
const mayQuoteQuantity = (c) =>
  (c.server ? c.server.stance : c.trust?.stance ?? (c.recommendable ? "recommend" : null)) === "recommend";

// ⚠ AND WHEN IT MAY NOT, SAY SO — a row that silently disappears reads as a
// screen with nothing to add, not as one withholding a number on purpose.
// "Refused" and "never evaluated" are different answers and get different
// sentences: a trend card carries no gates at all, and telling someone it
// "failed" them would be a second false claim replacing the first.
function noQuantityReason(c) {
  if (c.server) {
    return "Sin cantidad sugerida — el motor no lo recomienda con su propia evidencia. "
      + "Esto se guarda como investigación, no como apuesta.";
  }
  if (c.trust || c.recommendable != null) {
    return "Sin cantidad sugerida — no pasó las compuertas, así que esto se guarda "
      + "como investigación y no como apuesta.";
  }
  return "Sin cantidad sugerida — todavía no hay compuertas evaluadas sobre esta "
    + "tendencia, y una cifra acá sería una apuesta que nadie respaldó.";
}

// §8 stance banner + §11 trust record. When a gate is missing the card says so
// instead of pretending to recommend.
//
// ⚠ SPLIT IN TWO, NOT SHORTENED (owner review 2026-08-14 — the page measured
// ~5.5k px and needed "más agrupación progresiva"). The half that says WHAT WE
// CONCLUDED AND WHAT WE DO NOT KNOW never collapses:
//   · the stance line ("Dirección — no recomendable aún")
//   · the engine's stance, and its disagreement with this card
//   · `abstainReason` — a refusal to judge is the answer, not a footnote
//   · the four gate chips, each keeping its `title={g.why}`
//   · "No sabemos" — the honest-absence row this product exists to print
// The half that is the WORKING behind it — what contradicts, how confident, how
// success will be measured — goes in the drawer. Hiding weak evidence would be
// the one thing this screen may never do; hiding the arithmetic under a label
// that counts it is not that.
function TrustHead({ p }) {
  const t = p.trust;
  if (!t) return null;
  const stance = STANCE_LABEL[t.stance] || STANCE_LABEL.insufficient;
  return (
    <div className="fd2-trust">
      <div className={`fd2-stance ${stance.tone}`}>{stance.text}</div>
      <ServerStance server={p.server} localStance={t.stance} />
      {t.abstainReason && <div className="fd2-abstain">{t.abstainReason}</div>}
      <div className="fd2-gates">
        {Object.entries(p.gates).map(([k, g]) => (
          <span key={k} className={`fd2-gate ${g.pass ? "ok" : "no"}`}
            title={g.why}>{g.pass ? "✓" : "✕"} {GATE_LABEL[k]}</span>
        ))}
      </div>
      <div className="fd2-rows">
        <div className="fd2-row"><b>No sabemos</b> {t.unknowns[0]}</div>
      </div>
    </div>
  );
}

// The trust record's detail — inside the drawer, counted by its label.
function TrustDetail({ p }) {
  const t = p.trust;
  if (!t) return null;
  return (
    <>
      {p.server && <div className="fd2-row"><b>Base del motor</b> {serverBasis(p.server)}</div>}
      {t.contradicting && <div className="fd2-row contra"><b>En contra</b> {t.contradicting}</div>}
      <div className="fd2-row"><b>Confianza</b> {t.confidence} · {t.dataCoverage}</div>
      {t.successMetric && <div className="fd2-row"><b>Éxito</b> {t.successMetric}</div>}
    </>
  );
}
// How many rows `TrustDetail` will actually print — the label may not claim
// more than the drawer contains.
const trustDetailCount = (p) =>
  !p.trust ? 0 : 1 + (p.server ? 1 : 0) + (p.trust.contradicting ? 1 : 0)
    + (p.trust.successMetric ? 1 : 0);
const GATE_LABEL = { market: "evidencia", brand: "marca", feasible: "comercial", confident: "confianza" };

// The accepted-proposals store (read by Pipeline) is written ONLY through
// lib/ledger.js `promoteToPipeline` now — this view used to write it in three
// places, each with its own copy of the "did the server confirm?" guard.

// Durable decision outbox — the SAME store Results/Decisions reads. Every
// decision (accept AND reject) is written here so it survives reload and reaches
// the learning ledger. Before, offline decisions lived only in React state:
// accepts vanished from Results, rejections disappeared entirely on reload.
function loadLocalDecisions(brandId) {
  return readScoped(DECISIONS_KEY, brandId, []) || [];
}
function appendLocalDecision(rec, brandId) {
  try {
    writeScoped(DECISIONS_KEY, brandId, [rec, ...loadLocalDecisions(brandId)].slice(0, 300));
  } catch { /* storage full/blocked */ }
}

// Real image for a candidate: try its evidence URLs through /api/og until one
// yields the page's own og:image. No stock-photo fallback — an honest
// palette panel instead.
function useRealImage(urls) {
  const [img, setImg] = useState(null);
  const keyList = (urls || []).join("|");
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const u of urls || []) {
        try {
          const r = await appFetch(`/api/og?url=${encodeURIComponent(u)}`);
          const { image } = await r.json();
          if (dead) return;
          if (image) { setImg(image); return; }
        } catch { /* next url */ }
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList]);
  return img;
}

function CardFigure({ c, hero }) {
  const img = useRealImage(c.evidence.urls);
  return (
    <div className={`fd2-fig${hero ? " hero" : ""}`}>
      {img ? (
        <>
          <img src={img} alt={c.trend} loading="lazy" />
          <span className="fd2-imgsrc">foto: {c.evidence.sources[0] || "fuente citada"}</span>
        </>
      ) : (
        <div className="fd2-noimg" style={{ background: `linear-gradient(135deg, ${c.colorways[0]?.hex} 0%, ${c.colorways[1]?.hex || c.colorways[0]?.hex} 100%)` }}>
          <span>{c.trend}</span>
          <small>{c.evidence.urls.length ? "cargando imagen real…" : "sin imagen citable en esta corrida"}</small>
        </div>
      )}
      <span className="fd2-stage" style={{ background: STAGE_CHIP[c.stage] }}>{c.stage}</span>
      {c.gap && <span className="fd2-gap">hueco en tu catálogo</span>}
    </div>
  );
}


// Memory at review time (owner requirement #5, surfaced 2026-07-22): the most
// similar PAST decision with its automatic outcome, shown while the designer
// looks at a new product. Honestly absent when nothing genuinely overlaps.
function MemoriaRow({ title }) {
  const engine = useEngine();
  const [items, setItems] = useState(null);
  useEffect(() => {
    let dead = false;
    if (engine.status === "live" && engine.brandId && title) {
      getSimilarDecisions(engine.brandId, title).then((r) => { if (!dead) setItems(r); });
    } else setItems([]);
    return () => { dead = true; };
  }, [engine.status, engine.brandId, title]);
  if (!items?.length) return null;
  const s = items[0];
  const d = s.decision;
  const v = s.outcome?.verdict;
  const verdictEs = { funciono: "funcionó", no_funciono: "no funcionó",
                      en_mercado: "todavía en mercado" }[v];
  return (
    <div className="fd2-row"><span className="fd2-k">Memoria</span>
      <span>
        ya decidiste algo parecido: <b>{d.candidate?.title || d.candidate_key}</b>
        {" "}({d.decision === "accept" ? "aceptada" : "pasada"}
        {d.reason ? ` — ${d.reason}` : ""})
        {verdictEs && <> → <b>{verdictEs}</b></>}
        {s.outcome?.basis && <> · {s.outcome.basis}</>}
        {" "}· coincide en: {s.shared_tokens.join(", ")}
      </span>
    </div>
  );
}

// A product proposal: a real garment (crawled today, later AI-generated) the
// brand could produce — with the full analysis behind the verdict.
function ProductCard({ p, hero, onDecide, onDesign }) {
  const [rejecting, setRejecting] = useState(false);
  const [open, setOpen] = useState(hero);
  const tone = TONE[p.verdict.tone];
  const it = p.item;
  // What the disclosure label promises. Counted from what will actually
  // render, never a round number: the six dimensions, the lineage note, the
  // trust detail, the analysis rows and the link to the original. `MemoriaRow`
  // is excluded because it answers over the network and honestly renders
  // nothing when no past decision overlaps — a count cannot promise it.
  const drawer = p.dims.length + (p.lineage ? 1 : 0) + trustDetailCount(p)
    + (p.fitWords.length > 0 ? 1 : 0) + 1 + (p.trend ? 1 : 0)
    + (p.price ? 1 : 0) + (p.adapt.note ? 1 : 0) + 1;

  return (
    <article className={`fd2-card${hero ? " hero" : ""}${p.window.ok ? "" : " closed"}`}>
      <div className={`fd2-fig product${hero ? " hero" : ""}`}>
        {it.image_url
          ? <img src={it.image_url} alt={it.title} loading="lazy" />
          : <div className="fd2-noimg" style={{ background: "var(--paper-2)" }}><span>{it.title}</span></div>}
        <span className="fd2-imgsrc">ref: {it.competitor} · {it.currency} {it.price}</span>
        {p.trend && <span className="fd2-stage" style={{ background: STAGE_CHIP[p.stage] }}>{p.trend.name}</span>}
        {p.overlap.kind === "gap" && <span className="fd2-gap">hueco en tu línea</span>}
      </div>
      <div className="fd2-body">
        <div className="fd2-verdictrow">
          <span className="fd2-verdict" style={{ color: tone.col, background: tone.bg }}>{p.verdict.label}</span>
        </div>

        <h3 className="fd2-name">{it.title}</h3>
        <TrustHead p={p} />

        {/* ⚠ THE QUANTITY LINE IS NOT IN THE DRAWER. It used to be the last row
            of "análisis completo", which meant a refused card said nothing at
            all about quantity until you expanded it — and silence there reads
            as "no opinion", not as "withheld on purpose". `mayQuoteQuantity`
            decides which sentence; both are on the face of the card. */}
        <div className="fd2-rows">
          <div className="fd2-row"><span className="fd2-k">Test</span>
            {mayQuoteQuantity(p)
              ? <span><b>{p.qty.range}</b> — {p.qty.why}. Lectura de sell-through a los 14 días, después escalás o cortás.</span>
              : <span className="fd2-noqty">{noQuantityReason(p)}</span>}
          </div>
        </div>

        <button className="fd2-disc" type="button" aria-expanded={open}
          onClick={() => setOpen((o) => !o)}>
          <span className={`fd2-chev${open ? " open" : ""}`}>▾</span>
          {open ? "Ocultar evidencia y análisis" : `Evidencia y análisis (${drawer})`}
        </button>
        {open && (
          <div className="fd2-drawer">
            <Dims dims={p.dims} lineage={p.lineage} />
            <div className="fd2-analysis">
              <TrustDetail p={p} />
              {p.fitWords.length > 0 && <div className="fd2-row"><span className="fd2-k">ADN</span>
                <span>habla tu idioma: {p.fitWords.slice(0, 5).join(", ")}</span></div>}
              <div className="fd2-row"><span className="fd2-k">Tu catálogo</span><span>{p.overlap.note}</span></div>
              {p.trend && <div className="fd2-row"><span className="fd2-k">Tendencia</span>
                <span>{p.trend.name} · {p.stage}{p.trend.velocity != null && (
                  p.trend.velocityBasis === "published"
                    ? <> · cambio vs período previo {p.trend.velocity}</>
                    : <> · recencia de evidencia {p.trend.velocity}</>
                )}</span></div>}
              {p.price && <div className="fd2-row"><span className="fd2-k">Precio</span><span>{p.price.note}</span></div>}
              {p.adapt.note && <div className="fd2-row"><span className="fd2-k">Hacela tuya</span><span>{p.adapt.note}</span></div>}
              <MemoriaRow title={it.title} />
              <a className="fd2-ev-link" href={it.url} target="_blank" rel="noreferrer">ver original en {it.competitor} →</a>
            </div>
          </div>
        )}

        {rejecting ? (
          <div className="fd2-reasons">
            {REJECT_REASONS.map((r) => (
              <button key={r.code} className="fd2-reason" title={r.learns}
                onClick={() => onDecide(p, "reject", r)}>{r.label}</button>
            ))}
            <button className="fd2-reason cancel" onClick={() => setRejecting(false)}>cancelar</button>
          </div>
        ) : (
          <div className="fd2-acts">
            <button className="fd2-design" disabled={!p.window.ok} onClick={() => onDesign(p)}>✦ Diseñar versión propia →</button>
            {/* A card that hasn't cleared the gates can be kept as research, but
                the label must never imply an operational commitment. */}
            <button className="fd2-save" onClick={() => onDecide(p, "accept")}
              title={governingStance(p) === "recommend" ? undefined
                : p.server ? "El motor no lo recomienda con su propia evidencia: se guarda como investigación, sin apuesta ni cantidad de test"
                : "No pasó las compuertas: se guarda como investigación, no genera una apuesta ni cantidad de test"}>
              {governingStance(p) === "recommend" ? "Guardar" : "Guardar como investigación"}
            </button>
            <button className="fd2-pass" onClick={() => setRejecting(true)}>Pasá</button>
          </div>
        )}
      </div>
    </article>
  );
}

function Card({ c, hero, onDecide, onDesign }) {
  const [rejecting, setRejecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tone = TONE[c.verdict.tone];
  // Same contract as the product card's label: the six dimensions, the lineage
  // note, the palette, the signals/differentiation row, the sources line and
  // one row per cited URL.
  const drawer = c.dims.length + (c.lineage ? 1 : 0) + c.colorways.length + 1
    + (c.evidence.sources.length > 0 ? 1 : 0) + c.evidence.urls.length;

  return (
    <article className={`fd2-card${hero ? " hero" : ""}${c.window.ok ? "" : " closed"}`}>
      <CardFigure c={c} hero={hero} />
      <div className="fd2-body">
        <div className="fd2-verdictrow">
          <span className="fd2-verdict" style={{ color: tone.col, background: tone.bg }}>{c.verdict.label}</span>
        </div>

        <h3 className="fd2-name">{c.trend}</h3>
        {c.summary && <p className="fd2-summary">{c.summary}</p>}
        {c.rationale && <p className="fd2-why"><b>Por qué para vos:</b> {c.rationale.replace(/⚠.*$/, "").trim()}</p>}

        {/* Same rule as the product card: a suggested buy is quoted only where
            something judged it. A trend candidate carries no gates at all, so
            it says that rather than borrowing a number's authority — and it
            says it here, without being expanded, because a card that goes
            quiet about quantity is a card that looks like it has no view. */}
        <div className="fd2-rows">
          {mayQuoteQuantity(c)
            ? <div className="fd2-row"><b>Test sugerido</b> {c.qty.range} — {c.qty.why}. Lectura de sell-through a los 14 días.</div>
            : <div className="fd2-row"><b>Test sugerido</b> <span className="fd2-noqty">{noQuantityReason(c)}</span></div>}
        </div>

        <button className="fd2-disc" type="button" aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}>
          <span className={`fd2-chev${expanded ? " open" : ""}`}>▾</span>
          {expanded ? "Ocultar evidencia" : `Evidencia (${drawer}) · ${c.evidence.signals} señales`}
        </button>
        {expanded && (
          <div className="fd2-drawer">
            <Dims dims={c.dims} lineage={c.lineage} />
            <div className="fd2-evidence">
              <div className="fd2-colorways">
                <span className="fd2-cw-l">En tu paleta:</span>
                {c.colorways.map((cw) => (
                  <span key={cw.hex} className="fd2-cw" title={`${cw.name} · differentiation ${cw.differentiation} (${cw.band})`}>
                    <i style={{ background: cw.hex }} />
                    {cw.name}{cw.role === "whitespace" && <em> · espacio abierto</em>}
                  </span>
                ))}
              </div>
              <div className="fd2-ev-row"><b>Señales</b> {c.evidence.signals} · <b>Recencia de evidencia</b> {c.momentum} · <b>Differentiation</b> {c.differentiation}</div>
              {c.evidence.sources.length > 0 && <div className="fd2-ev-row"><b>Fuentes</b> {c.evidence.sources.join(" · ")}</div>}
              {c.evidence.urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="fd2-ev-link">{u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 64)}</a>
              ))}
            </div>
          </div>
        )}

        {rejecting ? (
          <div className="fd2-reasons">
            {REJECT_REASONS.map((r) => (
              <button key={r.code} className="fd2-reason" title={r.learns}
                onClick={() => onDecide(c, "reject", r)}>{r.label}</button>
            ))}
            <button className="fd2-reason cancel" onClick={() => setRejecting(false)}>cancelar</button>
          </div>
        ) : (
          <div className="fd2-acts">
            <button className="fd2-design" disabled={!c.window.ok} onClick={() => onDesign(c)}
              title={c.window.ok ? "Aceptar y abrir el Studio con esta propuesta" : "Ventana cerrada para tu lead time"}>
              ✦ Diseñar similar →
            </button>
            <button className="fd2-save" onClick={() => onDecide(c, "accept")} title="Aceptar y guardar en el pipeline">Guardar</button>
            <button className="fd2-pass" onClick={() => setRejecting(true)}>Pasá</button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function Feed({ onNavigate }) {
  const engine = useEngine();
  const live = engine.status === "live";
  const [leadWeeks, setLeadWeeks] = useState(8);
  const [decisions, setDecisions] = useState([]);
  const [decided, setDecided] = useState(() => new Set());
  const [toast, setToast] = useState("");

  // The pipeline card — the ONE operational object a decision can create, and
  // what the trust gates ultimately protect. Created from a server-confirmed
  // accept here and in the outbox (lib/ledger.js), when a decision queued
  // offline is finally judged; `promoted` on the ledger row keeps it
  // exactly-once. Defined before the effects because the retry loop needs it.
  const promote = (rec) => promoteToPipeline(rec, engine.brandId);

  // Reads engine.brandId for the brand-scoped local ledger, so it must depend
  // on it — Shell's remount key covers this today, but tenant isolation should
  // not rest on a key prop three components away (owner audit, 2026-07-24).
  useEffect(() => {
    const saved = Number(localStorage.getItem(LEAD_KEY));
    if (saved) setLeadWeeks(saved);
    // Backfill legacy accepts (atelier-accepted) into the canonical ledger so
    // Proposals/Results/Review all agree, then seed from it. Offline decisions —
    // accepts AND rejections — persist across reloads, not just React state.
    migrateLegacyAccepted(engine.brandId);
    const local = loadLocalDecisions(engine.brandId).filter((x) => x.candidate?.kind !== "outcome");
    if (local.length) {
      setDecisions(local);
      setDecided(new Set(local.map((x) => x.candidate_key)));
    }
  }, [engine.brandId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (!live || !engine.brandId) return;
    getDecisions(engine.brandId).then((d) => {
      // Outcome closures live on the same append-only log (candidate.kind ===
      // "outcome", written by the Decisions view) — they're results, not new
      // decisions, so they must not inflate the taste summary or block cards.
      const base = d.filter((x) => x.candidate?.kind !== "outcome");
      // Union with the local outbox so decisions not yet synced to the server
      // (offline accepts/rejects) don't disappear when a live load returns.
      const seen = new Set(base.map((x) => `${x.candidate_key}|${x.decision}`));
      const localOnly = loadLocalDecisions(engine.brandId)
        .filter((x) => x.candidate?.kind !== "outcome" && !seen.has(`${x.candidate_key}|${x.decision}`));
      const merged = [...base, ...localOnly];
      setDecisions(merged);
      setDecided(new Set(merged.map((x) => x.candidate_key)));
    });
    getCompetitorItems(engine.brandId).then((p) => setProducts(p || [])); // null = failure; feed's empty state isn't a false conclusion
    // Real outbox: retry every unsynced decision now and whenever the browser
    // comes back online — reusing each record's id as the idempotency key.
    const patchStatus = (id, patch) =>
      setDecisions((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    // mintFn: a decision queued offline has no server judgement yet, and we are
    // online now — so it is minted here rather than posted on client evidence.
    // promote: an offline accept has no other moment to earn its pipeline card.
    const sync = () => syncPending(engine.brandId, postDecision, patchStatus,
                                   { mintFn: mintRecommendation, promote });
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [live, engine.brandId]);

  // The ACTIVE brand's own catalog — the brand side of every overlap/gap read.
  const brandCatalog = useBrandCatalog();

  // The engine's catalogue gaps — the SAME rows Oportunidades renders, so one
  // market gap cannot read two ways depending on the screen you stand on
  // (owner review 2026-08-11). Null until it answers, and null on failure: the
  // gap dimension then falls back to the catalogue-key heuristic rather than to
  // a browser-computed reading, because there no longer is one.
  const [opportunities, setOpportunities] = useState(null);
  useEffect(() => {
    let dead = false;
    if (!engine.brandId) { setOpportunities(null); return () => {}; }
    getOpportunities(engine.brandId).then((body) => { if (!dead) setOpportunities(body); });
    return () => { dead = true; };
  }, [engine.brandId]);

  const candidates = useMemo(
    () => buildCandidates({ trends: live ? engine.trends : null, dna: live ? engine.dna : null, leadWeeks, items: products, catalog: brandCatalog.products, opportunities, generatedAt: live ? engine.generatedAt : null }),
    [live, engine.trends, engine.dna, engine.generatedAt, leadWeeks, products, brandCatalog.products, opportunities]
  );
  // Product proposals (real crawled garments, DNA-analysed) are the feed's
  // real unit; trend cards remain the fallback when no crawl exists yet.
  const productProposals = useMemo(
    () => buildProductProposals({ items: products, trends: live ? engine.trends : null, dna: live ? engine.dna : null, leadWeeks, catalog: brandCatalog.products, opportunities, generatedAt: live ? engine.generatedAt : null }),
    [products, live, engine.trends, engine.dna, engine.generatedAt, leadWeeks, brandCatalog.products, opportunities]
  );
  // The engine's verdict for every card on screen, in ONE request that stores
  // nothing. Minting per visible card would write ~20 immutable judgement rows
  // per feed load for cards nobody decides; the frozen judgement is still
  // minted at decision time, which is the one that counts.
  const [serverStances, setServerStances] = useState(() => new Map());
  const previewSubjects = useMemo(() => [...productProposals, ...candidates].map((c) => ({
    candidateKey: c.key,
    title: c.item?.title || c.trend?.name || c.trend,
    category: c.item?.product_type || c.suggestion?.cat,
  })), [productProposals, candidates]);
  const previewKeys = previewSubjects.map((s) => s.candidateKey).join(",");
  useEffect(() => {
    if (!live || !engine.brandId || !previewKeys) { setServerStances(new Map()); return; }
    let cancelled = false;
    previewStances(engine.brandId, previewSubjects)
      .then((m) => { if (!cancelled) setServerStances(m); });
    return () => { cancelled = true; };
    // previewKeys (not previewSubjects) so deciding a card does not refetch the
    // whole feed's verdicts; engine.brandId is declared because it is READ.
  }, [live, engine.brandId, previewKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const withStance = (c) => (serverStances.has(c.key) ? { ...c, server: serverStances.get(c.key) } : c);

  const productMode = productProposals.length > 0;
  const visibleProducts = productProposals.filter((c) => !decided.has(c.key)).map(withStance);
  const strong = visibleProducts.filter((p) => p.verdict.tone === "make" || p.verdict.tone === "explore").slice(0, 13);
  const [heroProd, ...restProd] = strong;
  const radarProd = visibleProducts.filter((p) => !strong.includes(p)).slice(0, 8);
  const visible = candidates.filter((c) => !decided.has(c.key)).map(withStance);
  // Conviction threshold: only real matches get to be "proposals". Weak or
  // out-of-window trends stay visible — honestly — under "En el radar".
  const isProposal = (c) => c.window.ok && (c.action === "test" || (c.action === "explore" && c.fit >= 55));
  const proposals = visible.filter(isProposal);
  const radar = visible.filter((c) => !isProposal(c));
  const [heroCard, ...rest] = proposals;
  const taste = useMemo(() => tasteSummary(decisions), [decisions]);
  const pendingSync = useMemo(
    () => decisions.filter((d) => d.status === "pending" || d.status === "failed").length, [decisions]);

  function flash(m) { setToast(m); clearTimeout(window.__fpt); window.__fpt = setTimeout(() => setToast(""), 2000); }

  // RETURNS the verdict that was actually recorded — which is not always the
  // one that was asked for, and is null when nothing was recorded at all.
  // Callers MUST branch on this, never on their own argument: reading the
  // request instead of the outcome is precisely how the gate came to protect
  // the ledger while the pipeline filled up behind it.
  //
  // The flow itself lives in lib/decisionFlow.mjs — dependency-free, so the
  // rules below are tested against the real code rather than restated in a
  // component nothing can mount (tests/decisionFlow.test.mjs).
  async function record(c, decision, reason, reasonCode) {
    setDecided((prev) => new Set([...prev, c.key]));
    const { recorded, notice } = await recordDecision(
      { candidate: c, decision, reason, reasonCode },
      {
        live, brandId: engine.brandId,
        mint: mintRecommendation,
        post: postDecision,
        appendLocal: appendLocalDecision,
        patchStatus: (id, patch, brandId) => {
          setDecisionStatus(id, patch, brandId);
          setDecisions((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
        },
        onOptimistic: (rec) => setDecisions((prev) => [rec, ...prev]),
        promote,
        uuid: () => (crypto.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64),
        now: () => new Date().toISOString(),
      });
    if (notice) flash(notice);
    return recorded;
  }

  async function decide(c, decision, reason) {
    // `reason` is now a coded object from REJECT_REASONS (or undefined for
    // accepts). The label travels as the human string, the code as machine
    // truth, and the flash states WHAT was learned — the old copy said
    // "Atelier aprende" for every rejection, which was the defect in one line.
    const recorded = await record(c, decision, reason?.label, reason?.code);
    const title = c.item?.title || c.trend;
    if (recorded === "accept") flash(`${title} → pipeline (test ${c.qty.range})`);
    else if (recorded === "reject") flash(reason
      ? `Pasaste — ${reason.label} · ${reason.learns}`
      : "Pasaste — sin motivo · no enseña nada");
    // Everything else already flashed its own reason from the flow: the gates
    // refused it, the engine could not judge it, or it is queued unconfirmed.
  }

  // The flow the product is built around: accept + open the Studio seeded
  // with this proposal, to design the brand's own take on it.
  async function designProduct(p) {
    // Designing your own take on a reference is RESEARCH — always allowed, and
    // the brief below is seeded either way. What the gate withholds is the
    // operational pipeline card and its quantity.
    const recorded = await record(p, "accept", "design-similar");
    const it = p.item;
    // Stamped with the active brand: Studio refuses a handoff it cannot
    // attribute, because an unattributed one is how Brand A's opportunity got
    // designed under Brand B (owner review 2026-08-11).
    localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff({
      trend: it.title,
      summary: `Referencia real de ${it.competitor} (${it.currency} ${it.price}). ${p.verdict.label}: ${p.verdict.reasons[0] || ""}`,
      rationale: p.adapt.note,
      colors: [],
      fabric: p.adapt?.materials?.[0],
      typology: p.g,
      sources: [it.competitor],
      urls: [it.url],
      image: it.image_url,
      // A quantity is a commercial commitment: it travels into the Studio brief
      // only when the decision cleared the gates.
      qty: recorded === "accept" ? p.qty.range : null,
    }, { brandId: engine.brandId, collectionNeutral: true })));
    onNavigate?.("studio");
  }

  async function designSimilar(c) {
    const recorded = await record(c, "accept", "design-similar");
    localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff({
      trend: c.trend,
      summary: c.summary,
      rationale: c.rationale,
      colors: c.colorways.map((cw) => cw.hex),
      fabric: c.suggestion.fabric,
      typology: c.suggestion.label,
      sources: c.evidence.sources,
      urls: c.evidence.urls,
      qty: recorded === "accept" ? c.qty.range : null,
    }, { brandId: engine.brandId, collectionNeutral: true })));
    onNavigate?.("studio");
  }

  return (
    <section className="fd2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="fd2-head">
        <div>
          <div className="fd2-eyebrow">Crear · Propuestas</div>
          <h1 className="fd2-title">Propuestas</h1>
          <p className="fd2-lede">{live
            ? "Lo publicado en el mercado, cruzado con tu ADN y tu catálogo. Cada tarjeta separa evidencia, lectura y decisión."
            : "Ejemplos para recorrer el flujo. No describen el mercado actual ni sirven para decidir qué producir."}</p>
        </div>
        <div className="fd2-lead">
          <span className="fd2-lead-l">Tu lead time</span>
          <div className="fd2-sw">
            {[4, 8, 12, 16].map((w) => (
              // ⚠ "8s" READ AS EIGHT SECONDS (owner review, 2026-08-14). The
              // constant is `atelier-lead-WEEKS` and the label beside it says
              // "Tu lead time", but "s" is the SI symbol for a second — and a
              // lead time is exactly the kind of number a reader converts in
              // their head. "sem" costs two characters.
              <button key={w} className={leadWeeks === w ? "on" : ""}
                title={`${w} semanas de lead time`}
                onClick={() => { setLeadWeeks(w); localStorage.setItem(LEAD_KEY, String(w)); }}>
                {w} sem
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fd2-taste">
        <span className="fd2-taste-t">Taste log</span>
        {taste.total === 0 ? (
          <span className="fd2-taste-empty">sin decisiones todavía — aceptá o pasá y esto se vuelve tu perfil de gusto</span>
        ) : (
          <span className="fd2-taste-body">
            <b>{taste.accepts}</b> aceptadas · <b>{taste.rejects}</b> pasadas
            {taste.likes.cats.length > 0 && <> · te inclinás a <b>{taste.likes.cats.join(", ")}</b></>}
            {taste.dislikes.reasons.length > 0 && <> · pasás por <b>{taste.dislikes.reasons.join(", ")}</b></>}
            {/* Rejections whose reason was commercial/operational/legacy taught
                the profile NOTHING — said out loud, so a shrinking list reads
                as scoping, not as amnesia. */}
            {taste.untasted > 0 && <> · {taste.untasted} {taste.untasted === 1 ? "decisión" : "decisiones"} sin efecto en tu gusto</>}
          </span>
        )}
        <span className="fd2-taste-src">
          {live ? "guardado en tu engine" : "solo local (demo)"}
          {pendingSync > 0 && (
            <span className="fd2-pending"
              title="decisiones aún no sincronizadas con el engine — reintentan al reconectar">· {pendingSync} sin sincronizar</span>
          )}
        </span>
      </div>

      {productMode ? (
        visibleProducts.length === 0 ? (
          <div className="fd2-empty">
            <div className="fd2-empty-ic">✓</div>
            <h4>Feed al día</h4>
            <p>Decidiste sobre todos los productos propuestos. Refrescá la watchlist en Competitors para traer nuevos.</p>
          </div>
        ) : (
          <>
            {strong.length === 0 ? (
              <div className="fd2-none"><b>Nada fuerte entre los new arrivals de hoy.</b> Lo crawleado está abajo, en el radar.</div>
            ) : (
              <>
                {heroProd && <ProductCard p={heroProd} hero onDecide={decide} onDesign={designProduct} />}
                {restProd.length > 0 && (
                  <div className="fd2-grid">
                    {restProd.map((c) => <ProductCard key={c.key} p={c} onDecide={decide} onDesign={designProduct} />)}
                  </div>
                )}
              </>
            )}
            {radarProd.length > 0 && (
              <>
                <div className="fd2-radar-h">En el radar — referencias crawleadas, pero duplicadas, saturadas o fuera de ventana.</div>
                <div className="fd2-grid radar">
                  {radarProd.map((c) => <ProductCard key={c.key} p={c} onDecide={decide} onDesign={designProduct} />)}
                </div>
              </>
            )}
          </>
        )
      ) : visible.length === 0 ? (
        <div className="fd2-empty">
          <div className="fd2-empty-ic">✓</div>
          <h4>Feed al día</h4>
          <p>Decidiste sobre todas las propuestas. Las próximas llegan con la siguiente corrida del engine.</p>
          <button className="fd2-btn" onClick={() => onNavigate?.("integrations")}>Correr un refresh →</button>
        </div>
      ) : (
        <>
          {proposals.length === 0 ? (
            <div className="fd2-none">
              <b>Esta corrida no trajo propuestas fuertes para tu ADN.</b> Lo que apareció está abajo,
              en el radar — o corré un refresh para buscar de nuevo.
              <button className="fd2-btn" onClick={() => onNavigate?.("integrations")}>Correr un refresh →</button>
            </div>
          ) : (
            <>
              {heroCard && <Card c={heroCard} hero onDecide={decide} onDesign={designSimilar} />}
              {rest.length > 0 && (
                <div className="fd2-grid">
                  {rest.map((c) => <Card key={c.key} c={c} onDecide={decide} onDesign={designSimilar} />)}
                </div>
              )}
            </>
          )}
          {radar.length > 0 && (
            <>
              <div className="fd2-radar-h">
                {live
                  ? "En el radar — evidencia conectada, pero fit bajo o fuera de ventana. No son propuestas."
                  : "En el radar — ejemplos de muestra, no propuestas para producir."}
              </div>
              <div className="fd2-grid radar">
                {radar.map((c) => <Card key={c.key} c={c} onDecide={decide} onDesign={designSimilar} />)}
              </div>
            </>
          )}
        </>
      )}

      <div className={"fd2-toast" + (toast ? " show" : "")}>{toast}</div>
    </section>
  );
}
