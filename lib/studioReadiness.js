// What the studio may say about generation BEFORE offering a paid button.
//
// The studio has two generation paths and tries them in a fixed order:
// the engine's POST /studio/generate first, then this app's /api/generate.
// They read different environment variables and select providers in opposite
// orders (engine: OpenAI then Gemini; fallback: Google then OpenAI), so
// "is generation available" has never had one answer — and the screen showed
// neither. A user could click "Generar 2 variantes" while the engine held no
// key, watch the request quietly cross to a different provider, and be told
// nothing about either.
//
// ⚠ CONFIGURED IS NOT AVAILABLE. Both readiness payloads report whether a key
// exists, never whether the next call will succeed — quota lives at the
// provider and is only observable by spending a generation. Nothing here may
// grow a field that implies otherwise.

// Which path would actually serve, given the order callGenerate tries them in.
// Null when neither is configured — the only state in which the button must
// be disabled, because it is the only state where nothing can serve.
export function servingPath(engine, fallback) {
  if (engine?.configured) return "engine";
  if (fallback?.configured) return "fallback";
  return null;
}

// One readiness object describing the path that would serve.
//
// `unknown` is a THIRD state and is not `no`: both lookups return null when
// they fail, and a screen that renders a failed lookup as "sin proveedor"
// tells the user their deployment is broken when the truth is that we could
// not ask. Missing stays missing.
export function composeReadiness(engine, fallback) {
  if (engine == null && fallback == null) {
    return { state: "unknown", path: null, provider: null, model: null,
             supportsReferences: null, maxReferences: null, costKnown: false,
             quality: [], reason: null };
  }
  const path = servingPath(engine, fallback);
  if (!path) {
    // ⚠ ONE SIDE SILENT IS NOT BOTH SIDES EMPTY. Caught in the browser on
    // 2026-08-14: the engine 404'd (the running process predated the route),
    // so its lookup returned null, the Next fallback honestly said no_key, and
    // this branch printed "Sin clave de imágenes — la generación no está
    // disponible" over a box that was holding an OpenAI key the whole time.
    // Only both paths ANSWERING no is "unconfigured"; a silent path is unknown.
    if (engine == null || fallback == null) {
      return { state: "unknown", path: null, provider: null, model: null,
               supportsReferences: null, maxReferences: null, costKnown: false,
               quality: [], reason: null };
    }
    return { state: "unconfigured", path: null, provider: null, model: null,
             supportsReferences: false, maxReferences: 0, costKnown: false,
             quality: [], reason: engine?.unavailable_reason
                              || fallback?.unavailable_reason || "no_key" };
  }
  const r = path === "engine" ? engine : fallback;
  return {
    state: "configured",
    path,
    // The OTHER model the studio depends on: the one that reads brand material
    // and writes the analysis a prompt is built from. Only the engine reports
    // it — the browser fallback has no reasoning layer — and it is passed
    // through verbatim rather than re-derived, because its own module claimed
    // "Claude / claude-sonnet-4-6" for months while calling gpt-4o-mini.
    reasoning: engine?.reasoning || null,
    provider: r.provider || null,
    model: r.model || null,
    supportsReferences: r.supports_references ?? null,
    maxReferences: r.max_references ?? null,
    // Only the engine states prices; the fallback reports cost_known: false
    // rather than repeating a table it does not own.
    costKnown: !!r.cost_known,
    quality: Array.isArray(r.quality) ? r.quality : [],
    reason: null,
  };
}

// Per-image cost in cents for a quality tier, or null when unknown.
//
// ⚠ This replaces `const COST = {draft: 1, final: 6}` in the browser. That
// constant was the gpt-image-1 list price and was charged to whatever served
// the request — including Gemini, which has no quality tier at all, and the
// fallback route, whose pricing was never established. A wrong number in the
// ledger is worse than no number, because only one of them is arguable.
export function costCentsFor(readiness, quality) {
  if (!readiness?.costKnown) return null;
  const tier = readiness.quality.find((t) => t.tier === quality);
  return tier && Number.isFinite(tier.cost_cents) ? tier.cost_cents : null;
}

// Display strings. Spanish, matching the product.
//
// ⚠ These go in a TOOLBAR, so they are short by contract. The first version
// put "costo no declarado" inside the quality pills and blew the row apart —
// the honest answer was right and the place to put it was wrong. Detail
// belongs in the tooltip; the chip says only what fits.
export function readinessLabel(readiness) {
  if (!readiness || readiness.state === "unknown") return "Proveedor sin confirmar";
  if (readiness.state === "unconfigured") return "Sin proveedor de imágenes";
  return `${readiness.provider} · ${readiness.path === "engine" ? "motor" : "respaldo"}`;
}

// The long form, for a tooltip or a panel — never for a pill.
export function readinessDetail(readiness) {
  if (!readiness || readiness.state === "unknown") {
    return "No pude preguntarle al motor ni al respaldo si hay un proveedor configurado. No es lo mismo que no haberlo.";
  }
  if (readiness.state === "unconfigured") {
    return "Ni el motor ni el respaldo tienen clave de imágenes: generar va a fallar.";
  }
  const where = readiness.path === "engine" ? "el motor" : "el respaldo del navegador";
  const refs = readiness.supportsReferences
    ? `hasta ${readiness.maxReferences} referencias` : "sin referencias";
  const r = readiness.reasoning;
  const analysis = r
    ? ` · Análisis de marca: ${r.heuristic
        ? "heurística determinística, sin modelo"
        : `${r.provider} ${r.model}`}`
    : "";
  return `Las próximas generaciones las sirve ${readiness.provider} (${readiness.model || "modelo sin declarar"}) por ${where} · ${refs}.${analysis} `
    + "⚠ Que haya clave no garantiza cupo: eso sólo se sabe generando.";
}

// Short cost for a pill: the price when known, nothing at all when not.
// An empty string is deliberate — a tier with no known price shows its NAME,
// and the reason lives in the tooltip.
export function costChip(readiness, quality) {
  const cents = costCentsFor(readiness, quality);
  return cents == null ? "" : `~US$${(cents / 100).toFixed(2)}`;
}

export function costLabel(readiness, quality) {
  const cents = costCentsFor(readiness, quality);
  if (cents == null) return "costo no declarado";
  return `≈ US$${(cents / 100).toFixed(2)}/imagen`;
}
