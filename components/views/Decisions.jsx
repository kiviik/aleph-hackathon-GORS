"use client";
// Decisions & outcomes — the outcome-capture instrument, designed for the
// designer who thinks in images. The owner question: "¿qué decidimos, y quién
// tuvo razón?" Three moments, three treatments:
//   1. PARA CERRAR — decisions past their market-read window. The one action
//      that matters today, so these lead: big image, three verdict buttons.
//   2. EN EL MERCADO — accepted, still inside the 14-day read. A quiet grid
//      with a progress bar; nothing to do yet, so nothing shouts.
//   3. EL LIBRO — closed decisions as a ledger: decisión → veredicto, colour-
//      coded, with what the system takes from each.
//
// OUTCOME RECORD SHAPE — adapted to what the engine actually accepts.
// The engine's FeedDecision (api/app/db_models.py) is an APPEND-ONLY log:
//   { candidate_key: str<=120, decision: Literal["accept","reject"],
//     reason: str<=200|null, candidate: JSONB }
// There is no outcome column and no update endpoint — rows are "never
// updated, never deleted". So an outcome is appended as a new event row:
//   { candidate_key: "outcome:<original key>", decision: "accept",
//     reason: "outcome:<funciono|regular|no_funciono>",
//     candidate: { kind: "outcome", of, outcome, label, title, trend,
//                  decided_at, closed_at } }
// Consumers tell outcomes apart via candidate.kind === "outcome".
import { useEffect, useMemo, useState } from "react";
import { REJECT_REASONS, tasteSummary } from "@/lib/feed";
import { getDecisions, getOutcomes, gradeOutcomes, mintRecommendation, postDecision } from "@/lib/api";
import { migrateLegacyAccepted, setDecisionStatus, syncPending } from "@/lib/ledger";
import { useBrandId } from "@/components/EngineProvider";
import Thumbnail from "@/components/Thumbnail";
import { readScoped, writeScoped } from "@/lib/brandStore";

const LOCAL_KEY = "atelier-decisions"; // local mirror / offline fallback
const WAIT_DAYS = 14; // same window as the feed's "lectura de sell-through a los 14 días"

// Verdict TONES, not colour literals: the wash pairs live in the stylesheet so
// a verdict is one decision in one place — positive / inconclusive / negative /
// unknown — instead of three hexes repeated at every call site.
const OUTCOMES = [
  { value: "funciono", label: "Funcionó", tone: "pos" },
  { value: "regular", label: "Regular", tone: "warn" },
  { value: "no_funciono", label: "No funcionó", tone: "neg" },
];
const outcomeOf = (v) => OUTCOMES.find((o) => o.value === v) || { label: v, tone: "unk" };

// Brand-scoped: this mirrors ONE brand's decision ledger, so it must never be
// read while another brand is on screen (2026-07-24 audit).
function loadLocal(brandId) {
  return readScoped(LOCAL_KEY, brandId, []) || [];
}
function saveLocal(rows, brandId) {
  writeScoped(LOCAL_KEY, brandId, rows.slice(0, 300));
}

// Engine returns tz-aware ISO ("+00:00"); local rows end in "Z"; tolerate both.
function parseTs(iso) {
  if (!iso) return null;
  let d = new Date(iso);
  if (isNaN(d)) d = new Date(iso + "Z");
  return isNaN(d) ? null : d;
}
const daysSince = (iso) => {
  const d = parseTs(iso);
  return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) : null;
};
function agoEs(iso) {
  const days = daysSince(iso);
  if (days == null) return "fecha desconocida";
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.round(days / 7)} semanas`;
  return `hace ${Math.round(days / 30)} meses`;
}

// Feed stores the full candidate as shown; fields live in different places
// depending on whether it was a product proposal or a trend card.
const titleOf = (row) =>
  row.candidate?.title || row.candidate?.item?.title ||
  (typeof row.candidate?.trend === "string" ? row.candidate.trend : row.candidate?.trend?.name) ||
  row.candidate_key;
const trendOf = (row) => {
  const t = row.candidate?.trend;
  const name = typeof t === "string" ? t : t?.name;
  return name || row.candidate?.item?.competitor || null;
};
const imageOf = (row) => row.candidate?.item?.image_url || row.candidate?.image || null;
const colorOf = (row) =>
  row.candidate?.colorways?.[0]?.hex || row.candidate?.adapt?.colors?.[0] || "#1B1A14";
const fabricOf = (row) =>
  row.candidate?.suggestion?.fabric || row.candidate?.adapt?.materials?.[0] || "";
const reasonEs = (r) => (r === "design-similar" ? "diseñada en Studio" : r);

// Merge engine rows with the local mirror. Engine wins on exact id; local
// rows without a server twin (offline outcomes, demo-mode decisions) survive.
function mergeRows(local, remote) {
  const seen = new Set();
  const out = [];
  for (const r of [...(remote || []), ...(local || [])]) {
    if (!r || !r.candidate_key) continue;
    const k = r.id || `${r.candidate_key}|${r.decision}|${r.created_at || r.at || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...r, created_at: r.created_at || r.at || null });
  }
  return out;
}

// Fold the flat append-only log into decisions + their outcome. Since the
// 2nd audit the AUTOMATIC grade leads: a decision whose bet was launched and
// graded from real sales closes itself; the manual buttons remain only for
// decisions the grader honestly can't close (no engine, no link, no data).
function fold(rows, autoById) {
  const outcomes = new Map(); // original key -> latest MANUAL outcome row
  const base = new Map();     // candidate_key -> latest decision row
  const ts = (r) => parseTs(r.created_at)?.getTime() || 0;
  for (const r of [...rows].sort((a, b) => ts(a) - ts(b))) {
    if (r.candidate?.kind === "outcome") {
      outcomes.set(r.candidate.of || r.candidate_key.replace(/^outcome:/, ""), r);
    } else {
      base.set(r.candidate_key, r);
    }
  }
  const decisions = [...base.values()];
  const accepted = decisions.filter((d) => d.decision === "accept");
  const passed = decisions.filter((d) => d.decision === "reject").sort((a, b) => ts(b) - ts(a));

  const autoOf = (d) => (d.id && autoById?.[d.id]) || null;
  const closedAuto = [];
  const marketAuto = [];
  const notLaunched = [];
  const fallback = [];   // launched but ungradable -> manual close, with the why
  const noAuto = [];     // no bet/no engine -> legacy time-based flow
  for (const d of accepted) {
    if (outcomes.has(d.candidate_key)) continue; // manually closed already
    const a = autoOf(d);
    if (!a) noAuto.push(d);
    else if (a.complete && (a.verdict === "funciono" || a.verdict === "no_funciono"))
      closedAuto.push({ decision: d, auto: a });
    else if (a.verdict === "en_mercado") marketAuto.push({ ...d, auto: a });
    else if (a.verdict === "sin_lanzamiento") notLaunched.push(d);
    else fallback.push({ ...d, auto: a }); // sin_vinculo / sin_criterio / sin_datos
  }
  const ready = [
    ...fallback,
    ...noAuto.filter((d) => (daysSince(d.created_at) ?? WAIT_DAYS) >= WAIT_DAYS),
  ].sort((a, b) => ts(a) - ts(b)); // most overdue first
  const waiting = [
    ...marketAuto,
    ...noAuto.filter((d) => (daysSince(d.created_at) ?? WAIT_DAYS) < WAIT_DAYS),
  ].sort((a, b) => ts(a) - ts(b));
  const closed = [
    ...closedAuto,
    ...accepted.filter((d) => outcomes.has(d.candidate_key))
      .map((d) => ({ decision: d, outcome: outcomes.get(d.candidate_key) })),
  ].sort((a, b) => (b.auto ? parseTs(b.auto.graded_at)?.getTime() || 0 : ts(b.outcome))
                 - (a.auto ? parseTs(a.auto.graded_at)?.getTime() || 0 : ts(a.outcome)));
  const open = [...ready, ...waiting];
  return { decisions, passed, ready, waiting, open, closed, notLaunched };
}

const LEARN = {
  funciono: "el ojo estuvo bien — repetí la jugada",
  regular: "ni-ni — ajustá cantidad o timing la próxima",
  no_funciono: "no salió — el sistema pesa esto en las próximas propuestas",
};

// ⚠ MUST be `dangerouslySetInnerHTML`, never a style element with the CSS as a
// text child. React escapes `>` and `"` in that child on the server; the browser
// does not unescape inside <style>, so server and client markup differ and
// React discards the whole tree on every load.
//
// Everything the screen wears lives here, on its OWN `dc2-` namespace. The old
// markup borrowed `fp-taste`, `fp-toast`, `empty`, `ws-btn`, `dh-btn-s`, `link`
// and `vh` from app/globals.css — including a dark-header button rendered on a
// light page and a 10.5px note, below the 11px floor.
const CSS = `
/* ===== Decisiones y resultados — evidence-about-the-past restyle (dc2-) =====
   This screen reports what already happened, so it reads as a record: mono
   dates, tabular numerals, verdicts as small washed pills, and the learning
   line given room rather than shrunk into a caption. */

.dc2-head{margin:0 0 var(--s4)}
.dc2-eyebrow{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--editorial)}
.dc2-head h1{font-family:var(--serif);font-weight:500;font-size:34px;line-height:1.1;letter-spacing:-.01em;color:var(--ink);margin:6px 0 8px}
.dc2-head p{font-size:14px;line-height:1.55;color:var(--ink-2);margin:0;max-width:64ch}

/* ---- the recalc control. Pressable, so this is where blue is allowed. ---- */
.dc2-tools{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;margin:0 0 var(--s4)}
.dc2-btn{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);padding:9px 14px;font-size:12px;font-weight:600;color:var(--cobalt);cursor:pointer}
.dc2-btn:hover:not(:disabled){border-color:var(--cobalt);background:var(--cobalt-wash)}
.dc2-btn:disabled{opacity:.5;cursor:default;color:var(--ink-3)}
.dc2-btn.primary{background:var(--cobalt);border-color:var(--cobalt);color:#fff}
.dc2-btn.primary:hover:not(:disabled){background:var(--cobalt-ink);border-color:var(--cobalt-ink)}
.dc2-tools-note{font-size:12px;line-height:1.5;color:var(--ink-3);max-width:52ch}

/* ---- an honest failure, not a silent one ---- */
.dc2-alert{font-size:13px;line-height:1.55;color:var(--ink-2);background:var(--clay-wash);border:none;border-left:3px solid var(--danger);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:10px 13px;margin:0 0 var(--s4);max-width:70ch}

/* ---- OUTCOME FIGURES: one white card, cells split by 1px hairlines ---- */
.dc2-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;margin:0 0 var(--s4)}
.dc2-kpi{background:var(--surface);padding:14px 16px}
.dc2-kpi span{display:block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
.dc2-kpi b{display:block;font-family:var(--disp);font-size:22px;font-weight:600;line-height:1;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}
.dc2-kpi.ok b{color:var(--positive)}
.dc2-kpi.warn b{color:var(--warning)}

/* ---- WHAT IT TAUGHT: the payoff of the whole product. Given room. ---- */
.dc2-taste{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--editorial);border-radius:0 var(--r) var(--r) 0;box-shadow:var(--shadow);padding:16px 18px;margin:0 0 var(--s5)}
.dc2-taste-t{display:block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.dc2-taste-body{display:block;font-size:13px;line-height:1.65;color:var(--ink-2)}
.dc2-taste-body b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.dc2-taste-empty{display:block;font-size:13px;line-height:1.65;color:var(--ink-3)}
.dc2-taste-src{display:block;font-family:var(--d);font-size:11px;color:var(--ink-3);margin-top:9px}

/* ---- section headers ---- */
.dc2-sec{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);margin:var(--s5) 0 var(--s3)}
.dc2-hint{font-family:var(--ui);font-weight:400;letter-spacing:0;text-transform:none;font-size:12px;color:var(--ink-3)}
.dc2-meta{font-size:12px;line-height:1.55;color:var(--ink-3)}
.dc2-when{font-family:var(--d);font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink-3)}
/* the evidence a verdict cites — a reference, so it is set as one */
.dc2-basis{display:block;font-family:var(--d);font-size:11px;line-height:1.5;color:var(--ink-3)}
.dc2-link{display:inline-block;background:none;border:none;padding:0;font-size:12px;font-weight:600;color:var(--cobalt);cursor:pointer}
.dc2-link:hover{text-decoration:underline}

.dc2-img{border-radius:var(--r-xs);overflow:hidden;flex:none;background:var(--paper-2)}
.dc2-img .mtile{width:100%;height:100%;border-radius:0}
.dc2-img .mtile img{width:100%;height:100%;object-fit:cover}

/* ---- verdict pills: positive / inconclusive / negative / unknown ---- */
.dc2-pill{display:inline-block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:3px 9px;background:var(--paper-2);color:var(--ink-3)}
.dc2-pill.pos{color:var(--positive);background:color-mix(in srgb,var(--positive) 12%,#fff)}
.dc2-pill.warn{color:var(--warning);background:var(--ochre-wash)}
.dc2-pill.neg{color:var(--danger);background:var(--clay-wash)}
.dc2-pill.neutral,.dc2-pill.unk{color:var(--ink-3);background:var(--paper-2)}
.dc2-fix{border:1px solid var(--line);background:none;border-radius:999px;padding:2px 9px;font-family:var(--d);font-size:11px;color:var(--ink-3);cursor:pointer;margin-left:6px}
.dc2-fix:hover{color:var(--cobalt);border-color:var(--cobalt)}
.dc2-fix.opt{margin:0}
.dc2-fix-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.dc2-arrow{color:var(--ink-3);font-size:12px;margin:0 5px}

/* ---- PARA CERRAR — the only cards with something to do ---- */
.dc2-due{display:flex;gap:var(--s4);align-items:center;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--warning);border-radius:0 var(--r) var(--r) 0;box-shadow:var(--shadow);padding:14px 18px;margin-bottom:var(--s2)}
.dc2-due-what{flex:1;min-width:220px}
.dc2-due-title{font-size:14px;font-weight:600;line-height:1.3;color:var(--ink);margin:4px 0 4px}
.dc2-ask{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.dc2-btns{display:flex;gap:7px;flex-wrap:wrap}
.dc2-oc{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);padding:8px 13px;font-size:12px;font-weight:600;color:var(--ink-2);cursor:pointer}
.dc2-oc:hover{border-color:var(--ink-3)}
.dc2-oc.pos{color:var(--positive);background:color-mix(in srgb,var(--positive) 10%,#fff);border-color:color-mix(in srgb,var(--positive) 32%,#fff)}
.dc2-oc.warn{color:var(--warning);background:var(--ochre-wash);border-color:color-mix(in srgb,var(--warning) 32%,#fff)}
.dc2-oc.neg{color:var(--danger);background:var(--clay-wash);border-color:color-mix(in srgb,var(--danger) 32%,#fff)}
.dc2-oc.sm{padding:6px 10px;font-size:11px}

/* ---- EN EL MERCADO — nothing to do yet, so nothing shouts ---- */
.dc2-wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--s3)}
.dc2-wcard{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:13px 15px;display:flex;gap:12px;align-items:center}
.dc2-wbody{flex:1;min-width:0}
.dc2-wtitle{font-size:14px;font-weight:600;line-height:1.3;color:var(--ink)}
/* the measured bar: shared track, no colour claim about an outcome */
.dc2-prog{height:8px;border-radius:99px;background:var(--paper-2);margin:9px 0 6px;overflow:hidden}
.dc2-prog i{display:block;height:100%;background:var(--ink-2);border-radius:99px}
.dc2-prog-l{font-family:var(--d);font-size:11px;font-variant-numeric:tabular-nums;line-height:1.5;color:var(--ink-3)}

/* ---- EL LIBRO — the closed ledger ---- */
.dc2-led{display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--hair-2);border-radius:0 var(--r) var(--r) 0;box-shadow:var(--shadow);padding:12px 16px;margin-bottom:var(--s2)}
.dc2-led.won{border-left-color:var(--positive)}
.dc2-led.meh{border-left-color:var(--warning)}
.dc2-led.lost{border-left-color:var(--danger)}
.dc2-led-what{flex:1;min-width:220px}
.dc2-led-title{font-size:14px;font-weight:600;line-height:1.3;color:var(--ink);margin-bottom:5px}
.dc2-led-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--ink-3)}
.dc2-learn{font-size:13px;line-height:1.55;color:var(--ink-2);max-width:30ch;text-align:right}

/* ---- empty: legitimately empty before anything is decided ---- */
.dc2-empty{display:grid;place-items:center;align-content:center;min-height:340px;text-align:center;color:var(--ink-3)}
.dc2-empty .ic{width:54px;height:54px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line);display:grid;place-items:center;font-size:20px;color:var(--ink-3);margin:0 auto var(--s4)}
.dc2-empty h4{font-family:var(--serif);font-weight:500;font-size:22px;line-height:1.25;color:var(--ink);margin:0 0 8px}
.dc2-empty p{max-width:38ch;margin:0 0 var(--s4);font-size:13px;line-height:1.55;color:var(--ink-3)}

/* ---- toast ---- */
.dc2-toast{position:fixed;right:22px;bottom:24px;background:var(--ink);color:var(--paper);border-radius:var(--r-sm);padding:11px 15px;font-size:13px;font-weight:600;box-shadow:var(--shadow);opacity:0;transform:translateY(10px);transition:.22s;z-index:60;pointer-events:none}
.dc2-toast.show{opacity:1;transform:translateY(0)}

@media(max-width:900px){
  .dc2-kpis{grid-template-columns:repeat(3,1fr)}
  .dc2-head h1{font-size:28px}
}
@media(max-width:700px){
  .dc2-learn{text-align:left;max-width:none}
  .dc2-kpis{grid-template-columns:repeat(2,1fr)}
}
`;

function Img({ row, size = 64 }) {
  return (
    <div className="dc2-img" style={{ width: size, height: Math.round(size * 1.2) }}>
      <Thumbnail color={colorOf(row)} fabric={fabricOf(row)} img={imageOf(row)} />
    </div>
  );
}

export default function Decisions({ onNavigate }) {
  // ⚠ THIS SCREEN DOES NOT NEED A MARKET RUN (owner review, 2026-08-14).
  // It read `engine.status === "live"`, which means "a completed pipeline RUN
  // payload exists" — trends, DNA, competitor scoring. The decision ledger is
  // none of those: it is the brand's own workflow, written by people accepting
  // and rejecting proposals, and it lives in the collection graph.
  //
  // So a connected brand with no crawl saw "solo local (engine offline)" over a
  // ledger the engine was holding perfectly well, and every decision it
  // recorded stayed in the browser marked `local` — the memory of the product's
  // whole learning loop, withheld because an unrelated pipeline had not run.
  //
  // `EngineProvider`'s own header documents this exact distinction and says
  // graph screens must use `useBrandId()`. This was one of the screens still
  // using the old idiom.
  const brandId = useBrandId();
  const live = Boolean(brandId);
  const [rows, setRows] = useState([]);
  // candidate_key whose reason is being corrected (append-only supersede).
  const [correcting, setCorrecting] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [forceClose, setForceClose] = useState(null); // key of a "waiting" row the owner insists on closing
  const [showPassed, setShowPassed] = useState(false);
  const [toast, setToast] = useState("");

  const [autoById, setAutoById] = useState(null); // decision_id -> automatic grade
  const [syncFailed, setSyncFailed] = useState(false); // grade request failed (surfaced, not silent)

  const applyOutcomes = (out) => {
    if (!out?.items) return;
    const map = {};
    for (const it of out.items) if (it.decision_id) map[it.decision_id] = it;
    setAutoById(map);
  };

  useEffect(() => {
    migrateLegacyAccepted(brandId); // legacy accepts show here too, not just in Review
    setRows(mergeRows(loadLocal(brandId), []));
    setLoaded(true);
    if (live) {
      getDecisions(brandId).then((remote) => setRows(mergeRows(loadLocal(brandId), remote)));
      // READ-ONLY: opening a reporting screen must NOT trigger commercial
      // grading. Grading is an explicit action (recalc button) — long term it
      // belongs in a sales-ingest / scheduled worker.
      getOutcomes(brandId).then(applyOutcomes);
      const patchStatus = (id, patch) =>
        setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
      // Same contract as Feed's retry: a queued accept is JUDGED before it is
      // sent (we are online — that is why we are syncing), and it earns its
      // pipeline card only if the engine confirms it. Without mintFn this
      // screen would quietly walk offline accepts down the client-evidence
      // path that Feed refuses to take (owner audit, 2026-07-24 third pass).
      const sync = () => syncPending(brandId, postDecision, patchStatus,
                                     { mintFn: mintRecommendation });
      sync();
      window.addEventListener("online", sync);
      return () => window.removeEventListener("online", sync);
    }
  }, [live, brandId]);

  const [grading, setGrading] = useState(false);
  async function recalcOutcomes() {
    if (!brandId || grading) return;
    setGrading(true); setSyncFailed(false);
    const g = await gradeOutcomes(brandId);
    setSyncFailed(!g.ok);
    applyOutcomes(await getOutcomes(brandId));
    setGrading(false);
  }

  const { decisions, passed, ready, waiting, open, closed, notLaunched } =
    useMemo(() => fold(rows, autoById), [rows, autoById]);
  // Taste stats come from folded decision rows only (one per candidate,
  // outcome events excluded) so every count on screen adds up.
  const taste = useMemo(() => tasteSummary(decisions), [decisions]);
  const worked = closed.filter((c) =>
    c.auto ? c.auto.verdict === "funciono" : c.outcome.candidate?.outcome === "funciono").length;

  function flash(m) { setToast(m); clearTimeout(window.__dcxt); window.__dcxt = setTimeout(() => setToast(""), 2200); }

  // What one decision taught, from the SERVER's own flag — never re-derived
  // here. undefined (local mirror, older engine) claims nothing.
  const SCOPE_ES = { commercial: "comercial", technical: "técnico",
                     collection: "surtido", timing: "calendario" };
  function learnChip(row) {
    if (row.learns_taste === true) return { cls: "unk", text: "enseñó tu gusto" };
    if (row.learns_taste !== false) return null;
    const scopes = (row.learning_scope || []).map((x) => SCOPE_ES[x] || x);
    return scopes.length
      ? { cls: "unk", text: `sólo ${scopes.join(" y ")} — no tocó tu gusto` }
      : { cls: "unk", text: "no enseñó nada" };
  }

  // A17.2 #6: the reason was wrong. The fix is a NEW row superseding the old
  // one — the original stays in the ledger, the learner reads the correction.
  async function correctReason(row, r) {
    setCorrecting(null);
    try {
      await postDecision(brandId, {
        candidateKey: row.candidate_key, decision: "reject", verdict: "reject",
        // The ORIGINAL snapshot travels with the correction: the verdict is
        // about the same shown card, and a correction with an empty snapshot
        // rendered as its raw candidate_key in this very ledger.
        candidate: row.candidate || {},
        reason: r.label, reasonCode: r.code, supersedesId: row.id,
        idempotencyKey: (crypto.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64),
      });
      const remote = await getDecisions(brandId);
      setRows(mergeRows(loadLocal(brandId), remote));
      flash(`Motivo corregido — ${r.label} · ${r.learns}`);
    } catch {
      flash("No se pudo corregir — el motor no respondió");
    }
  }

  async function closeLoop(row, oc) {
    const now = new Date().toISOString();
    const rec = {
      id: `local-${row.candidate_key}-${Date.now()}`,
      candidate_key: `outcome:${row.candidate_key}`.slice(0, 120),
      decision: "accept",
      reason: `outcome:${oc.value}`,
      candidate: {
        kind: "outcome",
        of: row.candidate_key,
        outcome: oc.value,
        label: oc.label,
        title: titleOf(row),
        trend: trendOf(row),
        decided_at: row.created_at,
        closed_at: now,
      },
      created_at: now,
      status: live ? "pending" : "local",
      attempts: 0,
    };
    saveLocal([rec, ...loadLocal(brandId)], brandId);
    setRows((prev) => [rec, ...prev]);
    setForceClose(null);
    flash(`${titleOf(row)} → ${oc.label}. El sistema aprende de esto.`);
    if (live) {
      try {
        await postDecision(brandId, {
          candidateKey: rec.candidate_key, decision: rec.decision, reason: rec.reason, candidate: rec.candidate,
          idempotencyKey: rec.id,
        });
        const patch = { status: "synced", synced_at: new Date().toISOString(), last_error: null };
        setDecisionStatus(rec.id, patch, brandId);
        setRows((current) => current.map((item) => item.id === rec.id ? { ...item, ...patch } : item));
      } catch (error) {
        const patch = { status: "failed", attempts: 1, last_error: String(error?.message || error) };
        setDecisionStatus(rec.id, patch, brandId);
        setRows((current) => current.map((item) => item.id === rec.id ? { ...item, ...patch } : item));
        flash(`${titleOf(row)} quedó guardada localmente — se reintentará al reconectar.`);
      }
    }
  }

  const empty = loaded && open.length === 0 && closed.length === 0 && passed.length === 0;

  return (
    <section className="view on dc2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="dc2-head">
        <div className="dc2-eyebrow">Operar · Decisiones</div>
        <h1>Decisiones y resultados</h1>
        <p>¿Qué decidimos — y quién tuvo razón? Cada decisión que tomás en Proposals queda acá. Cerrala cuando el mercado hable, y el sistema aprende de verdad.</p>
      </div>

      {live && (
        <div className="dc2-tools">
          <button className="dc2-btn" disabled={grading} onClick={recalcOutcomes}
            title="Recalcula los resultados contra ventas. Abrir esta pantalla no lo hace solo.">
            {grading ? "Recalculando…" : "Recalcular resultados"}
          </button>
          <span className="dc2-tools-note">
            Abrir Results ya no dispara el cálculo comercial — pedilo cuando quieras.
          </span>
        </div>
      )}

      {syncFailed && (
        <div className="dc2-alert">
          No se pudo recalcular los resultados con ventas ahora — los grados mostrados pueden estar
          desactualizados. No lo damos por “aprendido” hasta que el recálculo funcione.
        </div>
      )}

      {!empty && (
        <div className="dc2-kpis">
          {closed.length > 0 && (
            <div className="dc2-kpi ok">
              <span>funcionaron</span><b>{worked}/{closed.length}</b>
            </div>
          )}
          <div className={`dc2-kpi${ready.length ? " warn" : ""}`}>
            <span>para cerrar</span><b>{ready.length}</b>
          </div>
          <div className="dc2-kpi"><span>en el mercado</span><b>{waiting.length}</b></div>
          <div className="dc2-kpi"><span>aceptadas</span><b>{taste.accepts}</b></div>
          <div className="dc2-kpi"><span>pasadas</span><b>{taste.rejects}</b></div>
        </div>
      )}

      <div className="dc2-taste">
        <span className="dc2-taste-t">Lo que el sistema aprendió</span>
        {taste.total === 0 ? (
          <span className="dc2-taste-empty">todavía nada — las decisiones que tomes en Proposals alimentan este perfil</span>
        ) : (
          <span className="dc2-taste-body">
            <b>{taste.accepts}</b> aceptadas · <b>{taste.rejects}</b> pasadas
            {taste.likes.cats.length > 0 && <> · te inclinás a <b>{taste.likes.cats.join(", ")}</b></>}
            {taste.dislikes.reasons.length > 0 && <> · pasás por <b>{taste.dislikes.reasons.join(", ")}</b></>}
            {closed.length > 0
              ? <> · de <b>{closed.length}</b> cerrada{closed.length > 1 ? "s" : ""}, <b>{worked}</b> funcionaron</>
              : <> · sin resultados cerrados todavía — la primera cerrada dice quién tuvo razón</>}
          </span>
        )}
        <span className="dc2-taste-src">{live ? "guardado en tu engine" : "solo local (engine offline)"}</span>
      </div>

      {empty ? (
        <div className="dc2-empty">
          <div>
            <div className="ic">✎</div>
            <h4>Todavía no hay decisiones</h4>
            <p>Aceptá o pasá propuestas en Proposals y el registro arranca acá.</p>
            <button className="dc2-btn primary" onClick={() => onNavigate?.("feed")}>
              Ir a Proposals →
            </button>
          </div>
        </div>
      ) : (
        <>
          {notLaunched.length > 0 && (
            <p className="dc2-meta">
              {notLaunched.length} aceptada{notLaunched.length > 1 ? "s" : ""} todavía en
              desarrollo — el resultado se mide desde el lanzamiento, no desde la
              aprobación.{" "}
              <button className="dc2-link" onClick={() => onNavigate?.("boards")}>Ver en pipeline →</button>
            </p>
          )}

          {ready.length > 0 && (
            <>
              <div className="dc2-sec">Para cerrar a mano ({ready.length})<span className="dc2-hint">el sistema no pudo cerrarlas solo — la razón está en cada tarjeta</span></div>
              {ready.map((row) => {
                const days = daysSince(row.created_at);
                return (
                  <div className="dc2-due" key={row.candidate_key}>
                    <Img row={row} size={72} />
                    <div className="dc2-due-what">
                      <span className="dc2-basis">
                        {row.auto ? row.auto.basis : `día ${days ?? "?"} · lectura vencida`}
                      </span>
                      <div className="dc2-due-title">{titleOf(row)}</div>
                      <div className="dc2-meta">
                        <span className="dc2-when">decidida {agoEs(row.created_at)}</span>
                        {trendOf(row) && <> · vía <b>{trendOf(row)}</b></>}
                        {row.reason && <> · <i>{reasonEs(row.reason)}</i></>}
                      </div>
                    </div>
                    <div>
                      <div className="dc2-ask">¿Cómo resultó?</div>
                      <div className="dc2-btns">
                        {OUTCOMES.map((oc) => (
                          <button key={oc.value} className={`dc2-oc ${oc.tone}`}
                            onClick={() => closeLoop(row, oc)}>
                            {oc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {waiting.length > 0 && (
            <>
              <div className="dc2-sec">En el mercado ({waiting.length})<span className="dc2-hint">lectura de resultado a los {WAIT_DAYS} días del lanzamiento</span></div>
              <div className="dc2-wgrid">
                {waiting.map((row) => {
                  const days = row.auto?.evidence?.days_elapsed ?? daysSince(row.created_at) ?? 0;
                  const total = row.auto?.evidence?.days_total ?? WAIT_DAYS;
                  const force = forceClose === row.candidate_key;
                  return (
                    <div className="dc2-wcard" key={row.candidate_key}>
                      <Img row={row} size={46} />
                      <div className="dc2-wbody">
                        <div className="dc2-wtitle">{titleOf(row)}</div>
                        <div className="dc2-prog"><i style={{ width: `${Math.min(100, (days / total) * 100)}%` }} /></div>
                        <div className="dc2-prog-l">
                          día {days} de {total}
                          {row.auto ? ` · ${row.auto.evidence?.units ?? 0} u vendidas · se cierra sola` : trendOf(row) ? ` · ${trendOf(row)}` : ""}
                        </div>
                        {row.auto ? null : force ? (
                          <div className="dc2-btns" style={{ marginTop: 8 }}>
                            {OUTCOMES.map((oc) => (
                              <button key={oc.value} className={`dc2-oc sm ${oc.tone}`}
                                onClick={() => closeLoop(row, oc)}>
                                {oc.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button className="dc2-link" style={{ marginTop: 6 }} onClick={() => setForceClose(row.candidate_key)}>¿Ya tenés el dato? Cerrala →</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {closed.length > 0 && (
            <>
              <div className="dc2-sec">El libro — decisión → veredicto ({closed.length})</div>
              {closed.map(({ decision, outcome, auto }) => {
                const v = auto ? auto.verdict : outcome.candidate?.outcome;
                const oc = outcomeOf(v);
                const tone = v === "funciono" ? "won" : v === "regular" ? "meh" : "lost";
                return (
                  <div className={`dc2-led ${tone}`} key={decision.candidate_key}>
                    <Img row={decision} size={44} />
                    <div className="dc2-led-what">
                      <div className="dc2-led-title">{titleOf(decision)}</div>
                      <div className="dc2-led-line">
                        <span className="dc2-pill pos">Aceptada</span>
                        <span className="dc2-arrow">→</span>
                        <span className={`dc2-pill ${oc.tone}`}>{oc.label}</span>
                        {auto
                          ? <span className="dc2-pill neutral" title={auto.basis}>automático — desde tus ventas</span>
                          : <span className="dc2-pill warn" title="Declarado por una persona; no fue calculado desde ventas">manual — declarado por el equipo</span>}
                        <span className="dc2-when">
                          · decidida {agoEs(decision.created_at)}
                          {auto ? (auto.launched_on ? ` · lanzada ${agoEs(auto.launched_on)}` : "")
                                : ` · cerrada ${agoEs(outcome.created_at)}`}
                        </span>
                        {trendOf(decision) && <span className="dc2-meta">· vía <b>{trendOf(decision)}</b></span>}
                      </div>
                      {auto && <div className="dc2-basis" style={{ marginTop: 5 }}>{auto.basis}</div>}
                    </div>
                    <div className="dc2-learn">
                      {LEARN[v] || ""}
                      <button className="dc2-link" style={{ display: "block", marginLeft: "auto", marginTop: 6 }} onClick={() => onNavigate?.("boards")}>Ver en pipeline →</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {passed.length > 0 && (
            <>
              <div className="dc2-sec">
                Pasadas ({passed.length}){" "}
                <button className="dc2-link" onClick={() => setShowPassed((s) => !s)}>
                  {showPassed ? "ocultar" : "ver"} →
                </button>
              </div>
              {showPassed && passed.map((row) => (
                <div className="dc2-led" key={row.candidate_key}>
                  <Img row={row} size={38} />
                  <div className="dc2-led-what">
                    <div className="dc2-led-title">{titleOf(row)}</div>
                    <div className="dc2-led-line">
                      <span className="dc2-pill neg">Pasada</span>
                      <span className="dc2-when">· {agoEs(row.created_at)}</span>
                      {row.reason && <span className="dc2-meta">· motivo: <i>{reasonEs(row.reason)}</i></span>}
                      {(() => { const c = learnChip(row);
                        return c ? <span className={`dc2-pill ${c.cls}`}>{c.text}</span> : null; })()}
                      {row.supersedes_id && <span className="dc2-pill unk">motivo corregido</span>}
                      {live && row.id && !String(row.id).startsWith("local-") && (
                        <button className="dc2-fix"
                          onClick={() => setCorrecting(correcting === row.candidate_key ? null : row.candidate_key)}>
                          {correcting === row.candidate_key ? "cancelar" : "corregir motivo"}
                        </button>
                      )}
                    </div>
                    {correcting === row.candidate_key && (
                      <div className="dc2-fix-row">
                        {REJECT_REASONS.map((r) => (
                          <button key={r.code} className="dc2-fix opt" title={r.learns}
                            onClick={() => correctReason(row, r)}>{r.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      <div className={"dc2-toast" + (toast ? " show" : "")}>{toast}</div>
    </section>
  );
}
