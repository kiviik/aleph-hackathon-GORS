// Maps the engine's run payload (api/app/serializers.build_payload) into the
// shapes the views already render, so live data drops into the same components
// as the demo constants.
//
// Honest-mapping rules: fields the engine really produces (fit, velocity,
// priority, action, rationale, sources, signal counts) are mapped 1:1; purely
// presentational fields (garment, fabric, thumbnail colour) are inferred from
// the trend text; fields the engine does not know (geo, age, resale, price)
// are left undefined so the views fall back to their neutral copy.

// Garment/category inference from trend name + summary.
const GARMENT_RULES = [
  [/knit|rib|gauge|sweater|jumper|cardigan|croch/i, "knit", "Knitwear", "Rib knit"],
  [/denim|jean/i, "trousers", "Denim", "Denim"],
  [/trouser|pant|carpenter|cargo/i, "trousers", "Tailoring", "Twill"],
  [/coat|jacket|chore|puffer|parka|outerwear/i, "coat", "Outerwear", "Twill"],
  [/blazer|suit|tailor/i, "blazer", "Tailoring", "Merino wool"],
  [/skirt/i, "skirt", "Dress", "Tencel"],
  [/dress|slip|bias|gown/i, "dress", "Dress", "Satin"],
  [/tee|t-shirt|shirt|top|blouse/i, "tee", "Knitwear", "Organic cotton"],
];

function inferGarment(text) {
  for (const [re, g, cat, fabric] of GARMENT_RULES) {
    if (re.test(text)) return { g, cat, fabric };
  }
  return { g: "dress", cat: "Emerging", fabric: "Satin" };
}

function inferMood(text) {
  if (/sheer|romantic|bloom|floral|lace|boho/i.test(text)) return "Romantic";
  if (/edit|sculpt|architect/i.test(text)) return "Editorial";
  return "Minimal";
}

function inferGender(text) {
  if (/menswear|\bmen'?s\b/i.test(text)) return "men";
  if (/\bkids?\b|children/i.test(text)) return "kids";
  return "women";
}

// The engine scores momentum (velocity 0-1) but has no trend history yet, so
// it can honestly distinguish "moving" from "early" — never "peaking" or
// "declining". Position within the zone scales with velocity.
//
// "Accelerating" is a claim about change over time, so it may only come from a
// published-date reading. A "collected" velocity is evidence recency/breadth —
// calling that Accelerating was the audit's exact complaint — so those trends
// stay "Emerging" regardless of how high the number is.
function lifecycleFromVelocity(v, basis = "collected") {
  if (basis === "published" && v >= 0.65) {
    return { stage: "Accelerating", pos: Math.min(60, Math.round(33 + 30 * v)) };
  }
  return { stage: "Emerging", pos: Math.max(8, Math.round(30 * v)) };
}

const ACTION_TAG = { test: "make", explore: "test", watch: "watch", pass: "watch" };

export function adaptPayload(payload, history = []) {
  const palette = (payload.dna?.palette || []).map((p) => p.label).filter((h) => /^#/.test(h));
  // Cross-run trend history (own endpoint): real lifecycle beats the
  // single-batch velocity guess whenever an identity exists for the trend.
  const historyByName = new Map(history.map((h) => [h.name.trim().toLowerCase(), h]));

  const trends = (payload.matches || []).map((m, i) => {
    const text = `${m.trend_name} ${m.trend_summary || ""}`;
    const { g, cat, fabric } = inferGarment(text);
    const vel = m.velocity ?? 0;
    const fit = m.fit_score ?? 0;
    const priority = m.priority ?? fit * (0.4 + 0.6 * vel);
    const hist = historyByName.get(m.trend_name.trim().toLowerCase());
    return {
      live: true,
      name: m.trend_name,
      g, cat, fabric,
      mood: inferMood(text),
      gd: inferGender(text),
      tag: ACTION_TAG[m.action] || "watch",
      action: m.action,
      score: Math.round(priority * 100),
      demand: { d: Math.round(vel * 100), f: Math.round(fit * 100), m: Math.round(priority * 100) },
      yoy: `+${Math.round(vel * 100)}`,
      // What the velocity number actually measured (engine velocity_basis):
      // "published" = prevalence change across real publication dates;
      // "collected" = share of signals fetched recently, i.e. evidence
      // recency/breadth, NOT market acceleration (2026-07-21 audit).
      velocityBasis: m.velocity_basis || "collected",
      datedSignals: m.trend_dated_signals ?? 0,
      yoyLabel: m.velocity_basis === "published" ? "cambio vs período previo" : "recencia de evidencia",
      brand: m.action === "test" || m.action === "explore",
      signals: m.trend_signal_count ?? 0,
      matches: (m.evidence || []).length,
      col: palette[i % Math.max(palette.length, 1)] || "#9A968B",
      rationale: m.rationale,
      summary: m.trend_summary,
      sources: m.trend_sources || [],
      evidence: m.evidence || [],
      fitBreakdown: m.fit_breakdown,
      // measured=true only when the stage comes from cross-run trend HISTORY
      // (real longitudinal identity). A single-batch velocity read is a guess —
      // the UI must not attach market-timing promises to it.
      _lc: hist ? { stage: hist.stage, pos: hist.pos, measured: true }
                : { ...lifecycleFromVelocity(vel, m.velocity_basis), measured: false },
      observations: hist?.observations ?? 1,
      history: hist?.series,
    };
  });

  // Aggregate source stats for the Signals header strip.
  const sourceSet = new Set();
  let totalSignals = 0;
  for (const t of trends) {
    t.sources.forEach((s) => sourceSet.add(s));
    totalSignals += t.signals;
  }

  const kw = (list, n = 8) => (list || []).slice(0, n);

  // dna.n_sources is a per-type count map ({pages, posts, images, products});
  // older payloads had a plain number.
  const countSources = (n) =>
    n && typeof n === "object"
      ? Object.values(n).reduce((sum, v) => sum + (Number(v) || 0), 0)
      : Number(n) || 0;

  return {
    brandName: payload.brand,
    mode: payload.mode,
    generatedAt: payload.generated_at,
    // What produced this run (models, prompt/scoring versions, whether image
    // vectors are real pixels). Absent on payloads from before 2026-07-21.
    provenance: payload.provenance || null,
    trends,
    stats: {
      nTrends: payload.n_trends ?? trends.length,
      totalSignals,
      sources: [...sourceSet],
    },
    dna: payload.dna
      ? {
          summary: payload.dna.summary,
          keywords: kw(payload.dna.aesthetic_keywords),
          palette,
          silhouettes: kw(payload.dna.silhouettes),
          materials: kw(payload.dna.materials),
          tone: kw(payload.dna.tone_of_voice),
          priceArchitecture: payload.dna.price_architecture || [],
          nSources: countSources(payload.dna.n_sources),
        }
      : null,
  };
}
