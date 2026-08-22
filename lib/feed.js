// Proposals feed: one candidate per REAL trend. The card shows the trend as
// the engine found it — its real name, summary, fit rationale, sources and
// evidence URLs — plus Atelier's angle for this brand: a verdict, colorway
// suggestions from the brand palette (scored for differentiation), a buy
// window against the brand's lead time, and an honest test quantity.
//
// Nothing here invents market data. Garment/fabric inference is labeled a
// suggestion; colours come from the brand's own palette; quantities are
// test->read->chase bands, never forecasts.
import { CATALOG_KEYS, TRENDS, colName, lifecycleOf } from "./signals";
import { ownRefsFromDna, scoreVariation, whitespaceNudge } from "./differentiation";
import { canonicalDecisionRows } from "./decisionLedger.mjs";

/* ---- Six-dimension readout (spec 2026-07-19): absolute certainty like
   "100 ADN" is banned. Every card shows six separate dimensions, each with
   its real basis in one phrase. Shared with lib/proposals.js. ---- */

export function fmtShortDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

// Frescura de datos — what this dimension actually measures. It was labeled
// "Confianza", but fresh evidence can still be incomplete or biased; calling
// recency "confidence" oversells it (2026-07-21 audit). Real confidence needs
// coverage, source agreement and calibration — none exist yet.
export function confidenceDim(dateStr, live) {
  const days = daysSince(dateStr);
  if (days == null) {
    return { k: "Frescura de datos", level: "baja", note: live ? "sin fecha en la evidencia" : "sin corrida live — datos demo" };
  }
  const level = days <= 3 ? "alta" : days <= 10 ? "media" : "baja";
  return { k: "Frescura de datos", level, note: `evidencia de hace ${days} día${days === 1 ? "" : "s"}` };
}

// Fit de marca: the engine score, 0–100, ALWAYS qualified — never bare, and
// never presented as 100-capped certainty: a saturated score is the top of
// the engine's scale, not a proven fact.
export function brandFitDim(fit, hasEngineFit) {
  if (!hasEngineFit) return { k: "Fit de marca", level: "estimado", note: "estimado — sin corrida live" };
  const level = fit >= 75 ? "alto" : fit >= 50 ? "medio" : "bajo";
  const note = fit >= 100
    ? "tope de la escala del engine — no es certeza (sin validar con resultados)"
    : `${fit}/100 según el engine (sin validar con resultados)`;
  return { k: "Fit de marca", level, note };
}

// Timing from the buy-window logic, in plain words.
export function timingDim(win) {
  return { k: "Timing", level: win.ok ? "en ventana" : "fuera", note: win.note };
}

// Studio texture ids (what the differentiation heuristic understands) from
// the trend's fabric family.
const FABRIC_TEXTURE = {
  "Rib knit": "stripe", Linen: "linen", Twill: "twill", Denim: "twill",
  "Merino wool": "herringbone", Satin: "solid", Tencel: "solid",
  "Organic cotton": "solid", "Technical shell": "twill",
};

// Buy window: can this brand still catch this trend given its lead time?
export function buyWindow(stage, leadWeeks) {
  if (stage === "Declining") return { ok: false, note: "pasó el pico — no entrar" };
  if (stage === "Peaking") {
    return leadWeeks <= 6
      ? { ok: true, note: "en el pico — viable solo porque tu lead time es corto" }
      : { ok: false, note: `en el pico — con ${leadWeeks} semanas llegás tarde` };
  }
  if (stage === "Accelerating") {
    return leadWeeks <= 16
      ? { ok: true, note: `subiendo — con ${leadWeeks} semanas llegás en ventana` }
      : { ok: false, note: "subiendo, pero tu lead time probablemente llegue pasado el pico" };
  }
  return { ok: true, note: leadWeeks >= 12 ? "señal temprana — tu lead time llega justo cuando sube" : "temprano — test chico ahora, profundidad después" };
}

// Honest test quantity: a starting band for a net-new design, sized by
// conviction (fit × momentum), never a demand forecast.
export function testQuantity(fit, stage) {
  const conviction = fit >= 70 && stage !== "Emerging" ? "high" : fit >= 55 ? "medium" : "low";
  return {
    high: { range: "60–90 u.", why: "fit alto en tendencia en movimiento" },
    medium: { range: "40–60 u.", why: "fit sólido — probala antes de profundizar" },
    low: { range: "25–40 u.", why: "exploratoria — la lectura viable más chica" },
  }[conviction];
}

export function verdictFor(action, window) {
  if (!window.ok) return { label: "Fuera de ventana", tone: "hold" };
  if (action === "test") return { label: "Hacela", tone: "make" };
  if (action === "explore") return { label: "Explorala", tone: "explore" };
  return { label: "En el radar", tone: "watch" };
}

const GARMENT_LABEL = {
  knit: "tejido", dress: "vestido", trousers: "pantalón", coat: "abrigo",
  blazer: "blazer", skirt: "falda", tee: "top",
};

export function buildCandidates({ trends, dna, leadWeeks = 8, items, catalog,
                                  opportunities = null, generatedAt } = {}) {
  const pool = trends && trends.length ? trends : TRENDS;
  const liveTrends = trends && trends.length ? trends : null;
  // No invented house palette: four hardcoded hexes used to stand in for any
  // brand without DNA, and every colourway suggestion below was built on them
  // (2026-07-24 audit). With no DNA there are no colourway suggestions.
  const palette = dna?.palette?.length ? dna.palette : [];
  const ownRefs = ownRefsFromDna(dna);

  // Real whitespace so the "hueco de surtido" dimension cites actual counts —
  // and now the SAME counts the Oportunidades screen shows.
  //
  // ⚠ THIS WAS THE SECOND TRUTH (owner review 2026-08-11). It called
  // `findWhitespace` with the browser's own 12-bucket rule table, and then
  // mapped each trend to a bucket with that same table, so one market gap could
  // read differently depending on which screen you stood on.
  //
  // Both halves come from `GET /brands/{id}/opportunities` now: the gaps, and
  // `trend_categories` — the ENGINE's resolution of a trend name to a canonical
  // bucket. This file looks up a name it was given and classifies nothing.
  //
  // ⚠ IT INHERITS THE WITHHOLDING, which is the safety property rather than a
  // side effect. A category the engine refuses for contaminated evidence is
  // absent from `opportunities`, so no gap can be asserted for it here either.
  // Live Complot: six of twelve trends resolve, and they land in Sweaters and
  // Camperas — both withheld. This file used to assert those gaps anyway.
  const wsByCat = new Map();
  for (const o of opportunities?.opportunities || []) wsByCat.set(o.category, o);
  const trendCategories = opportunities?.trend_categories || {};

  const out = pool.map((t) => {
    const texture = FABRIC_TEXTURE[t.fabric] || "solid";
    const lc = lifecycleOf(t);
    const fit = t.demand?.f ?? 50;
    const window = buyWindow(lc.stage, leadWeeks);

    // Colourway suggestions from the brand's own palette: the closest-to-core
    // colour and the most-open one, each scored against the brand's DNA refs +
    // the trend cone. Empty when the brand has no palette of its own.
    const core = t.col || palette[0] ? { hex: t.col || palette[0], role: "core" } : null;
    const nudge = palette.length
      ? whitespaceNudge(palette.map((h) => ({ name: colName(h), hex: h })), texture,
                        { trends: liveTrends, ownRefs })
      : null;
    const colorways = [core, nudge && nudge.hex !== core?.hex ? { hex: nudge.hex, role: "whitespace" } : null]
      .filter(Boolean)
      .map((c) => {
        const d = scoreVariation({ color: c.hex, texture }, { trends: liveTrends, ownRefs });
        return { ...c, name: colName(c.hex), differentiation: d.score, band: d.band, nearest: d.nearest };
      });
    // null when nothing was measurable — never -Infinity from an empty max().
    const measured = colorways.map((c) => c.differentiation).filter((n) => typeof n === "number");
    const bestDiff = measured.length ? Math.max(...measured) : null;

    // Real, linkable citations only — never .test fixtures.
    const urls = (t.evidence || []).filter((u) => /^https?:\/\//.test(u) && !u.includes(".test"));

    // ---- Six dimensions (each: level + the real basis, one phrase) ----
    const gap = !CATALOG_KEYS.has(t.g + "|" + t.cat);
    const signals = t.signals ?? 0;
    const srcCount = (t.sources || []).length;
    // The engine's own trend -> bucket answer, not the browser's. A trend the
    // canon cannot place has no entry, and the dimension falls back to the
    // catalogue-key heuristic below exactly as it did on a lookup miss before.
    const wsHit = wsByCat.get(trendCategories[t.name]);
    const dims = [
      {
        k: "Evidencia de mercado",
        level: signals >= 5 ? "alta" : signals >= 2 ? "media" : "limitada",
        // "reales" ONLY on a live run — in demo the counts come from bundled
        // constants, so calling them real contradicts the "datos demo" lineage.
        note: signals > 0
          ? `${signals} señal${signals === 1 ? "" : "es"} ${liveTrends ? (signals === 1 ? "real" : "reales") : "de muestra"}${srcCount ? ` de ${srcCount} fuente${srcCount === 1 ? "" : "s"} (${(t.sources || []).slice(0, 2).join(", ")})` : ""}`
          : "limitada — sin señales citables en esta corrida",
      },
      wsHit
        ? { k: "Hueco de surtido", level: wsHit.kind === "sin-cobertura" ? "alto" : "medio", note: wsHit.title }
        : {
            k: "Hueco de surtido",
            level: gap ? "medio" : "bajo",
            note: gap ? "categoría nueva para tu línea — sin conteo de rivales acá" : "ya cubrís esta categoría en tu línea",
          },
      brandFitDim(fit, !!liveTrends),
      { k: "Fit comercial", level: "s/datos", note: "sin datos de venta propios todavía" },
      timingDim(window),
      confidenceDim(liveTrends ? generatedAt : null, !!liveTrends),
    ];
    const lineage = liveTrends && fmtShortDate(generatedAt) ? `fuente: corrida ${fmtShortDate(generatedAt)}` : "fuente: datos demo — sin corrida live";

    return {
      dims,
      lineage,
      key: t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      trend: t.name,
      summary: t.summary,          // real engine output
      rationale: t.rationale,      // real fit reasoning
      action: t.action || (t.tag === "make" ? "test" : t.tag === "test" ? "explore" : "watch"),
      live: !!t.live,
      fit,
      // NOT market adoption: the engine's `d` is the share of signals collected
      // recently, and live signals are stamped at collection time — so this is
      // evidence recency/breadth (2026-07-21 audit). UI labels it "recencia".
      momentum: t.demand?.d ?? t.score ?? 0,
      differentiation: bestDiff,
      colorways,
      stage: lc.stage,
      window,
      verdict: verdictFor(t.action || "explore", window),
      gap,
      suggestion: { g: t.g, label: GARMENT_LABEL[t.g] || t.g, cat: t.cat, fabric: t.fabric, mood: t.mood, gd: t.gd },
      evidence: { signals: t.signals ?? 0, sources: (t.sources || []).slice(0, 4), urls: urls.slice(0, 4) },
      qty: testQuantity(fit, lc.stage),
    };
  });

  out.sort((a, b) => {
    if (a.window.ok !== b.window.ok) return a.window.ok ? -1 : 1;
    const pa = (a.gap ? 12 : 0) + a.fit * 0.55 + a.momentum * 0.3 + a.differentiation * 0.15;
    const pb = (b.gap ? 12 : 0) + b.fit * 0.55 + b.momentum * 0.3 + b.differentiation * 0.15;
    return pb - pa;
  });
  return out;
}

// What the taste log says so far — derived fresh from the raw decisions every
// time, so it improves whenever the decisions do.
export function tasteSummary(decisions) {
  const canonical = canonicalDecisionRows(decisions);
  const accepts = canonical.filter((d) => d.decision === "accept");
  const rejects = canonical.filter((d) => d.decision === "reject");
  const count = (list, get) => {
    const m = new Map();
    for (const d of list) {
      const v = get(d);
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  };
  return {
    total: canonical.length,
    accepts: accepts.length,
    rejects: rejects.length,
    likes: {
      cats: count(accepts, (d) => d.candidate?.suggestion?.cat || d.candidate?.cat),
      stages: count(accepts, (d) => d.candidate?.stage),
    },
    dislikes: {
      // ⚠ ONLY taste-scoped rejections speak here. `learns_taste` is computed
      // by the ENGINE (one place owns the policy); rows without it — legacy,
      // commercial, operational — are counted but never shown as taste.
      // Before this filter, "no es comercial" appeared in "tu perfil de
      // gusto": the range plan's arithmetic presented as an aesthetic.
      reasons: count(rejects.filter((d) => d.learns_taste === true),
                     (d) => d.reason),
    },
    // Rejections that deliberately taught the profile nothing — surfaced so
    // the log can say "N decisiones no tocaron tu gusto" instead of silently
    // shrinking.
    untasted: rejects.filter((d) => d.learns_taste !== true).length,
  };
}

// Reject reasons, now CODED (A17.2). Each carries the engine's code and the
// consequence the user is shown BEFORE committing — because "margin
// impossible" must not teach Atelier that the visuals are disliked, and the
// only honest way to hold that rule is to say, per reason, what will be
// learned. The engine derives the real scope server-side from the code; these
// `learns` strings are display, mirrored by tests against the engine table.
export const REJECT_REASONS = [
  { code: "off_brand", label: "off-brand",
    learns: "Enseña tu gusto de marca", taste: true },
  { code: "too_familiar", label: "muy parecido a lo que ya hay",
    learns: "Enseña gusto y surtido de esta colección", taste: true },
  { code: "wrong_season", label: "mal timing",
    learns: "Sólo calendario — no toca tu perfil de gusto", taste: false },
  { code: "not_commercial", label: "no es comercial",
    learns: "Sólo política comercial — no toca tu perfil de gusto", taste: false },
  { code: "margin_impossible", label: "el margen no cierra",
    learns: "Sólo política comercial — no toca tu perfil de gusto", taste: false },
  { code: "insufficient_evidence", label: "falta evidencia",
    learns: "No enseña nada — es sobre los datos, no sobre la prenda", taste: false },
];
