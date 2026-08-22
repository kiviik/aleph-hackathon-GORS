"use client";
// Concept Studio — expanded to a COLLECTION workspace (owner, 2026-07-20):
// designers don't make one concept, they make a drop. The working unit is a
// collection of ITEMS; each item carries silhouette + fabric + colorway, and
// the image model renders exactly that combination.
//
// The organs and their honesty rules:
//   · TELAS      — fabric library: your real catalog fabrics, seeded, plus
//                  team-entered fabrics with REAL supplier names (we never
//                  invent fabric shops; "proveedor" is typed by the team).
//   · SILUETAS   — from your own archive's garment types + free text.
//   · CONCEPTO   — real gpt-image-1 generation, prompt built from the item's
//                  silhouette/fabric/colorway + brand DNA; cost visible.
//   · EN MODELO  — try-on as GENERATION (the Alta/PSNYC-style feature):
//                  conditioned on the concept image; labeled "visualización
//                  generada" — we never claim fit accuracy.
//   · PNG ↓      — export for Photoshop (PNG; PSD is out of scope).
//   · Aprobar    — per item, requires the designer's rating, writes the
//                  pipeline card + the append-only decisions ledger.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { colName } from "@/lib/signals";
import { useCollection } from "@/components/CollectionProvider";
import { approveConceptVersion, coverVersion, touchesDesign } from "@/lib/concepts";
import {
  boardConceptCount, registerBoardConcept, syncBoardConcepts,
} from "@/lib/conceptRegistry";
import { ownRefsFromDna, scoreVariation } from "@/lib/differentiation";
import { dnaPromptBlock } from "@/lib/brandDna";
import { getStudioReadiness, postDecision } from "@/lib/api";
import { appFetch, engineFetch } from "@/lib/auth";
import { assetUrl, capReached, generateAssets } from "@/lib/assets";
import { useEngine } from "@/components/EngineProvider";
import StudioItemEditor from "@/components/StudioItemEditor";
import StudioExplore from "@/components/StudioExplore";
import { useTeam } from "@/components/IdentityProvider";
import { makeVersion } from "@/lib/version";
import {
  coverageLine, fetchTasteProfile, fetchTasteScores, itemCandidate,
  matchedSummary, orderByTaste, scoreIndex, tasteStatus,
} from "@/lib/tasteRanking.mjs";
import {
  loadCollections, createCollection, saveCollection, saveAllLocal,
} from "@/lib/studioStore";
import { getDirection } from "@/lib/direction";
import { claimHandoff } from "@/lib/handoff.mjs";
import {
  directionPrompt, directionReferences,
} from "@/lib/directionGeneration.mjs";
import {
  composeReadiness, costCentsFor, costLabel, readinessDetail,
  readinessLabel,
} from "@/lib/studioReadiness";
import {
  MODELS, MODEL_PIN_NOTE, TIERS, buildIntent, fallbackPrompt, refusalMessage,
} from "@/lib/generationIntent.mjs";

const BRIEF_KEY = "atelier-design-brief";
const MODE_KEY = "atelier-studio-mode";
const COLLS_KEY = "atelier-studio-collections-v1";
const FABRICS_KEY = "atelier-fabrics-v1";
const ACCEPTED_KEY = "atelier-accepted";
const DECISIONS_KEY = "atelier-decisions";
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
// The per-image price used to live here as `const COST = {draft: 1, final: 6}`
// and was charged to whatever served the request. See lib/studioReadiness.js —
// the engine owns the table now and says null where it does not know.

const abs = (url) => (url?.startsWith("/") ? API_BASE + url : url);

// Downscale a real swatch photo to a compact data-URI (localStorage-friendly).
async function fileToSwatch(file) {
  const img = await createImageBitmap(file);
  const s = 220 / Math.max(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
// The app-local generator returns data URLs. Keeping the original multi-MB
// payloads in localStorage makes a collection appear saved until the quota is
// hit. A working-board preview does not need print resolution, so persist a
// compact 1200px JPEG and keep high-res export for engine-hosted URLs.
async function compactGeneratedImage(url) {
  if (!url?.startsWith("data:image/")) return url;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? f; } catch { return f; } };
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error?.name === "QuotaExceededError"
        ? "El navegador se quedó sin espacio. Exportá o eliminá imágenes antes de seguir."
        : "No se pudo guardar en este navegador.",
    };
  }
};
const fmtTs = (iso) => {
  const d = new Date(iso); if (isNaN(d)) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const defaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

// Garments saved before the team model existed carry no owner, approver or due
// date. Review requires all three, so without this backfill those items can
// never leave the board — the send button just sits disabled behind a tooltip.
function withTeamDefaults(collections) {
  return collections.map((c) => ({
    ...c,
    items: c.items.map((it) => {
      // No silent ownership: unassigned stays unassigned ("sin asignar") until a
      // real person picks it up. Auto-filling default personas made fictional
      // people appear responsible (owner audit 2026-07-24). Only rule kept: the
      // approver can never be the owner — that pairing is cleared, not swapped.
      const ownerId = it.ownerId || null;
      const approverId = it.approverId && it.approverId !== ownerId ? it.approverId : null;
      return {
        ...it,
        ownerId,
        approverId,
        dueAt: it.dueAt || defaultDueDate(),
        approvalStatus: it.approvalStatus
          || (it.approved ? "approved" : it.cover ? "in_progress" : "draft"),
      };
    }),
  }));
}

// Fabrics, silhouettes and palette all describe the ACTIVE brand, so they come
// from that brand's engine DNA. They used to be read off a 36-product Complot
// list hardcoded in lib/catalog.js — every brand got Complot's materials and
// colours, under the label "tus prendas reales" (2026-07-24 audit). With no DNA
// these are empty and the UI says so; there is deliberately nothing to fall
// back to.
const lbl = (x) => (typeof x === "string" ? x : x?.label ?? x?.name ?? "");
function seedFabrics(dna) {
  const seen = new Set();
  const out = [];
  for (const raw of dna?.materials || []) {
    const name = lbl(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ id: `dna-${name.toLowerCase().replace(/\W+/g, "-")}`, name,
               comp: "", proveedor: "", source: "ADN de marca" });
  }
  return out;
}
const houseSilhouettes = (dna) => [...new Set((dna?.silhouettes || []).map(lbl).filter(Boolean))];
const housePalette = (dna) => (dna?.palette || []).map(lbl).filter((h) => /^#/.test(h)).slice(0, 8);

function itemPrompt(it, fabric, dna, direction) {
  const bits = [];
  bits.push(`${it.silhouette || "Prenda"} en ${fabric?.name || "tejido de la casa"}${fabric?.comp ? ` (${fabric.comp})` : ""}, color ${colName(it.colorway)}.`);
  if (it.nota) bits.push(it.nota + ".");
  if (direction?.exists) bits.push(directionPrompt(direction));
  bits.push(dnaPromptBlock(dna)); // active brand's own DNA — never hardcoded
  bits.push("Foto de producto e-commerce, prenda sola, fondo neutro de estudio, luz natural suave, sin texto ni marca de agua.");
  return bits.join(" ");
}
const MODEL_PROMPT = "La MISMA prenda de la imagen de referencia, puesta por una modelo, foto editorial de e-commerce de cuerpo entero, fondo neutro claro, luz suave. Mantené fiel el diseño, el color y la textura de la tela de la prenda de referencia. Sin texto ni marca de agua.";

export default function DesignStudio({ onNavigate, initialItemId = null }) {
  const engine = useEngine();
  const [colls, setColls] = useState([]);
  // Studio keeps its own selection state (deep-links and creation both need to
  // set it) but MIRRORS the shared one, so Range Plan and Review follow along
  // instead of each guessing their own collection (2026-07-24 audit).
  const collectionCtx = useCollection();
  const [activeId, setActiveIdLocal] = useState(null);
  // ⚠ THIS MIRRORED STATE AND NOT THE URL (owner review, 2026-08-13). Switching
  // collection on Studio's OWN tabs changed the entire screen and left
  // `?collection=` pointing at the previous one, so a RELOAD returned Studio to
  // the collection you had just left. Same defect as Portfolio and the top-bar
  // switcher, in the third place — it survived both earlier fixes because each
  // was applied where the bug was seen rather than to the fact they share.
  //
  // ⚠ AND CHOOSING IS NOT THE SAME AS LOADING. The first version of this fix
  // routed EVERY `setActiveId` through `selectCollection`, including the one in
  // the loader that resolves which collection to show. That made start-up write
  // the URL instead of read it: opening `#/studio?collection=<Pilot>` had Studio
  // resolve its own default a beat later and overwrite the hash, so a reload
  // landed on the wrong collection — the same symptom as the bug, from the
  // opposite direction. A person choosing writes the URL; the loader derives
  // from it and uses `setActiveIdLocal`.
  const setActiveId = (id) => { setActiveIdLocal(id); if (id) collectionCtx.selectCollection(id); };
  const [fabrics, setFabrics] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [swatchFor, setSwatchFor] = useState(null); // fabric id awaiting a swatch photo
  // The speed/quality appetite, in the ENGINE's vocabulary (fast | balanced |
  // best). This replaced the old Borrador/Final pair (2026-08-17 reversal):
  // the engine now routes the model by tier, so the selector changes which
  // model serves, not just a price. ⚠ "best" is the registry's provisional
  // ranking by documented capability — the blind benchmark has not run, so the
  // label is hedged ("según el proveedor") and must never read as a measured
  // quality claim. The provider-native `quality` parameter is derived: the top
  // tier asks for final rendering where the provider has that knob.
  const [tier, setTier] = useState("balanced");
  // Expert pin: exactly this registry model answers, or the request errors —
  // the engine does not substitute. Empty string = route by task/tier.
  const [pinModel, setPinModel] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const quality = tier === "best" ? "final" : "draft";
  // Provider readiness for BOTH generation paths, composed into one answer.
  // Starts as {state: "unknown"} rather than as an assumption — the studio
  // used to offer generation while knowing nothing at all, and "I have not
  // asked yet" must not render as either available or broken.
  const [readiness, setReadiness] = useState(() => composeReadiness(null, null));
  const [busyId, setBusyId] = useState(null); // item id mid-generation
  const [genError, setGenError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingFabric, setAddingFabric] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  // "explorar" (matrix batch) | "coleccion" (board). A deep-linked item forces
  // the board; otherwise the last-used mode wins, defaulting to Explorar —
  // the owner's flow is explore first, then build the collection.
  const [mode, setMode] = useState("coleccion");
  const [toast, setToast] = useState("");
  // scope: "team" (durable, shared, in the engine) | "local" (this browser only).
  // Never inferred silently — the save chip reads it out (2026-07-21 audit).
  const [saveState, setSaveState] = useState({ status: "loading", at: null, message: "", scope: "local" });
  const [brandId, setBrandId] = useState(null);
  // The active collection's exact, server-owned creative Direction. This used
  // to stop at its own screen while Studio generated from broad brand DNA; the
  // designer could carefully choose a palette, fabrics and references and the
  // image model would never see them.
  const [direction, setDirection] = useState(null);
  // Whether the ENGINE can see this board's concepts. The stage rail, the
  // command centre and the portfolio all count engine `Concept` rows; Studio
  // counts board items with a cover. Those were two stores answering the same
  // question ("0 conceptos" on the rail beside "1/1 con concepto" here), so the
  // board now projects itself into the engine and this flag records whether the
  // projection actually landed. When it did not, the studio SAYS the other
  // screens cannot see this work rather than letting the numbers disagree
  // silently. See lib/conceptRegistry.mjs for the whole argument.
  const [projected, setProjected] = useState({ ok: false, at: null });
  // The learned-taste profile and the scores it produced for THIS board.
  // `null` while unanswered and after a failure — never an empty profile, so
  // "the engine is down" cannot be rendered as "you have judged nothing".
  const [taste, setTaste] = useState(null);
  const [tasteScores, setTasteScores] = useState(null);
  const collsRef = useRef([]);

  const flash = (m) => { setToast(m); clearTimeout(window.__cst); window.__cst = setTimeout(() => setToast(""), 2400); };

  // Ask both generation paths what they can do, before offering the button
  // that spends money on them. Both helpers swallow their own failures and
  // return null, which composeReadiness renders as "unknown" — a third state,
  // deliberately not "unavailable": a failed lookup is not a broken box.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [engineR, fallbackR] = await Promise.all([
        getStudioReadiness(),
        appFetch("/api/generate").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!cancelled) setReadiness(composeReadiness(engineR, fallbackR));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { colls: loaded, scope, brandId: bid } = await loadCollections();
      if (cancelled) return;
      setBrandId(bid);
      // ⚠ THE REF, NOW — NOT ON THE NEXT RENDER (found 2026-08-12 by mounting
      // this screen in a test). `brandIdRef.current = brandId` is a render-time
      // assignment, and `brandId` is state that has not been applied yet inside
      // this effect. So the handoff block below called `persistColls`, which
      // mirrors with `saveAllLocal(next, brandIdRef.current)` — still null —
      // and the new design was written to `…::brand:none`.
      //
      // Two consequences, both quiet: an offline reload of the real brand did
      // not contain the design that had just been created, and the row landed
      // in the one bucket every session with an unresolved brand shares. Same
      // shape as the Inspiration race: a ref that lags the value it guards.
      brandIdRef.current = bid;
      let cs = withTeamDefaults(loaded);
      if (!cs.length) {
        const fresh = { id: uid(), name: "Colección nueva", items: [], at: new Date().toISOString() };
        if (bid) {
          const created = await createCollection(bid, { name: fresh.name, items: [] }).catch(() => null);
          cs = [created || fresh];
        } else {
          cs = [fresh];
        }
      }
      if (cancelled) return;
      collsRef.current = cs;
      setColls(cs);

      // Deep-linked item (#/studio:<itemId>) selects its collection.
      const requested = initialItemId
        ? cs.find((c) => c.items.some((item) => item.id === initialItemId))
        : null;
      const shared = cs.find((c) => c.id === collectionCtx.activeId);
      // The collection this screen is actually about — deep-linked item first,
      // then the shared active collection, then the only one there is.
      const targetId = requested?.id || shared?.id || cs[0].id;
      // ⚠ LOCAL ONLY — the loader READS the selection, it does not make one.
      // Routing this through `selectCollection` made Studio overwrite the
      // `?collection=` it had just been opened with, one beat after load.
      // The deep-link case below is different and does write, because a
      // deep-linked ITEM is a real navigation to that item's collection.
      setActiveIdLocal(targetId);
      if (requested) setEditingId(initialItemId);
      setMode(initialItemId ? "coleccion" : load(MODE_KEY, "explorar"));
      setFabrics(load(FABRICS_KEY, null) || []);
      setSaveState({ status: "saved", at: new Date().toISOString(), message: "", scope });

      // A brief from Proposals / Biblioteca / Buscador becomes a first item.
      //
      // ⚠ THE HANDOFF IS CHECKED AGAINST THE ACTIVE BRAND (owner review
      // 2026-08-11). `atelier-design-brief` is a GLOBAL key by design, on the
      // reasoning that it is "a one-shot handoff between two screens in one
      // session" — which describes its lifetime and says nothing about its
      // tenant. Pick an opportunity under Brand A, switch the topbar to Brand
      // B, open Studio: Brand A's opportunity arrived here and became an item
      // designed against Brand B's DNA, palette and catalogue. Nothing expired
      // in between, so being transient never prevented it.
      //
      // The check lives HERE because six screens write this key and one reads
      // it, and it fails closed: an unstamped payload cannot prove its origin,
      // and "probably this one" is the assumption that caused the bug.
      const raw = load(BRIEF_KEY, null);
      // `bid` from this same load, NOT the `brandId` state — setBrandId is
      // async and the state is still null here, which would refuse every
      // handoff including the correct ones.
      const claim = claimHandoff(raw, { brandId: bid, collectionId: targetId });
      if (raw && !claim.ok && claim.reason) {
        // Consumed either way — a refused handoff that stays on disk re-refuses
        // on every mount. The refusal is SAID, not swallowed: silently dropping
        // it means clicking "Diseñar" and finding an empty Studio.
        localStorage.removeItem(BRIEF_KEY);
        flash(claim.reason);
      }
      const b = claim.ok ? claim.payload : null;
      if (b?.trend) {
        localStorage.removeItem(BRIEF_KEY);
        // ⚠ THE ACTIVE COLLECTION, NOT `cs[0]` (owner review, third pass
        // 2026-08-11). This inserted at index 0 regardless of which collection
        // was open — computed two lines above and then ignored — so a handoff
        // could land in the wrong collection inside the right brand, under a
        // brief that never authorised it.
        const next = cs.map((c) => c.id === targetId ? {
          ...c,
          items: [{
            id: uid(), name: b.trend.slice(0, 48), silhouette: b.typology || "",
            fabricName: b.fabric || "", colorway: b.colors?.[0] || "#17181C",
            nota: b.summary || "", refImage: b.image || null,
            images: [], cover: null, rating: null, approved: false,
            ownerId: null, approverId: null, // assigned by the team, never defaulted
            approvalStatus: "draft", dueAt: defaultDueDate(),
            // ⚠ THE LINEAGE DIED HERE (owner review, fourth pass 2026-08-12).
            // Opportunities mints an immutable recommendation and the handoff
            // carries its id — and then this constructor copied name,
            // silhouette, fabric, colour, note and image, and dropped it. So
            // the one link the whole chain depends on was created, transported
            // intact, and thrown away at the moment the design came into
            // existence. A concept could never afterwards prove which validated
            // opportunity caused it, which is exactly what the tech pack needs
            // to cite. Carried on the item now, so it survives into the concept
            // projection and the pack beyond it.
            recommendationId: b.recommendation_id || null,
            opportunityKey: b.opportunity_key || null,
            recommendationStance: b.recommendation_stance || null,
          }, ...c.items],
        } : c);
        persistColls(next);
        const target = cs.find((c) => c.id === targetId);
        flash(`Brief "${b.trend}" entró como prenda de ${target?.name || "la colección"}`);
      }

      // Project the boards into the engine's concept record. Only writes what
      // the engine cannot already see (one list call does the diff), so a board
      // that is already projected costs a single request. This is what makes
      // the stage rail's "N conceptos" and this screen's "N/M con concepto"
      // count the same set instead of two stores.
      const sync = await syncBoardConcepts(bid, collsRef.current);
      if (cancelled) return;
      setProjected({ ok: sync.ok, at: sync.ok ? new Date().toISOString() : null });
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The topbar switcher (or another stage) changed the collection.
  useEffect(() => {
    if (!collectionCtx.activeId || collectionCtx.activeId === activeId) return;
    if (colls.some((c) => c.id === collectionCtx.activeId)) {
      setActiveIdLocal(collectionCtx.activeId);
      setEditingId(null);
    }
  }, [collectionCtx.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    if (!brandId || !activeId) {
      setDirection(null);
      return () => { cancelled = true; };
    }
    // Failure and absence are intentionally different: `exists:false` means
    // this collection has no Direction; null means Studio could not read it
    // and therefore must not claim it conditioned a generation.
    getDirection(brandId, activeId)
      .then((payload) => { if (!cancelled) setDirection(payload); })
      .catch(() => { if (!cancelled) setDirection(null); });
    return () => { cancelled = true; };
  }, [brandId, activeId]);

  useEffect(() => {
    if (!initialItemId || !colls.length) return;
    const requestedCollection = colls.find((collection) => collection.items.some((item) => item.id === initialItemId));
    if (!requestedCollection) return;
    setActiveId(requestedCollection.id);
    setEditingId(initialItemId);
  }, [initialItemId, colls.length]);

  useEffect(() => {
    if (!editingId) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    return () => cancelAnimationFrame(frame);
  }, [editingId]);

  const reportSave = (result) => setSaveState((s) => (result.ok
    ? { status: "saved", at: new Date().toISOString(), message: "", scope: result.scope || s.scope }
    : { status: "error", at: null, message: result.message, scope: result.scope || s.scope }));

  // Write-through: the engine owns the collection when a brand is configured,
  // localStorage is the mirror/fallback. A 409 means a teammate wrote first —
  // we surface it and reload rather than overwrite their work.
  // Server writes are DEBOUNCED and SERIALIZED per collection. Rapid keystrokes
  // used to each fire an immediate save carrying the SAME `version` — the server
  // kept the first and returned false "another person changed this" 409s for the
  // rest, losing edits. Now: the local mirror saves on every keystroke (nothing
  // is lost locally), while the server save coalesces and never runs two writes
  // for one collection at once — a save requested mid-flight waits for the first
  // to return its new version, then re-saves the freshest content.
  const saveTimers = useRef({});        // collectionId -> debounce timeout
  const savingIds = useRef(new Set());  // collections with a save in flight
  const dirtyIds = useRef(new Set());   // collections edited while saving
  const brandIdRef = useRef(brandId);
  const flushServerSaveRef = useRef(null);
  brandIdRef.current = brandId;

  const flushServerSave = (collectionId) => {
    const target = collsRef.current.find((c) => c.id === collectionId);
    const currentBrandId = brandIdRef.current;
    if (!currentBrandId || !target || target.version == null) return;
    if (savingIds.current.has(collectionId)) { // one write at a time per collection
      dirtyIds.current.add(collectionId);
      return;
    }
    savingIds.current.add(collectionId);
    saveCollection(currentBrandId, target, { updatedBy: teamRef.current?.me?.name || null })
      .then((r) => {
        if (r.conflict) {
          setSaveState({
            status: "error", at: null, scope: "team",
            message: `Otra persona guardó esta colección (v${r.conflict.version}). Recargá para ver su versión antes de seguir.`,
          });
          flash("Conflicto: la colección cambió en el equipo — recargá");
          return;
        }
        if (r.ok && r.collection) {
          // Adopt the server's new version so the NEXT save isn't stale.
          const synced = collsRef.current.map((c) =>
            (c.id === r.collection.id ? { ...c, version: r.collection.version } : c));
          collsRef.current = synced;
          setColls(synced);
        }
        reportSave(r);
      })
      .catch(() => reportSave({ ok: false, scope: "local", message: "Motor no disponible — guardado solo en este navegador." }))
      .finally(() => {
        savingIds.current.delete(collectionId);
        if (dirtyIds.current.has(collectionId)) { // edited mid-save -> save fresh version
          dirtyIds.current.delete(collectionId);
          flushServerSave(collectionId);
        }
      });
  };
  flushServerSaveRef.current = flushServerSave;

  const scheduleServerSave = (collectionId) => {
    clearTimeout(saveTimers.current[collectionId]);
    saveTimers.current[collectionId] = setTimeout(() => flushServerSave(collectionId), 600);
  };

  // Don't strand the last edit: flush every pending debounce on unmount.
  useEffect(() => () => {
    Object.keys(saveTimers.current).forEach((id) => {
      clearTimeout(saveTimers.current[id]);
      flushServerSaveRef.current?.(id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persistColls = (valueOrUpdater) => {
    const next = typeof valueOrUpdater === "function"
      ? valueOrUpdater(collsRef.current)
      : valueOrUpdater;
    collsRef.current = next;
    setColls(next);
    saveAllLocal(next, brandIdRef.current); // mirror first, so an offline reload still shows the board

    const target = next.find((c) => c.id === activeId) || next[0];
    if (brandId && target?.version != null) {
      scheduleServerSave(target.id); // debounced + serialized server write
    } else {
      reportSave({ ...saveAllLocal(next, brandIdRef.current), scope: "local" });
    }
    return next;
  };
  const persistFabrics = (next) => {
    setFabrics(next);
    const result = save(FABRICS_KEY, next);
    if (!result.ok) {
      reportSave(result);
      flash(result.message);
    }
  };

  const coll = colls.find((c) => c.id === activeId) || colls[0];
  // An approved concept is LOCKED against design changes. Editing the cover,
  // image set, colourway, material, price, name or silhouette makes it a
  // different garment, so the approval — which names one immutable version row
  // in the engine — no longer applies: the item drops back to review and the
  // stale approval pointer is cleared (ROADMAP A9.2). Before this, an approved
  // item stayed "Aprobada" while its cover was replaced underneath it.
  const patchItem = (itemId, patch) => persistColls((current) => current.map((c) => c.id !== activeId ? c : ({
    ...c,
    updatedAt: new Date().toISOString(),
    items: c.items.map((it) => {
      if (it.id !== itemId) return it;
      const reopen = it.approved && touchesDesign(patch);
      if (reopen) {
        flash("Cambio sobre una prenda aprobada: vuelve a revisión como versión nueva.");
      }
      return {
        ...it, ...patch,
        ...(reopen ? {
          approved: false, approvalStatus: "in_review",
          approvedVersionId: null, approvedVersionKey: null,
          approvedAt: null, approvedBy: null,
          reviewRound: (it.reviewRound || 0) + 1,
        } : {}),
        updatedAt: new Date().toISOString(),
      };
    }),
  })));

  const team = useTeam();
  const teamRef = useRef(team);
  teamRef.current = team;
  const brandDna = engine.status === "live" ? engine.dna : null; // active brand's DNA for prompts/fidelity
  const palette = useMemo(() => housePalette(brandDna), [brandDna]);
  const silhouettes = useMemo(() => houseSilhouettes(brandDna), [brandDna]);
  const ownRefs = useMemo(() => ownRefsFromDna(brandDna), [brandDna]);

  // Seed the fabric library from the ACTIVE brand's DNA materials once they
  // arrive — the DNA loads after the collections do. Only ever seeds an empty
  // library, so a team's own edited fabrics are never overwritten.
  useEffect(() => {
    if (fabrics.length || !brandDna) return;
    const seeded = seedFabrics(brandDna);
    if (seeded.length) persistFabrics(seeded);
  }, [brandDna]); // eslint-disable-line react-hooks/exhaustive-deps
  const fabricOf = (it) =>
    it.fabricSnapshot
    || fabrics.find((f) => f.id === it.fabricId)
    || (it.fabricName ? { name: it.fabricName } : null);
  const liveTrends = engine.status === "live" && engine.trends.length ? engine.trends : undefined;
  const editing = coll?.items.find((i) => i.id === editingId) || null;

  const errorText = (code) => (
    code === "quota" ? "Sin cupo de generación — probá en unos minutos." :
    code === "no_key" ? "El motor no tiene clave de imágenes." :
    "El proveedor de imágenes falló — revisá el log de la API.");

  // Returns the image url (unchanged contract for all callers). onMeta, when
  // given, receives { provider } so the caller can record version provenance
  // without every call site having to change.
  //
  // ⚠ THE BRAND'S OWN DOOR, NOT `/studio/generate` (blueprint Phase 2b). The
  // old route takes NO BRAND — not in the path, not in the body, not in any
  // row it wrote — so every image it made was unattributable, unmeterable, and
  // landed in one shared directory that `/studio/history` listed to any token.
  // `POST /brands/{id}/assets/generate` owns all four things this screen was
  // getting for free and should not have been: tenancy, budget, idempotency
  // and durable storage. The pixels stop being this browser's problem.
  async function callGenerate(prompt, refs, onMeta, opts = {}) {
    const urls = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
    const brandId = brandIdRef.current;
    // The typed request (2026-08-17 reversal). When the caller hands an
    // intent, the SERVER composes the prompt from it — nothing is
    // concatenated here — and the references ride inside it with their roles.
    // The `prompt` argument then serves only the no-engine fallback below.
    const intent = opts.intent || null;
    try {
      // ⚠ NO BRAND MEANS NO LEDGER, AND THAT IS A REAL STATE, not an error:
      // the studio runs before a brand is chosen in local/pilot use. Skipping
      // straight to the fallback is honest; inventing a brand id to satisfy
      // the route would file one tenant's image under another.
      if (!brandId) throw new Error("sin marca activa");
      const data = await generateAssets(brandId, {
        ...(intent
          ? { generation_intent: intent }
          : { prompt, reference_image_urls: urls }),
        n: 1, quality,
        operation: opts.operation || "generate",
        // Routing: task by job when the caller knows it, tier always, and the
        // expert pin exactly when the designer set one — that model answers
        // or the request errors; the engine never substitutes silently.
        ...(opts.task ? { task: opts.task } : {}),
        tier,
        ...(pinModel ? { model: pinModel } : {}),
        collection_id: opts.collectionId || null,
        concept_id: opts.conceptId || null,
        parent_asset_id: opts.parentAssetId || null,
      }, {
        // The version id this generation is about to become: a retry of the
        // SAME generation is free, and a new prompt gets a new key. A constant
        // here would be worse than nothing — 0076 refuses a reused key that
        // carries a different request rather than returning the old image.
        idempotencyKey: opts.idempotencyKey || null,
      });
      const asset = (data?.assets || []).find((a) => a?.url);
      if (asset) {
        onMeta?.({
          provider: asset.provider || "engine", path: "engine",
          assetId: asset.id, model: asset.model || null,
          // The envelope's honesty record: the model that was ASKED and the
          // compiler's per-control treatment list. Callers render THIS —
          // never a claim of their own about what the provider honoured.
          requestedModel: data?.model || null,
          controlMapping: data?.control_mapping || null,
          // The prompt the provider actually saw — composed by the SERVER on
          // the typed path. Version records store this one, not a local guess.
          sentPrompt: asset.prompt || null,
        });
        return assetUrl(asset.url);
      }
      // ⚠ `no_key` ARRIVES AS HTTP 200 WITH AN EMPTY LIST — a deliberate
      // contract, because a partial batch needs 200 too. Falling through in
      // silence is what used to send the request to a different provider with
      // a different key while `errorText("no_key")` stayed unreachable.
      if (data?.error === "quota") throw new Error(errorText("quota"));
    } catch (error) {
      // ⚠ A REFUSAL IS AN ANSWER, NOT AN OUTAGE. `capability_unavailable` /
      // `intent_refused` mean no configured model can honour the request
      // without lying (e.g. fake-transparent output). The engine's own
      // sentence reaches the screen verbatim, and the request must NOT be
      // retried against the app's fallback generator — that retry would
      // produce exactly the degraded image the engine refused to make.
      const refusal = refusalMessage(error?.body);
      if (refusal) throw new Error(refusal);
      // The brand's own allowance is NOT a provider failure and must never
      // read as one: the engine says so with a 429 rather than an error code,
      // and retrying against the app's generator would spend money the owner
      // capped on purpose.
      if (capReached(error)) throw new Error(errorText("quota"));
      if (error?.message?.includes("Sin cupo")) throw error;
      if (error?.status === 409) {
        // 0076: this key already named a different request. Retrying with the
        // same key would 409 forever; the caller has to mint a new one.
        throw new Error("esa generación ya existe con otro pedido — "
                        + "volvé a intentar");
      }
      // The full engine is optional in local/pilot environments. Fall through
      // to this Next app's configured generator so the studio still works.
    }

    // The no-engine fallback takes ONE plain prompt, so an intent is rendered
    // locally here and ONLY here (lib/generationIntent.mjs#fallbackPrompt) —
    // a degradation, not a second composer. No control mapping exists on this
    // path, and the receipt panel says so rather than inventing one.
    const fallbackRefs = intent
      ? (intent.references || []).map((r) => r.url).filter(Boolean)
      : urls;
    const fallback = await appFetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Forward the same garment/swatch/fit references the engine path uses —
      // otherwise fallback generation silently ignores them despite the UI
      // promising fidelity to them.
      body: JSON.stringify({
        prompts: [prompt || fallbackPrompt(intent)],
        reference_image_urls: fallbackRefs,
      }),
    });
    const data = await fallback.json().catch(() => null);
    const url = data?.images?.find(Boolean);
    if (!fallback.ok || !url) throw new Error(errorText(fallback.status === 429 ? "quota" : data?.error));
    onMeta?.({ provider: data?.provider || "fallback", path: "fallback" });
    return compactGeneratedImage(url);
  }

  // A generated Version is a real, auditable object (shared shape via lib/version).
  const versionRecord = (kind, url, note, extra = {}) =>
    makeVersion(kind, url, note, {
      // null when the engine does not know this provider's price — which is
      // the honest record, and the one concept_versions should have been
      // getting instead of gpt-image-1 rates applied to whatever served.
      ...extra, quality, costCents: costCentsFor(readiness, quality),
      byId: team.me?.id || null, byName: team.me?.name || null,
    });

  // A generation is the moment the item becomes a concept, so it is the moment
  // the engine has to know about it — not approval, which is where the only
  // write used to be. Until this call lands, every server-derived screen
  // (rail, command centre, portfolio, Review, Launch) is blind to this garment.
  // Idempotent, so calling it again after the next version is free.
  async function projectItem(board, item) {
    if (!brandIdRef.current || !board) { setProjected({ ok: false, at: null }); return; }
    try {
      await registerBoardConcept(brandIdRef.current, board, item);
      setProjected({ ok: true, at: new Date().toISOString() });
    } catch {
      // The board keeps the work either way; what we must not do is let the
      // screen imply the rest of the app can see it.
      setProjected({ ok: false, at: null });
    }
  }

  async function genConcept(it) {
    if (busyId) return;
    setBusyId(it.id); setGenError("");
    try {
      const f = fabricOf(it);
      const prompt = itemPrompt(it, f, brandDna, direction)
        + (f?.swatch ? " La tela de la prenda es EXACTAMENTE la del swatch de referencia (foto real de la tela)." : "");
      const directionRefs = directionReferences(direction).eligible
        .map((r) => abs(r.image_url)).filter(Boolean).slice(0, 2);
      const references = [
        ...directionRefs, it.refImage && abs(it.refImage), f?.swatch && abs(f.swatch),
      ].filter(Boolean).slice(0, 3);
      // The typed path, when the designer wrote a nota: HER words travel as
      // authored_prompt and the SERVER composes — spec, DNA and staging go as
      // labelled context and structured dicts, never mixed into her sentence.
      // With no nota there is no authored prompt, so the request honestly
      // stays on the legacy composed-prompt path (`itemPrompt` above, which
      // also remains the fallback rendering either way).
      const intent = buildIntent({
        authored: it.nota,
        context: [
          direction?.exists ? directionPrompt(direction) : "",
          dnaPromptBlock(brandDna),
          "Foto de producto e-commerce, prenda sola, fondo neutro de estudio, luz natural suave, sin texto ni marca de agua.",
          f?.swatch ? "La tela de la prenda es EXACTAMENTE la del swatch de referencia (foto real de la tela)." : "",
        ].filter(Boolean).join(" "),
        garment: { categoria: it.silhouette || "" },
        materials: f?.name ? { tela: `${f.name}${f.comp ? ` (${f.comp})` : ""}` } : {},
        palette: it.colorway ? { color: `${colName(it.colorway)} (${it.colorway})` } : {},
        references: [
          ...directionRefs.map((u) => ({ url: u, role: "styling" })),
          it.refImage ? { url: abs(it.refImage), role: "garment" } : null,
          f?.swatch ? { url: abs(f.swatch), role: "fabric" } : null,
        ].filter(Boolean).slice(0, 3),
      });
      let meta = {};
      // ⚠ THE KEY IS THIS GENERATION, NOT THIS GARMENT. Item id + how many
      // versions it already has: a failed attempt retried costs nothing
      // (the count has not moved), and asking for a genuinely new image gets
      // a new key. A key per garment would make the second version a 409.
      const url = await callGenerate(prompt, references, (m) => { meta = m; },
        { idempotencyKey: `concepto:${it.id}:${it.images.length}`,
          intent, task: "ideation" });
      const rec = versionRecord("concepto", url, `${f?.name || "tela"} · ${colName(it.colorway)}`, { prompt: meta.sentPrompt || prompt, references, provider: meta.provider, assetId: meta.assetId || null });
      const next = patchItem(it.id, { cover: url, images: [rec, ...it.images] });
      flash("Concepto generado con la tela elegida");
      const board = next.find((c) => c.id === (coll?.id ?? activeId));
      await projectItem(board, board?.items.find((x) => x.id === it.id));
    } catch (e) { setGenError(e.message); flash(e.message); }
    setBusyId(null);
  }

  async function genModel(it) {
    if (busyId || !it.cover) return;
    setBusyId(it.id); setGenError("");
    try {
      const references = [abs(it.cover)];
      let meta = {};
      // App-authored fixed prompt (no designer text → no intent), but the job
      // is a reference-conditioned edit and saying so lets the engine route to
      // the model documented for edit fidelity.
      const url = await callGenerate(MODEL_PROMPT, references, (m) => { meta = m; },
        { idempotencyKey: `modelo:${it.id}:${it.images.length}`,
          task: "garment_edit" });
      const rec = versionRecord("modelo", url, "en modelo · visualización generada", { prompt: MODEL_PROMPT, references, provider: meta.provider, assetId: meta.assetId || null });
      const next = patchItem(it.id, { modelShot: url, images: [rec, ...it.images] });
      flash("Prenda en modelo — visualización generada, no un fit real");
      const board = next.find((c) => c.id === (coll?.id ?? activeId));
      await projectItem(board, board?.items.find((x) => x.id === it.id));
    } catch (e) { setGenError(e.message); flash(e.message); }
    setBusyId(null);
  }

  // PNG export (Photoshop-ready). Cross-origin -> fetch blob, then download.
  async function exportPng(url, name) {
    try {
      const blob = await fetch(abs(url)).then((r) => r.blob());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(name || "atelier").replace(/\W+/g, "-").toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { flash("No pude bajar el PNG — ¿motor prendido?"); }
  }
  async function exportCollection() {
    const withImg = coll.items.filter((i) => i.cover);
    if (!withImg.length) { flash("Nada para exportar todavía"); return; }
    flash(`Exportando ${withImg.length} PNG…`);
    for (const it of withImg) {
      await exportPng(it.cover, `${coll.name}-${it.name || it.silhouette}`);
      if (it.modelShot) await exportPng(it.modelShot, `${coll.name}-${it.name || it.silhouette}-modelo`);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  async function approve(it) {
    if (!it.approverId || !it.ownerId || it.approverId === it.ownerId) {
      flash("La aprobación requiere responsable y una persona aprobadora diferente");
      return;
    }
    // Who approves is the SIGNED-IN user, never a persona picked from a list
    // (2026-07-24 audit). The engine enforces can_approve; this is the UI half.
    if (!team.authenticated) {
      flash("Iniciá sesión para que la aprobación quede atribuida a una persona real");
      return;
    }
    if (!team.me?.can_approve) {
      flash(`${team.me?.name || "Tu usuario"} no tiene permiso de aprobación`);
      return;
    }
    // Register the approval against an EXACT immutable version in the engine
    // FIRST. If the engine will not acknowledge it there is no approval — we do
    // not write a ledger row or flip the badge on a promise (2026-07-24 audit).
    const version = coverVersion(it);
    if (!version) { flash("No hay una versión concreta para aprobar — generá una imagen primero"); return; }
    if (!brandIdRef.current) { flash("Sin marca activa no se puede registrar una aprobación auditable"); return; }
    let record;
    try {
      // Register the board's versions before approving, so the append-only
      // history is complete rather than starting at the approved one.
      //
      // This used to be load-bearing for a second reason that is now FIXED:
      // `approveConceptVersion` hand-rolled its body and omitted
      // `collection_id`, so a row it created alone was invisible to every
      // `WHERE collection_id = ...`. It now shares `conceptRecord` with the
      // registry. Kept because the version history still needs it — but it is
      // no longer covering for a bug, and the next reader should not have to
      // wonder.
      await registerBoardConcept(brandIdRef.current, coll, it);
      record = await approveConceptVersion(brandIdRef.current, {
        coll, item: it, approvedBy: team.me?.name || null,
      });
      setProjected({ ok: true, at: new Date().toISOString() });
    } catch {
      flash("El motor no confirmó la aprobación. Nada quedó aprobado — probá de nuevo.");
      return;
    }
    const title = `${coll.name} — ${it.name || it.silhouette}`;
    const now = new Date().toISOString();
    const acc = load(ACCEPTED_KEY, []);
    acc.unshift({
      key: `concept:${it.id}`, title, cat: it.silhouette || "Concepto", gd: "women",
      color: it.colorway, fabric: fabricOf(it)?.name || "", qty: "",
      trend: coll.name, image: abs(it.cover), at: now,
    });
    save(ACCEPTED_KEY, acc.slice(0, 50));
    const rec = {
      candidate_key: `concept:${it.id}`.slice(0, 120), decision: "accept", reason: "concept-approval",
      candidate: {
        kind: "concept-approval", title, trend: coll.name, image: abs(it.cover),
        colorway: it.colorway, fabric: fabricOf(it)?.name || null,
        proveedor: fabricOf(it)?.proveedor || null, typology: it.silhouette || null,
        rating_marca: it.rating,
        // The decision ledger is append-only, so a number written here is
        // permanent. It used to be scored against a hardcoded Complot catalog
        // and, with no live trends, against the sample TRENDS constant — with
        // nothing recorded to say so (2026-07-24 audit). Now the basis travels
        // with the score, and an unmeasurable score is recorded as null rather
        // than as a confident 100.
        diferenciacion: (() => {
          const d = scoreVariation(
            { color: it.colorway, texture: fabricOf(it)?.name || "Cotton jersey" },
            { trends: liveTrends, ownRefs },
          );
          return {
            score: d.score, band: d.band,
            basis: d.score == null
              ? "no medida — sin ADN de marca ni tendencias del engine"
              : `heurística color+superficie vs ${d.basis.own} referencias de tu ADN y ${d.basis.market} de tendencias live`,
          };
        })(),
        versions: it.images.length,
        approved_version_id: record.approvedVersionId,
        approved_version_key: record.approvedVersionKey,
      },
      created_at: now,
    };
    save(DECISIONS_KEY, [{ ...rec, id: `local-${rec.candidate_key}` }, ...load(DECISIONS_KEY, [])].slice(0, 300));
    if (engine.status === "live" && engine.brandId) {
      try {
        await postDecision(engine.brandId, {
          candidateKey: rec.candidate_key, decision: "accept", reason: rec.reason, candidate: rec.candidate,
        });
      } catch { /* queda local */ }
    }
    patchItem(it.id, {
      approved: true,
      approvalStatus: "approved",
      approvedBy: it.approverId, // guaranteed non-null by the guard above — never a default persona
      approvedAt: record.approvedAt || now,
      // The exact immutable version the engine approved.
      conceptId: record.conceptId,
      approvedVersionId: record.approvedVersionId,
      approvedVersionKey: record.approvedVersionKey,
    });
    flash(`${it.name || it.silhouette}: versión ${String(record.approvedVersionKey).slice(0, 12)} aprobada en el motor`);
  }

  function addItem(form) {
    const it = {
      id: uid(), name: form.name || "", silhouette: form.silhouette, fabricId: form.fabricId,
      colorway: form.colorway, nota: form.nota || "", refImage: null,
      images: [], cover: null, modelShot: null, rating: null, approved: false,
      ownerId: null, approverId: null, // assigned by the team, never defaulted
      approvalStatus: "draft", dueAt: defaultDueDate(),
    };
    persistColls((current) => current.map((c) => (c.id === coll.id
      ? { ...c, updatedAt: new Date().toISOString(), items: [...c.items, it] }
      : c)));
    setEditingId(it.id); // the mock's flow: a new prenda opens its workspace
    setAdding(false);
  }
  async function attachSwatch(fabricId, file) {
    if (!file) { setSwatchFor(null); return; }
    try {
      const dataUri = await fileToSwatch(file);
      let stored = dataUri; // engine down -> keep locally, still visible
      try {
        const fb = fabrics.find((f) => f.id === fabricId);
        const res = await engineFetch(`${API_BASE}/studio/swatch`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: fb?.name || "tela", image_data_uri: dataUri }),
        });
        const d = await res.json();
        if (d?.url) stored = d.url;
      } catch { /* queda local */ }
      persistFabrics(fabrics.map((f) => (f.id === fabricId ? { ...f, swatch: stored } : f)));
      flash(stored.startsWith("/static")
        ? "Swatch real guardado en el motor — la generación lo usa como referencia"
        : "Swatch guardado solo en este navegador (motor apagado)");
    } catch { flash("No pude leer la foto"); }
    setSwatchFor(null);
  }
  function addFabric(f) {
    if (!f.name?.trim()) return;
    persistFabrics([{
      id: uid(), name: f.name.trim(), comp: f.comp || "", proveedor: f.proveedor || "",
      gsm: f.gsm || "", precio_m: f.precio_m || "", moq_m: f.moq_m || "", lead: f.lead || "",
      source: "propio",
    }, ...fabrics]);
    setAddingFabric(false);
    flash(`Tela "${f.name}" en tu biblioteca`);
  }
  async function newCollection() {
    const name = `Colección ${colls.length + 1}`;
    // Created server-side when a brand exists, so it carries a real id and
    // version from birth — a locally-minted id could never sync later.
    const created = brandId
      ? await createCollection(brandId, { name, items: [], updatedBy: team.me?.name || null }).catch(() => null)
      : null;
    const c = created || { id: uid(), name, items: [], at: new Date().toISOString() };
    const next = [c, ...collsRef.current];
    collsRef.current = next;
    setColls(next);
    saveAllLocal(next, brandId);
    setActiveId(c.id);
    setSaveState((s) => ({ ...s, status: "saved", at: new Date().toISOString(), scope: created ? "team" : s.scope }));
  }
  const renameColl = (name) => persistColls((current) => current.map((c) => (c.id === coll.id
    ? { ...c, name, updatedAt: new Date().toISOString() }
    : c)));
  const commitItem = () => {
    const result = saveAllLocal(collsRef.current, brandIdRef.current);
    if (!result.ok) {
      reportSave({ ...result, scope: "local" });
      flash(result.message);
      return false;
    }
    persistColls(collsRef.current); // write through to the engine too
    flash(brandId ? "Propuesta guardada — visible para el equipo" : "Propuesta guardada en este navegador");
    return true;
  };

  const switchMode = (m) => {
    setMode(m);
    save(MODE_KEY, m);
    setEditingId(null);
  };

  // Explorar → board handoff: promoted concepts become real collection items
  // with the full spec (silhouette, fabric, colorway, cover) so the existing
  // review workflow takes over from here.
  async function promoteConcepts(newItems) {
    if (!newItems.length) return;
    const now = new Date().toISOString();
    const boardId = coll?.id || collsRef.current[0]?.id;
    // These arrive with a cover, so they ARE concepts the moment they land —
    // they get the same canonical Version shape as every other generation path
    // (makeVersion), because a version with no id cannot be keyed, and an
    // unkeyable version cannot be registered as an auditable engine row.
    const promoted = newItems.map((ni) => ({
      id: uid(), name: ni.name, silhouette: ni.silhouette,
      fabricId: ni.fabricId, fabricName: ni.fabricName, colorway: ni.colorway,
      fabricSnapshot: ni.fabricSnapshot || null,
      directionLineage: ni.directionLineage || null,
      // ⚠ WHAT WAS ASKED FOR, IN BOTH HALVES (prompt box, 2026-08-14). A
      // concept made from a typed sentence must be able to answer "what was I
      // asked for" — her words AND the context the app attached to them. The
      // matrix path leaves these null, which is the true answer there: nobody
      // typed anything, the combo IS the request.
      freeText: ni.freeText || null,
      promptAttachments: ni.promptAttachments || null,
      nota: ni.nota, refImage: ni.references?.[0] || null, cover: ni.cover,
      // Quality tier and cost are NOT stamped here: the image was made during
      // the exploration run, possibly at a different tier than the one selected
      // now, and Explorar does not carry them across. Null is the true answer;
      // reading today's toggle would be a plausible invented number.
      // The version is the append-only record, so the lineage belongs ON it and
      // not only on the mutable item. `makeVersion` owns the canonical shape
      // (and drops keys it does not know), so the attachment list is spread
      // alongside rather than smuggled through it.
      images: [{
        ...makeVersion("concepto", ni.cover, ni.nota, {
          prompt: ni.prompt || null, references: ni.references || [],
          directionLineage: ni.directionLineage || null,
          provider: ni.provider || null,
          byId: team.me?.id || null, byName: team.me?.name || null,
        }),
        ...(ni.freeText ? { free_text: ni.freeText } : {}),
        ...(ni.promptAttachments ? { prompt_attachments: ni.promptAttachments } : {}),
      }],
      modelShot: null, rating: null, approved: false,
      ownerId: null, approverId: null, // assigned by the team, never defaulted
      approvalStatus: "in_progress", dueAt: defaultDueDate(),
    }));
    const next = persistColls((current) => current.map((c) => (c.id === boardId ? {
      ...c,
      updatedAt: now,
      items: [...promoted, ...c.items],
    } : c)));
    flash(`${newItems.length} concepto${newItems.length > 1 ? "s" : ""} en ${coll?.name || "la colección"} — siguen el flujo de revisión`);
    switchMode("coleccion");
    const board = next.find((c) => c.id === boardId);
    for (const it of promoted) await projectItem(board, it);
  }

  // The SAME function that decides which items get projected into the engine,
  // so the number on this screen and the number the stage rail reads cannot
  // drift apart by definition (lib/conceptRegistry.mjs).
  // ---- the brand's learned taste, on the board ----------------------------
  // Same source and same rules as Explorar: the engine gates it, the engine
  // scores it, and with nothing calibrated the board keeps the order it always
  // had while the header says why. The board is the second surface on purpose —
  // a designer who orders their exploration by the house's taste and then finds
  // the collection sorted by insertion order is looking at two products.
  const tasteRequest = useCallback(async (path, init) => {
    if (!brandId) return null;
    const res = await engineFetch(`${API_BASE}/brands/${brandId}${path}`, init);
    return res.ok ? res.json() : null;
  }, [brandId]);

  useEffect(() => {
    if (!brandId) { setTaste(null); return; }
    let cancelled = false;
    fetchTasteProfile(tasteRequest).then((p) => { if (!cancelled) setTaste(p); });
    return () => { cancelled = true; };
  }, [brandId, tasteRequest]);

  const boardCandidates = useMemo(
    () => (coll?.items || []).map((it) => itemCandidate(it, fabricOf(it))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coll?.id, coll?.items, fabrics]);
  const boardKey = boardCandidates.map((c) => `${c.id}:${c.kind}`).join("|");

  useEffect(() => {
    if (!brandId || !taste?.calibrated || !boardCandidates.length) {
      setTasteScores(null); return;
    }
    let cancelled = false;
    fetchTasteScores(tasteRequest, boardCandidates)
      .then((r) => { if (!cancelled) setTasteScores(scoreIndex(r)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, taste?.calibrated, boardKey, tasteRequest]);

  const tasteState = tasteStatus(taste);

  const withConcept = boardConceptCount(coll);
  const approvedCount = coll?.items.filter((i) => i.approved).length || 0;
  const reviewCount = coll?.items.filter((i) => i.cover && i.rating && !i.approved).length || 0;
  const draftCount = Math.max(0, (coll?.items.length || 0) - approvedCount - reviewCount);
  const stageOf = (item) => item.approved ? "approved" : item.cover && item.rating ? "review" : "draft";
  const stages = [
    { id: "draft", label: "En diseño", count: draftCount, note: "brief, concepto y variantes" },
    { id: "review", label: "Para revisar", count: reviewCount, note: "concepto puntuado" },
    { id: "approved", label: "Aprobadas", count: approvedCount, note: "listas para desarrollo" },
  ];
  const completion = coll?.items.length ? Math.round((approvedCount / coll.items.length) * 100) : 0;

  return (
    <section className="view on st4">
      <style dangerouslySetInnerHTML={{ __html: `
/* ============ Estudio de concepto — st4 =============================
   THE BENCH, NOT THE DASHBOARD. The garments are the content; the chrome
   around them is hairlines, mono labels and white cards. Rules kept:
     · blue (--cobalt) only on things you can press — never on a badge,
       a border accent or a count;
     · --editorial carries eyebrows, --serif carries the names you read;
     · a "generated / not validated" notice keeps a 3px --warning rule
       and stays legible, because the lineage IS the product;
     · ⚠ 11px IS THE FLOOR. Nothing below it anywhere in this file. */

.st4{
  background:var(--paper);margin:-8px 0 0;padding:0 var(--s5) var(--s6);
  border-radius:var(--r);min-height:calc(100vh - 90px);overflow-x:clip;
}

/* ---- header: sticky, calm, one line of identity ---- */
.st4 .hd{
  position:sticky;top:0;z-index:20;margin:0 calc(-1 * var(--s5)) var(--s4);
  padding:var(--s4) var(--s5) var(--s3);
  background:color-mix(in srgb,var(--paper) 93%,transparent);
  backdrop-filter:blur(18px);border-bottom:1px solid var(--hair);
}
.studio-command{display:flex;align-items:flex-start;gap:var(--s4);min-width:0}
/* flex:none so the title keeps its line and the ACTIONS wrap instead —
   a wrapped screen name reads like a bug, a wrapped button row does not. */
.studio-identity{display:flex;align-items:center;gap:var(--s3);min-width:260px;flex:none}
.studio-identity .back{
  width:32px;height:32px;flex:none;border-radius:var(--r-sm);
  border:1px solid var(--line);background:var(--card);color:var(--ink);
  font-size:15px;line-height:1;cursor:pointer;
}
.studio-identity .back:hover{border-color:var(--ink-3)}
.studio-eyebrow{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--editorial);margin-bottom:4px;
}
.st4 .hd h1{
  font-family:var(--serif);font-weight:500;font-size:26px;line-height:1.12;
  letter-spacing:-.015em;color:var(--ink);margin:0;
}
/* The collection's own name, editable in place — serif, because it is a
   name you read rather than a field you administer. */
.st4 .cname{
  display:block;font-family:var(--serif);font-size:15px;font-weight:500;
  color:var(--ink-2);border:none;background:none;
  border-bottom:1px dashed var(--hair-2);padding:3px 0;max-width:240px;margin-top:6px;
}
.st4 .cname:focus{outline:none;border-bottom-color:var(--cobalt);color:var(--ink)}
.st4 .meta{font-size:12px;color:var(--ink-3);margin-top:5px}

/* ---- mode: a segmented control, not two tabs ---- */
.mode-tabs{
  display:inline-flex;gap:2px;padding:3px;background:var(--paper-2);
  border:1px solid var(--line);border-radius:999px;flex:none;
}
.mode-tabs button{
  border:none;background:none;border-radius:999px;font-size:12px;font-weight:600;
  padding:6px 13px;cursor:pointer;color:var(--ink-3);white-space:nowrap;
}
.mode-tabs button:hover{color:var(--ink)}
.mode-tabs button.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}

/* ---- actions ---- */
.studio-actions{
  display:flex;align-items:center;justify-content:flex-end;gap:var(--s2);
  flex-wrap:wrap;margin-left:auto;
}
/* WHERE THE WORK LIVES. Provenance, so: mono, quiet, always on screen. */
.save-state{
  display:inline-flex;align-items:center;gap:6px;font-family:var(--d);
  font-size:11px;font-weight:500;color:var(--ink-3);white-space:nowrap;
}
.save-state i{width:6px;height:6px;border-radius:99px;background:var(--positive);flex:none}
.save-state.error{color:var(--danger)}
.save-state.error i{background:var(--danger)}
.save-state.local{color:var(--warning)}
.save-state.local i{background:var(--warning)}
/* Provider readiness. Three states, because "I could not ask" is not "no
   provider" — an unknown reads amber, never red. */
.gen-ready{
  display:inline-flex;align-items:center;gap:6px;font-family:var(--d);
  font-size:11px;font-weight:500;color:var(--ink-3);white-space:nowrap;
}
.gen-ready i{width:6px;height:6px;border-radius:99px;background:var(--ink-3);flex:none}
.gen-ready.ok i{background:var(--positive)}
.gen-ready.unknown{color:var(--warning)}
.gen-ready.unknown i{background:var(--warning)}
.gen-ready.off{color:var(--danger)}
.gen-ready.off i{background:var(--danger)}
.seg4{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--card)}
.seg4 button{
  border:none;background:none;font-family:var(--d);font-size:11px;font-weight:500;
  padding:7px 11px;cursor:pointer;color:var(--ink-3);
}
.seg4 button:hover{color:var(--ink)}
.seg4 button.on{background:var(--ink);color:#fff}
.tier-adv-t{
  border:none;background:none;font-family:var(--d);font-size:11px;font-weight:500;
  color:var(--ink-3);cursor:pointer;padding:7px 4px;white-space:nowrap;
}
.tier-adv-t:hover{color:var(--ink)}
.tier-adv{display:inline-flex;align-items:center;gap:7px;max-width:340px}
.tier-adv select{
  border:1px solid var(--line);border-radius:8px;background:var(--card);
  font-family:var(--d);font-size:11px;color:var(--ink);padding:6px 7px;
}
.tier-adv em{font-size:10.5px;font-style:normal;color:var(--ink-3);line-height:1.3}
.btn-b{
  border:1px solid var(--cobalt);border-radius:var(--r-sm);background:var(--cobalt);
  color:#fff;font-size:12.5px;font-weight:600;padding:9px 14px;cursor:pointer;
}
.btn-b:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}
.btn-w{
  border:1px solid var(--line);border-radius:var(--r-sm);background:var(--card);
  font-size:12.5px;font-weight:600;padding:9px 13px;cursor:pointer;color:var(--ink);
}
.btn-w:hover{border-color:var(--ink-3)}
.btn-b:disabled,.btn-w:disabled{opacity:.45;cursor:default}

/* ---- collections: quiet pills ---- */
.st4 .ctabs{
  display:flex;gap:6px;align-items:center;overflow-x:auto;padding:2px 0;
  margin-top:var(--s3);scrollbar-width:thin;scrollbar-color:var(--hair-2) transparent;
}
/* ⚠ .ctab ALSO EXISTS IN globals.css as an underlined tab (padding, a 2px
   bottom border and a -2px margin that pulls it onto a rule). These are
   pills, so the leaked geometry is reset here rather than inherited into a
   shape it was never meant to make. */
.st4 .ctab{
  flex:none;border:1px solid var(--line);border-radius:99px;background:var(--card);
  font-size:12.5px;font-weight:600;padding:6px 13px;margin-bottom:0;cursor:pointer;
  color:var(--ink-2);white-space:nowrap;font-variant-numeric:tabular-nums;
  transition:border-color .14s,color .14s;
}
.st4 .ctab:hover{border-color:var(--ink-3);color:var(--ink)}
.st4 .ctab.on{background:var(--ink);color:#fff;border-color:var(--ink)}

/* ---- progress: state, never a pressable, so never blue ---- */
.studio-progress{display:flex;align-items:stretch;gap:var(--s2);margin-top:var(--s3)}
.studio-step{
  flex:1;min-width:0;display:flex;align-items:flex-start;gap:9px;padding:10px 12px;
  background:var(--card);border:1px solid var(--line);
  border-left:3px solid var(--hair-2);border-radius:var(--r-sm);
}
.studio-step .n{
  width:24px;height:24px;flex:none;border-radius:99px;display:grid;place-items:center;
  background:var(--paper-2);font-family:var(--d);font-size:11px;font-weight:600;
  color:var(--ink-3);font-variant-numeric:tabular-nums;
}
.studio-step.active{border-left-color:var(--ink)}
.studio-step.active .n{background:var(--ink);color:#fff}
.studio-step.done{border-left-color:var(--positive)}
.studio-step.done .n{background:var(--positive);color:#fff}
/* ⚠ THE PROJECTION WARNING. When the board has concepts the engine cannot
   see, every other screen counts zero for this collection. That sentence
   keeps a --warning rule and full legibility — it is never clipped. */
.studio-step.warn{border-left-color:var(--warning)}
.studio-step.warn small{color:var(--warning)}
.studio-step div{min-width:0}
.studio-step b{
  display:block;font-size:12px;font-weight:600;color:var(--ink);line-height:1.25;
  font-variant-numeric:tabular-nums;
}
.studio-step small{display:block;font-size:11px;color:var(--ink-3);margin-top:3px;line-height:1.4}

/* ---- layout ---- */
.lay4{display:grid;grid-template-columns:280px minmax(0,1fr);gap:var(--s4);align-items:start}
.lay4.norail{grid-template-columns:minmax(0,1fr)}
@media(max-width:1050px){
  .studio-command{align-items:flex-start;flex-wrap:wrap}
  .studio-actions{margin-left:0}
  .studio-progress{overflow-x:auto}
  .studio-step{min-width:160px}
  .lay4,.lay4.norail{grid-template-columns:1fr}
}

/* ---- left rail: white panel, mono section headings ---- */
.st4 .pane{
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:var(--s4);margin-bottom:var(--s3);box-shadow:var(--shadow);
}
.materials-rail{position:sticky;top:152px}
.st4 .pk{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s3);
  display:flex;justify-content:space-between;align-items:baseline;gap:var(--s2);
}
.st4 .pk .act{
  font-size:11px;font-weight:600;letter-spacing:0;text-transform:none;
  color:var(--cobalt);cursor:pointer;background:none;border:none;padding:0;
}
.st4 .mini{font-size:11px;color:var(--ink-3);line-height:1.5}

/* fabric library — the swatch is the subject, the source tag is provenance */
.fab{
  display:flex;align-items:center;gap:var(--s2);padding:8px 0;
  border-bottom:1px solid var(--hair);font-size:12px;
}
.fab:last-child{border-bottom:none}
.fab .nm{font-weight:600;color:var(--ink);flex:1;min-width:0}
.fab .nm small{display:block;font-weight:400;color:var(--ink-3);font-size:11px;margin-top:2px;line-height:1.4}
.fab .fabsw{
  width:30px;height:30px;flex:none;border-radius:var(--r-xs);object-fit:cover;
  border:1px solid var(--line);background:var(--paper-2);cursor:pointer;
}
.fab .fabsw.add{color:var(--ink-3);font-size:12px;display:grid;place-items:center;padding:0}
.fab .fabsw.add:hover{border-color:var(--cobalt);color:var(--cobalt)}
.fab .src{
  flex:none;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;
  text-transform:uppercase;border-radius:999px;padding:2px 8px;
  background:var(--paper-2);color:var(--ink-3);
}
.fab .src.own{background:var(--surface);border:1px solid var(--hair-2);color:var(--ink-2)}
.fform input{
  width:100%;border:1px solid var(--line);border-radius:var(--r-xs);
  background:var(--surface);padding:8px 10px;font-size:12px;margin-bottom:6px;color:var(--ink);
}
.fform input:focus{outline:none;border-color:var(--cobalt)}
.fform .note{font-size:11px;color:var(--ink-3);margin-bottom:9px;line-height:1.5}

/* chips */
.ichips{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0 9px}
.ichip{
  font-size:11px;font-weight:600;background:var(--paper-2);border-radius:999px;
  padding:3px 8px;color:var(--ink-2);max-width:100%;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.ichip.dot{display:inline-flex;align-items:center;gap:5px}
.ichip .sw{width:10px;height:10px;flex:none;border-radius:99px;border:1px solid var(--hair-2);display:inline-block}
.ichip.taste{background:var(--surface);border:1px solid var(--hair-2);color:var(--ink)}

/* ---- board ---- */
.board{min-width:0}
.board-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s4);margin:0 0 var(--s4)}
.board-head h2{
  font-family:var(--serif);font-weight:500;font-size:26px;line-height:1.1;
  letter-spacing:-.015em;margin:0 0 6px;color:var(--ink);
}
.board-head p{font-size:12.5px;color:var(--ink-3);margin:0;line-height:1.5;max-width:62ch}
/* What ordered these cards — evidence, so it keeps a rule down its edge. */
.taste-note{
  flex:none;max-width:340px;background:var(--card);border:1px solid var(--line);
  border-left-width:3px;border-radius:var(--r-sm);padding:11px 13px;box-shadow:var(--shadow);
}
.taste-note.off{border-left-color:var(--warning)}
.taste-note.on{border-left-color:var(--positive)}
.taste-note b{display:block;font-size:12px;font-weight:700;color:var(--ink);line-height:1.35}
.taste-note span{display:block;font-size:11px;color:var(--ink-2);line-height:1.5;margin-top:4px}
.taste-note button{
  margin-top:8px;border:1px solid var(--line);border-radius:var(--r-xs);
  background:var(--card);font-size:11px;font-weight:600;padding:6px 10px;
  cursor:pointer;color:var(--cobalt);
}
.taste-note button:hover{border-color:var(--cobalt)}

.stage-block{margin-bottom:var(--s5)}
.stage-head{display:flex;align-items:center;gap:var(--s2);margin-bottom:var(--s3);flex-wrap:wrap}
.stage-head h3{
  font-family:var(--d);font-size:11px;font-weight:500;text-transform:uppercase;
  letter-spacing:.06em;color:var(--ink);margin:0;
}
.stage-head b{
  font-family:var(--d);font-size:11px;font-weight:500;background:var(--surface);
  border:1px solid var(--line);border-radius:99px;padding:2px 8px;color:var(--ink-2);
  font-variant-numeric:tabular-nums;
}
.stage-head span{font-size:11px;color:var(--ink-3)}

/* ---- the garments ---- */
.igrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:var(--s3)}
.icard{
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  overflow:hidden;cursor:pointer;
  transition:transform .16s,box-shadow .16s,border-color .16s;
}
.icard:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:var(--hair-2)}
.icard.ok{border-color:var(--positive)}
/* 4:5, cover, paper underneath — the same frame Revisión uses, so a
   garment looks like the same object on both screens. */
.ifig{aspect-ratio:4/5;background:var(--paper-2);position:relative}
.ifig img{width:100%;height:100%;object-fit:cover;display:block}
.ifig .ph{
  position:absolute;inset:0;display:grid;place-items:center;align-content:center;
  font-size:11px;color:var(--ink-3);text-align:center;padding:var(--s4);line-height:1.6;
}
.ifig .ph b{display:block;margin-top:6px;font-weight:600;color:var(--ink-2)}
.ifig .shot{
  position:absolute;right:8px;bottom:8px;width:34%;border-radius:var(--r-xs);
  border:2px solid var(--surface);overflow:hidden;box-shadow:var(--shadow);
}
.ifig .shot img{aspect-ratio:4/5}
.ifig .apr{
  position:absolute;top:9px;right:9px;font-family:var(--d);font-size:11px;
  font-weight:500;background:var(--positive);color:#fff;border-radius:999px;padding:3px 8px;
}
/* ⚠ width:auto IS LOAD-BEARING: globals.css has a layout container also
   called .stage with width:100%, which stretched this badge into a bar
   across the whole garment. */
.ifig .stage{
  position:absolute;top:9px;left:9px;width:auto;max-width:calc(100% - 18px);
  font-family:var(--d);font-size:11px;font-weight:500;
  text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2);
  background:color-mix(in srgb,var(--surface) 92%,transparent);
  border-radius:999px;padding:3px 8px;box-shadow:var(--shadow);
}
.ifig .spin{
  position:absolute;inset:0;background-size:200% 100%;animation:st4sh 1.2s infinite;
  background-image:linear-gradient(100deg,var(--paper-2) 40%,var(--surface) 50%,var(--paper-2) 60%);
}
@keyframes st4sh{to{background-position:-200% 0}}
.ibody{padding:11px 12px 12px}
.it{
  font-size:13px;font-weight:650;color:var(--ink);line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.iacts{display:flex;gap:5px}
.ib{
  flex:1;border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  font-size:11px;font-weight:600;padding:7px 5px;cursor:pointer;color:var(--ink-2);
}
.ib:hover{border-color:var(--ink-3);color:var(--ink)}
.ib.b{flex:1.7;background:var(--cobalt);border-color:var(--cobalt);color:#fff}
.ib.b:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}
.ib:disabled{opacity:.4;cursor:default}
.ib:disabled:hover{border-color:var(--line);color:var(--ink-2)}

.addcard{
  border:1px dashed var(--hair-2);border-radius:var(--r);display:grid;place-items:center;
  min-height:260px;cursor:pointer;color:var(--ink-3);font-size:12px;font-weight:600;
  background:color-mix(in srgb,var(--surface) 55%,transparent);
}
.addcard:hover{border-color:var(--cobalt);color:var(--cobalt)}
.aform{background:var(--card);border:1px solid var(--cobalt);border-radius:var(--r);padding:var(--s4)}
.aform label{
  display:block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);margin:10px 0 5px;
}
.aform input,.aform select{
  width:100%;border:1px solid var(--line);border-radius:var(--r-xs);
  background:var(--surface);padding:8px 10px;font-size:12.5px;color:var(--ink);
}
.aform input:focus,.aform select:focus{outline:none;border-color:var(--cobalt)}
.aform .sws{display:flex;gap:6px;flex-wrap:wrap}
.aform .swb{width:22px;height:22px;border-radius:999px;border:1px solid var(--hair-2);cursor:pointer;padding:0}
.aform .swb.on{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--cobalt)}

/* ---- empty, error, toast ---- */
.empty4{
  border:1px dashed var(--hair-2);border-radius:var(--r);padding:var(--s7) var(--s5);
  text-align:center;font-size:12.5px;color:var(--ink-3);background:var(--card);
  line-height:1.6;max-width:64ch;margin:0 auto;
}
.empty4 strong{
  display:block;font-family:var(--serif);font-size:20px;font-weight:500;
  color:var(--ink);margin-bottom:9px;letter-spacing:-.01em;
}
.err4{
  font-size:12px;color:var(--ink);margin:0 0 var(--s3);padding:10px 13px;
  border-left:3px solid var(--danger);background:var(--clay-wash);
  border-radius:0 var(--r-xs) var(--r-xs) 0;line-height:1.5;
}
.toast4{
  position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--ink);
  color:#fff;font-size:12px;font-weight:500;border-radius:999px;padding:10px 18px;
  z-index:60;box-shadow:var(--shadow-lg);
}
      ` }} />

      <div className="hd">
        <div className="studio-command">
          <div className="studio-identity">
            {editing && <button className="back" onClick={() => setEditingId(null)} aria-label="Volver a la colección">←</button>}
            <div>
              <div className="studio-eyebrow">{editing ? "Workspace de prenda" : mode === "explorar" ? "Exploración de conceptos" : "Colección activa"}</div>
              <h1>{editing ? editing.name || editing.silhouette || "Prenda" : "Estudio de concepto"}</h1>
              {coll && !editing && mode === "coleccion" && <input className="cname" value={coll.name} onChange={(e) => renameColl(e.target.value)} title="Nombre de la colección" />}
              {editing && <div className="meta">{coll?.name} · {fabricOf(editing)?.name || "sin tela"}</div>}
            </div>
            {!editing && (
              <div className="mode-tabs" role="tablist" aria-label="Modo del estudio">
                <button className={mode === "explorar" ? "on" : ""} role="tab" aria-selected={mode === "explorar"} onClick={() => switchMode("explorar")}>✦ Explorar</button>
                <button className={mode === "coleccion" ? "on" : ""} role="tab" aria-selected={mode === "coleccion"} onClick={() => switchMode("coleccion")}>Colección · {coll?.items.length || 0}</button>
              </div>
            )}
          </div>

          <div className="studio-actions">
            {/* Says WHERE the work lives — "guardado" without a scope was the
                thing that let a browser-only workspace look durable. */}
            <span className={`save-state${saveState.status === "error" ? " error" : ""}${saveState.scope === "local" && saveState.status !== "error" ? " local" : ""}`}
              title={saveState.message || (saveState.scope === "team"
                ? `Guardado en el equipo (motor) · ${fmtTs(saveState.at)} — visible para todo el equipo`
                : "Solo en este navegador: si lo borrás, se pierde. Prendé el motor para compartirlo con el equipo.")}>
              <i />{saveState.status === "error" ? "No guardado"
                : saveState.status === "loading" ? "Abriendo…"
                : saveState.scope === "team" ? `Equipo · ${fmtTs(saveState.at)}`
                : `Solo este navegador · ${fmtTs(saveState.at)}`}
            </span>
            {/* ⚠ The old pair here was Borrador/Final — a provider-native
                quality knob on OpenAI and pure decoration on Gemini. The
                selector now speaks the ENGINE's routing vocabulary (fast |
                balanced | best): it changes which model serves, and the top
                tier additionally asks for final rendering where the provider
                has that knob. No tier is called "mejor": the registry ranks by
                documented capability and availability, and the blind fashion
                benchmark that would justify a quality claim has not run —
                hence "según el proveedor". No price chip either: the price
                depends on the model the tier routes to, which the engine
                decides per request; printing the legacy provider's list price
                here would be the decoration this row already had removed
                once. */}
            <div className="seg4" title="Calidad pedida para las próximas generaciones — cambia el modelo que responde. El costo depende del modelo que sirva; se registra en cada versión.">
              {TIERS.map((t) => (
                <button key={t.id} className={tier === t.id ? "on" : ""}
                  onClick={() => setTier(t.id)}>{t.label}</button>
              ))}
            </div>
            <button className="tier-adv-t" onClick={() => setAdvOpen((o) => !o)}
              title="Fijar un modelo exacto del registro del motor">
              avanzado {advOpen ? "▴" : "▾"}
            </button>
            {advOpen && (
              <span className="tier-adv">
                <select value={pinModel} onChange={(e) => setPinModel(e.target.value)}
                  aria-label="Modelo exacto">
                  <option value="">según tarea y calidad</option>
                  {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <em>{MODEL_PIN_NOTE}</em>
              </span>
            )}
            <span className={`gen-ready${readiness.state === "configured" ? " ok" : readiness.state === "unknown" ? " unknown" : " off"}`}
              title={readinessDetail(readiness)}>
              <i />{readinessLabel(readiness)}
            </span>
            {(editing || mode === "coleccion") && <button className="btn-w" onClick={exportCollection} title="Baja los PNG de toda la colección — listos para Photoshop">Exportar PNGs ↓</button>}
            {!editing && mode === "coleccion" && <button className="btn-w" onClick={() => setRailOpen((o) => !o)}>{railOpen ? "Ocultar materiales" : "Materiales"}</button>}
            {!editing && mode === "coleccion" && <button className="btn-b" onClick={() => setAdding(true)}>＋ Nueva prenda</button>}
          </div>
        </div>

        {!editing && mode === "coleccion" && (
          <>
            <div className="ctabs" aria-label="Colecciones">
              {colls.map((c) => (
                <button key={c.id} className={`ctab${c.id === coll?.id ? " on" : ""}`} onClick={() => { setActiveId(c.id); setEditingId(null); }}>
                  {c.name} · {c.items.length}
                </button>
              ))}
              <button className="ctab" onClick={newCollection}>＋ Nueva colección</button>
            </div>
            <div className="studio-progress" aria-label="Progreso de la colección">
              {stages.map((stage, index) => (
                <div key={stage.id} className={`studio-step${stage.count ? " active" : ""}${stage.id === "approved" && stage.count ? " done" : ""}`}>
                  <span className="n">{index + 1}</span>
                  <div><b>{stage.label} · {stage.count}</b><small>{stage.note}</small></div>
                </div>
              ))}
              {/* When the projection into the engine has not landed, the rest
                  of the app (rail, centro de colección, portfolio) counts
                  zero for this collection. Saying so is the honest version of
                  the bug that used to show "1/1 con concepto" here beside
                  "0 conceptos" on the rail with nothing to explain it — and
                  the `warn` rule down its left edge is what stops it reading
                  as one more grey count. */}
              <div className={`studio-step${completion === 100 && coll?.items.length ? " done" : ""}${withConcept > 0 && !projected.ok ? " warn" : ""}`}>
                <span className="n">{completion}%</span>
                <div><b>Lista para handoff</b><small>
                  {withConcept}/{coll?.items.length || 0} con concepto
                  {withConcept > 0 && !projected.ok
                    ? " · sin registrar en el motor: las demás pantallas todavía no los ven"
                    : ""}
                </small></div>
              </div>
            </div>
          </>
        )}
      </div>

      {genError && <div className="err4">{genError}</div>}

      {editing ? (
        <StudioItemEditor
          item={editing} coll={coll} itemIndex={coll.items.indexOf(editing)}
          fabric={fabricOf(editing)} palette={palette} trends={liveTrends} dna={brandDna}
          quality={quality} cost={costCentsFor(readiness, quality)} abs={abs}
          patchItem={patchItem} callGenerate={callGenerate} approve={approve}
          exportPng={exportPng} onClose={() => setEditingId(null)} onCommit={commitItem} flash={flash}
        />
      ) : mode === "explorar" ? (
        <StudioExplore
          engine={engine} fabrics={fabrics} quality={quality}
          // The engine's price for the provider that would actually serve, or
          // null when it does not know one. Explore must not re-derive it.
          perImageCents={costCentsFor(readiness, quality)}
          callGenerate={callGenerate} flash={flash}
          onSendToCollection={promoteConcepts} collName={coll?.name}
          // The brand whose taste applies. `brandId` here, not
          // `engine.status === "live" && ...`: calibration reads the archive and
          // the concepts, which exist with or without a market run — the same
          // rule Calibration.jsx follows (EngineProvider's run-gate).
          brandId={brandId} onNavigate={onNavigate}
          collectionId={coll?.id || activeId}
          collectionItemCount={coll?.items?.length || 0}
          direction={direction?.exists ? direction : null}
        />
      ) : (
      <div className={`lay4${railOpen ? "" : " norail"}`}>
        {/* ===== LEFT — fabric library + silhouettes ===== */}
        {railOpen && (
          <div className="materials-rail">
            <div className="pane">
              <div className="pk">Biblioteca de telas
                <button className="act" onClick={() => setAddingFabric((a) => !a)}>{addingFabric ? "cerrar" : "＋ agregar tela"}</button>
              </div>
              {addingFabric && (
                <FabricForm onAdd={addFabric} />
              )}
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {fabrics.map((f) => (
                  <div className="fab" key={f.id}>
                    {f.swatch
                      ? <img className="fabsw" src={abs(f.swatch)} alt="" title="Swatch real — tocá para reemplazar" onClick={() => setSwatchFor(f.id)} />
                      : <button className="fabsw add" title="Subí una foto real de la tela" onClick={() => setSwatchFor(f.id)}>＋</button>}
                    <span className="nm">{f.name}
                      {(f.comp || f.proveedor || f.precio_m || f.gsm) && (
                        <small>{[f.comp, f.gsm && `${f.gsm} g/m²`, f.precio_m && `AR$${f.precio_m}/m`, f.proveedor].filter(Boolean).join(" · ")}</small>
                      )}
                      {(() => { const n = colls.reduce((a, c) => a + c.items.filter((x) => x.fabricId === f.id).length, 0);
                        return n > 0 ? <small style={{ color: "var(--cobalt)" }}>en {n} prenda{n > 1 ? "s" : ""}</small> : null; })()}
                    </span>
                    <span className={`src${f.source === "propio" ? " own" : ""}`}>{f.source}</span>
                  </div>
                ))}
                {swatchFor && (
                  <input type="file" accept="image/*" autoFocus style={{ position: "fixed", opacity: 0 }} ref={(el) => el?.click()}
                    onChange={(e) => attachSwatch(swatchFor, e.target.files[0])} onBlur={() => setSwatchFor(null)} />
                )}
              </div>
              <div className="mini" style={{ marginTop: 8 }}>
                las telas de tu catálogo vienen sembradas; sumá las tuyas con proveedor real — la generación usa la tela elegida de cada prenda
              </div>
            </div>
            <div className="pane">
              <div className="pk">Siluetas de tu archivo</div>
              <div className="ichips" style={{ margin: 0 }}>
                {silhouettes.map((s) => <span className="ichip" key={s}>{s}</span>)}
              </div>
              <div className="mini" style={{ marginTop: 8 }}>
                {silhouettes.length
                  ? "aprendidas por el engine del catálogo de tu marca — en \u201cagregar prenda\u201d podés escribir cualquier otra"
                  : "Todavía no hay ADN de tu marca. Conectá tu tienda en Integraciones; no listamos las siluetas de otra marca."}
              </div>
            </div>
          </div>
        )}

        {/* ===== CENTER — collection workflow board ===== */}
        <div className="board">
          <div className="board-head">
            <div>
              <div className="studio-eyebrow">Desarrollo de colección</div>
              <h2>{coll?.name}</h2>
              <p>De brief a desarrollo: cada prenda avanza cuando tiene concepto, criterio del equipo y aprobación.</p>
            </div>
            {/* What is ordering these cards, in both states. Uncalibrated is the
                live state and gets the same prominence: the missing comparisons
                and the way to make them. */}
            <div className={`taste-note ${tasteState.tone}`}>
              <b>{tasteState.applied
                ? "Ordenadas por el gusto aprendido de tu equipo"
                : tasteState.headline}</b>
              <span>{tasteState.detail}</span>
              {tasteState.cta && onNavigate && (
                <button onClick={() => onNavigate(tasteState.cta.view)}>{tasteState.cta.label}</button>
              )}
            </div>
          </div>

          {coll?.items.length === 0 && !adding ? (
            <div className="empty4">
              <strong>Empezá con una prenda, un brief o una referencia</strong>
              Definí silueta, tela y color. Después generá una base, refiná variantes y mandá la elegida a desarrollo.
              <div style={{ marginTop: 16 }}><button className="btn-b" onClick={() => setAdding(true)}>＋ Crear primera prenda</button></div>
            </div>
          ) : stages.map((stage) => {
            const inStage = coll?.items.filter((item) => stageOf(item) === stage.id) || [];
            // Ordered WITHIN the stage, never across it: taste does not move a
            // garment out of "en diseño" into "aprobadas". With no calibration
            // `orderByTaste` hands back the same array, so the board is the
            // board it always was.
            const order = orderByTaste(inStage, tasteScores);
            const stageItems = order.ordered;
            if (!stageItems.length && stage.id !== "draft") return null;
            return (
              <div className="stage-block" key={stage.id}>
                <div className="stage-head"><h3>{stage.label}</h3><b>{stageItems.length}</b>
                  <span>{order.applied
                    ? `ordenadas por el gusto aprendido · ${coverageLine(order)}`
                    : stage.note}</span></div>
                <div className="igrid">
                  {stageItems.map((it) => {
                    const f = fabricOf(it);
                    return (
                      <div key={it.id} className={`icard${it.approved ? " ok" : ""}`} onClick={() => setEditingId(it.id)}>
                        <div className="ifig">
                          {busyId === it.id ? <div className="spin" /> : it.cover ? (
                            <>
                              <img src={abs(it.cover)} alt={it.name} />
                              {it.modelShot && <span className="shot"><img src={abs(it.modelShot)} alt="en modelo" title="visualización generada" /></span>}
                            </>
                          ) : (
                            <span className="ph">Todavía sin concepto<br /><b>abrí la prenda para empezar</b></span>
                          )}
                          <span className="stage">{stage.label}</span>
                          {it.approved && <span className="apr">✓ Aprobada</span>}
                        </div>
                        <div className="ibody">
                          <div className="it">{it.name || it.silhouette || "Prenda"}</div>
                          <div className="ichips">
                            {it.silhouette && <span className="ichip">{it.silhouette}</span>}
                            {f && <span className="ichip">{f.name}</span>}
                            {/* A garment asked for in prose states no colourway,
                                and an empty swatch beside an empty name is the
                                chip claiming a colour nobody picked. */}
                            {it.colorway && <span className="ichip dot"><i className="sw" style={{ background: it.colorway }} />{colName(it.colorway)}</span>}
                            {/* Only ever rendered when the engine returned a
                                score for THIS garment; an unscored one shows
                                nothing rather than a zero. */}
                            {order.applied && (() => {
                              const hit = tasteScores?.get(String(it.id));
                              return hit && typeof hit.score === "number"
                                ? <span className="ichip taste" title={matchedSummary(hit.matched)}>gusto ✓</span>
                                : null;
                            })()}
                          </div>
                          <div className="iacts">
                            <button className="ib b" disabled={!!busyId} onClick={(e) => { e.stopPropagation(); it.cover ? setEditingId(it.id) : genConcept(it); }}
                              title={it.cover ? "Abrir el workspace de esta prenda" : `Genera el concepto con ${f?.name || "su tela"} (${costLabel(readiness, quality)})`}>
                              {it.cover ? "Abrir workspace" : "✦ Generar base"}
                            </button>
                            <button className="ib" disabled={!!busyId || !it.cover} onClick={(e) => { e.stopPropagation(); genModel(it); }}
                              title="La misma prenda puesta en una modelo — visualización generada">Modelo</button>
                            <button className="ib" disabled={!it.cover} onClick={(e) => { e.stopPropagation(); exportPng(it.cover, `${coll.name}-${it.name || it.silhouette}`); }}
                              title="PNG listo para Photoshop">↓</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {stage.id === "draft" && (adding ? (
                    <AddItemForm fabrics={fabrics} silhouettes={silhouettes} palette={palette}
                      onAdd={addItem} onCancel={() => setAdding(false)} />
                  ) : <button className="addcard" onClick={() => setAdding(true)}>＋ Agregar otra prenda</button>)}
                </div>
              </div>
            );
          })}
        </div>

      </div>
      )}

      {toast && <div className="toast4">{toast}</div>}
    </section>
  );
}

function AddItemForm({ fabrics, silhouettes, palette, onAdd, onCancel }) {
  const [f, setF] = useState({ name: "", silhouette: silhouettes[0] || "", fabricId: fabrics[0]?.id || "", colorway: palette[0] || "#17181C", nota: "" });
  return (
    <div className="aform" onClick={(e) => e.stopPropagation()}>
      <label>Nombre (opcional)</label>
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Remera Cinema v2…" />
      <label>Silueta</label>
      <input list="st4-sil" value={f.silhouette} onChange={(e) => setF({ ...f, silhouette: e.target.value })} placeholder="tee, hoodie, cargo…" />
      <datalist id="st4-sil">{silhouettes.map((s) => <option key={s} value={s} />)}</datalist>
      <label>Tela · de tu biblioteca</label>
      <select value={f.fabricId} onChange={(e) => setF({ ...f, fabricId: e.target.value })}>
        {fabrics.map((x) => <option key={x.id} value={x.id}>{x.name}{x.proveedor ? ` — ${x.proveedor}` : ""}</option>)}
      </select>
      <label>Color</label>
      <div className="sws">
        {palette.map((h) => (
          <button key={h} className={`swb${f.colorway === h ? " on" : ""}`} style={{ background: h }} title={h}
            onClick={() => setF({ ...f, colorway: h })} />
        ))}
      </div>
      <label>Nota de diseño (opcional)</label>
      <input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="gráfica de cine al frente, calce oversize…" />
      <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
        <button className="btn-b" style={{ flex: 1 }} disabled={!f.silhouette.trim()} onClick={() => onAdd(f)}>Agregar</button>
        <button className="btn-w" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function FabricForm({ onAdd }) {
  const [f, setF] = useState({ name: "", comp: "", proveedor: "", gsm: "", precio_m: "", moq_m: "", lead: "" });
  return (
    <div className="fform">
      <div className="note">Cargá telas REALES con tu proveedor — no inventamos casas de telas. Los datos de producción (peso, precio/m, MOQ, lead) habilitan el costeo honesto por prenda.</div>
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nombre — rib 1x1, gabardina 8 oz…" />
      <input value={f.comp} onChange={(e) => setF({ ...f, comp: e.target.value })} placeholder="Composición — 95% CO 5% EA" />
      <input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} placeholder="Proveedor real — Textil Oeste…" />
      <div style={{ display: "flex", gap: 6 }}>
        <input value={f.gsm} onChange={(e) => setF({ ...f, gsm: e.target.value })} placeholder="g/m²" />
        <input value={f.precio_m} onChange={(e) => setF({ ...f, precio_m: e.target.value })} placeholder="AR$/metro" />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={f.moq_m} onChange={(e) => setF({ ...f, moq_m: e.target.value })} placeholder="MOQ (m)" />
        <input value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} placeholder="Lead (días)" />
      </div>
      <button className="btn-b" style={{ width: "100%" }} disabled={!f.name.trim()} onClick={() => onAdd(f)}>Guardar tela</button>
    </div>
  );
}
