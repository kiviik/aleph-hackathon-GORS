"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Thumbnail from "@/components/Thumbnail";
import { useCollection } from "@/components/CollectionProvider";
import RangeSlots from "@/components/RangeSlots";
import RangeBoard from "@/components/RangeBoard";
import { getPlanVersion, planForSeason, setTargets } from "@/lib/collectionPlans";
import { loadCollections, saveAllLocal, saveCollection } from "@/lib/studioStore";
import { getBrief } from "@/lib/collectionBrief";
import { moneyText, num } from "@/lib/money.mjs";
import {
  approvalDetail, canPlanColours, imageState, nextPlanRevision,
  reconciliationSentences, whyLocked,
} from "@/lib/slotColourways.mjs";
import {
  getSlotColourways, planSlotColourway, unplanSlotColourway,
} from "@/lib/api";

// Local mirror ONLY. The plan's targets are a commercial commitment and now
// live on the engine (collection_plans.targets); this key is the offline
// fallback and is labelled as such on screen, instead of sitting under a
// "compartido con el equipo" chip that described the collection (2026-07-24
// audit, ROADMAP A4.4).
const PLAN_KEY = "atelier-line-plans-v2";
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
const abs = (url) => (url?.startsWith("/") ? API_BASE + url : url);
const uid = () => `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const todayPlus = (days) => {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
};
const readPlans = () => {
  try { return JSON.parse(localStorage.getItem(PLAN_KEY) || "{}"); } catch { return {}; }
};
const writePlans = (plans) => {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(plans)); return true; } catch { return false; }
};
// ⚠ ABSENT IS NOT ZERO (`lib/money.mjs`). Both of these used to fabricate:
// `money(null)` was "$0" and `number(null)` was 0, because `Math.round(null)`
// and `Number("")` are both 0. The one live call site happens to guard with a
// truthiness check, so this was a trap set for the next caller rather than a
// visible lie — the Range board's copy of the same mistake was NOT guarded and
// showed a buyer «ARS 0» for a budget nobody had set.
const money = (value) => moneyText(value, null, { symbol: "$" });
const number = (value) =>
  num(typeof value === "string" ? value.replace(/[^\d.-]/g, "") : value);
const statusOf = (item) => item.approved ? "Aprobada"
  : item.approvalStatus === "in_review" ? "En revisión"
  : item.cover ? "En diseño" : "Placeholder";

// Targets start EMPTY on purpose: 62% margin or 70% newness are the brand's
// decisions, not Atelier's. A silent default reads as a recommendation we never
// made (owner audit 2026-07-24). The UI shows "objetivo sin definir" until set.
//
// ⚠ AND `drop`, `market` AND `channel` WERE NOT EMPTY — they were invented
// (owner walkthrough 2026-08-12). Every brand's Range header read "Drop 1 ·
// Argentina · DTC + tiendas" regardless of what its approved brief said. The
// owner's brief said markets ["AR","UY"] and channels ["ecommerce","retail"];
// the screen above it said Argentina and DTC + tiendas. Two screens disagreeing
// about which countries a brand sells in, one of them making it up — the exact
// class the 07-24 audit purged from the targets and left behind here.
const DEFAULT_PLAN = {
  season: "", drop: "", market: "", channel: "",
  targetStyles: "", targetColorways: "", targetNewness: "",
  openingPrice: "", ceilingPrice: "", targetMargin: "", targetUnits: "",
};

// ⚠ THE BRIEF GOVERNS, AND THE SCREEN SAYS SO. The brief screen promises "Este
// brief gobierna el rango, los conceptos y las aprobaciones" and the Range
// header was reading `collection_plans.targets` — a second, free-text model of
// the same facts, unreconciled with the frozen document. What an approved brief
// commits to is the answer; the plan's own targets fill only what the brief
// leaves open.
//
// ⚠ AND THE FIRST CUT OF IT READ THE WRONG SHAPE, SO IT DID NOTHING (owner
// walkthrough 2026-08-12). It looked for `approved.content.target_margin_pct`
// — a wrapper object and two field names the engine has never returned. `c` was
// always `{}`, every field came back "", and the helper was inert: the header
// rendered BLANK while a frozen, approved brief sat one tab away saying AW26 ·
// AR, UY · ecommerce, retail · 58% margen · 40% newness.
//
// Blank is less dishonest than the invented "Drop 1 / Argentina / DTC +
// tiendas" it replaced, which is exactly why it looked fixed. It was not: the
// brief still did not govern the range, it had only stopped saying something
// false. A silent no-op is the failure mode to watch for here, because both
// states look calm.
//
// The real shape, checked against a live GET /collections/{id}/brief: fields
// sit DIRECTLY on the version, and the targets are `margin_target` and
// `newness_target`.
function fromApprovedBrief(brief) {
  const v = (brief?.versions || []).find((x) => x.status === "approved");
  const list = (x) => (Array.isArray(x) ? x.filter(Boolean).join(" · ") : (x || ""));
  return {
    season: v?.season || "",
    drop: v?.drop_name || "",
    market: list(v?.markets),
    channel: list(v?.channels),
    targetMargin: v?.margin_target ?? "",
    targetNewness: v?.newness_target ?? "",
    _approvedVersion: v?.version_number ?? null,
    _approvedBy: v?.approved_by || null,
    _approvedAt: v?.approved_at || null,
  };
}

function Stat({ value, label, tone }) {
  return <div className={`rp2-kpi ${tone || ""}`}><span>{label}</span><b>{value}</b></div>;
}

function Bar({ value, target, label, suffix = "" }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="rp2-bar">
      <div><span>{label}</span><b>{value}{suffix} / {target}{suffix}</b></div>
      <i><em style={{ width: `${pct}%` }} /></i>
    </div>
  );
}

export default function LinePlan({ onNavigate }) {
  // The active collection is SHARED (CollectionProvider). This view used to take
  // colls[0] while Review took the first item with a cover, so the two screens
  // could be on different collections (2026-07-24 audit).
  const collectionCtx = useCollection();
  const [colls, setColls] = useState([]);
  const activeId = collectionCtx.activeId;
  const [scope, setScope] = useState("local");
  const [brandId, setBrandId] = useState(null);
  const [plans, setPlans] = useState({});
  const [serverPlan, setServerPlan] = useState(null);   // engine collection_plan
  // Bumped by any write in either surface so the board and the table remount
  // together. Two views of the same rows showing different numbers is worse
  // than one view, which is the whole reason the table is collapsed.
  const [planNonce, setPlanNonce] = useState(0);
  const [planScope, setPlanScope] = useState("local");  // "team" | "local"
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", silhouette: "", fabricName: "", precio: "", dueAt: todayPlus(45) });

  useEffect(() => {
    let dead = false;
    (async () => {
      const loaded = await loadCollections();
      if (dead) return;
      setColls(loaded.colls || []);
      setScope(loaded.scope);
      setBrandId(loaded.brandId);
      setPlans(readPlans());
    })();
    return () => { dead = true; };
  }, [collectionCtx.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // THE PLAN IS THE SERVER'S SLOTS. Everything on this screen — the headline
  // stats, the coverage bars, the visual assortment — is derived from these,
  // never from the local studio cards. Before this, the stats counted design
  // cards while the financial plan counted server rows, and the copy claimed
  // they were the same object: the screen could show "1 estilo" above a plan
  // with zero rows.
  const [brief, setBrief] = useState(null);
  useEffect(() => {
    let dead = false;
    if (!brandId || !activeId) { setBrief(null); return () => {}; }
    getBrief(brandId, activeId).then((b) => { if (!dead) setBrief(b); }).catch(() => {});
    return () => { dead = true; };
  }, [brandId, activeId]);

  const [serverVersion, setServerVersion] = useState(null);
  const onVersion = useCallback((v) => setServerVersion(v), []);
  const slots = serverVersion?.slots || [];

  // Which colours a row plans (engine 0086). One slot at a time and fetched on
  // demand: the answer carries approval evidence per colourway, which is a read
  // nobody needs for ten rows at once.
  const [cwSlot, setCwSlot] = useState(null);
  const [cwData, setCwData] = useState(null);
  const [cwBusy, setCwBusy] = useState(false);
  const [cwErr, setCwErr] = useState(null);
  // The revision THIS panel last saw confirmed, which is not the one the page
  // loaded with once she has written anything. null until the panel opens.
  const [cwRevision, setCwRevision] = useState(null);
  const openColours = useCallback(async (slotId) => {
    setCwSlot(slotId); setCwErr(null); setCwData(null);
    setCwRevision(null);
    setCwData(await getSlotColourways(brandId, slotId));
  }, [brandId]);
  // ⚠ THE WRITE CLOCK MOVES ON EVERY WRITE, INCLUDING HERS. Planning a colour
  // bumps the plan version's `revision`, so a second colour sent with the
  // revision this screen LOADED with is stale and the engine refuses it —
  // correctly, and with a message about "another session" that would be a lie
  // to show her, because the other session was her own click a second earlier.
  // Found by planning two colours in a row in the running app.
  //
  // So each response's `plan_revision` becomes the next request's precondition,
  // and the freshly read version is handed back UP so the rest of the screen
  // agrees with what the database now says.
  const colourAct = useCallback(async (fn) => {
    setCwBusy(true); setCwErr(null);
    try {
      const next = await fn();
      setCwData(next);
      setCwRevision((prev) => nextPlanRevision(prev, next));
      if (serverVersion?.id) {
        const fresh = await getPlanVersion(brandId, serverVersion.id);
        if (fresh) onVersion(fresh);
      }
    } catch (e) {
      // The engine's refusal IS the message — "ese color pertenece a otro
      // estilo" is better copy than anything written here.
      setCwErr(typeof e?.payload === "string" ? e.payload
        : e?.payload?.message || e?.payload?.detail || e?.message
          || "no se pudo");
    }
    setCwBusy(false);
  }, [brandId, onVersion, serverVersion?.id]);

  const coll = colls.find((c) => c.id === activeId) || colls[0] || null;
  // Server targets win over the local mirror: they are the shared commitment.
  // Precedence, most authoritative last EXCEPT the brief, which wins outright:
  // local mirror < the plan's own targets < the approved brief. A frozen,
  // human-approved document is not overridden by a free-text field somebody
  // typed into a different screen.
  const briefTargets = fromApprovedBrief(brief);
  const plan = coll
    ? { ...DEFAULT_PLAN, ...(plans[coll.id] || {}), ...(serverPlan?.targets || {}),
        ...Object.fromEntries(Object.entries(briefTargets).filter(([, v]) => v !== "" && v != null)) }
    : DEFAULT_PLAN;
  const items = coll?.items || [];
  const season = plan.season;

  // Load (or create) the engine plan for this season. Targets then persist for
  // the brand instead of only in this browser.
  useEffect(() => {
    let dead = false;
    if (!brandId || !season) { setServerPlan(null); setPlanScope("local"); return () => {}; }
    (async () => {
      const localTargets = coll ? (plans[coll.id] || {}) : {};
      const p = await planForSeason(brandId, season, localTargets, collectionCtx.activeId);
      if (dead) return;
      setServerPlan(p);
      setPlanScope(p ? "team" : "local");
    })();
    return () => { dead = true; };
  }, [brandId, season, collectionCtx.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = useMemo(() => {
    const cats = new Map(), fabrics = new Map(), colors = new Set();
    let priced = 0, missing = 0, withConcept = 0, carryovers = 0;
    for (const slot of slots) {
      const cat = slot.category || "Sin categoría";
      cats.set(cat, (cats.get(cat) || 0) + 1);
      const fabric = slot.material_id || "Sin material";
      fabrics.set(fabric, (fabrics.get(fabric) || 0) + 1);
      if (slot.colorway) colors.add(slot.colorway);
      if (slot.retail_price != null) priced++;
      // "Incomplete" against what the engine needs to approve, not against a
      // second opinion invented here.
      if (slot.retail_price == null || slot.landed_cost == null
          || !slot.delivery_date) missing++;
      if (slot.concept_id) withConcept++;
      if (slot.carryover_type === "carryover") carryovers++;
    }
    return {
      cats: [...cats.entries()].sort((a, b) => b[1] - a[1]),
      fabrics: [...fabrics.entries()].sort((a, b) => b[1] - a[1]),
      colors: colors.size, priced, missing, withConcept, carryovers,
    };
  }, [slots]);

  // ⚠ THIS SCREEN USED TO COMPUTE ITS OWN NEWNESS, AND DISAGREED WITH THE
  // ENGINE BY DEFINITION (owner bug hunt, 2026-08-13).
  //
  //   engine  (planning.py): new = count(carryover_type == "new")
  //   here:                  new = total − count(carryover_type == "carryover")
  //
  // `carryover_type` is nullable and also accepts "variation", so everything
  // undeclared counted as new HERE and as nothing THERE. Import a range plan
  // whose CSV had no continuity column — ten slots, all null — and the same
  // screen said three different things at once: RangeBoard "sin declarar 10",
  // this KPI "100% newness" with its target bar full green, and the engine's
  // own totals row, eight hundred pixels below, "Newness 0.0%" beneath the
  // caption "esta pantalla no recalcula nada."
  //
  // A merchandiser reads the big number and signs off on a newness commitment
  // the engine says is unmet. So the number is the ENGINE's or it is absent —
  // this screen does not get a second opinion. `null` renders "—", which is
  // the honest answer when the plan has no approved version to total.
  const engineNewness = serverVersion?.totals?.newness_pct;
  const newness = engineNewness == null ? null : Number(engineNewness);

  // Studio cards that are NOT a row in the plan. Shown separately and named
  // for what they are — design exploration — rather than counted as plan
  // coverage, which is what made the two halves disagree.
  const linkedConceptIds = new Set(slots.map((s) => s.concept_id).filter(Boolean));
  const unplanned = items.filter((it) => !linkedConceptIds.has(it.conceptId || it.id));

  const patchPlan = async (patch) => {
    if (!coll) return;
    const merged = { ...plan, ...patch };
    const next = { ...plans, [coll.id]: merged };
    setPlans(next);                       // optimistic, plus the offline mirror
    if (!writePlans(next)) setNotice("No se pudo guardar el plan en este navegador.");
    if (!brandId || !serverPlan) { setPlanScope("local"); return; }
    try {
      const saved = await setTargets(brandId, serverPlan.id, merged);
      setServerPlan(saved);
      setPlanScope("team");
      setNotice("");
    } catch (e) {
      setPlanScope("local");
      setNotice(e?.status === 409
        ? "El plan está aprobado: reabrilo antes de cambiar objetivos."
        : "Los objetivos quedaron solo en este navegador — el motor no respondió.");
    }
  };

  async function persistCollection(nextColl) {
    const nextList = colls.map((c) => c.id === nextColl.id ? nextColl : c);
    setColls(nextList);
    saveAllLocal(nextList, brandId);
    if (!brandId || nextColl.version == null) { setScope("local"); return; }
    setSaving(true);
    const result = await saveCollection(brandId, nextColl, { updatedBy: "Line Plan" });
    if (result.ok && result.collection) {
      setColls((current) => current.map((c) => c.id === result.collection.id ? result.collection : c));
      setScope(result.scope);
      setNotice("Plan y colección guardados para el equipo.");
    } else if (result.conflict) {
      setNotice(`La colección cambió en otra sesión (v${result.conflict.version}). Recargá antes de editar.`);
    } else {
      setScope("local");
      setNotice("El motor no respondió; los cambios quedaron solo en este navegador.");
    }
    setSaving(false);
  }

  function addPlaceholder() {
    if (!coll || !draft.name.trim()) return;
    const item = {
      id: uid(), name: draft.name.trim(), silhouette: draft.silhouette.trim(),
      category: draft.silhouette.trim(), fabricName: draft.fabricName.trim(),
      precio: draft.precio, dueAt: draft.dueAt, colorway: "#17181C",
      images: [], cover: null, rating: null, approved: false, carryover: false,
      // No silent ownership: a placeholder starts unassigned — the team assigns
      // a real owner/approver in Studio, instead of a default persona appearing
      // to have accepted responsibility (owner audit 2026-07-24).
      ownerId: null, approverId: null,
      approvalStatus: "draft", createdAt: new Date().toISOString(),
      nota: "Placeholder creado desde Line Plan.",
    };
    persistCollection({ ...coll, items: [...items, item], updatedAt: new Date().toISOString() });
    setDraft({ name: "", silhouette: "", fabricName: "", precio: "", dueAt: todayPlus(45) });
    setAdding(false);
  }

  return (
    <section className="view on rp2">
      <style dangerouslySetInnerHTML={{ __html: `
        /* ============ Plan de rango — precision-instrument restyle (rp2-) ==
           Everything scoped under .rp2. The rs-*/rb-* rules below restyle the
           markup of RangeSlots/RangeBoard (children of this view) without
           touching their files: descendant selectors from here win over the
           shared sheets on specificity. */

        /* ---- header ---- */
        .rp2-head{display:flex;justify-content:space-between;gap:var(--s4);align-items:flex-end;flex-wrap:wrap;margin-bottom:var(--s4)}
        .rp2-eyebrow{font-family:var(--d);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--editorial);font-weight:500}
        .rp2-head h1{font-family:var(--serif);font-weight:500;font-size:34px;line-height:1.1;letter-spacing:-.01em;margin:6px 0 8px}
        .rp2-head p{font-size:12.5px;color:var(--ink-2);margin:0;max-width:640px;line-height:1.5}
        .rp2-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .rp2-scope{font-family:var(--d);font-size:11px;letter-spacing:.02em}
        .rp2-scope.team{color:var(--positive)}
        .rp2-scope.local{color:var(--warning)}

        /* ---- buttons: blue only on pressable, primary alone is solid ---- */
        .rp2-btn{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);padding:9px 14px;font-size:12px;font-weight:600;color:var(--ink);cursor:pointer}
        .rp2-btn:hover{border-color:var(--ink-3)}
        .rp2-btn.primary{background:var(--cobalt);color:#fff;border-color:var(--cobalt)}
        .rp2-btn.primary:hover{background:var(--cobalt-ink);border-color:var(--cobalt-ink)}
        .rp2-btn:disabled{opacity:.5;cursor:default}

        /* ---- targets: the plan's own commitments, editable ---- */
        .rp2-targets{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:var(--s3);background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:var(--s4);margin-bottom:var(--s3)}
        .rp2-targets label{font-family:var(--d);font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:500;color:var(--ink-3)}
        .rp2-targets input{display:block;width:100%;margin-top:6px}
        .rp2-targets input,.rp2-form input{border:1px solid var(--line);border-radius:var(--r-xs);background:var(--paper-2);padding:8px 10px;color:var(--ink);font-size:13px;font-family:var(--ui)}
        .rp2-targets input[type=number],.rp2-form input{font-variant-numeric:tabular-nums}
        .rp2-targets input:focus,.rp2-form input:focus{outline:none;border-color:var(--cobalt);background:var(--surface);box-shadow:0 0 0 2px var(--cobalt-wash)}

        /* ---- KPI strip: one white card, hairline-separated cells ---- */
        .rp2-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;margin-bottom:var(--s3)}
        .rp2-kpi{background:var(--surface);padding:13px 16px}
        .rp2-kpi span{display:block;font-family:var(--d);font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
        .rp2-kpi b{display:block;font-family:var(--disp);font-size:21px;font-weight:600;line-height:var(--lh-flat);letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}
        .rp2-kpi.warn b{color:var(--warning)}

        /* ---- cards ---- */
        .rp2-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:var(--s4) 18px;margin-bottom:var(--s3)}
        .rp2-card h3{font-size:15px;font-weight:700;letter-spacing:-.01em;margin:0 0 3px}
        .rp2-card h4{font-size:13px;font-weight:700;margin:0 0 3px}
        .rp2-sub{font-size:12px;color:var(--ink-3);line-height:1.5;margin-bottom:var(--s3)}
        .rp2-btn.small{padding:5px 9px;font-size:11px;font-weight:500;margin-top:6px}
        .rp2-warn{font-size:12px;line-height:1.5;color:var(--bad,#8a2b2b);margin-bottom:var(--s3)}
        .rp2-colours{border:1px solid var(--line);border-radius:var(--r-sm);padding:var(--s3);margin-top:var(--s3);background:var(--card)}
        .rp2-colours-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
        .rp2-colours-head h4{font-size:14px;margin:0}
        .rp2-colour-group{margin-top:10px}
        .rp2-colour{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;
                    padding:8px 0;border-top:1px solid var(--line);font-size:12px}
        .rp2-colour .rp2-sub{margin-bottom:0}
        .rp2-notice{font-size:12.5px;color:var(--ink-2);background:var(--ochre-wash);border-left:3px solid var(--warning);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:9px 12px;margin:0 0 var(--s3)}

        /* ---- add-placeholder form ---- */
        .rp2-form{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;gap:8px;margin-top:var(--s2)}
        .rp2-form input{width:100%}

        /* ---- collapsed table toggle (pressable, so cobalt is allowed) ---- */
        .rp2-details{margin:var(--s4) 0 0}
        .rp2-details>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:var(--r-sm);background:var(--surface);border:1px solid var(--line);font-size:12.5px;font-weight:600;color:var(--cobalt)}
        .rp2-details>summary::-webkit-details-marker{display:none}
        .rp2-details>summary::before{content:"▸";color:var(--ink-3)}
        .rp2-details[open]>summary::before{content:"▾"}
        .rp2-details>summary:hover{border-color:var(--cobalt)}
        .rp2-details[open]>summary{margin-bottom:var(--s3)}

        /* ---- coverage bars (not pressable: no blue) ---- */
        .rp2-bars{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)}
        .rp2-bar div{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
        .rp2-bar div span{color:var(--ink-2)}
        .rp2-bar b{font-variant-numeric:tabular-nums}
        .rp2-bar i{display:block;height:6px;background:var(--paper-2);border-radius:99px;overflow:hidden}
        .rp2-bar em{display:block;height:100%;background:var(--ink-2);border-radius:99px}

        /* ---- visual assortment tiles ---- */
        .rp2-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.7fr);gap:var(--s3);align-items:start}
        .rp2-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:var(--s3);margin-top:var(--s3)}
        .rp2-item{border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;background:var(--card);cursor:pointer;transition:border-color .14s}
        .rp2-item:hover{border-color:var(--ink-3)}
        .rp2-img{aspect-ratio:4/3;background:var(--paper-2)}
        .rp2-img img{width:100%;height:100%;object-fit:cover;display:block}
        .rp2-img .mtile{width:100%;height:100%;border-radius:0}
        .rp2-body{padding:10px 12px}
        .rp2-name{font-size:13px;font-weight:700}
        .rp2-meta{font-size:11px;color:var(--ink-3);margin-top:3px;font-variant-numeric:tabular-nums}
        .rp2-state{display:inline-block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);background:var(--paper-2);border-radius:999px;padding:3px 8px;margin-top:8px}
        .rp2-state.ok{color:var(--positive);background:color-mix(in srgb,var(--positive) 12%,#fff)}
        .rp2-unplanned{margin-top:var(--s4);padding-top:var(--s4);border-top:1px solid var(--hair)}
        .rp2-unplanned p{font-size:12px;color:var(--ink-3);margin:0}

        /* ---- mix chips ---- */
        .rp2-mix{display:flex;gap:6px;flex-wrap:wrap}
        .rp2-chip{font-size:11px;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 10px;color:var(--ink-2)}
        .rp2-chip b{color:var(--ink);font-variant-numeric:tabular-nums}

        /* ---- empty state: calm, centered, honest ---- */
        .rp2-empty{display:grid;place-items:center;align-content:center;min-height:340px;text-align:center;color:var(--ink-3)}
        .rp2-empty h4{font-family:var(--serif);font-weight:500;font-size:22px;color:var(--ink);margin:0 0 6px}
        .rp2-empty p{max-width:36ch;margin:0 auto var(--s4);font-size:13px;line-height:1.5}

        /* ================= RangeSlots (rs-) — THE TABLE ================= */
        .rp2 .rs-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 var(--s3)}
        .rp2 .rs-status{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;border:none;border-radius:999px;padding:4px 10px;background:var(--paper-2);color:var(--ink-3)}
        .rp2 .rs-status.approved{background:color-mix(in srgb,var(--positive) 12%,#fff);color:var(--positive)}
        .rp2 .rs-status.in_review{background:var(--ochre-wash);color:var(--warning)}
        .rp2 .rs-vers{font-family:var(--d);font-size:11px;color:var(--ink-3);border:1px solid var(--hair-2);border-radius:999px;padding:3px 9px}
        .rp2 .rs-vers em{font-style:normal}
        .rp2 .rs-approver{font-family:var(--d);font-size:11px;color:var(--ink-3)}
        .rp2 .rs-notice{font-size:12.5px;color:var(--ink-2);border:1px solid var(--line);background:var(--paper-2);border-radius:var(--r-xs);padding:9px 12px;margin:0 0 var(--s3)}

        /* the engine's refusal + readiness issues: slim left-bordered strips */
        .rp2 .rs-refusal{border:none;border-left:3px solid var(--danger);background:var(--clay-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:11px 14px;font-size:12.5px;margin:0 0 var(--s3)}
        .rp2 .rs-refusal b{color:var(--danger)}
        .rp2 .rs-refusal li{font-size:12.5px;color:var(--ink-2);margin:3px 0}
        .rp2 .rs-refusal code,.rp2 .rs-issue code{font-family:var(--d);font-size:11px;background:rgba(255,255,255,.7);border-radius:4px;padding:1px 5px}
        .rp2 .rs-issues{display:flex;flex-direction:column;gap:6px;margin:0 0 var(--s3)}
        .rp2 .rs-issue{font-size:12.5px;color:var(--ink-2);border:none;border-radius:0 var(--r-xs) var(--r-xs) 0;padding:8px 12px;display:flex;align-items:baseline;gap:8px}
        .rp2 .rs-issue.block{border-left:3px solid var(--danger);background:var(--clay-wash)}
        .rp2 .rs-issue.warn{border-left:3px solid var(--warning);background:var(--ochre-wash)}
        .rp2 .rs-issue>span{font-family:var(--d);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
        .rp2 .rs-issue.block>span{color:var(--danger)}
        .rp2 .rs-issue.warn>span{color:var(--warning)}

        /* engine totals as a hairline KPI strip */
        .rp2 .rs-totals{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin:0 0 var(--s2)}
        .rp2 .rs-t{background:var(--surface);padding:12px 14px;border:none}
        .rp2 .rs-t b{display:block;font-family:var(--disp);font-size:18px;font-weight:600;line-height:var(--lh-flat);letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
        .rp2 .rs-t span{display:block;font-family:var(--d);font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;margin-top:5px}
        .rp2 .rs-src{font-size:11px;color:var(--ink-3);margin:0 0 var(--s3);line-height:1.55}
        .rp2 .rs-src b{color:var(--warning)}

        /* the table itself: white card, mono header band, tabular numerals */
        .rp2 .rs-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
        .rp2 .rs-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
        .rp2 .rs-table th{text-align:left;font-family:var(--d);font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);background:var(--paper-2);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
        /* money/units/lead columns and the derived Venta/Margen: right-aligned */
        .rp2 .rs-table th:nth-child(n+4):nth-child(-n+8),
        .rp2 .rs-table th:nth-child(10),.rp2 .rs-table th:nth-child(11){text-align:right}
        .rp2 .rs-table td{padding:5px 6px;border-bottom:1px solid var(--hair);vertical-align:middle}
        .rp2 .rs-table tbody tr:last-child td{border-bottom:none}
        .rp2 .rs-table tbody tr:hover td{background:var(--paper-2)}
        .rp2 .rs-table td.rs-num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;color:var(--ink-2);padding:13px 12px}
        .rp2 .rs-in{width:100%;border:1px solid transparent;border-radius:var(--r-xs);padding:8px;font-size:13px;color:var(--ink);background:transparent;font-family:var(--ui)}
        .rp2 .rs-in:hover:not(:disabled){border-color:var(--line)}
        .rp2 .rs-in:focus{border-color:var(--cobalt);outline:none;background:var(--surface);box-shadow:0 0 0 2px var(--cobalt-wash)}
        .rp2 .rs-in.num{text-align:right;font-variant-numeric:tabular-nums}
        .rp2 .rs-in:disabled{color:var(--ink-2)}
        /* ---- the price a row's own numbers imply (rs-sug-) ----------------
           A quiet strip under each row: a stated figure, where it falls in her
           own band, and ONE pressable thing. The figure is not blue — it is not
           pressable, and blue here would read as a recommendation. */
        .rp2 .rs-sug td{background:var(--paper-2);border-bottom:1px solid var(--line);padding:8px 12px}
        .rp2 .rs-table tbody tr.rs-sug:hover td{background:var(--paper-2)}
        .rp2 .rs-sug-cell{font-size:12px;line-height:1.55;color:var(--ink-2)}
        .rp2 .rs-sug-lead{color:var(--ink-2)}
        .rp2 .rs-sug-fig{font-family:var(--disp);font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
        .rp2 .rs-sug-note{font-size:11px;color:var(--ink-3);margin-left:8px}
        .rp2 .rs-sug-band{display:inline-block;font-size:12px;color:var(--ink-2);margin-left:10px;padding-left:10px;border-left:1px solid var(--hair-2)}
        .rp2 .rs-sug-band.out{color:var(--warning);font-weight:600}
        .rp2 .rs-sug-miss{font-size:12px;color:var(--ink-3)}
        .rp2 .rs-sug-miss b{color:var(--ink-2);font-weight:600}
        .rp2 .rs-sug-fill{margin-left:12px;border:1px solid var(--cobalt);border-radius:var(--r-sm);background:var(--surface);color:var(--cobalt);padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer}
        .rp2 .rs-sug-fill:hover:not(:disabled){background:var(--cobalt);color:#fff}
        .rp2 .rs-sug-fill:disabled{opacity:.5;cursor:default}
        .rp2 .rs-empty-row{text-align:center;color:var(--ink-3);padding:26px 0;font-size:12.5px}
        .rp2 .rs-empty{color:var(--ink-3);font-size:12.5px;padding:10px 0}
        .rp2 .rs-team{border:1px solid var(--line);border-radius:var(--r-xs);color:var(--ink-3)}
        .rp2 .rs-team:hover{border-color:var(--cobalt);color:var(--cobalt)}
        .rp2 .rs-del:hover{color:var(--danger)}

        /* actions: one solid cobalt primary, everything else quiet */
        .rp2 .rs-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:var(--s3)}
        .rp2 .rs-actions button{border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);padding:9px 14px;font-size:12px;font-weight:600;color:var(--ink);cursor:pointer}
        .rp2 .rs-actions button:hover:not(:disabled){border-color:var(--ink-3)}
        .rp2 .rs-actions button:disabled{opacity:.5;cursor:default}
        .rp2 .rs-primary{background:var(--cobalt) !important;color:#fff !important;border-color:var(--cobalt) !important}

        /* ============ RangeBoard (rb-) — lift below-floor sizes ========== */
        .rp2 .rb-chips span{font-family:var(--d);font-size:11px;letter-spacing:.02em}
        .rp2 .rb-code{font-size:11px}
        .rp2 .rb-col-head{font-size:11px;letter-spacing:.06em}
        .rp2 .rb-col-head span{font-size:11px}
        .rp2 .rb-meta{font-size:11px}
        .rp2 .rb-tag{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px}
        .rp2 .rb-tag.ok{background:color-mix(in srgb,var(--positive) 12%,#fff);color:var(--positive)}
        .rp2 .rb-tag.warn{background:var(--ochre-wash);color:var(--warning)}
        .rp2 .rb-tag.bad{background:var(--clay-wash);color:var(--danger)}
        .rp2 .rb-input{font-size:13px;border:1px solid var(--line);border-radius:var(--r-xs);background:var(--paper-2)}
        .rp2 .rb-input:focus{background:var(--surface)}
        .rp2 .rb-flag.bad{color:var(--danger)}

        /* ---- responsive ---- */
        @media(max-width:1050px){
          .rp2-targets{grid-template-columns:repeat(2,1fr)}
          .rp2-kpis{grid-template-columns:repeat(3,1fr)}
          .rp2-grid{grid-template-columns:1fr}
          .rp2-form{grid-template-columns:1fr 1fr}
          .rp2 .rs-totals{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:600px){
          .rp2-targets,.rp2-kpis{grid-template-columns:1fr 1fr}
          .rp2 .rs-totals{grid-template-columns:1fr 1fr}
        }
      ` }} />

      <div className="rp2-head">
        <div><div className="rp2-eyebrow">Plan · colección y negocio</div><h1>Plan de rango</h1>
          <p>Construí el surtido visualmente y comprobá categoría, precio, color, material, entrega y aprobación antes de comprometer desarrollo.</p></div>
        <div className="rp2-actions">
          {/* The collection is chosen once, in the topbar — not per screen. */}
          <span className={`rp2-scope ${planScope}`} title="alcance de los objetivos comerciales de este plan">
            {planScope === "team" ? "● objetivos guardados para la marca" : "● objetivos solo en este navegador"}
          </span>
          <button className="rp2-btn primary" onClick={() => setAdding((v) => !v)}>＋ Placeholder</button>
        </div>
      </div>

      {!coll ? <div className="rp2-empty"><h4>No hay colección todavía</h4><p>Creá una colección en el Estudio de concepto para empezar a planificar.</p>
        <button className="rp2-btn primary" onClick={() => onNavigate?.("studio")}>Abrir el Estudio de concepto</button></div> : <>
        <div className="rp2-targets">
          {[["season","Temporada"],["drop","Drop / entrega"],["market","Mercado"],["channel","Canal"]].map(([key,label]) =>
            <label key={key}>{label}<input value={plan[key]} onChange={(e) => patchPlan({ [key]: e.target.value })} /></label>)}
          {[["targetStyles","Estilos objetivo"],["targetColorways","Colorways objetivo"],["targetNewness","Newness %"],["targetMargin","Margen objetivo %"]].map(([key,label]) =>
            <label key={key}>{label}<input type="number" value={plan[key]} onChange={(e) => patchPlan({ [key]: Number(e.target.value) })} /></label>)}
        </div>

        <div className="rp2-kpis">
          <Stat value={slots.length} label={plan.targetStyles ? `filas / ${plan.targetStyles}` : "filas · objetivo sin definir"} />
          <Stat value={metrics.colors} label={plan.targetColorways ? `colores / ${plan.targetColorways}` : "colores · objetivo sin definir"} />
          {/* The engine's figure or none — see the note on `newness` above. */}
          <Stat value={newness == null ? "—" : `${newness}%`}
                label={newness == null
                  ? "newness · el motor todavía no lo calculó"
                  : plan.targetNewness ? `newness / ${plan.targetNewness}%` : "newness · objetivo sin definir"} />
          <Stat value={metrics.priced} label="con precio" />
          <Stat value={metrics.withConcept} label="con concepto" />
          <Stat value={metrics.missing} label="filas incompletas" tone={metrics.missing ? "warn" : ""} />
        </div>

        {adding && <div className="rp2-card">
          <h3>Nuevo placeholder</h3><div className="rp2-sub">Reservá el lugar comercial antes de tener el diseño final.</div>
          <div className="rp2-form">
            <input placeholder="Nombre / intención" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input placeholder="Categoría" value={draft.silhouette} onChange={(e) => setDraft({ ...draft, silhouette: e.target.value })} />
            <input placeholder="Material" value={draft.fabricName} onChange={(e) => setDraft({ ...draft, fabricName: e.target.value })} />
            <input placeholder="Precio objetivo" value={draft.precio} onChange={(e) => setDraft({ ...draft, precio: e.target.value })} />
            <input type="date" value={draft.dueAt} onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })} />
            <button className="rp2-btn primary" disabled={!draft.name.trim() || saving} onClick={addPlaceholder}>{saving ? "Guardando…" : "Agregar"}</button>
          </div>
        </div>}
        {notice && <div className="rp2-notice">{notice}</div>}

        {/* The commercial half: server-owned assortment rows with the engine's
            own money, blockers and approval (0032). The visual surtido below
            stays what it is — the design view of the same collection. */}
        <div className="rp2-card">
          <h3>Plan financiero · filas de surtido</h3>
          <div className="rp2-sub">
            Precio, costo, unidades, MOQ y entrega por estilo. Los totales, los
            bloqueos y la aprobación los calcula el motor — esta pantalla no
            recalcula nada.
          </div>
          {/* The board IS the plan now: the same server-owned slots, editable
              in the detail panel beside the garment. The table stays — it owns
              submission, approval, adding and deleting rows — but COLLAPSED,
              because rendering the same ten slots twice was 1,528px of one
              dataset drawn two ways and most of why this page never ended.

              `planNonce` keeps them honest: any save in either remounts the
              other, so the two can never show different numbers for the same
              row. */}
          <RangeBoard nonce={planNonce} onChanged={() => setPlanNonce((n) => n + 1)} />
          <details className="rp2-details" onToggle={(e) => e.currentTarget.open && setPlanNonce((n) => n + 1)}>
            <summary>
              Ver como tabla — editar todas las filas, agregar, enviar a aprobación
            </summary>
            <RangeSlots key={planNonce} brandId={brandId} planId={serverPlan?.id || null}
                        currency={plan.currency || "ARS"} onVersion={onVersion}
                        onNavigate={onNavigate} collectionId={collectionCtx?.activeId || null} />
          </details>
        </div>

        <div className="rp2-grid">
          <div className="rp2-card">
            <h3>Surtido visual</h3>
            <div className="rp2-sub">
              Una tarjeta por FILA del plan de arriba — el mismo objeto, no una
              segunda lista. Una fila sin concepto asignado se ve igual: existe
              comercialmente y todavía no tiene diseño.
            </div>
            <div className="rp2-bars">
              {plan.targetStyles
                ? <Bar value={slots.length} target={plan.targetStyles} label="Cobertura de estilos" />
                : <div className="rp2-sub">Definí el objetivo de estilos para medir cobertura.</div>}
              {plan.targetNewness && newness != null
                ? <Bar value={newness} target={plan.targetNewness} label="Newness" suffix="%" />
                : <div className="rp2-sub">{plan.targetNewness
                    ? "El motor todavía no calculó el newness de esta versión."
                    : "Definí el objetivo de newness para medirlo."}</div>}
            </div>
            <div className="rp2-items">
              {slots.map((slot) => {
                // The design card behind this row, when one is assigned. Its
                // imagery is borrowed for the tile; its numbers are NOT — the
                // money on screen is always the slot's.
                const card = items.find((it) => (it.conceptId || it.id) === slot.concept_id);
                return (
                  <article className="rp2-item" key={slot.id}
                           onClick={() => card && onNavigate?.(`studio:${card.id}`)}>
                    <div className="rp2-img">{card?.cover
                      ? <img src={abs(card.cover)} alt={slot.slot_code} />
                      : <Thumbnail color={slot.colorway} fabric={slot.material_id || "material pendiente"} />}</div>
                    <div className="rp2-body">
                      <div className="rp2-name">{slot.slot_code}</div>
                      <div className="rp2-meta">{slot.category || "sin categoría"} · {slot.carryover_type || "sin tipo"}</div>
                      <div className="rp2-meta">
                        {slot.retail_price ? `${slot.currency || "AR$"} ${slot.retail_price}` : "precio pendiente"}
                        {" · "}{slot.delivery_date || "entrega pendiente"}
                      </div>
                      <span className={`rp2-state${slot.concept_id ? " ok" : ""}`}>
                        {slot.concept_id ? "concepto asignado" : "sin concepto"}
                      </span>
                      {/* The second transition (engine 0086). A row that is not
                          yet a Style has no colours to plan — a colour belongs
                          to a garment — so the affordance says that instead of
                          offering an action that would be refused. */}
                      {slot.style_id ? (
                        <button type="button" className="rp2-btn small"
                          onClick={(e) => { e.stopPropagation(); openColours(slot.id); }}>
                          {cwSlot === slot.id ? "Colores ▾" : "Colores"}
                        </button>
                      ) : (
                        <span className="rp2-state">sin estilo — no planifica colores</span>
                      )}
                    </div>
                  </article>
                );
              })}
              {!slots.length && (
                <div className="rp2-sub">
                  El plan todavía no tiene filas. Agregalas arriba: una fila es
                  el compromiso comercial, y el diseño se le asigna después.
                </div>
              )}
            </div>

            {cwSlot && (
              <div className="rp2-colours">
                <div className="rp2-colours-head">
                  <h4>
                    Colores de {slots.find((x) => x.id === cwSlot)?.slot_code || "esta fila"}
                  </h4>
                  <button type="button" className="rp2-btn small"
                    onClick={() => { setCwSlot(null); setCwData(null);
                      setCwErr(null); setCwRevision(null); }}>
                    Cerrar
                  </button>
                </div>
                {cwErr && <p className="rp2-warn">{cwErr}</p>}
                {cwData === null ? (
                  <div className="rp2-sub">Buscando los colores de esta fila…</div>
                ) : (
                  <>
                    {/* ⚠ The declaration and the count, side by side, with the
                        contradiction NAMED. planned_skus is the planner's
                        number and nothing here rewrites it. */}
                    {reconciliationSentences(cwData.reconciliation).map((r, i) => (
                      <p key={i} className={r.tone === "warn" ? "rp2-warn" : "rp2-sub"}>
                        {r.text}
                      </p>
                    ))}
                    {!canPlanColours(serverVersion?.status) && (
                      <p className="rp2-sub">{whyLocked(serverVersion?.status)}</p>
                    )}
                    {[["planned", "Planificados"], ["candidates", "Del estilo, sin planificar"]]
                      .map(([key, title]) => (
                      <div key={key} className="rp2-colour-group">
                        <div className="rp2-sub"><b>{title}</b></div>
                        {(cwData[key] || []).length === 0 && (
                          <div className="rp2-sub">
                            {key === "planned"
                              ? "Esta fila todavía no planifica ningún color."
                              : "No quedan colores del estilo sin planificar."}
                          </div>
                        )}
                        {(cwData[key] || []).map((c) => {
                          const st = imageState(c.image_approval);
                          const detail = approvalDetail(c.image_approval);
                          return (
                            <div className="rp2-colour" key={c.colourway_id}>
                              <span>
                                <b>{c.colour_code}</b>
                                {c.colour_name ? ` · ${c.colour_name}` : ""}
                                <div className="rp2-sub">
                                  estado del producto: {c.lifecycle_status}
                                  {c.planned_by ? ` · planificado por ${c.planned_by}` : ""}
                                </div>
                              </span>
                              {st && (
                                <span className={st.tone === "warn" ? "rp2-warn" : "rp2-sub"}
                                  title={detail || ""}>
                                  {st.tone === "warn" ? "⚠ " : ""}{st.text}
                                </span>
                              )}
                              {canPlanColours(serverVersion?.status) && (
                                <button type="button" className="rp2-btn small"
                                  disabled={cwBusy}
                                  onClick={() => colourAct(() => (
                                    key === "planned"
                                      ? unplanSlotColourway(brandId, cwSlot,
                                          c.colourway_id,
                                          cwRevision ?? serverVersion?.revision)
                                      : planSlotColourway(brandId, cwSlot,
                                          c.colourway_id,
                                          cwRevision ?? serverVersion?.revision)))}>
                                  {key === "planned" ? "Quitar del plan" : "Planificar"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Design work that is NOT in the plan. Named for what it is
                instead of counted as coverage — counting it is what made this
                screen contradict the plan underneath it. */}
            {unplanned.length > 0 && (
              <div className="rp2-unplanned">
                <h4>{unplanned.length} diseño(s) sin fila en el plan</h4>
                <p>
                  Exploración de Studio que todavía no compromete presupuesto.
                  No cuenta para la cobertura de arriba.
                </p>
                <div className="rp2-items">
                  {unplanned.map((item) => (
                    <article className="rp2-item ghost" key={item.id}
                             onClick={() => onNavigate?.(`studio:${item.id}`)}>
                      <div className="rp2-img">{item.cover
                        ? <img src={abs(item.cover)} alt={item.name} />
                        : <Thumbnail color={item.colorway} fabric={item.fabricName || "material pendiente"} />}</div>
                      <div className="rp2-body">
                        <div className="rp2-name">{item.name || "Sin nombre"}</div>
                        <div className="rp2-meta">{item.silhouette || "sin categoría"}</div>
                        <span className="rp2-state">sin fila</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
          <aside>
            <div className="rp2-card"><h3>Mix de categoría</h3><div className="rp2-sub">Dónde está concentrada la colección.</div>
              <div className="rp2-mix">{metrics.cats.map(([name,count]) => <span className="rp2-chip" key={name}><b>{count}</b> {name}</span>)}</div></div>
            <div className="rp2-card"><h3>Mix de materiales</h3><div className="rp2-sub">Concentración y materiales todavía indefinidos.</div>
              <div className="rp2-mix">{metrics.fabrics.map(([name,count]) => <span className="rp2-chip" key={name}><b>{count}</b> {name}</span>)}</div></div>
            {serverPlan && (
              <div className="rp2-card">
                <h3>Plan del motor · {serverPlan.season}</h3>
                <div className="rp2-sub">
                  Armado por el motor con tus ventas y stock reales. Las líneas de
                  carryover llevan una cantidad pronosticada; las direcciones nuevas,
                  una banda de test etiquetada — nunca un pronóstico que un producto
                  nuevo no puede tener.
                </div>
                <div className="rp2-mix">
                  <span className="rp2-chip"><b>{serverPlan.totals?.lines ?? 0}</b> líneas</span>
                  <span className="rp2-chip"><b>{serverPlan.totals?.units ?? 0}</b> unidades</span>
                  <span className="rp2-chip"><b>{serverPlan.totals?.carryover_proven ?? 0}</b> probadas por ventas</span>
                  <span className="rp2-chip"><b>{serverPlan.totals?.new_directions_unproven ?? 0}</b> sin validar</span>
                </div>
                <div className="rp2-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                  {serverPlan.totals?.est_revenue
                    ? `Ingreso estimado ${money(serverPlan.totals.est_revenue)} — precio × unidades planificadas, no una proyección de demanda.`
                    : "Sin ventas propias conectadas todavía, el motor no estima ingreso."}
                </div>
              </div>
            )}
            <div className="rp2-card"><h3>Riesgos antes de review</h3>
              <div className="rp2-sub">{slots.length === 0 ? "El plan todavía no tiene filas — agregalas arriba para evaluar riesgos." : metrics.missing ? `${metrics.missing} fila(s) sin precio, costo o entrega.` : "Todas las filas tienen precio, costo y entrega."}</div>
              <button className="rp2-btn" onClick={() => onNavigate?.("review")}>Abrir Review →</button>
            </div>
          </aside>
        </div>
      </>}
    </section>
  );
}
