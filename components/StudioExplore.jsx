"use client";
// Explorar — the exploration-matrix mode of Concept Studio (owner mockup,
// pasted 2026-07-21): a designer defines a design SPACE (siluetas × tejidos ×
// colores, with detalles/fit as rotating modifiers), the Director de diseño
// rail weights how much of each axis a run uses, and a batch of concepts is
// generated, curated and promoted into the collection board.
//
// Honesty rules:
//   · Every axis option shows its source (catálogo / ADN / tendencia / propio);
//     trend-sourced suggestions appear only when the engine is live.
//   · Cost is engine-documented math (n × 1¢ draft / 6¢ final), shown before
//     generating. Time is measured during the run — no invented ETAs.
//   · A quota error pauses the run and says so; partial results stay.
//   · Image pixels live in IndexedDB (localStorage can't hold a 240-run);
//     only combo metadata + selection state persist in localStorage.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FAB_FAMILY } from "@/lib/catalog";
import { useBrandCatalog } from "@/lib/useBrandCatalog";
import { colName } from "@/lib/signals";
import {
  DEFAULT_WEIGHTS, matrixSize, batchCostCents,
  sampleCombos, firstCapsuleCombos, comboContext, comboPrompt, scoreCombo,
  markSimilar, trayBalance, groupLabel, compactImage,
} from "@/lib/explore";
import { dnaFidelity, DNA_BAND_LABEL } from "@/lib/brandDna";
import { idbPut, idbGetMany, idbClear } from "@/lib/idb";
import { ownRefsFromDna, whitespaceNudge } from "@/lib/differentiation";
import { getGenerationReadiness, getOpportunities } from "@/lib/api";
import {
  STUDIO_DIMENSION_QUESTION, conceptCandidate, coverageLine, fetchTasteProfile,
  fetchTasteScores, matchedSummary, orderByTaste, scoreIndex, tasteStatus,
  topByTaste, topTerms,
} from "@/lib/tasteRanking.mjs";
import {
  directionAxes, directionLineage, directionPrompt, directionReferences,
  directionRunCount, directionSelection, directionSummary, directionVersionKey,
} from "@/lib/directionGeneration.mjs";
import { engineFetch } from "@/lib/auth";
import { GUIDANCE_LABEL, buildIntent } from "@/lib/generationIntent.mjs";
import GenerationReceipt from "@/components/GenerationReceipt";

const META_KEY = "atelier-explore-v1";
// Engine URLs come back relative (/static/studio/…) — resolve them against the
// engine, not this Next app. Stored concepts keep the relative form (same
// convention as the board), only rendering applies abs().
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
const abs = (url) => (url?.startsWith("/") ? API_BASE + url : url);
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? f; } catch { return f; } };
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return { ok: true }; }
  catch (e) {
    return { ok: false, message: e?.name === "QuotaExceededError"
      ? "El navegador se quedó sin espacio para metadatos — limpiá la corrida anterior."
      : "No se pudo guardar en este navegador." };
  }
};

const CONCURRENCY = 2; // the provider renders one image per call — 2 keeps the pipe full without inviting 429s

// A design space with nothing in it — the honest state for a brand with no DNA
// and no Direction. A module constant, so the effect that installs it cannot
// hand React a new object on every render.
const EMPTY_SPACE = Object.freeze({
  siluetas: [], tejidos: [], colores: [], detalles: [], fits: [],
});

// House silhouettes/palette come from the ACTIVE brand's engine DNA. They used
// to be read off a 36-product Complot list hardcoded in lib/catalog.js, so every
// brand explored against Complot's shapes and colours (2026-07-24 audit). No
// DNA -> empty, and the axis simply offers nothing rather than someone else's.
const lbl = (x) => (typeof x === "string" ? x : x?.label ?? x?.name ?? "");
const houseSilhouettes = (dna) =>
  [...new Set((dna?.silhouettes || []).map(lbl).filter(Boolean))];
const housePalette = (dna) =>
  (dna?.palette || []).map(lbl).filter((h) => /^#/.test(h)).slice(0, 8);

// Axis options with source tags. Live engine data (trends typologies, DNA
// palette) only joins when engine.status === "live" — demo mode stays on the
// catalog so we never present sample data as market evidence.
function buildAxisOptions(engine, fabrics, direction) {
  const brandDna = engine?.status === "live" ? engine.dna : null;
  const fromDirection = directionAxes(direction);
  const siluetas = [...fromDirection.siluetas];
  const knownSilhouettes = new Set(siluetas.map((s) => s.name));
  houseSilhouettes(brandDna).forEach((name) => {
    if (!knownSilhouettes.has(name)) {
      knownSilhouettes.add(name);
      siluetas.push({ name, source: "ADN de marca" });
    }
  });
  if (engine?.status === "live") {
    (engine.trends || []).forEach((t) => {
      if (t.g && !knownSilhouettes.has(t.g)) {
        knownSilhouettes.add(t.g);
        siluetas.push({ name: t.g, source: "tendencia", evidence: `${t.name} · ${t.yoyLabel || t.yoy || ""}`.trim() });
      }
    });
  }
  const tejidos = [...fromDirection.tejidos];
  const knownFabrics = new Set(tejidos.map((f) => f.id || f.name));
  fabrics.forEach((f) => {
    if (knownFabrics.has(f.id || f.name)) return;
    knownFabrics.add(f.id || f.name);
    tejidos.push({
    id: f.id, name: f.name, comp: f.comp, swatch: f.swatch,
    source: f.source === "propio" ? "propio" : "catálogo",
    });
  });
  const seenHex = new Set();
  const colores = [...fromDirection.colores];
  colores.forEach((c) => seenHex.add(c.hex));
  housePalette(brandDna).forEach((hex) => {
    if (!seenHex.has(hex)) {
      seenHex.add(hex);
      colores.push({ hex, name: colName(hex), source: "ADN de marca" });
    }
  });
  if (engine?.status === "live") {
    (engine.dna?.palette || []).forEach((hex) => {
      if (!seenHex.has(hex)) { seenHex.add(hex); colores.push({ hex, name: colName(hex), source: "ADN" }); }
    });
  }
  return { siluetas, tejidos, colores };
}

// ---------------------------------------------------------------------------
// THE PROMPT BOX'S HALF OF THE BARGAIN: freedom in the phrasing, discipline in
// what is attached and what is recorded.
//
// Designers were leaving to write to a general chat model, because that tool
// lets them type what they want and this one offered no free text at all —
// generation was the matrix and a constant. So the box exists. What it must NOT
// become is a worse chat model: Atelier will never win at open generation, and
// the thing a chat model structurally cannot know is that a garment may only be
// made from fabrics THIS brand can actually buy, at its supplier's minimum,
// inside its delivery window.
//
// Hence the shape below. Her sentence travels FIRST and VERBATIM — no template,
// no forced fields, nothing rewritten. Everything appended after it is a fact
// this screen already holds and can name its source for.
//
// ⚠ NOTHING IS SUBSTITUTED FOR A MISSING PART. No default palette, no generic
// "tejido de la casa", no other brand's silhouettes. With no Direction, no
// palette and no material sheet, the composed prompt IS her sentence and the
// panel says so in one line. That is the same defect the engine has fought
// three times (`runner._fixtures_dir` serving the default fixture set as an
// uningested brand's own catalogue): a fallback that makes an empty tenant look
// furnished is worse than an empty tenant.

const textOrNull = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
};

/**
 * Everything this screen can honestly say about ONE selected fabric, from the
 * three places such a fact may live: the axis option itself, the collection's
 * Direction payload (which carries the engine's own material sheet row) and the
 * studio's fabric library.
 *
 * Unknown stays null. An absent MOQ is not "sin mínimo", and the two stores
 * count in different units — the engine's sheet in units, a hand-entered
 * library row in metres — so the unit travels with the number instead of being
 * assumed. Returns null for a fabric with no name: there is nothing to say.
 */
export function fabricFacts(fabric, { direction = null, library = [] } = {}) {
  const name = textOrNull(fabric?.name);
  if (!name) return null;
  const materialId = fabric.materialId || fabric.id || null;
  const sheet = (direction?.items?.fabrics || []).find(
    (f) => f?.material_id && materialId && String(f.material_id) === String(materialId),
  )?.material || null;
  const lib = (library || []).find(
    (f) => (fabric.id && f?.id === fabric.id) || textOrNull(f?.name) === name,
  ) || null;

  const moqUnits = textOrNull(sheet?.moq_units);
  const moqMetres = textOrNull(lib?.moq_m);
  const leadDays = textOrNull(sheet?.lead_time_days) || textOrNull(lib?.lead);

  return {
    name,
    comp: textOrNull(fabric.comp) || textOrNull(sheet?.composition) || textOrNull(lib?.comp),
    supplier: textOrNull(fabric.supplier) || textOrNull(sheet?.supplier_name)
      || textOrNull(lib?.proveedor),
    moq: moqUnits ? `${moqUnits} u` : moqMetres ? `${moqMetres} m` : null,
    lead: leadDays ? `${leadDays} días` : null,
  };
}

const fabricLine = (f) => [
  f.comp ? `${f.name} (${f.comp})` : f.name,
  [f.supplier && `proveedor ${f.supplier}`, f.moq && `MOQ ${f.moq}`,
   f.lead && `entrega ${f.lead}`].filter(Boolean).join(" · "),
].filter(Boolean).join(" — ");

/**
 * Her words plus what this screen already knows, in that order.
 *
 * Pure and exported so the honesty property can be asserted without a browser:
 * with nothing attached, `prompt === text`. A version of this that reached for
 * a default palette, a house fabric or a neutral silhouette would fail that
 * assertion, which is the point of writing it this way round.
 */
export function composeFreePrompt({
  text = "", silhouettes = [], colours = [], fabrics = [], directionText = "",
} = {}) {
  const mine = typeof text === "string" ? text.trim() : "";
  const sil = (silhouettes || [])
    .map((s) => textOrNull(typeof s === "string" ? s : s?.name)).filter(Boolean);
  const col = (colours || [])
    .map((c) => ({ hex: textOrNull(c?.hex), name: textOrNull(c?.name) }))
    .filter((c) => /^#[0-9a-f]{3,8}$/i.test(c.hex || ""));
  const fab = (fabrics || []).filter((f) => textOrNull(f?.name));
  const dir = textOrNull(directionText);

  const blocks = [];
  if (dir) {
    blocks.push({ key: "direccion", label: "Dirección de la colección", line: dir });
  }
  if (sil.length) {
    blocks.push({
      key: "siluetas", label: `Siluetas · ${sil.length}`,
      line: `Siluetas elegidas para esta exploración: ${sil.join(", ")}.`,
    });
  }
  if (col.length) {
    blocks.push({
      key: "paleta", label: `Paleta · ${col.length}`,
      // The real hex values, not the names: the name is ours, the hex is hers.
      line: `Paleta de esta colección, con sus hex exactos: ${
        col.map((c) => (c.name && c.name !== c.hex ? `${c.name} ${c.hex}` : c.hex)).join(", ")}.`,
    });
  }
  if (fab.length) {
    blocks.push({
      key: "telas", label: `Telas · ${fab.length}`,
      line: `Telas que esta marca puede comprar para esta colección: ${
        fab.map(fabricLine).join("; ")}.`,
    });
  }
  // Derived from what was actually attached, never asserted on its own — with
  // no palette and no fabrics there is no list to stay inside of.
  if (col.length || fab.length) {
    blocks.push({
      key: "limite", label: "Límite de materiales",
      line: "Quedate dentro de esas telas y esos colores: son los que esta marca "
        + "puede comprar, en su mínimo y en su plazo.",
    });
  }

  const missing = [];
  if (!dir && !sil.length) missing.push("dirección");
  if (!col.length) missing.push("paleta");
  if (!fab.length) missing.push("telas");

  return {
    text: mine,
    prompt: [mine, ...blocks.map((b) => b.line)].filter(Boolean).join(" "),
    blocks,
    missing,
    // One quiet line, said before she runs — never a silent substitution.
    notice: !blocks.length
      ? "sin dirección: se genera sólo con tu texto"
      : missing.length
        ? `sin ${missing.join(" ni ")}: esa parte no se adjunta`
        : "",
    attached: {
      silhouettes: sil, colours: col, fabrics: fab, directionText: dir,
    },
  };
}

export default function StudioExplore({
  engine, fabrics, quality, callGenerate, flash, onSendToCollection, collName,
  brandId = null, onNavigate, direction = null, collectionId = null,
  collectionItemCount = 0,
  // Per-image price for the provider that would serve, from the engine. Null
  // means unknown — a real answer here, not a reason for a default.
  perImageCents = null,
}) {
  const options = useMemo(
    () => buildAxisOptions(engine, fabrics, direction),
    [engine, fabrics, direction],
  );
  const directionKey = directionVersionKey(direction);
  const directionState = useMemo(() => directionSummary(direction), [direction]);
  // The unscoped form is kept only for embedded/test callers that genuinely
  // have no collection. Real Studio always passes collectionId.
  const metaKey = collectionId ? `${META_KEY}::${collectionId}` : META_KEY;
  const [sel, setSel] = useState(null);            // {siluetas[], tejidos[], colores[], detalles[], fits[]}
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [adnFiel, setAdnFiel] = useState(0.82);
  const [count, setCount] = useState(24);
  const [brief, setBrief] = useState("");
  // The prompt box: her words, and the runs they produced. `freeRuns` holds
  // pixels, so it is deliberately NOT persisted — the durable home for a
  // generated image is the collection, and the panel says so rather than
  // letting a reload quietly eat the tanda.
  const [freeText, setFreeText] = useState("");
  const [freeRuns, setFreeRuns] = useState([]);
  const [freeBusy, setFreeBusy] = useState(false);
  const [refCodes, setRefCodes] = useState([]);    // ≤2 catalog style codes as generation references
  const [concepts, setConcepts] = useState([]);    // [{id, code, combo, status, url, idb, score, band, selected, similarTo}]
  const [imgs, setImgs] = useState({});            // id → dataURL hydrated from IndexedDB
  const [run, setRun] = useState({ phase: "idle", total: 0, done: 0, errors: 0, avgMs: null });
  const [groupOn, setGroupOn] = useState(true);
  const [hideSimilar, setHideSimilar] = useState(false);
  const [hideDerivative, setHideDerivative] = useState(false);
  // "orden" | "novedad" | "adn" | "gusto". `gusto` becomes the DEFAULT the
  // moment the engine says the brand's taste is calibrated — that is the whole
  // point of the feature, and a learned preference that a designer has to go
  // find in a dropdown is not steering anything. `sortTouched` records that the
  // person chose for themselves, and their choice is never overridden.
  const [sortBy, setSortBy] = useState("orden");
  const [sortTouched, setSortTouched] = useState(false);
  // The brand's learned taste: `null` until the engine answers, and null again
  // if it never does. Not defaulted to an empty profile — "the engine is down"
  // and "nobody has judged anything" are different sentences on screen.
  const [taste, setTaste] = useState(null);
  const [tasteScores, setTasteScores] = useState(null);   // Map id -> {score, matched}
  const [filterSil, setFilterSil] = useState("");
  const [detalleInput, setDetalleInput] = useState("");
  const [fitInput, setFitInput] = useState("");
  const runningRef = useRef(false);
  const conceptsRef = useRef([]);
  const initializedRef = useRef(null);
  // Evidence-grounded suggestions: real assortment gaps, computed and evidenced
  // by the ENGINE (`GET /brands/{id}/opportunities`).
  //
  // ⚠ THIS WAS DEAD AND READ AS WORKING. It called `findWhitespace(items,
  // trends)` with no third argument — and that function returns [] immediately
  // without a catalog, because a gap is YOUR range against theirs. So `gaps`
  // was permanently empty while the comment above it described "crawled
  // competitors × your catalog × live trends". Nothing rendered, nothing
  // errored, and the chips simply never appeared.
  const [gaps, setGaps] = useState([]);

  useEffect(() => {
    if (engine?.status !== "live" || !engine.brandId) return;
    let dead = false;
    getOpportunities(engine.brandId)
      .then((body) => {
        if (dead || !body?.opportunities?.length) return;
        setGaps(body.opportunities.slice(0, 3));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [engine?.status, engine?.brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠ MAY WHAT THIS RUN PRODUCES BE KEPT? Asked before the run, not after.
  // The engine has refused concepts against an unbriefed collection since
  // 2026-08-10 — but only at `POST /concepts`, i.e. after twelve images had
  // been generated and paid for. `null` means we could not ask, which is
  // neither a block nor a promise and says so.
  const [readiness, setReadiness] = useState(undefined); // undefined = asking
  useEffect(() => {
    let dead = false;
    if (!brandId || !collectionId) { setReadiness(null); return () => {}; }
    setReadiness(undefined);
    getGenerationReadiness(brandId, collectionId).then((r) => {
      if (!dead) setReadiness(r);
    });
    return () => { dead = true; };
  }, [brandId, collectionId, directionKey, collectionItemCount]);

  // ---- the brand's learned taste -----------------------------------------
  // Everything here is READ. The engine holds the judgments, learns the order,
  // gates it and does the scoring; this screen asks two questions ("is it
  // calibrated?" and "what do these concepts score?") and renders the answers.
  // It never computes a taste number, which is why an uncalibrated brand simply
  // has nothing to sort by rather than something to fall back on.
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

  // A calibrated brand gets its own taste as the default order. A designer who
  // picks a different one keeps it.
  useEffect(() => {
    if (!sortTouched && taste?.calibrated) setSortBy("gusto");
  }, [taste?.calibrated, sortTouched]);

  const doneIds = concepts.filter((c) => c.status === "done").map((c) => c.id).join("|");
  useEffect(() => {
    const done = conceptsRef.current.filter((c) => c.status === "done");
    if (!brandId || !taste?.calibrated || !done.length) { setTasteScores(null); return; }
    let cancelled = false;
    fetchTasteScores(tasteRequest, done.map(conceptCandidate))
      .then((r) => { if (!cancelled) setTasteScores(scoreIndex(r)); });
    return () => { cancelled = true; };
  }, [brandId, taste?.calibrated, doneIds, tasteRequest]);

  const tasteState = tasteStatus(taste);

  // Apply a gap: its typology joins the silhouettes (tagged as hueco), its
  // suggested fabric joins if the library has it, and the brief takes the note.
  function exploreGap(gap) {
    setSel((s) => {
      const next = { ...s };
      const typ = gap.brief?.typology;
      if (typ && !next.siluetas.some((x) => x.name === typ)) {
        next.siluetas = [...next.siluetas, { name: typ, source: "hueco", evidence: gap.title }];
      }
      const fabName = gap.brief?.fabric;
      const fab = fabName && options.tejidos.find((t) => t.name.toLowerCase().includes(fabName.toLowerCase()));
      if (fab && !next.tejidos.some((x) => (x.id || x.name) === (fab.id || fab.name))) {
        next.tejidos = [...next.tejidos, fab];
      }
      return next;
    });
    if (gap.brief?.note) setBrief(gap.brief.note);
    flash(`Hueco "${gap.category}" agregado al espacio de diseño`);
  }

  // Least-crowded colorway of the current selection vs catalog + live trends.
  const colorNudge = useMemo(() => {
    if (!sel?.colores?.length) return null;
    const texture = sel.tejidos?.[0]?.name || "Cotton jersey";
    const trends = engine?.status === "live" && engine.trends?.length ? engine.trends : undefined;
    const ownRefs = ownRefsFromDna(engine?.status === "live" ? engine.dna : null);
    return whitespaceNudge(sel.colores, texture, { trends, ownRefs });
  }, [sel?.colores, sel?.tejidos, engine?.status, engine?.dna]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- init: one collection, one Direction, one resumable exploration ----
  //
  // The old META_KEY was global: opening collection B could restore the axes
  // and concepts explored for collection A. The key is now collection-scoped,
  // and a saved run is restored only when it names the same Direction version.
  // A new Direction version deliberately resets the design space to its own
  // picks; silently keeping the superseded palette would make approval cosmetic.
  useEffect(() => {
    const initKey = `${metaKey}:${directionKey || "sin-direccion"}`;
    if (initializedRef.current === initKey) return;

    const stored = load(metaKey, null);
    if (stored?.sel && (stored.directionVersionId || null) === (directionKey || null)) {
      initializedRef.current = initKey;
      setSel(stored.sel); setWeights(stored.weights || DEFAULT_WEIGHTS);
      setAdnFiel(stored.adnFiel ?? 0.82); setCount(stored.count || 24);
      setBrief(stored.brief || ""); setRefCodes(stored.refCodes || []);
      setFreeText(stored.freeText || "");
      const cs = stored.concepts || [];
      conceptsRef.current = cs; setConcepts(cs);
      const idbKeys = cs.filter((c) => c.idb && c.status === "done").map((c) => c.id);
      if (idbKeys.length) idbGetMany(idbKeys).then(setImgs).catch(() => {});
    } else {
      if (!options.siluetas.length || !options.tejidos.length || !options.colores.length) {
        // ⚠ THIS USED TO `return` AND THE WHOLE SCREEN RENDERED NOTHING (found
        // while adding the prompt box). A brand with no DNA and no Direction
        // has no axes, `sel` stayed null, and `if (!sel) return null` below
        // took Explorar off the screen entirely — a blank panel where the
        // labelled empty state belongs.
        //
        // An empty design space is now a real, empty design space: the axes
        // read "0 de 0" and the prompt box works, because her sentence does not
        // depend on any of it. `initializedRef` is deliberately NOT stamped, so
        // the DNA that arrives a beat later still installs the real defaults.
        if (!sel) setSel(EMPTY_SPACE);
        return;
      }
      initializedRef.current = initKey;
      const directed = directionSelection(direction);
      const next = directionState.ready ? directed : {
        siluetas: options.siluetas.slice(0, 5),
        tejidos: options.tejidos.filter((f) => f.sourceability !== "blocked").slice(0, 8),
        colores: options.colores.slice(0, 6),
        detalles: [], fits: [],
      };
      setSel(next);
      setBrief(direction?.working_version?.mood_note || "");
      const nextMatrix = matrixSize(next);
      setCount(directionRunCount(direction, nextMatrix));
      setRefCodes([]);
      // A new Direction version means a different set of attachable facts, so
      // the composed prompt she last saw no longer describes what would be
      // sent. Her text is hers, but this run's images belonged to the old one.
      setFreeText("");
      setFreeRuns([]);
      setConceptsBoth([]);
      setImgs({});
      setRun({ phase: "idle", total: 0, done: 0, errors: 0, avgMs: null });
    }
  }, [
    metaKey, directionKey, direction, directionState.ready,
    options.siluetas, options.tejidos, options.colores,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (patch = {}) => {
    const meta = {
      sel, weights, adnFiel, count, brief, refCodes, freeText,
      directionVersionId: directionKey || null,
      concepts: conceptsRef.current.map(({ ...c }) => ({ ...c, url: c.idb ? null : c.url })),
      ...patch,
    };
    const r = save(metaKey, meta);
    if (!r.ok) flash(r.message);
  };

  const setConceptsBoth = (next) => { conceptsRef.current = next; setConcepts(next); };
  const patchConcept = (id, patch) =>
    setConceptsBoth(conceptsRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // ---- axis toggling ----
  const toggleOpt = (axis, opt, keyFn) => {
    setSel((s) => {
      const key = keyFn(opt);
      const has = s[axis].some((o) => keyFn(o) === key);
      return { ...s, [axis]: has ? s[axis].filter((o) => keyFn(o) !== key) : [...s[axis], opt] };
    });
  };
  const addChip = (axis, value, setter) => {
    const v = value.trim();
    if (!v) return;
    setSel((s) => (s[axis].includes(v) ? s : { ...s, [axis]: [...s[axis], v] }));
    setter("");
  };

  const matrix = sel ? matrixSize(sel) : 0;
  const n = Math.min(count, matrix || 0);
  const costCents = batchCostCents(n, perImageCents);
  // The active brand's own DNA drives both the prompt and the fidelity score —
  // nothing brand-specific is hardcoded (brandDna.js falls back to neutral).
  const dna = engine?.status === "live" ? engine.dna : null;
  const ownRefs = useMemo(() => ownRefsFromDna(dna), [dna]);
  const brandCatalog = useBrandCatalog();
  const liveTrends = engine?.status === "live" && engine.trends?.length ? engine.trends : undefined;
  const directionRefPolicy = useMemo(() => directionReferences(direction), [direction]);
  const directionPromptText = useMemo(() => directionPrompt(direction), [direction]);
  const evidenceLabel = gaps.length
    ? `ADN de marca × ${engine?.status === "live" ? "competencia" : ""}${liveTrends ? " × tendencias" : ""}`.replace(/ × $/, "")
    : liveTrends ? "ADN de marca × tendencias" : "solo ADN de marca";

  // ---- the prompt box ------------------------------------------------------
  // What would be attached RIGHT NOW, recomputed as she changes the design
  // space, so the panel she opens before running is the prompt that runs.
  //
  // ⚠ `directionPrompt` returns its closing sentence even for a null payload,
  // so it is read only when there IS a Direction. Attaching "usá las
  // referencias sólo como dirección" to a collection with no direction would be
  // the app describing an intent nobody expressed.
  const composed = useMemo(() => composeFreePrompt({
    text: freeText,
    silhouettes: sel?.siluetas || [],
    colours: sel?.colores || [],
    fabrics: (sel?.tejidos || [])
      .map((t) => fabricFacts(t, { direction, library: fabrics }))
      .filter(Boolean),
    directionText: direction ? directionPromptText : "",
  }), [freeText, sel, direction, directionPromptText, fabrics]);

  // The same rights-aware references the matrix run uses, resolved once.
  const eligibleReferences = useMemo(() => {
    const fromDirection = directionRefPolicy.eligible
      .map((r) => ({ id: r.id, url: abs(r.image_url) })).filter((r) => r.url).slice(0, 2);
    const fromCatalog = refCodes
      .map((code) => brandCatalog.products.find((p) => p.id === code)?.image_url)
      .filter(Boolean).slice(0, 1)
      .map((url) => ({ id: null, url }));
    return [...fromDirection, ...fromCatalog].slice(0, 3);
  }, [directionRefPolicy, refCodes, brandCatalog.products]);

  // One typed request per matrix combo. The BRIEF is the only designer text a
  // matrix run carries — with no brief there is no authored prompt, so the run
  // honestly stays on the legacy composed path rather than signing the
  // designer's name to words the app wrote. The combo's structured axes travel
  // as dicts; the DNA/fidelity/staging prose goes as labelled context.
  const comboIntentFor = (combo, refEntries) => buildIntent({
    authored: brief,
    context: [comboContext({ dna, adnFiel }), directionPromptText]
      .filter(Boolean).join(" ").trim(),
    garment: {
      categoria: combo.silueta.name,
      ...(combo.detalle ? { detalle: combo.detalle } : {}),
      ...(combo.fit ? { calce: combo.fit } : {}),
    },
    materials: {
      tela: `${combo.tejido.name}${combo.tejido.comp ? ` (${combo.tejido.comp})` : ""}`,
    },
    palette: {
      color: `${combo.color.name || colName(combo.color.hex)} (${combo.color.hex})`,
    },
    references: refEntries,
  });

  // Her way in, the matrix's way in, ONE generation path: `callGenerate` — the
  // same function the batch worker calls, which is engine-first and falls back
  // to this app's guarded /api/generate through `appFetch`.
  async function runFreePrompt() {
    if (freeBusy || !composed.text) return;
    setFreeBusy(true);
    const id = uid();
    const attachments = composed.attached;
    // `composed.prompt` is now the FALLBACK rendering and the preview — on the
    // engine path the SERVER composes from the typed intent below, with her
    // sentence as authored_prompt (verbatim, first) and everything this screen
    // attached carried as labelled context and structured dicts. "Reset to my
    // input" stays honest because `text` never left her hands.
    const promptSent = composed.prompt;
    const references = eligibleReferences.map((r) => r.url);
    const intent = buildIntent({
      authored: composed.text,
      context: composed.blocks
        .filter((b) => b.key === "direccion" || b.key === "limite")
        .map((b) => b.line).join(" "),
      garment: attachments.silhouettes.length
        ? { siluetas: attachments.silhouettes.join(", ") } : {},
      palette: attachments.colours.length
        ? { colores: attachments.colours
            .map((c) => (c.name && c.name !== c.hex ? `${c.name} ${c.hex}` : c.hex))
            .join(", ") } : {},
      materials: attachments.fabrics.length
        ? { telas: attachments.fabrics.map(fabricLine).join("; ") } : {},
      // Direction imagery steers styling only; a catalog garment is a garment.
      references: eligibleReferences.map((r) => ({
        url: r.url, role: r.id ? "styling" : "garment",
      })),
    });
    setFreeRuns((runs) => [{
      id, at: new Date().toISOString(), status: "generating",
      text: composed.text, prompt: promptSent, attachments, intent,
      references, url: null, provider: null, lineage: null, error: null,
      controlMapping: null, model: null, requestedModel: null,
    }, ...runs]);
    try {
      let generationMeta = {};
      const url = await callGenerate(promptSent, references,
        (m) => { generationMeta = m || {}; }, { intent, task: "ideation" });
      const stored = url.startsWith("data:") ? await compactImage(url, 800) : url;
      const lineage = directionLineage(
        direction, null, eligibleReferences.map((r) => r.id).filter(Boolean));
      setFreeRuns((runs) => runs.map((r) => (r.id === id ? {
        ...r, status: "done", url: stored,
        provider: generationMeta.provider || null, lineage,
        // The engine's own record of what each control became — the card
        // renders THIS, not a local claim about what was honoured.
        controlMapping: generationMeta.controlMapping || null,
        model: generationMeta.model || null,
        requestedModel: generationMeta.requestedModel || null,
      } : r)));
    } catch (e) {
      setFreeRuns((runs) => runs.map((r) => (
        r.id === id ? { ...r, status: "error", error: e.message } : r)));
      flash(e.message);
    }
    setFreeBusy(false);
  }

  // One conversion contract for BOTH curation paths:
  //   · designer selects concepts and sends them
  //   · first-capsule automation promotes the generated batch
  //
  // Keeping this in one function prevents the automatic path from silently
  // losing Direction lineage, provider provenance, fabric sourceability or the
  // exact prompt while the manual path preserves them.
  const collectionItemsFrom = (source, imageMap = imgs) =>
    source.map((c) => ({
      silhouette: c.combo.silueta.name,
      fabricId: c.combo.tejido.id || null,
      fabricName: c.combo.tejido.name,
      colorway: c.combo.color.hex,
      name: `${c.combo.silueta.name} ${c.combo.color.name || colName(c.combo.color.hex)}`,
      nota: [c.combo.detalle, c.combo.fit && `calce ${c.combo.fit}`, `explorado en matriz (${c.code})`].filter(Boolean).join(" · "),
      cover: c.idb ? imageMap[c.id] : c.url,
      score: c.score,
      prompt: c.prompt || null,
      references: c.references || [],
      provider: c.provider || null,
      directionLineage: c.lineage || null,
      fabricSnapshot: {
        id: c.combo.tejido.id || null,
        name: c.combo.tejido.name,
        comp: c.combo.tejido.comp || "",
        proveedor: c.combo.tejido.supplier || null,
        sourceability: c.combo.tejido.sourceability || null,
      },
    })).filter((it) => it.cover);

  // ---- batch run ----
  async function startRun({ autoPromote = false, limit = null } = {}) {
    if (!sel || run.phase === "running") return;
    if (!n) { flash("Elegí al menos una silueta, una tela y un color"); return; }
    const runCount = Math.max(1, Math.min(n, Number(limit) || n));
    await idbClear().catch(() => {});
    setImgs({});
    const combos = autoPromote
      ? firstCapsuleCombos(sel, runCount, weights, adnFiel)
      : sampleCombos(sel, runCount, weights, adnFiel);
    const fresh = combos.map((combo) => {
      const d = scoreCombo(combo, liveTrends, ownRefs);
      // DNA fidelity: how much this combo reads as the ACTIVE brand (null when
      // the brand has no DNA to score against — the badge then hides).
      const fid = dnaFidelity({ colorway: combo.color.hex, fabric: combo.tejido.name }, dna);
      return { id: uid(), code: combo.code, combo, status: "queued", url: null, idb: false,
               score: d.score, band: d.band, nearest: d.nearest || null,
               dnaScore: fid?.score ?? null, dnaBand: fid?.band ?? null, selected: false };
    });
    setConceptsBoth(markSimilar(fresh));
    setRun({ phase: "running", total: fresh.length, done: 0, errors: 0, avgMs: null });
    runningRef.current = true;
    persist({ concepts: fresh });
    const queue = [...conceptsRef.current];
    const times = [];
    let done = 0, errors = 0;
    const refUrls = refCodes
      .map((code) => brandCatalog.products.find((p) => p.id === code)?.image_url)
      .filter(Boolean).slice(0, 1);
    const directionRefs = directionRefPolicy.eligible
      .map((r) => ({ id: r.id, url: abs(r.image_url) }))
      .filter((r) => r.url)
      .slice(0, 2);
    const directionReferenceIds = directionRefs.map((r) => r.id);
    const generatedImageData = {};

    const worker = async () => {
      while (runningRef.current && queue.length) {
        const c = queue.shift();
        patchConcept(c.id, { status: "generating" });
        const t0 = Date.now();
        try {
          const basePrompt = brief.trim()
            ? `${comboPrompt(c.combo, { dna, adnFiel })} Brief de la exploración: ${brief.trim()}.`
            : comboPrompt(c.combo, { dna, adnFiel });
          const prompt = `${basePrompt} ${directionPromptText}`.trim();
          const swatch = c.combo.tejido.swatch;
          const refEntries = [
            ...directionRefs.map((r) => ({ url: r.url, role: "styling" })),
            ...refUrls.map((u) => ({ url: u, role: "garment" })),
            ...(swatch ? [{ url: swatch, role: "fabric" }] : []),
          ].slice(0, 3);
          const references = refEntries.map((r) => r.url);
          let generationMeta = {};
          const url = await callGenerate(prompt, references,
            (meta) => { generationMeta = meta || {}; },
            { intent: comboIntentFor(c.combo, refEntries), task: "ideation" });
          const lineage = directionLineage(direction, c.combo, directionReferenceIds);
          if (url.startsWith("data:")) {
            const small = await compactImage(url, 800);
            await idbPut(c.id, small);
            generatedImageData[c.id] = small;
            setImgs((m) => ({ ...m, [c.id]: small }));
            patchConcept(c.id, {
              status: "done", idb: true, url: null, prompt, references, lineage,
              provider: generationMeta.provider || null,
            });
          } else {
            patchConcept(c.id, {
              status: "done", idb: false, url, prompt, references, lineage,
              provider: generationMeta.provider || null,
            });
          }
        } catch (e) {
          errors++;
          patchConcept(c.id, { status: "error", error: e.message });
          if (e.message?.includes("Sin cupo")) {
            runningRef.current = false; // quota: stop the whole run honestly, keep partials
            flash("Sin cupo de generación — corrida pausada, lo generado queda");
          }
        }
        times.push(Date.now() - t0);
        done++;
        const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        setRun((r) => ({ ...r, done, errors, avgMs }));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRun((r) => ({ ...r, phase: queue.length ? "paused" : "done" }));
    runningRef.current = false;

    if (autoPromote && !attachRefused()) {
      const ids = new Set(fresh.map((c) => c.id));
      const generated = conceptsRef.current.filter(
        (c) => ids.has(c.id) && c.status === "done",
      );
      const promotedItems = collectionItemsFrom(
        generated,
        { ...imgs, ...generatedImageData },
      );
      if (promotedItems.length) {
        setConceptsBoth(conceptsRef.current.map(
          (c) => ids.has(c.id) && c.status === "done"
            ? { ...c, selected: false, promoted: true }
            : c,
        ));
        persist();
        await onSendToCollection(promotedItems);
        flash(`${promotedItems.length} conceptos generados desde Dirección y guardados en ${collName || "la colección"}`);
        return;
      }
    }

    persist();
    flash(queue.length ? "Corrida pausada" : `Corrida completa: ${done - errors} conceptos generados`);
  }

  function pauseRun() { runningRef.current = false; setRun((r) => ({ ...r, phase: "paused" })); }

  async function resumeRun() {
    if (run.phase === "running") return;
    const pending = conceptsRef.current.filter((c) => c.status === "queued" || c.status === "error");
    if (!pending.length) return;
    setConceptsBoth(conceptsRef.current.map((c) => (c.status === "error" ? { ...c, status: "queued" } : c)));
    setRun((r) => ({ ...r, phase: "running" }));
    runningRef.current = true;
    // Reuse startRun's worker over the remaining queue.
    const queue = conceptsRef.current.filter((c) => c.status === "queued");
    const times = [];
    let done = run.done, errors = run.errors;
    const refUrls = refCodes.map((code) => brandCatalog.products.find((p) => p.id === code)?.image_url)
      .filter(Boolean).slice(0, 1);
    const directionRefs = directionRefPolicy.eligible
      .map((r) => ({ id: r.id, url: abs(r.image_url) }))
      .filter((r) => r.url)
      .slice(0, 2);
    const directionReferenceIds = directionRefs.map((r) => r.id);
    const worker = async () => {
      while (runningRef.current && queue.length) {
        const c = queue.shift();
        patchConcept(c.id, { status: "generating" });
        const t0 = Date.now();
        try {
          const basePrompt = brief.trim()
            ? `${comboPrompt(c.combo, { dna, adnFiel })} Brief de la exploración: ${brief.trim()}.`
            : comboPrompt(c.combo, { dna, adnFiel });
          const prompt = `${basePrompt} ${directionPromptText}`.trim();
          const refEntries = [
            ...directionRefs.map((r) => ({ url: r.url, role: "styling" })),
            ...refUrls.map((u) => ({ url: u, role: "garment" })),
            ...(c.combo.tejido.swatch
              ? [{ url: c.combo.tejido.swatch, role: "fabric" }] : []),
          ].slice(0, 3);
          const references = refEntries.map((r) => r.url);
          let generationMeta = {};
          const url = await callGenerate(prompt, references,
            (meta) => { generationMeta = meta || {}; },
            { intent: comboIntentFor(c.combo, refEntries), task: "ideation" });
          const lineage = directionLineage(direction, c.combo, directionReferenceIds);
          if (url.startsWith("data:")) {
            const small = await compactImage(url, 800);
            await idbPut(c.id, small);
            setImgs((m) => ({ ...m, [c.id]: small }));
            patchConcept(c.id, {
              status: "done", idb: true, url: null, prompt, references, lineage,
              provider: generationMeta.provider || null,
            });
          } else {
            patchConcept(c.id, {
              status: "done", idb: false, url, prompt, references, lineage,
              provider: generationMeta.provider || null,
            });
          }
        } catch (e) {
          errors++;
          patchConcept(c.id, { status: "error", error: e.message });
          if (e.message?.includes("Sin cupo")) { runningRef.current = false; flash("Sin cupo — corrida pausada de nuevo"); }
        }
        times.push(Date.now() - t0);
        done++;
        const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        setRun((r) => ({ ...r, done, errors, avgMs }));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRun((r) => ({ ...r, phase: conceptsRef.current.some((c) => c.status === "queued") ? "paused" : "done" }));
    runningRef.current = false;
    persist();
  }

  // ---- curation ----
  const tray = concepts.filter((c) => c.selected && c.status === "done");
  const filtered = useMemo(() => {
    let list = concepts.filter((c) => c.status !== "discarded");
    if (filterSil) list = list.filter((c) => c.combo.silueta.name === filterSil);
    if (hideSimilar) list = list.filter((c) => !c.similarTo);
    if (hideDerivative) list = list.filter((c) => c.band !== "crowded");
    if (sortBy === "novedad") list = [...list].sort((a, b) => b.score - a.score);
    if (sortBy === "adn") list = [...list].sort((a, b) => (b.dnaScore ?? -1) - (a.dnaScore ?? -1));
    return list;
  }, [concepts, filterSil, hideSimilar, hideDerivative, sortBy]);

  // The one place the learned order is applied. `orderByTaste` with no scores
  // returns the SAME array it was handed, so an uncalibrated run is provably
  // the run the screen would have shown before this feature existed.
  const tasteOrder = useMemo(
    () => orderByTaste(filtered, sortBy === "gusto" ? tasteScores : null),
    [filtered, sortBy, tasteScores]);
  const visible = tasteOrder.ordered;
  // Grouping by fabric family would cut a single learned ranking into several
  // lists, and "3rd of the knits" is not what the taste order means. So the
  // taste order takes the grid ungrouped — visibly, with the toggle disabled
  // and saying why, rather than silently ignoring it.
  const tasteRanked = sortBy === "gusto" && tasteOrder.applied;

  const groups = useMemo(() => {
    if (!groupOn || tasteRanked) return [{ label: null, items: visible }];
    const map = new Map();
    visible.forEach((c) => {
      const l = groupLabel(c.combo, FAB_FAMILY);
      if (!map.has(l)) map.set(l, []);
      map.get(l).push(c);
    });
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  }, [visible, groupOn, tasteRanked]);

  const balance = sel ? trayBalance(tray, sel) : null;

  // Curation, the other half of "taste steers the studio": put the concepts
  // whose traits the team has actually preferred into the tray. Deliberately
  // ADDITIVE and deliberately six — it joins a designer's own picks instead of
  // replacing them, and the flash says these are candidates to look at, not a
  // verdict. Never reachable while uncalibrated: `topByTaste` returns nothing
  // without scores, and the button is not rendered.
  function preselectByTaste() {
    const done = conceptsRef.current.filter((c) => c.status === "done");
    const top = topByTaste(done, tasteScores, 6);
    if (!top.length) { flash("No hay conceptos con rasgos medidos por tu equipo"); return; }
    const ids = new Set(top.map((c) => c.id));
    setConceptsBoth(conceptsRef.current.map((c) => (ids.has(c.id) ? { ...c, selected: true } : c)));
    persist();
    flash(`${top.length} conceptos con los rasgos que tu equipo eligió más — revisalos antes de enviar`);
  }

  // ⚠ ONE REFUSAL FOR EVERY PATH INTO THE COLLECTION (owner review 2026-08-11,
  // P0). The 08-11 pass gated the AUTOMATIC "Crear primera cápsula" button on
  // `can_attach` and left the manual tray send ungated — so the sandbox still
  // leaked: selected concepts were written onto the collection board before the
  // server ever got the chance to refuse them, and the board is what the team
  // then looks at. Gating one of two doors is not gating.
  //
  // ⚠ THIS IS THE EARLY REFUSAL, NOT THE ENFORCEMENT. `POST /concepts` calls
  // `require_approved_brief` and 409s regardless of what this file does; the
  // distinction matters because it is why this may stay quiet when the engine
  // is unreachable (`readiness === null`) without opening a hole — in that
  // state the write cannot succeed either. That is the opposite of the
  // Opportunities gate, where the browser was the ONLY thing deciding and
  // failing open would have rendered unvetted advice.
  function attachRefused() {
    if (readiness && !readiness.can_attach) {
      flash(readiness.attach_blockers?.[0]
        || `«${readiness.collection}» no puede recibir conceptos todavía`);
      return true;
    }
    return false;
  }

  // The prompt box reaches the collection through the SAME refusal and the same
  // handler as the tray — a second door into the board that the engine's
  // `can_attach` did not guard is exactly the hole the 08-11 review found.
  //
  // ⚠ NOTHING IS INFERRED ABOUT THE GARMENT. A free prompt states no silhouette,
  // no fabric id and no colourway, so none are sent: reading the first selected
  // chip and calling it this garment's fabric would be a spec nobody wrote. The
  // item arrives named by her own sentence, with the composed prompt and its
  // attachment list as its lineage.
  function sendFreeToCollection(entry) {
    if (entry?.status !== "done" || !entry.url || attachRefused()) return;
    onSendToCollection([{
      name: entry.text.slice(0, 48),
      silhouette: "", fabricId: null, fabricName: "", colorway: null,
      nota: `pedido en texto libre: “${entry.text}”`,
      cover: entry.url,
      prompt: entry.prompt,
      references: entry.references || [],
      provider: entry.provider || null,
      directionLineage: entry.lineage || null,
      // What the app added to her words, so the concept can always answer
      // "what was I asked for" with both halves.
      promptAttachments: entry.attachments || null,
      freeText: entry.text,
    }]);
    setFreeRuns((runs) => runs.map((r) => (r.id === entry.id ? { ...r, promoted: true } : r)));
  }

  function sendToCollection() {
    if (!tray.length || attachRefused()) return;
    const items = collectionItemsFrom(tray);
    onSendToCollection(items);
    setConceptsBoth(conceptsRef.current.map((c) => (c.selected ? { ...c, selected: false, promoted: true } : c)));
    persist();
  }

  // The headline has to describe THIS grid, not the profile. A calibrated brand
  // looking at a matrix-ordered list must not read "ordenado por el gusto
  // aprendido" — that is the same lie as showing an uncalibrated ranking, just
  // in the other direction.
  const orderHeadline = !tasteState.applied ? tasteState.headline
    : tasteRanked ? "Ordenado por el gusto aprendido de tu equipo"
    : sortBy === "gusto"
      ? "Ningún concepto de esta tanda comparte rasgos que tu equipo haya comparado"
      : "Tu gusto está calibrado, pero esta lista está ordenada por otra cosa";
  const likedTerms = topTerms(taste);
  const tasteRankOf = (id) => {
    if (!tasteRanked) return null;
    const hit = tasteScores?.get(String(id));
    return hit && typeof hit.score === "number" ? hit : null;
  };

  if (!sel) return null;
  const srcTag = (s) => s && s !== "catálogo" ? <i className={`xsrc ${s === "tendencia" ? "tr" : s === "hueco" ? "gap" : ""}`}>{s}</i> : null;
  const eta = run.avgMs && run.phase === "running"
    ? Math.round(((run.total - run.done) * run.avgMs) / CONCURRENCY / 60000 * 10) / 10 : null;
  // ONE solid button per rail. The capsule run is the recommended path when
  // the engine says the collection may receive it; when it is not offered,
  // the sandbox run is the primary and takes the fill. Same conditions as
  // before — read once instead of twice, so the two cannot disagree.
  const capsuleOffered = collectionItemCount === 0 && directionState.ready && !!readiness?.can_attach;

  return (
    <div className="xp">
      <style dangerouslySetInnerHTML={{ __html: `
/* ============ Explorar — xp- / xc ==================================
   The matrix bench: the design space on the left, the garments in the
   middle, the director on the right. Same rules as the board it feeds:
     · blue (--cobalt) only on pressables — plus slider fills and thumbs,
       which ARE the control;
     · a band, a source tag or a DNA score is a measurement, not an
       affordance, so it stays in ink and the semantic accents;
     · provenance and every refusal keep their 3px rule and their words;
     · ⚠ 11px IS THE FLOOR. Nothing below it anywhere in this file. */

.xp{min-width:0}

/* ---- brief strip ---- */
.xp-brief{
  display:grid;grid-template-columns:minmax(280px,1.4fr) auto;gap:var(--s4);
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:var(--s3) var(--s4);margin-bottom:var(--s3);align-items:center;
  box-shadow:var(--shadow);
}
.xp-brief input{
  width:100%;border:none;background:none;font-size:14px;font-weight:500;
  color:var(--ink);border-bottom:1px dashed var(--hair-2);padding:4px 0;
}
.xp-brief input:focus{outline:none;border-bottom-color:var(--cobalt)}
.xp-brief .k{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);margin-bottom:5px;
}
.xp-brief .adn{
  display:flex;flex-direction:column;justify-content:center;gap:3px;
  font-size:11px;color:var(--ink-2);text-align:right;max-width:34ch;
}
.xp-brief .adn b{color:var(--ink);font-family:var(--d);font-weight:600;font-variant-numeric:tabular-nums}
/* The sentence that says what the slider means when there is no DNA to be
   faithful TO. It used to be 8.5px — below the floor, and it is the part
   that keeps the control honest. */
.xp-hint{display:block;font-size:11px;color:var(--ink-3);line-height:1.45;margin-top:4px}

/* ---- layout ---- */
.xp-lay{
  display:grid;grid-template-columns:262px minmax(0,1fr) 276px;
  gap:var(--s4);align-items:start;
}
@media(max-width:1150px){.xp-lay{grid-template-columns:1fr}}
.xp-pane{
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:var(--s4);margin-bottom:var(--s3);box-shadow:var(--shadow);
}
.xp-k{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s2);
  display:flex;justify-content:space-between;align-items:baseline;gap:var(--s2);
}
.xp-k span{font-size:11px;font-weight:500;color:var(--ink-3);letter-spacing:.06em}

/* ---- the design space: axes and chips ---- */
.xp-axis{border-bottom:1px solid var(--hair);padding:var(--s2) 0}
.xp-axis:last-child{border-bottom:none}
.xp-axis .hd2{
  display:flex;justify-content:space-between;align-items:center;gap:var(--s2);
  font-size:12.5px;font-weight:650;color:var(--ink);
}
.xp-axis .hd2 em{
  font-style:normal;font-family:var(--d);font-size:11px;font-weight:500;
  color:var(--ink-3);font-variant-numeric:tabular-nums;
}
.xp-opts{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.xp-opt{
  display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);
  border-radius:999px;background:var(--card);font-size:12px;font-weight:500;
  padding:5px 10px;cursor:pointer;color:var(--ink-2);
}
.xp-opt:hover{border-color:var(--ink-3);color:var(--ink)}
/* ⚠ SELECTED IS INK, NOT BLUE. Every one of these chips is pressable, so blue
   passed the "blue only on pressables" rule — and the rule was the wrong test.
   Thirty selected chips down the left rail turned the calmest column on the
   screen into the loudest, and drowned the ONE blue thing that matters here:
   the run button that spends money. Selection is a state, not an invitation. */
.xp-opt.on{
  border-color:var(--ink);color:var(--ink);
  background:var(--paper-2);font-weight:600;
}
.xp-opt .sw{width:11px;height:11px;flex:none;border-radius:99px;border:1px solid var(--hair-2);display:inline-block}
/* WHERE AN OPTION CAME FROM — catalogue, DNA, market, gap. Provenance. */
.xsrc{
  font-style:normal;font-family:var(--d);font-size:11px;font-weight:500;
  text-transform:uppercase;letter-spacing:.04em;background:var(--paper-2);
  border-radius:99px;padding:1px 6px;color:var(--ink-3);
}
.xsrc.tr{background:var(--ochre-wash);color:var(--warning)}
.xsrc.gap{background:color-mix(in srgb,var(--positive) 12%,#fff);color:var(--positive)}

/* ---- evidence-grounded suggestions ---- */
.xp-sug{display:flex;gap:var(--s2);align-items:stretch;margin-bottom:var(--s3);overflow-x:auto;padding:2px 0}
.xp-sug-k{
  flex:none;display:flex;flex-direction:column;justify-content:center;max-width:132px;
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);
}
.xp-sug-k i{
  font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;
  font-size:11px;margin-top:5px;line-height:1.4;color:var(--ink-3);
}
.xp-sug-c{
  flex:none;width:232px;text-align:left;background:var(--card);
  border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px;
  cursor:pointer;transition:border-color .14s;
}
.xp-sug-c:hover{border-color:var(--cobalt)}
.xp-sug-c.static{cursor:default}
.xp-sug-c.static:hover{border-color:var(--line)}
.xp-sug-c b{
  display:flex;align-items:center;gap:6px;font-family:var(--d);font-size:11px;
  font-weight:500;text-transform:uppercase;letter-spacing:.06em;
  color:var(--editorial);margin-bottom:5px;
}
.xp-sug-c b .sw{width:11px;height:11px;border-radius:99px;border:1px solid var(--hair-2);display:inline-block}
.xp-sug-c span{
  display:block;font-size:12px;font-weight:600;color:var(--ink);line-height:1.35;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.xp-sug-c em{display:block;font-style:normal;font-size:11px;color:var(--ink-3);margin-top:4px;line-height:1.4}

/* ---- free-text chips ---- */
.xp-chipin{display:flex;gap:5px;margin-top:8px}
.xp-chipin input{
  flex:1;min-width:0;border:1px solid var(--line);border-radius:var(--r-xs);
  background:var(--surface);padding:6px 9px;font-size:11px;color:var(--ink);
}
.xp-chipin input:focus{outline:none;border-color:var(--cobalt)}
.xp-chipin button{
  border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  font-size:12px;font-weight:600;padding:0 11px;cursor:pointer;color:var(--ink-2);
}
.xp-chipin button:hover{border-color:var(--ink-3);color:var(--ink)}
.xp-matrix{
  display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s3);
  background:var(--paper-2);border-radius:var(--r-sm);padding:11px 13px;margin-top:var(--s3);
}
.xp-matrix span{
  display:block;font-family:var(--d);font-size:11px;font-weight:500;
  letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);
}
.xp-matrix b{
  display:block;font-family:var(--disp);font-size:16px;font-weight:600;
  color:var(--ink);line-height:1.15;margin-top:4px;font-variant-numeric:tabular-nums;
  white-space:nowrap;
}

/* ---- what ordered this grid / which Direction applies ---- */
.xp-taste{
  display:flex;flex-wrap:wrap;gap:var(--s3) var(--s4);align-items:flex-start;background:var(--card);
  border:1px solid var(--line);border-left-width:3px;border-radius:var(--r-sm);
  padding:12px 14px;margin-bottom:var(--s3);box-shadow:var(--shadow);
}
.xp-taste.off{border-left-color:var(--warning)}
.xp-taste.on{border-left-color:var(--positive)}
/* ⚠ .tt IS ALSO A GLOBAL (a stacked panel with its own rule, gap and
   top margin). Everything it leaks in is reset here — inherited geometry
   was pushing this banner's first line 34px below its own border. */
.xp-taste .tt{
  flex:1 1 220px;min-width:0;display:block;gap:0;
  margin-top:0;padding-top:0;border-top:none;
}
.xp-taste .tt b{display:block;font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.35}
.xp-taste .tt span{display:block;font-size:11px;color:var(--ink-2);line-height:1.5;margin-top:4px}
.xp-taste .tt .cov{color:var(--ink-3)}
.xp-taste .tt .terms i{font-style:normal;font-weight:700;color:var(--ink)}
.xp-taste .tacts{display:flex;gap:6px;flex:none;flex-wrap:wrap;justify-content:flex-end}
.xp-taste button{
  border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  font-size:11px;font-weight:600;padding:7px 11px;cursor:pointer;color:var(--ink);white-space:nowrap;
}
.xp-taste button:hover{border-color:var(--ink-3)}
.xp-taste button.go{border-color:var(--cobalt);background:var(--cobalt);color:#fff}
.xp-taste button.go:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}

/* ---- filters ---- */
.xp-filters{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:var(--s3)}
.xp-filters select{
  border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  font-size:11px;font-weight:600;padding:7px 9px;color:var(--ink-2);cursor:pointer;
}
.xp-filters select:hover{border-color:var(--ink-3)}
.xp-tgl{
  border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  font-size:11px;font-weight:600;padding:7px 11px;cursor:pointer;color:var(--ink-2);
}
.xp-tgl:hover{border-color:var(--ink-3);color:var(--ink)}
.xp-tgl.on{                       /* same reasoning as .xp-opt.on above */
  border-color:var(--ink);color:var(--ink);
  background:var(--paper-2);font-weight:600;
}
.xp-tgl:disabled{opacity:.45;cursor:default}
.xp-tgl:disabled:hover{border-color:var(--line);color:var(--ink-2)}

/* ---- the concepts ---- */
.xp-ghead{display:flex;align-items:center;gap:var(--s2);margin:2px 0 var(--s2)}
.xp-ghead h4{
  font-family:var(--d);font-size:11px;font-weight:500;text-transform:uppercase;
  letter-spacing:.06em;color:var(--ink);margin:0;
}
.xp-ghead b{
  font-family:var(--d);font-size:11px;font-weight:500;background:var(--surface);
  border:1px solid var(--line);border-radius:99px;padding:2px 8px;color:var(--ink-2);
  font-variant-numeric:tabular-nums;
}
.xp-ggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:var(--s3);margin-bottom:var(--s4)}
.xc{
  position:relative;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-sm);overflow:hidden;cursor:pointer;
  transition:transform .14s,box-shadow .14s,border-color .14s;
}
.xc:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
/* Selection is a RING, never a wash: nothing tints the garment itself. */
.xc.on{border-color:var(--cobalt);box-shadow:0 0 0 1px var(--cobalt)}
.xc.sim{opacity:.6}
.xc .fig{aspect-ratio:4/5;background:var(--paper-2);position:relative}
.xc .fig img{width:100%;height:100%;object-fit:cover;display:block}
.xc .fig .st{
  position:absolute;inset:0;display:grid;place-items:center;align-content:center;
  font-size:11px;color:var(--ink-3);text-align:center;padding:var(--s2);line-height:1.5;
}
.xc .fig .st .xerr{display:block;margin-top:5px;font-size:11px;color:var(--danger);line-height:1.4}
.xc .fig .spin{
  position:absolute;inset:0;background-size:200% 100%;animation:xpsh 1.2s infinite;
  background-image:linear-gradient(100deg,var(--paper-2) 40%,var(--surface) 50%,var(--paper-2) 60%);
}
@keyframes xpsh{to{background-position:-200% 0}}
.xc .cb{
  position:absolute;top:8px;left:8px;width:18px;height:18px;border-radius:var(--r-xs);
  border:1px solid color-mix(in srgb,var(--surface) 85%,transparent);
  background:color-mix(in srgb,var(--surface) 45%,transparent);
  display:grid;place-items:center;font-size:11px;color:#fff;z-index:2;
}
.xc.on .cb{background:var(--cobalt);border-color:var(--cobalt)}
.xc .code{
  position:absolute;top:8px;right:8px;z-index:2;font-family:var(--d);font-size:11px;
  font-weight:500;background:color-mix(in srgb,var(--surface) 92%,transparent);
  border-radius:99px;padding:2px 7px;color:var(--ink-2);
}
.xc .rank{
  position:absolute;top:8px;left:32px;z-index:2;font-family:var(--d);font-size:11px;
  font-weight:600;background:var(--ink);color:#fff;border-radius:99px;padding:2px 8px;
  font-variant-numeric:tabular-nums;
}
.xc .rank.none{background:color-mix(in srgb,var(--ink) 55%,transparent);font-weight:500}
.xc .bd{padding:8px 10px 10px}
.xc .bd .t{
  font-size:12px;font-weight:650;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.xc .bd .m{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-3);margin-top:5px}
.xc .bd .m .sw{width:9px;height:9px;flex:none;border-radius:99px;border:1px solid var(--hair-2)}
.xc .bd .nv{
  font-family:var(--d);font-size:11px;font-weight:500;border-radius:99px;
  padding:1px 7px;font-variant-numeric:tabular-nums;
}
.xc .bd .nv.open{background:color-mix(in srgb,var(--positive) 12%,#fff);color:var(--positive)}
.xc .bd .nv.adjacent{background:var(--ochre-wash);color:var(--warning)}
.xc .bd .nv.crowded{background:var(--clay-wash);color:var(--danger)}
.xc .bd .dna{
  font-family:var(--d);font-size:11px;font-weight:500;border-radius:99px;padding:1px 7px;
  margin-left:auto;border:1px solid transparent;font-variant-numeric:tabular-nums;
}
.xc .bd .dna.core{background:var(--surface);border-color:var(--hair-2);color:var(--ink)}
.xc .bd .dna.adjacent{background:var(--paper-2);color:var(--ink-2)}
.xc .bd .dna.off{background:var(--paper-2);color:var(--ink-3)}
/* §8 anti-copying. A collision is a blocker, so it reads like one. */
.xc .bd .collide{
  margin-top:7px;font-size:11px;font-weight:500;color:var(--danger);
  background:var(--clay-wash);border-left:3px solid var(--danger);
  border-radius:0 var(--r-xs) var(--r-xs) 0;padding:4px 7px;line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.xc .bd .collide b{font-weight:700}
.xc .dis{
  position:absolute;bottom:8px;right:8px;width:22px;height:22px;z-index:2;
  border:none;border-radius:var(--r-xs);color:#fff;font-size:11px;cursor:pointer;
  background:color-mix(in srgb,var(--ink) 62%,transparent);display:none;
}
.xc:hover .dis{display:block}
.xp-empty{text-align:center;padding:var(--s7) var(--s5);color:var(--ink-3);font-size:12.5px;line-height:1.6}
.xp-empty b{
  display:block;font-family:var(--serif);font-size:20px;font-weight:500;
  color:var(--ink);margin-bottom:9px;letter-spacing:-.01em;
}

/* ---- director de diseño ---- */
.xp-side{position:sticky;top:152px}
.xp-refs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px}
.xp-ref{
  width:100%;border:1px solid var(--line);border-radius:var(--r-xs);overflow:hidden;
  cursor:pointer;padding:0;background:var(--card);
}
.xp-ref.on{border-color:var(--cobalt);box-shadow:0 0 0 1px var(--cobalt)}
.xp-ref img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}
.xp-slider{margin-bottom:var(--s3)}
.xp-slider .t{display:flex;justify-content:space-between;gap:var(--s2);font-size:11px;color:var(--ink-2);margin-bottom:5px}
.xp-slider .t b{font-family:var(--d);font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.xp-slider input{width:100%;accent-color:var(--cobalt)}
.xp-num{
  width:100%;border:1px solid var(--line);border-radius:var(--r-xs);background:var(--surface);
  padding:9px 11px;font-family:var(--d);font-size:13px;font-weight:600;color:var(--ink);
  font-variant-numeric:tabular-nums;
}
.xp-num:focus{outline:none;border-color:var(--cobalt)}
/* The estimate, as fact rows: mono label, tabular value, no invented ETA. */
.xp-est{
  display:grid;gap:7px;margin:var(--s3) 0;padding:var(--s3) 0;
  border-top:1px solid var(--hair);border-bottom:1px solid var(--hair);
}
.xp-fact{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s3)}
.xp-lbl{
  flex:none;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);
}
.xp-fact b{
  font-size:13px;font-weight:600;color:var(--ink);text-align:right;
  font-variant-numeric:tabular-nums;
}
.xp-go{
  width:100%;border:1px solid var(--cobalt);border-radius:var(--r-sm);background:var(--cobalt);
  color:#fff;font-size:12.5px;font-weight:600;padding:12px;cursor:pointer;
}
.xp-go:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}
.xp-go.quiet{background:var(--card);border-color:var(--line);color:var(--ink)}
.xp-go.quiet:hover{background:var(--card);border-color:var(--ink-3)}
.xp-go:disabled{opacity:.45;cursor:default}
/* Every run button in the rail, whether or not a refusal panel sits
   between them — an adjacent-sibling rule missed the ones after a gate. */
.xp-side .xp-go{margin-top:7px}
.xp-note{font-size:11px;color:var(--ink-3);line-height:1.5;margin-top:8px}
/* ⚠ A REFUSAL KEEPS ITS RULE AND ITS WORDS. "You can generate, but this
   cannot be kept here" is the most consequential sentence on the screen. */
.xp-gate{
  margin-top:var(--s3);padding:11px 13px;border-left:3px solid var(--warning);
  background:var(--ochre-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;
  font-size:11px;color:var(--ink-2);line-height:1.55;
}
.xp-gate.muted{background:var(--paper-2);border-left-color:var(--hair-2)}
.xp-gate b{color:var(--ink);font-weight:700}
.xp-gate ul{margin:7px 0 0;padding-left:16px}
.xp-gate li{margin-bottom:5px}
.xp-gate-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:var(--s2)}
.xp-gate-actions button{
  border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  padding:6px 10px;font-size:11px;font-weight:600;color:var(--ink);cursor:pointer;
}
.xp-gate-actions button:hover{border-color:var(--ink-3)}

/* ---- run progress: measured, never estimated ---- */
.xp-prog{
  position:fixed;right:22px;bottom:88px;z-index:55;min-width:238px;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:13px 15px;box-shadow:var(--shadow-lg);
}
.xp-prog .t{
  display:flex;justify-content:space-between;align-items:center;gap:var(--s3);
  font-size:12px;font-weight:600;color:var(--ink);margin-bottom:8px;
  font-variant-numeric:tabular-nums;
}
/* width:100% against the global .bar, which is 84px wide. */
.xp-prog .bar{height:5px;width:100%;border-radius:99px;background:var(--paper-2);overflow:hidden;margin-bottom:7px}
.xp-prog .bar i{display:block;height:100%;background:var(--cobalt);border-radius:99px;transition:width .3s}
.xp-prog .m{
  display:flex;justify-content:space-between;gap:var(--s3);
  font-family:var(--d);font-size:11px;color:var(--ink-3);
}
.xp-prog button{
  border:1px solid var(--line);border-radius:var(--r-xs);background:var(--card);
  font-size:11px;font-weight:600;padding:5px 10px;cursor:pointer;color:var(--ink-2);
}
.xp-prog button:hover{border-color:var(--ink-3);color:var(--ink)}

/* ---- the tray ---- */
.xp-tray{
  position:sticky;bottom:0;z-index:40;display:flex;align-items:center;gap:var(--s4);
  margin:0 calc(-1 * var(--s5));padding:var(--s3) var(--s5);
  background:color-mix(in srgb,var(--paper) 95%,transparent);
  backdrop-filter:blur(14px);border-top:1px solid var(--line);
}
.xp-tray .cnt{
  font-family:var(--d);font-size:11px;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums;
}
.xp-tray .thumbs{display:flex;gap:5px;flex:1;overflow-x:auto;padding:2px 0}
.xp-tray .thumbs img{
  width:38px;height:48px;object-fit:cover;border-radius:var(--r-xs);
  border:1px solid var(--line);background:var(--paper-2);
}
.xp-bal{display:flex;gap:var(--s3)}
.xp-bal .b1{
  font-family:var(--d);font-size:11px;color:var(--ink-3);text-align:center;
  text-transform:uppercase;letter-spacing:.05em;
}
.xp-bal .b1 b{
  display:block;font-size:11px;font-weight:600;color:var(--ink);
  text-transform:none;letter-spacing:0;margin-top:3px;
}
.xp-send{
  border:1px solid var(--cobalt);border-radius:var(--r-sm);background:var(--cobalt);
  color:#fff;font-size:12px;font-weight:600;padding:10px 16px;cursor:pointer;white-space:nowrap;
}
.xp-send:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}
.xp-send:disabled{opacity:.45;cursor:default}
.xp-send:disabled:hover{background:var(--cobalt)}

/* ---- xf- : the prompt box, its attachment and its results ----------
   The one surface here where the designer writes a sentence instead of
   picking chips. Same rules as everything above it:
     · blue only on the two pressables (generar, enviar);
     · what the app ADDED to her words is shown, never hidden — the
       disclosure is labelled with its own contents and the composed
       prompt is readable in full;
     · a missing part gets a line, never a substitute;
     · the results carry the no-verdict sentence with a --hair rule,
       because "this is an image, not an assessment" is the boundary
       this whole product is built on;
     · ⚠ 11px IS THE FLOOR here too. */
.xf{
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:var(--s4);margin-bottom:var(--s3);box-shadow:var(--shadow);
}
.xf-k{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s2);
}
.xf-ta{
  width:100%;min-height:76px;resize:vertical;box-sizing:border-box;
  border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);
  padding:11px 13px;font:inherit;font-size:13px;line-height:1.55;color:var(--ink);
}
.xf-ta:focus{outline:none;border-color:var(--cobalt)}
.xf-ta::placeholder{color:var(--ink-3)}
.xf-row{
  display:flex;align-items:center;justify-content:space-between;
  gap:var(--s3);flex-wrap:wrap;margin-top:var(--s2);
}
.xf-go{
  flex:none;border:1px solid var(--cobalt);border-radius:var(--r-sm);
  background:var(--cobalt);color:#fff;font-size:12.5px;font-weight:600;
  padding:10px 16px;cursor:pointer;
}
.xf-go:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}
.xf-go:disabled{opacity:.45;cursor:default}
.xf-go:disabled:hover{background:var(--cobalt)}
/* The absent part, said out loud. Quiet on purpose — it is a fact about
   this collection, not a failure of hers. */
.xf-quiet{font-size:11px;color:var(--ink-3);line-height:1.5;flex:1 1 220px;min-width:0}
.xf-see{margin-top:var(--s3);border-top:1px solid var(--hair);padding-top:var(--s2)}
.xf-sum{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;
  color:var(--ink-2);cursor:pointer;list-style:revert;
}
.xf-sum:hover{color:var(--ink)}
.xf-block{margin-top:9px}
.xf-bk{
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3);
}
.xf-bt{font-size:11px;color:var(--ink-2);line-height:1.55;margin-top:3px}
.xf-full{
  margin-top:11px;background:var(--paper-2);border-radius:var(--r-xs);
  padding:10px 12px;font-size:11px;line-height:1.6;color:var(--ink-2);
  white-space:pre-wrap;word-break:break-word;
}
.xf-full b{display:block;color:var(--ink);font-weight:700;margin-bottom:4px}
.xf-res{display:grid;grid-template-columns:repeat(auto-fill,minmax(188px,1fr));gap:var(--s3);margin-top:var(--s3)}
.xf-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}
.xf-fig{aspect-ratio:4/5;background:var(--paper-2);position:relative}
.xf-fig img{width:100%;height:100%;object-fit:cover;display:block}
.xf-fig .st{
  position:absolute;inset:0;display:grid;place-items:center;align-content:center;
  font-size:11px;color:var(--ink-3);text-align:center;padding:var(--s2);line-height:1.5;
}
.xf-fig .spin{
  position:absolute;inset:0;background-size:200% 100%;animation:xpsh 1.2s infinite;
  background-image:linear-gradient(100deg,var(--paper-2) 40%,var(--surface) 50%,var(--paper-2) 60%);
}
.xf-bd{padding:9px 11px 11px}
.xf-bd .t{font-size:12px;font-weight:650;color:var(--ink);line-height:1.35}
.xf-send{
  width:100%;margin-top:8px;border:1px solid var(--cobalt);border-radius:var(--r-xs);
  background:var(--cobalt);color:#fff;font-size:11px;font-weight:600;
  padding:7px 9px;cursor:pointer;
}
.xf-send:hover{background:color-mix(in srgb,var(--cobalt) 88%,#000)}
.xf-send:disabled{opacity:.45;cursor:default}
.xf-send:disabled:hover{background:var(--cobalt)}
.xf-err{font-size:11px;color:var(--danger);line-height:1.45;margin-top:5px}
/* ⚠ THE BOUNDARY, WHERE THE RESULTS ARE. A free prompt may produce an
   IMAGE; it may never produce a VERDICT. Nothing in this block renders a
   score, a fit or a forecast, and any prose the provider returns is
   discarded rather than dressed up as an assessment — those answers come
   from the gates, on evidence. */
.xf-note{
  font-size:11px;color:var(--ink-2);line-height:1.55;margin-top:var(--s3);
  border-left:3px solid var(--hair-2);padding:7px 11px;background:var(--paper-2);
  border-radius:0 var(--r-xs) var(--r-xs) 0;
}
.xf-note b{color:var(--ink);font-weight:700}
      ` }} />

      {/* brief strip */}
      <div className="xp-brief">
        <div>
          <div className="k">Brief de la exploración</div>
          <input value={brief} onChange={(e) => setBrief(e.target.value)} onBlur={() => persist()}
            placeholder='p.ej. "Ampliá la familia sastrera con proporciones nuevas, manteniendo cintura y ADN minimalista"' />
        </div>
        <div className="adn">
          {dna ? "ADN de marca" : "Fidelidad creativa"} <b>{dna ? "fiel " : ""}{Math.round(adnFiel * 100)}%</b> · {Math.round((1 - adnFiel) * 100)}% experimental
          {!dna && <span className="xp-hint">sin ADN live: controla cuánto se aparta la generación de tus referencias</span>}
        </div>
      </div>

      {directionKey && (
        <div className={`xp-taste ${directionState.ready ? "on" : "off"}`}>
          <div className="tt">
            <b>
              Dirección v{directionState.version} aplicada a esta exploración
            </b>
            <span>
              {directionState.silhouettes} silueta(s) · {directionState.fabrics} tela(s)
              {" "}· {directionState.colours} color(es) · {directionState.references}
              {" "}referencia(s) con derechos para generar · {directionState.rules} regla(s).
            </span>
            <span className="cov">
              {directionState.planSlots
                ? `El plan tiene ${directionState.planSlots} fila(s): esa es la cantidad inicial de conceptos, no una predicción de demanda.`
                : "Sin filas de rango: proponemos una tanda controlada de exploración, no una cantidad de compra."}
              {directionState.blockedFabrics
                ? ` ${directionState.blockedFabrics} tela(s) bloqueada(s) siguen visibles pero no se seleccionan solas.`
                : ""}
              {directionState.referencesExcluded
                ? ` ${directionState.referencesExcluded} referencia(s) pública(s) o con derechos sin confirmar quedan fuera del prompt visual.`
                : ""}
            </span>
          </div>
          {!directionState.ready && onNavigate && (
            <button onClick={() => onNavigate("direction")}>Completar Dirección</button>
          )}
        </div>
      )}

      {/* ===== la caja de texto: decilo con tus palabras =====
          The SECOND way in, beside the matrix — not a replacement for it. The
          matrix is still the useful tool for a batch; this is for the designer
          who already knows what she wants and wants to say it. Both end in
          `callGenerate`. */}
      <div className="xf">
        <div className="xf-k">Pedilo con tus palabras</div>
        <textarea className="xf-ta" value={freeText}
          onChange={(e) => setFreeText(e.target.value)} onBlur={() => persist()}
          placeholder="Escribilo como se lo dirías a tu equipo: “quiero una campera corta, cuello mao, que se pueda usar sobre los vestidos de la cápsula y no pese en mayo”." />
        <div className="xf-row">
          <span className="xf-quiet">
            {composed.notice
              || "se adjunta la dirección, la paleta y las telas de esta colección"}
          </span>
          <button className="xf-go" disabled={freeBusy || !composed.text}
            onClick={runFreePrompt}
            title="Genera UNA imagen con tu texto más el contexto de arriba, por el mismo camino que la matriz">
            {/* The price rides along only when the engine states one for the
                provider that would actually serve — same rule as the batch
                estimate, which stopped quoting gpt-image-1 rates at Gemini. */}
            {freeBusy ? "Generando…" : `✦ Generar 1 imagen${
              Number.isFinite(perImageCents) ? ` · ${perImageCents}¢` : ""}`}
          </button>
        </div>

        {/* Collapsed by default, labelled with what it contains, and it shows
            the COMPOSED prompt — not just her half. The app added text to her
            words and must not hide that it did. */}
        <details className="xf-see">
          <summary className="xf-sum">
            Ver lo que se envía · tu texto
            {composed.blocks.filter((b) => b.key !== "limite")
              .map((b) => ` + ${b.label.toLowerCase()}`).join("")}
            {composed.blocks.length ? ` · ${GUIDANCE_LABEL}` : ""}
          </summary>
          {composed.blocks.length === 0 && (
            <div className="xf-block">
              <div className="xf-bt">
                Esta colección no tiene dirección, paleta ni telas cargadas, así que
                no se adjunta nada: viaja tu texto tal como lo escribiste. No
                completamos con una paleta por defecto ni con telas de otra marca.
              </div>
            </div>
          )}
          {composed.blocks.map((b) => (
            <div className="xf-block" key={b.key}>
              <div className="xf-bk">{b.label}</div>
              <div className="xf-bt">{b.line}</div>
            </div>
          ))}
          {composed.prompt && (
            // ⚠ With the engine vivo, the prompt is composed SERVER-SIDE from
            // the typed intent (tu texto primero, verbatim; los adjuntos bajo
            // sus propios encabezados) — this local rendering serves only the
            // no-engine fallback. What actually went out appears on each
            // resultado, en "Qué se envió", con el mapa del motor.
            <div className="xf-full"><b>Vista previa local (el motor compone la versión final)</b>{composed.prompt}</div>
          )}
        </details>

        {freeRuns.length > 0 && (
          <>
            <div className="xf-res">
              {freeRuns.map((r) => (
                <div className="xf-card" key={r.id}>
                  <div className="xf-fig">
                    {r.status === "generating" && <div className="spin" />}
                    {r.status === "error" && <div className="st">falló</div>}
                    {r.status === "done" && r.url && <img src={abs(r.url)} alt={r.text} loading="lazy" />}
                  </div>
                  <div className="xf-bd">
                    <div className="t">{r.text}</div>
                    {/* A 422 refusal arrives here VERBATIM (the engine's own
                        sentence about why rendering would mislead) — never
                        swallowed, never retried on the fallback generator. */}
                    {r.status === "error" && <div className="xf-err">{r.error}</div>}
                    {r.status === "done" && (
                      <GenerationReceipt sent={{
                        authored: r.text, intent: r.intent,
                        context: r.intent?.atelier_context || null,
                        controlMapping: r.controlMapping,
                        model: r.model, requestedModel: r.requestedModel,
                      }} />
                    )}
                    <button className="xf-send"
                      disabled={r.status !== "done" || r.promoted
                        || (readiness ? !readiness.can_attach : false)}
                      onClick={() => sendFreeToCollection(r)}
                      title={readiness && !readiness.can_attach
                        ? readiness.attach_blockers?.[0] : undefined}>
                      {r.promoted ? "Enviada" : readiness && !readiness.can_attach
                        ? "La colección no puede recibirla todavía"
                        : `Enviar a ${collName || "la colección"} →`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="xf-note">
              <b>Esto es una imagen, no un veredicto.</b> No lleva puntaje, ni calce,
              ni pronóstico de venta: si el modelo devuelve texto opinando sobre el
              resultado, lo descartamos. Esas respuestas salen de las compuertas,
              sobre evidencia. Las imágenes de esta tanda viven en esta sesión hasta
              que las mandes a la colección.
            </div>
          </>
        )}
      </div>

      {/* evidence-grounded suggestions — engine-live only */}
      {(gaps.length > 0 || colorNudge) && (
        <div className="xp-sug">
          <span className="xp-sug-k">El director sugiere<i>base disponible: {evidenceLabel}</i></span>
          {gaps.map((g) => (
            <button key={g.key} className="xp-sug-c" onClick={() => exploreGap(g)}
              title={g.brief?.note || g.title}>
              <b>{g.cat}</b>
              <span>{g.title}</span>
              <em>{g.brandCount} tuya{g.brandCount === 1 ? "" : "s"} · {g.competitorCount} de competencia{g.trend ? ` · empuja "${g.trend.name}"` : ""}</em>
            </button>
          ))}
          {colorNudge && (
            <div className="xp-sug-c static" title={`El color de tu selección con menos colisión contra ${liveTrends ? "el ADN de tu marca y las tendencias live" : "el ADN de tu marca"}`}>
              <b><span className="sw" style={{ background: colorNudge.hex }} />espacio abierto</b>
              <span>{colorNudge.name} es tu color menos disputado</span>
              <em>diferenciación {colorNudge.score}/100</em>
            </div>
          )}
        </div>
      )}

      <div className="xp-lay">
        {/* ===== left: espacio de diseño ===== */}
        <div>
          <div className="xp-pane">
            <div className="xp-k">Espacio de diseño</div>
            {[
              ["siluetas", "Siluetas", options.siluetas, (o) => o.name,
                (o, on) => <>{o.name}{srcTag(o.source)}</>],
              ["tejidos", "Tejidos", options.tejidos, (o) => o.id || o.name,
                (o) => <>{o.name}{srcTag(o.source)}</>],
              ["colores", "Colores", options.colores, (o) => o.hex,
                (o) => <><span className="sw" style={{ background: o.hex }} />{o.name}{srcTag(o.source)}</>],
            ].map(([axis, label, opts, keyFn, render]) => (
              <div className="xp-axis" key={axis}>
                <div className="hd2">{label}<em>{sel[axis].length} de {opts.length}</em></div>
                <div className="xp-opts">
                  {opts.map((o) => {
                    const on = sel[axis].some((x) => keyFn(x) === keyFn(o));
                    return (
                      <button key={keyFn(o)} className={`xp-opt${on ? " on" : ""}`}
                        onClick={() => toggleOpt(axis, o, keyFn)}>{render(o, on)}</button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="xp-axis">
              <div className="hd2">Detalles<em>{sel.detalles.length}</em></div>
              <div className="xp-opts">
                {sel.detalles.map((d) => (
                  <button key={d} className="xp-opt on" onClick={() => setSel((s) => ({ ...s, detalles: s.detalles.filter((x) => x !== d) }))}>{d} ×</button>
                ))}
              </div>
              <div className="xp-chipin">
                <input value={detalleInput} onChange={(e) => setDetalleInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChip("detalles", detalleInput, setDetalleInput)}
                  placeholder="bolsillo cargo, pinzas, tiro alto…" />
                <button onClick={() => addChip("detalles", detalleInput, setDetalleInput)}>＋</button>
              </div>
            </div>
            <div className="xp-axis">
              <div className="hd2">Fit<em>{sel.fits.length}</em></div>
              <div className="xp-opts">
                {sel.fits.map((f) => (
                  <button key={f} className="xp-opt on" onClick={() => setSel((s) => ({ ...s, fits: s.fits.filter((x) => x !== f) }))}>{f} ×</button>
                ))}
              </div>
              <div className="xp-chipin">
                <input value={fitInput} onChange={(e) => setFitInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChip("fits", fitInput, setFitInput)}
                  placeholder="relajado, oversize, entallado…" />
                <button onClick={() => addChip("fits", fitInput, setFitInput)}>＋</button>
              </div>
            </div>
            <div className="xp-matrix">
              <div><span>Matriz</span><b>{sel.siluetas.length} × {sel.tejidos.length} × {sel.colores.length}</b></div>
              <div style={{ textAlign: "right" }}><span>Conceptos posibles</span><b>{matrix}</b></div>
            </div>
          </div>
        </div>

        {/* ===== center: concept grid ===== */}
        <div>
          {/* WHAT ORDERED THIS GRID, said before the grid. The uncalibrated
              version is the one that matters: it names how many comparisons are
              missing and links to the screen where they get made, and it never
              dresses the matrix order up as a preference. */}
          <div className={`xp-taste ${tasteState.tone}`} aria-live="polite">
            <div className="tt">
              <b>{orderHeadline}</b>
              <span>{tasteState.detail}</span>
              {tasteRanked && tasteOrder.unranked > 0 && (
                <span className="cov">{coverageLine(tasteOrder)}</span>
              )}
              {tasteState.applied && likedTerms.length > 0 && (
                <span className="terms">Rasgos que tu equipo eligió más:{" "}
                  {likedTerms.map((t) => (
                    <i key={t.term}>{t.label} ({t.garments} prendas) </i>
                  ))}
                </span>
              )}
              <span className="cov">Dimensión creativa — “{STUDIO_DIMENSION_QUESTION}”. No mira los píxeles: compara los rasgos que cada concepto declara con los que tu equipo comparó.</span>
            </div>
            <div className="tacts">
              {tasteState.applied && sortBy !== "gusto" && (
                <button onClick={() => { setSortTouched(true); setSortBy("gusto"); }}>Ordenar por gusto</button>
              )}
              {tasteRanked && (
                <button className="go" onClick={preselectByTaste}>Preseleccionar 6 por gusto</button>
              )}
              {tasteState.cta && onNavigate && (
                <button className={tasteState.applied ? "" : "go"}
                  onClick={() => onNavigate(tasteState.cta.view)}>{tasteState.cta.label}</button>
              )}
            </div>
          </div>

          <div className="xp-filters">
            <select value={filterSil} onChange={(e) => setFilterSil(e.target.value)}>
              <option value="">Todas las siluetas</option>
              {sel.siluetas.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <button className={`xp-tgl${groupOn && !tasteRanked ? " on" : ""}`} disabled={tasteRanked}
              title={tasteRanked
                ? "El orden por gusto es una sola lista: agrupada, “3° de los tejidos de punto” no significa nada"
                : "Agrupa por familia de tejido"}
              onClick={() => setGroupOn((g) => !g)}>Agrupar</button>
            <button className={`xp-tgl${hideSimilar ? " on" : ""}`} onClick={() => setHideSimilar((h) => !h)}
              title="Oculta conceptos con misma silueta y tela y color casi igual — queda el mejor puntuado">Eliminar similares</button>
            <button className={`xp-tgl${hideDerivative ? " on" : ""}`} onClick={() => setHideDerivative((h) => !h)}
              title="Oculta conceptos demasiado parecidos a algo que ya existe (banda 'crowded') — evita copiar">Ocultar derivados</button>
            <select value={sortBy} style={{ marginLeft: "auto" }}
              onChange={(e) => { setSortTouched(true); setSortBy(e.target.value); }}>
              <option value="orden">Orden de la matriz</option>
              <option value="novedad">Novedad (diferenciación)</option>
              {dna && <option value="adn">Afinidad con el ADN (léxico)</option>}
              {/* Offered only once the engine says it is earned. An option that
                  silently does nothing is worse than an absent one — and the
                  banner above already explains where it went. */}
              {taste?.calibrated && <option value="gusto">Gusto aprendido del equipo</option>}
            </select>
          </div>

          {!concepts.length ? (
            <div className="xp-pane xp-empty">
              <b>Definí el espacio y generá la primera tanda</b>
              Elegí siluetas, telas y colores a la izquierda; el Director de diseño (derecha) controla cuánto del espacio se explora.
            </div>
          ) : groups.map((g) => (
            <div key={g.label || "all"}>
              {g.label && <div className="xp-ghead"><h4>{g.label}</h4><b>{g.items.length}</b></div>}
              <div className="xp-ggrid">
                {g.items.map((c, position) => (
                  <div key={c.id} className={`xc${c.selected ? " on" : ""}${c.similarTo ? " sim" : ""}`}
                    onClick={() => c.status === "done" && patchConcept(c.id, { selected: !c.selected })}>
                    <span className="cb">{c.selected ? "✓" : ""}</span>
                    {/* Position in the LEARNED order, with the traits that put it
                        there. A concept the team has never measured says so
                        instead of showing a number it did not earn. */}
                    {tasteRanked && c.status === "done" && (tasteRankOf(c.id)
                      ? <span className="rank" title={matchedSummary(tasteRankOf(c.id).matched)}>
                          #{position + 1}
                        </span>
                      : <span className="rank none" title="Este concepto no declara ningún rasgo que tu equipo haya comparado — queda sin puntaje, no último">
                          sin medir
                        </span>)}
                    <span className="code">{c.code}</span>
                    <div className="fig">
                      {c.status === "generating" && <div className="spin" />}
                      {c.status === "queued" && <div className="st">en cola</div>}
                      {c.status === "error" && <div className="st">falló<span className="xerr">{c.error}</span></div>}
                      {c.status === "done" && (c.idb ? imgs[c.id] : c.url) &&
                        <img src={c.idb ? imgs[c.id] : abs(c.url)} alt={c.code} loading="lazy" />}
                    </div>
                    <div className="bd">
                      <div className="t">{c.combo.silueta.name} · {c.combo.tejido.name}</div>
                      <div className="m">
                        <span className="sw" style={{ background: c.combo.color.hex }} />
                        {c.combo.color.name}
                        {c.dnaScore != null && (
                          <span className={`dna ${c.dnaBand}`}
                            title={`Afinidad con el ADN de la marca: ${c.dnaScore}/100 (${DNA_BAND_LABEL[c.dnaBand]}) — cercanía a tu paleta y materiales`}>
                            ADN {c.dnaScore}
                          </span>
                        )}
                        <span className={`nv ${c.band}`} style={{ marginLeft: c.dnaScore != null ? 0 : "auto" }}
                          title={`Diferenciación ${c.score} — vs tu catálogo y tendencias`}>{c.score}</span>
                      </div>
                      {/* §8 anti-copying: flag concepts too close to an existing piece */}
                      {c.band === "crowded" && c.nearest && (
                        <div className="collide" title={`Colisión ${c.nearest.sim}% — evitá copiar; cambiá silueta, detalle o color`}>
                          ⚠ muy parecido a <b>{c.nearest.name}</b> ({c.nearest.owner === "your catalog" ? "tu archivo" : "el mercado"})
                        </div>
                      )}
                    </div>
                    <button className="dis" title="Descartar"
                      onClick={(e) => { e.stopPropagation(); patchConcept(c.id, { status: "discarded", selected: false }); }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ===== right: director de diseño ===== */}
        <div className="xp-side">
          <div className="xp-pane">
            <div className="xp-k">Director de diseño</div>
            <div className="xp-k" style={{ marginBottom: 5 }}><span>Referencias (viajan al motor, máx. 2)</span></div>
            <div className="xp-refs">
              {brandCatalog.products.filter((p) => p.image_url).slice(0, 8).map((p) => {
                const on = refCodes.includes(p.id);
                return (
                  <button key={p.id} className={`xp-ref${on ? " on" : ""}`} title={p.title}
                    onClick={() => setRefCodes((r) => on ? r.filter((x) => x !== p.id) : [...r, p.id].slice(-2))}>
                    <img src={p.image_url} alt={p.title} loading="lazy" />
                  </button>
                );
              })}
            </div>
            <div className="xp-note" style={{ marginBottom: 10 }}>
              {brandCatalog.loading ? "Leyendo tu catálogo…"
                : brandCatalog.total
                  ? "productos reales de tu catálogo como referencia visual; la tela con swatch viaja sola"
                  : brandCatalog.visualReferenceCount
                    ? `${brandCatalog.visualReferenceCount} referencias visuales en el archivo. No viajan al modelo mientras sus derechos sean públicos o no confirmados; la Dirección derivada sí condiciona esta exploración.`
                    : "Sin Product Master ni archivo visual para esta marca — conectá tu tienda o cargá referencias. No mostramos productos de otra marca como si fueran tuyos."}
            </div>

            <div className="xp-k"><span>Importancia de variables</span></div>
            {[["silueta", "Silueta"], ["tejido", "Tejido"], ["color", "Color"], ["detalle", "Detalles"], ["fit", "Fit"]].map(([k, l]) => (
              <div className="xp-slider" key={k}>
                <div className="t">{l}<b>{Math.round(weights[k] * 100)}%</b></div>
                <input type="range" min={0} max={100} value={Math.round(weights[k] * 100)}
                  onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) / 100 }))} />
              </div>
            ))}
            <div className="xp-note" style={{ margin: "0 0 10px" }}>más importancia = la corrida usa más variantes de ese eje</div>

            <div className="xp-slider">
              <div className="t">Equilibrio ADN<b>fiel {Math.round(adnFiel * 100)}%</b></div>
              <input type="range" min={30} max={100} value={Math.round(adnFiel * 100)}
                onChange={(e) => setAdnFiel(Number(e.target.value) / 100)} />
            </div>

            <div className="xp-k" style={{ marginTop: 10 }}><span>Cantidad de conceptos</span></div>
            <input className="xp-num" type="number" min={1} max={matrix || 1} value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(matrix || 1, Number(e.target.value) || 1)))} />
            <div className="xp-k" style={{ marginTop: 10 }}><span>Estimación</span></div>
            <div className="xp-est">
              <div className="xp-fact">
                <span className="xp-lbl">Costo</span>
                {/* The arithmetic is shown only when the engine states a
                    price. It used to print n × 1¢ or n × 6¢ regardless of who
                    would serve, so a Gemini run quoted gpt-image-1's rates. */}
                <b>{costCents == null
                  ? `${n} imágenes · costo no declarado por el proveedor (${quality})`
                  : `${n} × ${perImageCents}¢ ≈ $${(costCents / 100).toFixed(2)} (${quality})`}</b>
              </div>
              <div className="xp-fact">
                <span className="xp-lbl">Tiempo</span>
                {/* Measured during the run or not claimed at all — never an ETA
                    invented before a single image has come back. */}
                <b>{run.avgMs ? `~${Math.round(run.avgMs / 1000)}s por imagen (medido)` : "se mide durante la corrida"}</b>
              </div>
            </div>
            <div className="xp-note" style={{ marginTop: 0 }}>si el proveedor se queda sin cupo, la corrida se pausa y lo generado queda</div>
            {/* ⚠ THE FIRST-CAPSULE BUTTON PROMOTES INTO THE COLLECTION, so it
                appears only when the engine says that may happen. It used to
                depend on `directionState.ready` alone — the browser's read of
                the Direction — which knows nothing about the approved brief the
                engine requires, so it offered to build a capsule the last step
                was always going to refuse with a 409. */}
            {capsuleOffered && (
              <button className="xp-go" disabled={run.phase === "running" || !n}
                onClick={() => startRun({ autoPromote: true, limit: 4 })}>
                ✦ Crear primera cápsula · {Math.min(4, n)} conceptos
              </button>
            )}
            {/* Exploring stays open — it is a sandbox and the label now says so
                rather than implying the output is keepable. The owner's own
                framing: "either enforce it, or make it an explicit sandbox that
                can't flow into a collection." */}
            <button className={`xp-go${capsuleOffered ? " quiet" : ""}`}
              disabled={run.phase === "running" || !n} onClick={() => startRun()}>
              Explorar {n} conceptos sin enviar
            </button>
            {/* ⚠ TWO STATES, NOT ONE (owner review 2026-08-11). The first
                version rendered one list mixing "this cannot be saved" with
                "the direction is empty" — so a collection WITH an approved
                brief was told its work could not be saved, because a missing
                silhouette sat in the same list as the brief refusal. They are
                different questions about different objects: the brief decides
                whether work may belong here, the direction decides whether the
                run has anything to be grounded in. */}
            {readiness && !readiness.can_attach && (
              <div className="xp-gate">
                <b>Prueba, no colección.</b> Podés generar, pero esto todavía no
                puede guardarse en {readiness.collection ? `«${readiness.collection}»` : "la colección"}:
                {/* Same defect as `direction_gaps` below, same block shape,
                    and the one the stack trace actually landed on. The guard
                    proves `readiness` exists; it proves nothing about the
                    array. Both are fixed together because fixing one and not
                    the other is how this comes back. */}
                {Array.isArray(readiness.attach_blockers)
                 && readiness.attach_blockers.length > 0 ? (
                  <ul>
                    {readiness.attach_blockers.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                ) : (
                  <p>El motor no detalló qué lo impide.</p>
                )}
                {onNavigate && !readiness.brief?.approved && (
                  <div className="xp-gate-actions">
                    <button onClick={() => onNavigate("collectionbrief")}>
                      Redactar el brief con mis datos →
                    </button>
                  </div>
                )}
              </div>
            )}
            {readiness && !readiness.can_ground_a_run && (
              <div className="xp-gate muted">
                <b>La dirección todavía no puede fundamentar una corrida.</b>
                {" "}Lo generado saldría del prompt base y no de una intención de
                la colección:
                {/* ⚠ THIS CRASHED THE WHOLE SCREEN. The guard above proves
                    `readiness` exists and that it cannot ground a run; it
                    proves nothing about `direction_gaps`, which was mapped
                    unconditionally. Any readiness payload lacking that array —
                    an older engine, a shape change, a partial response — took
                    Explore down with "Cannot read properties of undefined".
                    Flagged by an external audit, 2026-08-16.

                    An EMPTY list would be its own small lie: the sentence above
                    says something is missing, so rendering nothing under it
                    reads as "nothing is". If the engine did not name the gaps,
                    say so rather than implying there are none. */}
                {Array.isArray(readiness.direction_gaps)
                 && readiness.direction_gaps.length > 0 ? (
                  <ul>
                    {readiness.direction_gaps.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                ) : (
                  <p>El motor no detalló qué parte de la dirección falta.</p>
                )}
                {onNavigate && (
                  <div className="xp-gate-actions">
                    <button onClick={() => onNavigate("direction")}>
                      Completar la dirección →
                    </button>
                  </div>
                )}
              </div>
            )}
            {readiness === null && brandId && collectionId && (
              <div className="xp-gate muted">
                No pudimos consultarle al motor si esto puede guardarse en la
                colección. Se puede generar igual — pero <b>sin</b> esa
                verificación hecha, que es distinto de haberla pasado.
              </div>
            )}
            {run.phase === "paused" && (
              <button className="xp-go quiet" onClick={resumeRun}>
                Reanudar corrida ({concepts.filter((c) => c.status === "queued" || c.status === "error").length} pendientes)
              </button>
            )}
            <div className="xp-note">la muestra es balanceada y determinística: misma matriz → mismos conceptos</div>
          </div>
        </div>
      </div>

      {/* progress */}
      {run.phase === "running" && (
        <div className="xp-prog">
          <div className="t"><span>Generando {run.done}/{run.total}</span>
            <button onClick={pauseRun}>Pausar</button></div>
          <div className="bar"><i style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} /></div>
          <div className="m">
            <span>{run.errors ? `${run.errors} con error` : "sin errores"}</span>
            <span>{eta != null ? `~${eta} min restantes (medido)` : "midiendo velocidad…"}</span>
          </div>
        </div>
      )}

      {/* preselección tray */}
      {concepts.some((c) => c.status === "done") && (
        <div className="xp-tray">
          <span className="cnt">Preselección · {tray.length}</span>
          <div className="thumbs">
            {tray.slice(0, 14).map((c) => (
              <img key={c.id} src={c.idb ? imgs[c.id] : abs(c.url)} alt={c.code} />
            ))}
          </div>
          {balance && (
            <div className="xp-bal">
              <div className="b1">Siluetas<b>{balance.siluetas.label}</b></div>
              <div className="b1">Tejidos<b>{balance.tejidos.label}</b></div>
              <div className="b1">Colores<b>{balance.colores.label}</b></div>
              <div className="b1">Complejidad<b>{balance.complejidad.label}</b></div>
            </div>
          )}
          {/* Disabled AND labelled. A dead button with no sentence is the
              "internal data-validation console" this review keeps objecting
              to; the reason travels with the refusal. */}
          <button className="xp-send"
            disabled={!tray.length || (readiness ? !readiness.can_attach : false)}
            onClick={sendToCollection}
            title={readiness && !readiness.can_attach
              ? readiness.attach_blockers?.[0] : undefined}>
            {readiness && !readiness.can_attach
              ? `${collName || "La colección"} todavía no puede recibir conceptos`
              : `Enviar ${tray.length || ""} a ${collName || "la colección"} →`}
          </button>
        </div>
      )}
    </div>
  );
}
