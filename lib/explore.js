// Exploration-matrix logic for Concept Studio's Explorar mode: pure functions
// for sampling the design space, building prompts, scoring/deduping concepts
// and reading the balance of a preselection. No React, no storage.
//
// Honesty rules that shape this file:
//   · Axes carry a `source` tag (catálogo | ADN | tendencia | muestra | propio)
//     so the UI can say where every option comes from — nothing is invented.
//   · Cost math mirrors the engine's documented economics (draft ≈ 1¢/img,
//     final ≈ 6¢/img via gpt-image-1); time is MEASURED during the run, never
//     promised up front.
//   · Sampling is deterministic given the same inputs — a re-run with the same
//     space produces the same combos (rollback-friendly, no hidden RNG).
import { scoreVariation } from "@/lib/differentiation";
import { colName } from "@/lib/signals";
import { dnaPromptBlock } from "@/lib/brandDna";

export const DEFAULT_WEIGHTS = { silueta: 0.3, tejido: 0.3, color: 0.2, detalle: 0.1, fit: 0.1 };

// The matrix multiplies only the three garment-defining axes (the mockup's
// 5 × 8 × 6 = 240). Detalles and fit rotate across combos without multiplying.
export const matrixSize = (sel) =>
  (sel.siluetas?.length || 0) * (sel.tejidos?.length || 0) * (sel.colores?.length || 0);

// Per-image price comes from the engine (api/app/imaging.py:_PRICING) via
// lib/studioReadiness.costCentsFor — null when it does not know the provider's
// price. This used to hardcode the gpt-image-1 rates and charge them to
// whatever served, including Gemini, which has no quality tier at all.
export const batchCostCents = (n, costCents) =>
  (Number.isFinite(costCents) ? n * costCents : null);

// How much of an axis's breadth a run uses, driven by its importance weight:
// weight 0 → only the first pick, weight 1 → the full selection.
const breadth = (arr, w = 0.5) =>
  arr.slice(0, Math.max(1, Math.round(arr.length * (0.35 + 0.65 * Math.min(1, Math.max(0, w))))));

const isHouse = (opt) =>
  !opt.source
  || opt.source === "catálogo"
  || opt.source === "propio"
  || opt.source === "ADN"
  || opt.source === "ADN de marca"
  || opt.source === "dirección";

// Deterministic, balanced sample of the design space. Interleaves axes so the
// first N combos spread across silhouettes instead of exhausting one, dedupes,
// and caps experimental (trend/sample-sourced) values to the share the
// ADN-balance slider allows.
export function sampleCombos(sel, n, weights = DEFAULT_WEIGHTS, adnFiel = 0.82) {
  const S = breadth(sel.siluetas, weights.silueta);
  const T = breadth(sel.tejidos, weights.tejido);
  const C = breadth(sel.colores, weights.color);
  if (!S.length || !T.length || !C.length) return [];
  const D = sel.detalles || [];
  const F = sel.fits || [];
  const nS = S.length, nT = T.length, nC = C.length;
  const total = nS * nT * nC;
  const target = Math.min(n, total);
  const expBudget = Math.round(target * (1 - adnFiel));
  let expUsed = 0;
  const seen = new Set();
  const out = [];
  for (let i = 0; out.length < target && i < total * 2; i++) {
    const s = S[i % nS];
    let t = T[(i + Math.floor(i / nS)) % nT];
    let c = C[(i + Math.floor(i / (nS * nT))) % nC];
    const experimental = !isHouse(t) || !isHouse(c);
    if (experimental && expUsed >= expBudget) {
      t = isHouse(t) ? t : T.find(isHouse) || t;
      c = isHouse(c) ? c : C.find(isHouse) || c;
    } else if (experimental) {
      expUsed++;
    }
    const key = `${s.name}|${t.id || t.name}|${c.hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code: `EXP-${String(out.length + 1).padStart(3, "0")}`,
      silueta: s,
      tejido: t,
      color: c,
      detalle: D.length ? D[out.length % D.length] : null,
      fit: F.length ? F[out.length % F.length] : null,
    });
  }
  return out;
}

// The first capsule is a range proposal, not a weighted ideation batch. It
// should show the breadth the designer chose in Direction before it repeats a
// silhouette or material. Colour also stays broad so a four-look capsule does
// not accidentally read as one colourway exercise. Later "Explorar" runs keep
// the Director de diseño weights exactly as set.
export function firstCapsuleCombos(sel, n, weights = DEFAULT_WEIGHTS, adnFiel = 0.82) {
  return sampleCombos(sel, n, {
    ...weights,
    silueta: 1,
    tejido: 1,
    color: 1,
  }, adnFiel);
}

// One generation prompt per combo — same register as the studio's itemPrompt,
// generalized. The DNA block is built from the ACTIVE brand's own engine.dna
// (brand-agnostic; neutral fallback when absent). The ADN slider trades a
// strict-fidelity clause for a reinterpretation clause; it never invents facts.
export function comboPrompt(combo, { dna = null, adnFiel = 0.82 } = {}) {
  const bits = [];
  bits.push(
    `${combo.silueta.name} en ${combo.tejido.name}${combo.tejido.comp ? ` (${combo.tejido.comp})` : ""}, color ${combo.color.name || colName(combo.color.hex)}.`,
  );
  if (combo.detalle) bits.push(`Detalle: ${combo.detalle}.`);
  if (combo.fit) bits.push(`Calce ${combo.fit}.`);
  bits.push(comboContext({ dna, adnFiel }));
  return bits.join(" ");
}

// The APP-VOICE half of a combo prompt — DNA block, fidelity clause, staging —
// kept separable so the typed generation path (2026-08-17 reversal) can send
// it as labelled `atelier_context` while the combo's own axes travel as
// structured dicts. `comboPrompt` above remains the single local rendering for
// the no-engine fallback, built from these same parts.
export function comboContext({ dna = null, adnFiel = 0.82 } = {}) {
  return [
    dnaPromptBlock(dna),
    adnFiel >= 0.65
      ? "Mantenete fiel al ADN de la marca: proporciones y acabados reconocibles de su línea."
      : "Podés reinterpretar proporciones y acabados con libertad, manteniendo la identidad de la marca reconocible.",
    "Foto de producto e-commerce, prenda sola, fondo neutro de estudio, luz natural suave, sin texto ni marca de agua.",
  ].filter(Boolean).join(" ");
}

// Differentiation score per combo (colour × surface vs the brand's own DNA
// refs + live trends). Both reference sets are supplied by the caller; there is
// no hardcoded catalog to fall back on (2026-07-24 audit).
export const scoreCombo = (combo, trends, ownRefs = []) =>
  scoreVariation({ color: combo.color.hex, texture: combo.tejido.name || "Cotton jersey" },
                 { trends, ownRefs });

// Same weighted-RGB distance family differentiation.js uses internally —
// good enough to call two colorways of one silhouette+fabric "similares".
function colorDist(a, b) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const w = [0.3, 0.59, 0.11];
  return Math.sqrt(pa.reduce((acc, v, i) => acc + w[i] * ((v - pb[i]) / 255) ** 2, 0));
}

// Marks near-duplicates inside one run: same silhouette + same fabric + colors
// closer than `thr`. The LATER (lower-ranked) concept gets `similarTo` set so
// "Eliminar similares" can hide it while keeping the strongest of each pair.
export function markSimilar(concepts, thr = 0.09) {
  const out = concepts.map((c) => ({ ...c, similarTo: null }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].similarTo) continue;
    for (let j = i + 1; j < out.length; j++) {
      if (out[j].similarTo) continue;
      if (out[i].combo.silueta.name !== out[j].combo.silueta.name) continue;
      if ((out[i].combo.tejido.id || out[i].combo.tejido.name) !== (out[j].combo.tejido.id || out[j].combo.tejido.name)) continue;
      if (colorDist(out[i].combo.color.hex, out[j].combo.color.hex) < thr) out[j].similarTo = out[i].id;
    }
  }
  return out;
}

// Balance of a preselection against the explored space, per axis: how many of
// the selected values the tray actually uses, and how evenly. Labels are
// computed from coverage — never asserted.
function axisBalance(tray, selected, keyFn) {
  if (!selected.length) return { ratio: 0, label: "—" };
  const counts = {};
  tray.forEach((c) => { const k = keyFn(c); counts[k] = (counts[k] || 0) + 1; });
  const used = Object.keys(counts).length;
  const ratio = used / selected.length;
  // Evenness: normalized entropy of the distribution (1 = perfectly even).
  const totalN = tray.length || 1;
  const probs = Object.values(counts).map((v) => v / totalN);
  const entropy = -probs.reduce((a, p) => a + p * Math.log(p), 0);
  const evenness = used > 1 ? entropy / Math.log(used) : 1;
  const score = ratio * 0.6 + evenness * 0.4;
  return {
    ratio,
    used,
    of: selected.length,
    label: !tray.length ? "—" : score >= 0.75 ? "Excelente" : score >= 0.45 ? "Buena" : "Baja",
  };
}

export function trayBalance(tray, sel) {
  const combos = tray.map((c) => c.combo);
  const withDetail = combos.filter((c) => c.detalle).length;
  const detailShare = combos.length ? withDetail / combos.length : 0;
  return {
    siluetas: axisBalance(combos, sel.siluetas || [], (c) => c.silueta.name),
    tejidos: axisBalance(combos, sel.tejidos || [], (c) => c.tejido.id || c.tejido.name),
    colores: axisBalance(combos, sel.colores || [], (c) => c.color.hex),
    complejidad: {
      ratio: detailShare,
      label: !combos.length ? "—" : detailShare >= 0.3 && detailShare <= 0.75 ? "Equilibrada" : detailShare > 0.75 ? "Cargada" : "Simple",
    },
  };
}

// Group label for the concept grid: silhouette + fabric family reads like the
// mockup's "Sastrería fluida" without inventing editorial names.
export const groupLabel = (combo, fabFamily) => {
  const fam = fabFamily?.[combo.tejido.name];
  const famEs = { fluid: "fluida", knit: "de punto", structured: "estructurada", technical: "técnica" }[fam];
  return famEs ? `${combo.silueta.name} · construcción ${famEs}` : combo.silueta.name;
};

// Compact a data-URL image before persisting (IndexedDB for the grid, or the
// collection's localStorage when a concept is promoted). Engine-hosted URLs
// pass through untouched — the server keeps the high-res original.
export async function compactImage(url, maxPx = 800, q = 0.8) {
  if (!url?.startsWith("data:image/")) return url;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", q));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}
