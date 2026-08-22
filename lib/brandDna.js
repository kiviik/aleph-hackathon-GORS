// Brand-agnostic DNA engine for the studio: turn whatever DNA the engine holds
// for the ACTIVE brand into (a) a generation prompt and (b) a fidelity score on
// each creation. Nothing here names a brand — Complot, or any brand we onboard,
// is described entirely by its own extracted `engine.dna`.
//
// dna shape (from lib/engineAdapter): { summary, keywords[], palette[hex],
// silhouettes[], materials[], tone[], priceArchitecture[] }. Every field is
// optional; a brand mid-onboarding may have only some. When DNA is absent we
// fall back to a NEUTRAL contemporary-fashion prompt — never another brand's.

const NEUTRAL_DNA_LINE =
  "Prenda de una marca de moda contemporánea, con una estética propia y coherente.";

// DNA fields may arrive as plain strings OR as weighted {label, weight,
// evidence} objects depending on how far the adapter flattened them. Coerce to
// the string form everywhere so neither shape can crash the studio.
const lbl = (x) => (typeof x === "string" ? x : x?.label ?? x?.name ?? "");
const cap = (arr, n) => (arr || []).map(lbl).filter(Boolean).slice(0, n);

// A concise, image-model-friendly prompt fragment built from the decomposed
// DNA. Kept short on purpose — image models degrade with prompt bloat, so we
// take the most identity-bearing few items per field rather than everything.
export function dnaPromptBlock(dna) {
  if (!dna) return NEUTRAL_DNA_LINE;
  const parts = [];
  const kw = cap(dna.keywords, 6);
  if (kw.length) parts.push(`ADN de la marca: ${kw.join(", ")}.`);
  const sil = cap(dna.silhouettes, 3);
  if (sil.length) parts.push(`Siluetas de la casa: ${sil.join(", ")}.`);
  const mat = cap(dna.materials, 3);
  if (mat.length) parts.push(`Materiales típicos: ${mat.join(", ")}.`);
  const tone = cap(dna.tone, 3);
  if (tone.length) parts.push(`Actitud: ${tone.join(", ")}.`);
  return parts.length ? parts.join(" ") : NEUTRAL_DNA_LINE;
}

// ---- DNA fidelity: how much a creation reads as THIS brand ----------------
// Honest heuristic, not a sales prediction: proximity of the creation's colour
// to the brand's real palette + relatedness of its fabric to the brand's
// materials. Transparent and labeled as "afinidad con el ADN" in the UI.
function rgb(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function colorCloseness(hex, palette) {
  const c = rgb(hex);
  const hexes = (palette || []).map((p) => rgb(lbl(p))).filter(Boolean);
  if (!c || !hexes.length) return null;
  // nearest palette colour, weighted-RGB distance normalized to 0..1 closeness
  const w = [0.3, 0.59, 0.11];
  let best = Infinity;
  for (const p of hexes) {
    const d = Math.sqrt(w.reduce((a, wi, i) => a + wi * ((c[i] - p[i]) / 255) ** 2, 0));
    best = Math.min(best, d);
  }
  return Math.max(0, 1 - best / 0.28); // same falloff scale as differentiation.js
}
function materialCloseness(fabric, materials) {
  const f = (fabric || "").toLowerCase();
  const mats = (materials || []).map((m) => lbl(m).toLowerCase()).filter(Boolean);
  if (!f || !mats.length) return null;
  const fWords = new Set(f.split(/\W+/).filter((w) => w.length > 2));
  for (const m of mats) {
    if (m.includes(f) || f.includes(m)) return 1;
    const shared = m.split(/\W+/).some((w) => w.length > 2 && fWords.has(w));
    if (shared) return 0.8;
  }
  return 0.15; // named materials exist and this fabric matches none of them
}

// Returns { score:0-100, band, parts } or null when the brand has no DNA to
// score against (so the UI can hide the metric rather than show a fake number).
export function dnaFidelity(creation, dna) {
  if (!dna || (!dna.palette?.length && !dna.materials?.length)) return null;
  const col = colorCloseness(creation.colorway || creation.color?.hex, dna.palette);
  const mat = materialCloseness(creation.fabric || creation.fabricName || creation.tejido?.name, dna.materials);
  const present = [col, mat].filter((x) => x != null);
  if (!present.length) return null;
  // colour weighted a touch higher — palette is a stronger identity signal than
  // fabric family for most brands.
  const wcol = col != null ? 0.6 : 0;
  const wmat = mat != null ? 0.4 : 0;
  const wsum = wcol + wmat;
  const raw = ((col ?? 0) * wcol + (mat ?? 0) * wmat) / (wsum || 1);
  const score = Math.round(raw * 100);
  return {
    score,
    band: score >= 66 ? "core" : score >= 40 ? "adjacent" : "off",
    parts: { color: col == null ? null : Math.round(col * 100), material: mat == null ? null : Math.round(mat * 100) },
  };
}

export const DNA_BAND_LABEL = {
  core: "núcleo de marca",
  adjacent: "emparentado",
  off: "fuera del ADN",
};
