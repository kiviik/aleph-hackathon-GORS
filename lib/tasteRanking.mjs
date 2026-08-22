// Learned taste, applied to the Studio — and the sentence it says when it can't.
//
// The gap this closes (owner, 2026-07-25): *"learned visual taste is collected,
// but does not yet visibly steer Studio generation or ranking."* Both halves of
// that sentence were true. Designers have been answering "which of these two is
// more us" since 07-21, a Bradley-Terry order is learned from it and gated
// behind a held-out split — and Studio ordered its concepts by matrix position,
// by a differentiation heuristic, or by a lexical DNA-affinity score. None of
// those is the team's taste.
//
// WHERE THE SCORING IS. Not here. `POST /brands/{id}/fit/taste-rank` normalises
// the vocabulary and applies the learned weights, because the engine's standing
// invariant is that evidence is server-owned: this app may say what a concept
// IS (its silhouette, its fabric, its colourway) and may not say how good it is.
// So this module does three things that are genuinely the client's:
//
//   1. DESCRIBE — turn an exploration concept or a board garment into the
//      {kind, label, traits} the engine asks for.
//   2. ORDER — apply the scores the engine returned, keeping unscored items
//      visible instead of sinking them.
//   3. SAY IT — every sentence the screens print about calibration lives here,
//      so the two surfaces cannot describe the same state differently and so
//      the wording is testable without a browser.
//
// THE RULE THAT MATTERS. With zero judgments recorded — which is the live state
// of this product right now, 36 real garments in the pool and nobody has
// compared any of them — `applied` is false, the list stays in its ordinary
// order, and the screen says so with the number of comparisons still missing
// and a route to the calibration screen. An uncalibrated ordering is NEVER
// presented as a taste judgment. When it IS calibrated, the evidence is named
// (how many comparisons, held-out accuracy, how many traits over how many
// garments) rather than printed as a bare score.
// Relative, not `@/`: this module is pure and must stay runnable by
// `node --test` with no loader, exactly like `reasons.mjs` itself.
import { reasonText } from "./reasons.mjs";

/** The dimension that answers "is this us?" — `fit_judgments.DIMENSIONS`. */
export const STUDIO_DIMENSION = "creative";
export const STUDIO_DIMENSION_QUESTION = "¿Cuál es más de la marca?";

// MOVED to `lib/reasons.mjs` (2026-07-25), now that the parallel session that
// owned it has finished — so the cross-repo test which fails on any engine code
// with no Spanish here actually covers these four. Kept as a local fallback for
// exactly one case: a client running against an engine older than the move,
// whose payload has the code but whose vocabulary file does not.
const TASTE_REASONS = {
  taste_graph_disconnected: ({ components }) =>
    `Hay ${components} grupos de prendas que nunca se compararon entre sí: no existe un orden único que aplicar. Compará una prenda de un grupo contra una del otro.`,
  taste_traits_untestable: ({ decided, need }) =>
    `Los rasgos solo pudieron decidir ${decided} de los pares retenidos y hacen falta ${need}: todavía no hay con qué medirlos.`,
  taste_traits_below_baseline: ({ accuracy_pct }) =>
    `Los rasgos aciertan ${Math.round(accuracy_pct)}% de los pares retenidos y el azar es 50%: lo que el equipo prefiere no se explica por la silueta, la tela ni el color. Más juicios iguales no lo arreglan.`,
  taste_no_shared_traits: ({ need }) =>
    `Ningún rasgo aparece en ${need} prendas juzgadas: cada juicio habla de una prenda, no de un rasgo. Compará prendas que compartan tipo o material.`,
};

/** The reason, in our words, whatever the engine happened to send. */
export function tasteReason(profile) {
  if (!profile) return "El motor no respondió con el estado de calibración.";
  const code = profile.reason_code?.code;
  const mine = TASTE_REASONS[code];
  const own = mine ? mine(profile.reason_code?.params || {}) : null;
  // Known-to-reasons.mjs codes (needs_more_judgments, accuracy_below_baseline)
  // win; ours fill the gap; the server string is the floor. Never blank.
  return reasonText(profile.reason_code, own || profile.reason || "");
}

// --- 1. describing a candidate ---------------------------------------------
// `kind` is the garment's category and `traits` is everything else it declares.
// Deliberately raw: no normalising, no stemming, no stopwords here. The engine
// does all of that for both sides of the comparison, which is the only way the
// vocabulary of a judged archive piece and the vocabulary of a concept invented
// ninety seconds ago can be the same vocabulary.

/** An Explorar matrix concept -> the engine's candidate shape. */
export function conceptCandidate(concept) {
  const combo = concept?.combo || {};
  return {
    id: String(concept?.id ?? ""),
    kind: combo.silueta?.name || null,
    label: [combo.silueta?.name, combo.color?.name].filter(Boolean).join(" ") || null,
    traits: [
      combo.tejido?.name, combo.tejido?.comp, combo.color?.name,
      combo.detalle, combo.fit,
    ].filter(Boolean).map(String),
  };
}

/** A collection-board garment -> the same shape. */
export function itemCandidate(item, fabric) {
  return {
    id: String(item?.id ?? ""),
    kind: item?.silhouette || null,
    label: item?.name || item?.silhouette || null,
    traits: [fabric?.name || item?.fabricName, fabric?.comp, item?.nota]
      .filter(Boolean).map(String),
  };
}

// --- the two engine calls ----------------------------------------------------
// `request(path, init)` is injected rather than imported so this module stays
// pure and `node --test` can drive both calls without a browser or a server.
// It resolves to parsed JSON, or null when the engine is unreachable — and a
// null answer must reach `tasteStatus` as null, never as an empty profile: "the
// engine did not answer" and "your team has judged nothing" are different
// states and a designer is owed the difference.

/** `MAX_RANK_CANDIDATES` in the router. Kept in step so a long board is cut
 *  here, visibly, instead of being 422'd as a whole. */
export const MAX_RANK_CANDIDATES = 400;

export async function fetchTasteProfile(request, dimension = STUDIO_DIMENSION) {
  try {
    return await request(`/fit/taste-profile?dimension=${dimension}`);
  } catch {
    return null;
  }
}

export async function fetchTasteScores(request, candidates,
                                       dimension = STUDIO_DIMENSION) {
  const list = (candidates || []).filter((c) => c && c.id);
  if (!list.length) return null;
  try {
    return await request("/fit/taste-rank", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dimension, candidates: list.slice(0, MAX_RANK_CANDIDATES),
      }),
    });
  } catch {
    return null;
  }
}

// --- 2. ordering -------------------------------------------------------------

/** {id -> {score, matched}} from a taste-rank response. */
export function scoreIndex(response) {
  const out = new Map();
  if (!response?.calibrated) return out;      // no scores exist to index
  for (const s of response.scores || []) out.set(String(s.id), s);
  return out;
}

/**
 * Order a list by learned taste, or leave it exactly as it was.
 *
 * Two properties this has to have, and both are about honesty rather than
 * sorting. First, `applied: false` returns the ORIGINAL array — not a copy in
 * a different order, not a stable sort by a null score, the same order the
 * screen would have shown anyway, so an uncalibrated screen is provably
 * unchanged. Second, an item the profile cannot score keeps its relative place
 * at the END rather than being ranked last: "we have no measurement of this"
 * and "the team likes this least" are different statements and the screen must
 * be able to say which one it means.
 */
export function orderByTaste(list, scores, getId = (x) => x.id) {
  const items = list || [];
  if (!scores || !scores.size) {
    return { ordered: items, applied: false, ranked: 0, unranked: items.length };
  }
  const decorated = items.map((item, index) => {
    const hit = scores.get(String(getId(item)));
    const score = hit && typeof hit.score === "number" ? hit.score : null;
    return { item, index, score, matched: hit?.matched || [] };
  });
  const ranked = decorated.filter((d) => d.score !== null);
  const unranked = decorated.filter((d) => d.score === null);
  // Score first, original position as the tiebreak: two concepts with identical
  // traits have identical scores, and a run must not shuffle between renders.
  ranked.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return {
    ordered: [...ranked, ...unranked].map((d) => d.item),
    applied: ranked.length > 0,
    ranked: ranked.length,
    unranked: unranked.length,
  };
}

/** The best `n` scored items — the curation half. Never returns unscored ones. */
export function topByTaste(list, scores, n, getId = (x) => x.id) {
  if (!scores || !scores.size) return [];
  const scored = (list || [])
    .map((item, index) => ({ item, index, hit: scores.get(String(getId(item))) }))
    .filter((d) => d.hit && typeof d.hit.score === "number");
  scored.sort((a, b) => (b.hit.score - a.hit.score) || (a.index - b.index));
  return scored.slice(0, Math.max(0, n)).map((d) => d.item);
}

// --- 3. saying it ------------------------------------------------------------

const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The banner, in both states. `tone` is "on" | "off" so a screen cannot style
 * an uncalibrated state as if it were a result.
 */
export function tasteStatus(profile) {
  if (!profile) {
    return {
      applied: false, tone: "off",
      headline: "Gusto aprendido: sin respuesta del motor",
      detail: "No pudimos leer el estado de calibración: ves el orden de siempre, sin criterio de gusto.",
      cta: null,
    };
  }
  if (!profile.calibrated) {
    const missing = profile.missing_judgments || 0;
    return {
      applied: false, tone: "off",
      headline: "El gusto aprendido todavía no ordena esta pantalla",
      detail: `${tasteReason(profile)} Mientras tanto ves el orden de siempre, sin criterio de gusto.`,
      cta: {
        view: "calibration",
        label: missing > 0
          ? `Calibrar — ${missing === 1 ? "falta 1 comparación"
                                        : `faltan ${missing} comparaciones`}`
          : "Ir a calibración",
      },
      // The pool has garments and nobody has compared them: the one number a
      // designer can act on.
      missing,
      dimension: profile.dimension || STUDIO_DIMENSION,
    };
  }
  const terms = profile.terms || [];
  return {
    applied: true, tone: "on",
    headline: "Ordenado por el gusto aprendido de tu equipo",
    // Evidence, not a score: how much was compared, how well the traits
    // predicted comparisons they had not seen, and how wide the measurement is.
    detail: `${plural(profile.n_judgments, "comparación", "comparaciones")} del equipo · `
      + `${pct(profile.accuracy)} de acierto sobre ${plural(profile.n_test || 0, "par retenido", "pares retenidos")} · `
      + `${plural(terms.length, "rasgo medido", "rasgos medidos")} en ${plural(profile.garments || 0, "prenda juzgada", "prendas juzgadas")}`,
    cta: { view: "calibration", label: "Ver la calibración" },
    dimension: profile.dimension || STUDIO_DIMENSION,
  };
}

/** What the ordering actually reached, once a list has been through it. */
export function coverageLine({ ranked, unranked }) {
  const total = (ranked || 0) + (unranked || 0);
  if (!total) return "";
  if (!unranked) return `${ranked} de ${total} ordenados por rasgos medidos.`;
  return `${ranked} de ${total} ordenados por rasgos medidos; `
    + `${unranked} sin rasgos que el equipo haya comparado — van al final, sin puntaje.`;
}

/** The traits that carried one concept's position, for its tooltip. */
export function matchedSummary(matched) {
  const names = (matched || []).map((m) => m.label || m.term).filter(Boolean);
  if (!names.length) return "sin rasgos medidos por el equipo";
  return `rasgos medidos: ${names.slice(0, 6).join(", ")}`;
}

/** The strongest traits, for the "what your team likes" readout. */
export function topTerms(profile, n = 4) {
  return (profile?.terms || [])
    .filter((t) => t.above_average)
    .slice(0, n);
}
