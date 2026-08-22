// Server reason codes -> Spanish. The frontend owns the wording.
//
// Owner, 2026-07-25: "translate server policy/calibration reasons through
// stable error codes rather than displaying raw English." What happened was
// small and structural: `brand_fit_ranker.evaluate()` returned an English
// sentence, `Calibration.jsx` rendered `cal.reason` verbatim, and an English
// line landed on a client-facing screen. Two strings were patched to Spanish.
// That fixed those two strings and left the shape that produced them — an
// engine writing UI copy — completely intact.
//
// So the engine now emits both halves (`atelier/reason_codes.py`):
//
//     reason:      "faltan comparaciones: 7 de 20 necesarias para calibrar"
//     reason_code: { code: "needs_more_judgments", params: { have: 7, need: 20 } }
//
// and this module is the only place the Spanish lives. The pairing rule on the
// wire: a human string in field `X` has its machine form in `X_code`.
//
// Why the server string is still read at all: it is the FALLBACK, and the
// fallback is the load-bearing part. Codes are added by the engine on its own
// schedule, and stored rows (`Recommendation.evidence`, `gate_result`) are
// append-only — anything minted before a code existed has only the sentence.
// An unknown code must therefore degrade to the server's words, and when even
// those are missing, to a visible line that names the code. It must never
// degrade to blank: a missing explanation on a gate that BLOCKED something
// reads as "no reason", which is the one thing this product refuses to say.
//
// Dependency-free and pure on purpose, so `node --test` covers it directly.

/** Shown only when there is neither a known code nor a server string. */
export const NO_REASON_TEXT = "El motor no informó un motivo.";

const LEVEL = { alta: "alta", media: "media", baja: "baja" };

// A param that must be a number is either a number or absent — an absent one
// makes the formatter return null, and the caller falls back to the server's
// own sentence rather than rendering "undefined".
const num = (v) => {
  // `Number(null)` is 0 and `Number("")` is 0, both finite — so the comment
  // above was describing an intent the code did not have: an absent param
  // became a confident ZERO and rendered "0 de 20 necesarias" on a calibration
  // screen. Absent is now rejected before coercion, and the caller falls back to
  // the engine's own sentence, which is what the fallback chain is for.
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// code -> (params) => string | null. Returning null means "I cannot say this
// properly", never "say nothing": the fallback chain takes over.
const REASONS = {
  // --- calibración (Bradley-Terry, atelier/brand_fit_ranker.py) ------------
  needs_more_judgments: ({ have, need }) => {
    const h = num(have); const n = num(need);
    return h === null || n === null ? null
      : `Faltan comparaciones: ${h} de ${n} para calibrar.`;
  },
  holdout_split_empty: ({ have }) => {
    const h = num(have);
    return h === null ? null
      : `La partición de validación quedó vacía de un lado (${plural(h, "juicio", "juicios")}).`;
  },
  // Deliberately NOT "necesitás más juicios": the answers so far contradict
  // each other, and more of the same will not calibrate anything.
  accuracy_below_baseline: ({ have, accuracy_pct }) => {
    const h = num(have); const a = num(accuracy_pct);
    return h === null || a === null ? null
      : `Con ${plural(h, "juicio", "juicios")} la precisión sobre datos retenidos es ${Math.round(a)}% y el azar es 50%: las respuestas se contradicen entre sí.`;
  },

  // --- trust gates (api/app/gates.py) --------------------------------------
  market_adopters_observed: ({ adopters }) => {
    const a = num(adopters);
    return a === null ? null
      : `${plural(a, "competidor", "competidores")} lo adoptaron (oferta observada).`;
  },
  market_live_trend: () => "Tendencia de una corrida en vivo.",
  market_no_evidence: () =>
    "Sin evidencia de mercado citable — una etiqueta de tendencia no alcanza.",
  brand_fit_unvalidated: () => "Fit de marca sin validar (léxico, no aprendido).",
  brand_fit_on_brand: ({ fit }) => {
    const f = num(fit);
    return f === null ? null : `Fit de marca ${Math.round(f)}/100.`;
  },
  brand_fit_low: ({ fit }) => {
    const f = num(fit);
    return f === null ? null : `Fit de marca bajo (${Math.round(f)}/100).`;
  },
  feasible_own_sales: () => "Ventas propias disponibles para juzgar viabilidad.",
  feasible_no_own_sales: () =>
    "Sin datos de venta propios — no se puede juzgar viabilidad comercial.",
  // `level` is the engine's freshness enum, not display text. An unrecognised
  // level is printed as-is rather than dropped: a new enum value is still more
  // informative than silence.
  confidence_level: ({ level }) =>
    (typeof level === "string" && level ? `Evidencia ${LEVEL[level] || level}.` : null),
  confidence_insufficient_coverage: () => "Cobertura insuficiente.",

  // La quinta puerta (trust-gates-1.1). ⚠ NO dice que el dato sea falso: dice
  // que el motor no pudo comprobarlo, que es lo único honesto que puede
  // afirmar sobre un candidato escrito por quien pregunta. Por eso la palabra
  // es «verificar» y nunca «inventar» — acusar al usuario de mentir sería tan
  // deshonesto como creerle sin mirar.
  evidence_server_owned: () => "Evidencia del servidor (recomendación guardada).",
  evidence_client_supplied: () =>
    "Evidencia enviada por el cliente — el motor no puede verificarla, así que "
    + "las otras puertas no sostienen una recomendación.",

  // --- evidencia de una recomendación (routers/recommendations.py) ---------
  fit_learned_taste: ({ judgments, total_judgments, accuracy_pct }) => {
    const j = num(judgments); const t = num(total_judgments); const a = num(accuracy_pct);
    return j === null || t === null ? null
      : `Preferencia aprendida del equipo — ${plural(j, "comparación", "comparaciones")} de esta prenda, ${plural(t, "juicio", "juicios")} en total`
        + (a === null ? "." : `, precisión retenida ${Math.round(a)}%.`);
  },
  // Una afirmación MÁS DÉBIL que fit_learned_taste, y por eso tiene su propia
  // frase: aquélla dice "el equipo comparó esta prenda", ésta dice "las
  // respuestas del equipo hablan de rasgos que esta prenda comparte". Nadie
  // juzgó este candidato — es de un competidor. No unificar las dos.
  fit_learned_traits: ({ matched, total_judgments, accuracy_pct, test_pairs,
                        above_pct, archive }) => {
    const m = num(matched); const t = num(total_judgments);
    const a = num(accuracy_pct); const p = num(test_pairs);
    const ab = num(above_pct); const ar = num(archive);
    if (m === null || t === null) return null;
    // El número es un PERCENTIL del archivo propio, no una probabilidad contra
    // una prenda media — la frase tiene que decir contra qué se compara.
    const place = ab === null || ar === null ? ""
      : `, por encima del ${Math.round(ab)}% de ${plural(ar, "prenda juzgada", "prendas juzgadas")} propias`;
    return `Gusto aprendido del equipo aplicado a los rasgos de esta prenda — ${plural(m, "rasgo medido en común", "rasgos medidos en común")}${place}, ${plural(t, "juicio", "juicios")} en total`
      + (a === null || p === null ? "."
        : `, precisión retenida ${Math.round(a)}% sobre ${plural(p, "par retenido", "pares retenidos")}.`);
  },
  fit_engine_run: () => "Fit de la última corrida del motor.",
  fit_none: () => "Sin corrida del motor ni gusto calibrado que cubra este candidato.",
  subject_stored_item: () =>
    "Item competidor almacenado — título y categoría del propio registro.",
  subject_client_described: () =>
    "Candidato sin registro propio — descrito por quien pide la recomendación.",
  subject_server_category: () =>
    "Hueco de catálogo — la categoría sale del vocabulario canónico del motor, "
    + "no de lo que pidió el cliente.",
  adopters_distinct_competitors: () =>
    "Competidores distintos en el crawl propio de la marca.",
  freshness_item_age: () => "Antigüedad del propio item competidor.",
  freshness_brand_latest_crawl: () =>
    "Candidato sin item propio — antigüedad del crawl más reciente de la marca.",
  cutoff_newest_source: () => "Fuente más reciente consultada para este juicio.",
  cutoff_no_source: () => "Sin ninguna fuente propia.",
  rec_revoked: () => "Revocada.",
  rec_expired: () => "Vencida.",
  rec_item_gone: () => "El item que la originó ya no está en el crawl.",
  rec_item_recrawled: () => "El item fue vuelto a crawlear después del corte.",

  // --- pool de calibración (routers/fit_judgments.py) ----------------------
  pool_no_garments_with_image: () =>
    "Sin catálogo ni conceptos con imagen — la calibración visual necesita al menos dos prendas con foto.",
  pool_images_missing: ({ excluded }) => {
    const e = num(excluded);
    return e === null ? null
      : `Hay prendas, pero ${e} sin imagen: la calibración visual compara fotos, no títulos.`;
  },

  // --- gusto aprendido aplicado a prendas SIN juzgar (api/app/learned_fit.py)
  // Each of these refuses for a different reason, and the difference is the
  // point: "keep judging" is the right instruction for only one of them.
  taste_graph_disconnected: ({ components }) => {
    const c = num(components);
    return c === null ? null
      : `Hay ${c} grupos de prendas que nunca se compararon entre sí: no existe un orden único que aplicar. Compará una prenda de un grupo contra una del otro.`;
  },
  taste_traits_untestable: ({ decided, need }) => {
    const d = num(decided); const n = num(need);
    return d === null || n === null ? null
      : `Los rasgos solo pudieron decidir ${d} de los pares retenidos y hacen falta ${n}: todavía no hay con qué medirlos.`;
  },
  taste_traits_below_baseline: ({ accuracy_pct }) => {
    const a = num(accuracy_pct);
    return a === null ? null
      // The one refusal that more of the same judgments cannot fix, so it says so.
      : `Los rasgos aciertan ${Math.round(a)}% de los pares retenidos y el azar es 50%: lo que el equipo prefiere no se explica por la silueta, la tela ni el color. Más juicios iguales no lo arreglan.`;
  },
  // A decision minted before the reason taxonomy existed (A17.2). Not an
  // error state: it is history, honestly labelled, and it teaches nothing.
  legacy_unspecified: () =>
    "Decisión anterior al vocabulario de motivos — no entrena ningún perfil.",

  taste_no_shared_traits: ({ need }) => {
    const n = num(need);
    return n === null ? null
      : `Ningún rasgo aparece en ${n} prendas juzgadas: cada juicio habla de una prenda, no de un rasgo. Compará prendas que compartan tipo o material.`;
  },
};

/** Every code this app can say in Spanish. Mirrors the engine's ALL_CODES. */
export const KNOWN_CODES = Object.freeze(Object.keys(REASONS).sort());

/** The code inside a `X_code` payload, or null if there isn't a usable one. */
export function reasonCode(coded) {
  if (typeof coded === "string") return coded || null;
  const c = coded && typeof coded === "object" ? coded.code : null;
  return typeof c === "string" && c ? c : null;
}

/**
 * Spanish for one server reason. Never returns an empty string.
 *
 * The chain, in order:
 *   1. a known code with usable params  -> our own wording;
 *   2. anything else, with a server string -> the server string, verbatim;
 *   3. neither -> a line naming the code, so an untranslated code is visible
 *      in the product rather than silently missing (and greppable in a bug
 *      report). Falling through to "" would hide the gap on exactly the
 *      screens where an explanation is the whole point.
 *
 * @param coded    the `X_code` payload ({code, params}), or a bare code string
 * @param fallback the server's own `X` string
 */
export function reasonText(coded, fallback) {
  const code = reasonCode(coded);
  const params = (coded && typeof coded === "object" && coded.params) || {};

  if (code && Object.hasOwn(REASONS, code)) {
    let text = null;
    try {
      text = REASONS[code](params);
    } catch {
      text = null;                 // a malformed payload is a fallback, not a crash
    }
    if (typeof text === "string" && text.trim()) return text;
  }

  const server = typeof fallback === "string" ? fallback.trim() : "";
  if (server) return server;

  return code ? `${NO_REASON_TEXT} (${code})` : NO_REASON_TEXT;
}
