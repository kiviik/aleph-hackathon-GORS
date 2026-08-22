// The trust-and-honesty layer (TRUST-ARCHITECTURE.md §5, §8, §11).
//
// §5 — signal types: every recommendation dimension declares which of five
//   things it measures, so a supply number can never masquerade as demand.
// §8 — four gates + abstain: a product is only a *production* recommendation if
//   it clears market-evidence, brand-relevance, commercial-feasibility and
//   decision-confidence. Missing a gate -> "directional, not recommendable".
// §11 — trust record: the full evaluable record, honest about what's unknown.
//
// The load-bearing honesty here: with NO first-party sales, the
// commercial-feasibility gate CANNOT pass — so today the system abstains from
// production recommendations and offers directional reads instead. That is the
// correct behaviour, not a bug.

export const SIGNAL_TYPES = {
  supply: { label: "oferta", tone: "supply", help: "lo que las marcas publican" },
  attention: { label: "atención", tone: "attention", help: "vistas / guardados / búsquedas" },
  demand: { label: "demanda", tone: "demand", help: "lo que la gente compra" },
  satisfaction: { label: "satisfacción", tone: "satisfaction", help: "lo que conservan vs devuelven" },
  opportunity: { label: "oportunidad", tone: "opportunity", help: "relevancia para esta marca" },
  meta: { label: "cobertura", tone: "meta", help: "calidad y frescura del dato" },
};

// Which of the five each proposal dimension actually measures. Grounded in the
// crawl = supply; brand relevance = opportunity; commercial = demand (but we
// have no demand data yet — see gates); confidence = meta.
export const DIM_SIGNAL = {
  "Evidencia de mercado": "supply",
  "Hueco de surtido": "supply",
  "Fit de marca": "opportunity",
  "Fit comercial": "demand",
  "Timing": "supply",
  "Frescura de datos": "meta",
  "Confianza": "meta",
};

export const signalOf = (dimKey) => SIGNAL_TYPES[DIM_SIGNAL[dimKey] || "supply"];

// ---- §8 four gates --------------------------------------------------------
// Each gate returns { pass:boolean, why:string }. A gate we cannot yet
// evaluate (no data) is a FAIL with an honest reason — never a silent pass.
export function computeGates(p) {
  const dimBy = Object.fromEntries((p.dims || []).map((d) => [d.k, d]));

  // Market evidence: real observed competitor adoption OR a LIVE-run trend —
  // never a bare trend string. A trend label is not evidence. Full source-backed
  // gating (claim ids, source coverage, freshness) is the Evidence-Graph
  // milestone; this is the honest interim: >=2 crawled adopters, or a trend that
  // came from a live run (p.trendReal), which carries a measured velocity.
  const adopters = p.crowding?.brands?.length ?? 0;
  const liveTrend = !!p.trend && p.trendReal === true;
  const market = {
    pass: adopters >= 2 || liveTrend,
    why: adopters >= 2
      ? `${adopters} competidores lo adoptaron (oferta observada)`
      : liveTrend ? `empuja "${p.trend.name || p.trend}" (tendencia de corrida live)`
      : "sin evidencia de mercado citable — una etiqueta de tendencia no alcanza",
    signal: "supply",
  };

  // Brand relevance: a real (engine) DNA fit above the on-brand line.
  const fit = p.fit ?? 0;
  const brand = {
    pass: fit >= 50 && p.fitReal !== false,
    why: p.fitReal === false
      ? "fit de marca sin validar (léxico, no aprendido)"
      : fit >= 50 ? `fit de marca ${fit}/100` : `fit de marca bajo (${fit}/100)`,
    signal: "opportunity",
  };

  // Commercial feasibility: needs REAL demand/margin data. Structurally absent
  // until a brand connects sell-through — so this gate honestly cannot pass.
  const commercial = dimBy["Fit comercial"];
  const hasSales = commercial && commercial.level && commercial.level !== "s/datos";
  const feasible = {
    pass: !!hasSales,
    why: hasSales ? commercial.note : "sin datos de venta propios — no se puede juzgar viabilidad comercial",
    signal: "demand",
  };

  // Decision confidence: fresh evidence + enough coverage.
  const fresh = dimBy["Frescura de datos"] || dimBy["Confianza"];
  const confident = {
    pass: fresh ? fresh.level === "alta" : false,
    why: fresh ? `evidencia ${fresh.level} · ${fresh.note}` : "cobertura insuficiente",
    signal: "meta",
  };

  const gates = { market, brand, feasible, confident };
  const failed = Object.entries(gates).filter(([, g]) => !g.pass).map(([k]) => k);
  const recommendable = failed.length === 0;
  return {
    gates,
    recommendable,
    // The honest headline when a gate is missing.
    stance: recommendable ? "recommend" : failed.includes("feasible") ? "directional" : "insufficient",
    abstainReason: recommendable
      ? null
      : failed.includes("feasible")
        ? "Dirección interesante — evidencia de mercado, pero sin datos comerciales propios no se recomienda para producción."
        : "Evidencia insuficiente para recomendar. Falta: " +
          failed.map((k) => ({ market: "evidencia de mercado", brand: "relevancia de marca", feasible: "viabilidad comercial", confident: "confianza del dato" }[k])).join(", ") + ".",
  };
}

export const STANCE_LABEL = {
  recommend: { text: "Recomendado para test", tone: "make" },
  directional: { text: "Dirección — no recomendable aún", tone: "explore" },
  insufficient: { text: "Evidencia insuficiente", tone: "watch" },
};

// ---- §11 trust record -----------------------------------------------------
// The full evaluable record. Fields with no data are explicit, not hidden.
export function buildTrustRecord(p) {
  const { gates, stance, abstainReason } = computeGates(p);
  const dimBy = Object.fromEntries((p.dims || []).map((d) => [d.k, d]));
  const unknowns = [];
  if (!gates.feasible.pass) unknowns.push("sell-through, margen y devoluciones propios (sin marca conectada)");
  if (p.fitReal === false) unknowns.push("fit de marca aún no aprendido de decisiones reales");
  unknowns.push("demanda real del cliente — hoy medimos oferta y adopción, no ventas");

  return {
    stance,
    abstainReason,
    whyNow: p.trend ? `${p.trend.name || p.trend} · ${p.stage || ""}`.trim() : (p.window?.note || "ventana de compra abierta"),
    marketEvidence: gates.market.why,
    brandEvidence: gates.brand.why,
    commercialEvidence: gates.feasible.why,
    contradicting: (p.verdict?.reasons || []).find((r) => /riesgo|contra|pero|tensión/i.test(r))
      || (p.overlap?.kind === "dup" ? "muy parecido a algo que ya tenés" : null)
      || (gates.market.pass ? null : "adopción de mercado débil"),
    dataCoverage: dimBy["Frescura de datos"]?.note || dimBy["Confianza"]?.note || "cobertura parcial",
    unknowns,
    confidence: gates.confident.pass ? "media" : "baja",
    testSize: p.qty?.range || null,
    successMetric: p.qty ? "sell-through a 14 días (se mide cuando haya ventas propias)" : null,
    outcome: null, // filled after launch — the scoreboard, empty until then
  };
}
