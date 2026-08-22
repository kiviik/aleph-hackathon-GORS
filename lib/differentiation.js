// Differentiation / collision scoring for generated designs (v0 heuristic).
//
// The copycat objection: same DNA in -> same designs out. This makes the risk
// visible per variation by comparing its fingerprint (colour + surface) against
// two reference sets:
//   1. YOUR CATALOG  -> "you already sell this" (duplicate risk)
//   2. THE TREND CONE -> "every trend tool is pushing everyone here"
//      (convergence risk; live engine trends feed this set when available)
//
// v0 is a deterministic client-side heuristic over colour + texture; the
// engine upgrade replaces similarity with pgvector cosine over real design
// fingerprints. Numbers are honest about what they compare — nothing here
// pretends to see other brands' in-flight work.
//
// 2026-07-24 audit: both reference sets used to be fabricated for anyone but
// the pilot brand. "Your catalog" was a 36-product Complot list hardcoded in
// lib/catalog.js, and the trend cone silently fell back to the invented TRENDS
// constant when the engine had none — and the resulting score was PERSISTED
// into the decision ledger with no marker saying so. Both reference sets are
// now passed in by the caller from the ACTIVE brand's engine data, and a score
// with nothing real to compare against is null, not 100.
import { TREND_SW } from "./signals";

/* ---------- colour distance ---------- */
function rgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Weighted RGB distance, normalized to 0..1 (perceptual-ish, dependency-free).
function colorDist(a, b) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const d = Math.sqrt(
    (2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2
  );
  return Math.min(1, d / 765);
}
// Steep falloff: beyond ~28% of max RGB distance two colours read as clearly
// different garments to a buyer (ivory vs charcoal ~0.69 raw -> sim 0).
const colorSim = (a, b) => Math.max(0, 1 - colorDist(a, b) / 0.28);

/* ---------- surface similarity (studio texture vs fabric family) ---------- */
const TEX_FABRIC_SIM = {
  linen: { Linen: 1, Tencel: 0.6, "Organic cotton": 0.5 },
  twill: { Twill: 1, Denim: 0.7, "Technical shell": 0.4 },
  herringbone: { Twill: 0.7, "Merino wool": 0.6 },
  stripe: { "Rib knit": 0.5, "Organic cotton": 0.5, Linen: 0.4 },
  solid: { Satin: 0.6, "Merino wool": 0.5, "Organic cotton": 0.5, Tencel: 0.5 },
  dot: {},
};
const surfaceSim = (tex, fabric) => (TEX_FABRIC_SIM[tex] || {})[fabric] ?? 0.25;

/* ---------- reference sets ---------- */
// "Your line" refs, derived from the ACTIVE brand's engine DNA — the colours
// and materials the engine actually learned from that brand's catalog. Computed,
// never hand-curated: the palette × materials grid is the brand's own signature
// surface. Returns [] without DNA, which correctly means "we cannot judge
// duplicate risk yet" rather than judging it against someone else's line.
export function ownRefsFromDna(dna) {
  const hexes = (dna?.palette || [])
    .map((p) => (typeof p === "string" ? p : p?.label ?? p?.name))
    .filter((h) => typeof h === "string" && /^#/.test(h));
  const fabrics = (dna?.materials || [])
    .map((m) => (typeof m === "string" ? m : m?.label ?? m?.name))
    .filter(Boolean);
  if (!hexes.length) return [];
  const refs = [];
  for (const hex of hexes) {
    if (fabrics.length) {
      for (const fabric of fabrics) refs.push({ owner: "tu línea", name: `${fabric}`, hex, fabric });
    } else {
      refs.push({ owner: "tu línea", name: "paleta de marca", hex, fabric: null });
    }
  }
  return refs;
}

// Market refs from trends. NO fallback to the sample TRENDS constant: with no
// live trends there is no trend cone, and saying so beats scoring against
// invented ones.
function marketRefs(trends) {
  const refs = [];
  for (const t of trends || []) {
    const hexes = new Set([t.col, ...(TREND_SW[t.name] || [])].filter(Boolean));
    for (const hex of hexes) {
      refs.push({ owner: "market trend", name: t.name, hex, fabric: t.fabric, live: !!t.live });
    }
  }
  return refs;
}

/* ---------- scoring ---------- */
// Collision with one reference: colour identifies the clash, surface confirms it.
function collision(v, ref) {
  return 0.6 * colorSim(v.color, ref.hex) + 0.4 * surfaceSim(v.texture, ref.fabric);
}

// Blend the single worst collision with the local crowding around it (top 3),
// so one near-twin and a generally busy neighbourhood both pull the score down.
function collisionRead(v, refs) {
  const scored = refs.map((ref) => ({ ...ref, c: collision(v, ref) })).sort((a, b) => b.c - a.c);
  const top3 = scored.slice(0, 3);
  const mean3 = top3.reduce((s, r) => s + r.c, 0) / (top3.length || 1);
  return { worst: scored[0], pressure: 0.75 * (scored[0]?.c ?? 0) + 0.25 * mean3 };
}

// Returns { score, band, nearest, basis }. `score` is NULL when there is
// nothing real to compare against — no brand DNA and no live trends. A score of
// 100 in that situation would read as "maximally differentiated" when the truth
// is "not measured", and that number used to be written into the ledger.
// ⚠ HOW MANY REFERENCES BEFORE "51" MEANS ANYTHING.
//
// Owner test as a designer, 2026-08-10: a generated product showed
// "Differentiation: 51" and he asked the right question — "differentiation
// from what, measured how, and why should anyone trust it when the concept had
// no proper creative inputs?" The old floor was `refs.length > 0`, so ONE
// reference produced a two-digit score with a band label attached.
//
// DECLARED, NOT MEASURED, like every threshold in this product. The argument
// for 8: this is a worst-case collision against a reference set, and a
// worst-case over one or two items is a fact about those items, not about the
// brand's space. Below the floor there is no score — same rule as the
// category-coherence gate and the panel-comparability gate in the engine:
// "we could not measure this" must never render as a number.
export const MIN_REFERENCES = 8;

export function scoreVariation(v, { trends, ownRefs = [] } = {}) {
  const market = marketRefs(trends);
  const refs = [...ownRefs, ...market];
  const basis = { own: ownRefs.length, market: market.length, total: refs.length };
  if (refs.length < MIN_REFERENCES) {
    return {
      score: null,
      band: null,
      nearest: null,
      basis,
      // The sentence a designer reads INSTEAD of a number, answering the
      // question he actually asked: against what?
      why: refs.length
        ? `sin puntaje: se compara contra ${refs.length} referencia(s) ` +
          `(${basis.own} de tu catálogo, ${basis.market} del cono de tendencia) ` +
          `y hacen falta ${MIN_REFERENCES}. Un peor-caso sobre ${refs.length} ` +
          `es un dato sobre esas ${refs.length}, no sobre tu espacio.`
        : "sin puntaje: no hay ninguna referencia real contra la cual comparar",
    };
  }
  const { worst, pressure } = collisionRead(v, refs);
  const score = Math.round(100 * (1 - pressure));
  return {
    score,
    band: score >= 55 ? "open" : score >= 35 ? "adjacent" : "crowded",
    nearest: worst && { name: worst.name, owner: worst.owner, live: worst.live, sim: Math.round(worst.c * 100) },
    basis,
    // Always present, so the number can never appear without what it compared.
    why: `color y superficie contra ${refs.length} referencia(s): ` +
         `${basis.own} de tu catálogo y ${basis.market} del cono de tendencia`,
  };
}

// Whitespace nudge: the palette colour whose worst-case collision (for this
// texture) is lowest — i.e. the most open space to move this design into.
// Null when there are no references, for the same reason as above.
export function whitespaceNudge(palette, texture, { trends, ownRefs = [] } = {}) {
  const refs = [...ownRefs, ...marketRefs(trends)];
  if (!refs.length) return null;
  let best = null;
  for (const p of palette) {
    const { pressure } = collisionRead({ color: p.hex, texture }, refs);
    if (!best || pressure < best.pressure) best = { ...p, pressure };
  }
  return best && { name: best.name, hex: best.hex, score: Math.round(100 * (1 - best.pressure)) };
}

export const BAND_COPY = {
  open: "differentiated from your line and the trend cone",
  adjacent: "related to existing work but with its own angle",
  crowded: "close to what already exists or what everyone is chasing",
};
