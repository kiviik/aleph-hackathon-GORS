// Product proposals: the feed's unit is a PRODUCT the brand could produce —
// seeded from real crawled competitor garments (photo, price, tags), later
// also from AI generation. Each proposal carries a full analysis computed
// from data we actually have:
//
//   adn        — DNA-fit score + the matched vocabulary (from the crawler)
//   mercado    — crowding: how many watchlist brands sell something similar
//   catalogo   — overlap with the brand's own line (dup vs gap, named style)
//   tendencia  — which engine trend it expresses + stage + buy window
//   precio     — where it sits inside the watchlist price distribution
//   adaptacion — how to make it the brand's own (palette, materials)
//   verdict    — producila / adaptala / con twist / pasa, with reasons
//
// No invented numbers: every figure traces to the crawl, the engine run, or
// the brand's catalog.
import { colName, lifecycleOf } from "./signals";
import { buyWindow, testQuantity, brandFitDim, timingDim, confidenceDim, fmtShortDate } from "./feed";
import { computeGates, buildTrustRecord } from "./trust";
import {
  itemTokenSet,
  linkTrendToItem,
  sameCurrencyPrices,
  scoreProductDna,
  tokenSet,
} from "./trustMatching.mjs";

const GARMENT_OF = [
  [/skirt|falda/i, "skirt"], [/dress|vestido|slip dress/i, "dress"],
  [/jean|denim pant|trouser|pant|cargo pant/i, "trousers"],
  [/jacket|coat|campera|blazer/i, "coat"], [/hoodie|sweatshirt|buzo/i, "tee"],
  [/knit|sweater|cardigan|jumper/i, "knit"], [/top|tee|shirt|blouse|corset|bodysuit|cami/i, "tee"],
];
const garmentOf = (text) => (GARMENT_OF.find(([re]) => re.test(text)) || [null, "tee"])[1];

/* ---------- analysis pieces ---------- */

function marketCrowding(item, allItems) {
  const t = itemTokenSet(item);
  const similar = allItems.filter((o) => {
    if (o.id === item.id) return false;
    const ot = itemTokenSet({ title: o.title, product_type: o.product_type });
    let hits = 0;
    for (const w of ot) if (t.has(w)) hits++;
    return hits >= 2;
  });
  const brands = [...new Set(similar.map((s) => s.competitor))];
  return { similar: similar.length, brands };
}

// Overlap against the ACTIVE brand's own catalog (engine /brands/{id}/catalog).
// It used to run against a 36-product Complot list hardcoded in lib/catalog.js,
// so "ya tenés algo cercano" named a Complot garment to every brand
// (2026-07-24 audit). With no catalog we cannot judge overlap, and say so
// instead of declaring a gap we have not checked.
function catalogOverlap(item, products) {
  if (!products?.length) {
    return { kind: "unknown",
             note: "sin catálogo propio conectado — no podemos verificar si ya tenés algo parecido" };
  }
  const t = itemTokenSet(item);
  let best = null;
  for (const s of products) {
    const st = tokenSet(`${s.title || ""} ${s.category || ""} ${s.product_type || ""} ${(s.tags || []).join(" ")}`);
    let hits = 0;
    for (const w of st) if (t.has(w)) hits++;
    if (!best || hits > best.hits) best = { style: s, hits };
  }
  if (best && best.hits >= 3) {
    return { kind: "dup", style: best.style.title, code: best.style.id,
             note: `ya tenés algo cercano en el catálogo: ${best.style.title}` };
  }
  if (best && best.hits === 2) {
    return { kind: "adjacent", style: best.style.title, code: best.style.id,
             note: `pariente de ${best.style.title} — extensión, no duplicado` };
  }
  return { kind: "gap", note: "no tenés nada parecido — hueco en tu línea" };
}

function trendLink(item, trends) {
  const match = linkTrendToItem(item, trends);
  if (!match) return null;
  const lc = lifecycleOf(match.trend);
  return {
    name: match.trend.name, stage: lc.stage,
    velocity: match.trend.demand?.d ?? null,
    reasons: match.reasons,
    // carried so the UI labels the number by what it measured (07-21 audit)
    velocityBasis: match.trend.velocityBasis || "collected",
  };
}

function pricePosition(item, allItems) {
  const prices = sameCurrencyPrices(item, allItems);
  if (!item.price || prices.length < 8) return null;
  const idx = prices.findIndex((p) => p >= item.price);
  const pct = Math.round((idx / prices.length) * 100);
  const band = pct <= 33 ? "entrada" : pct <= 70 ? "core" : "premium";
  return { pct, band, note: `${item.currency} ${item.price} — banda ${band} de tu watchlist (p${pct})` };
}

function adaptation(dna) {
  const colors = (dna?.palette || []).slice(0, 3).map((h) => colName(h));
  const materials = (dna?.materials || []).slice(0, 2).map((m) => m.label || m);
  return {
    colors,
    materials,
    note: [
      colors.length ? `en tu paleta: ${colors.join(" / ")}` : null,
      materials.length ? `en tus materiales: ${materials.join(", ")}` : null,
    ].filter(Boolean).join(" · "),
  };
}

function verdictOf({ fit, crowding, overlap, window: win }) {
  const reasons = [];
  if (!win.ok) return { label: "Fuera de ventana", tone: "hold", reasons: [win.note] };
  if (overlap.kind === "dup") {
    reasons.push(overlap.note, "mejor extender esa línea que duplicarla");
    return { label: "Extensión de línea", tone: "watch", reasons };
  }
  if (fit >= 0.5) {
    reasons.push("afinidad lexical útil para explorar — todavía no es fit visual calibrado");
    return { label: "Explorar, no producir", tone: "explore", reasons };
  }
  return { label: "Revisión humana", tone: "watch", reasons: ["sin afinidad de marca suficiente para priorizarla automáticamente"] };
}

/* ---------- six-dimension readout (spec 2026-07-19) ------------------------
   Absolute certainty ("100 ADN") is banned. Each proposal shows six separate
   dimensions — each line: level + the real basis in one phrase. */

function marketEvidenceDim(crowding, totalBrands, trend) {
  const n = crowding.brands.length;
  if (n === 0) {
    return {
      k: "Evidencia de mercado",
      level: "limitada",
      note: `limitada — única referencia en tu watchlist de ${totalBrands} competidor${totalBrands === 1 ? "" : "es"}`,
    };
  }
  const base = `${crowding.similar} similar${crowding.similar === 1 ? "" : "es"} en ${n}/${totalBrands} competidores seguidos (${crowding.brands.slice(0, 3).join(", ")})`;
  return {
    k: "Evidencia de mercado",
    level: n >= 2 ? "alta" : "media",
    note: trend ? `${base} · tendencia ${trend.name}` : base,
  };
}

function assortmentGapDim(overlap, wsHit) {
  if (overlap.kind === "dup") return { k: "Hueco de surtido", level: "bajo", note: overlap.note };
  // No catalog connected: the gap is unmeasured, not medium.
  if (overlap.kind === "unknown" && !wsHit) {
    return { k: "Hueco de surtido", level: "s/datos", note: overlap.note };
  }
  if (wsHit) {
    return { k: "Hueco de surtido", level: wsHit.kind === "sin-cobertura" ? "alto" : "medio", note: wsHit.title };
  }
  if (overlap.kind === "gap") return { k: "Hueco de surtido", level: "alto", note: overlap.note };
  return { k: "Hueco de surtido", level: "medio", note: overlap.note };
}

// HONEST commercial fit: no first-party sales history exists yet — say so.
// When real band data exists (engine price architecture, ARS), name the band.
function commercialFitDim(item, dna, price) {
  const arch = dna?.priceArchitecture;
  if (arch?.length && item.currency === "ARS" && typeof item.price === "number") {
    const band = arch.find((b) => item.price >= b.low && item.price <= b.high);
    if (band) {
      return { k: "Fit comercial", level: "s/datos", note: `cae en banda ${band.name} de tu arquitectura real · sin datos de venta propios todavía` };
    }
  }
  if (price) {
    return { k: "Fit comercial", level: "s/datos", note: `sin datos de venta propios todavía · precio en banda ${price.band} de la watchlist (p${price.pct})` };
  }
  return { k: "Fit comercial", level: "s/datos", note: "sin datos de venta propios todavía" };
}

/* ---------- main ---------- */

export function buildProductProposals({ items, trends, dna, catalog, leadWeeks = 8,
                                        opportunities = null, generatedAt } = {}) {
  const catalogProducts = Array.isArray(catalog) ? catalog : (catalog?.products || []);
  if (!items?.length) return [];
  const totalBrands = new Set(items.map((i) => i.competitor)).size;

  // ⚠ THIS LIMB WAS DEAD AND READ AS WORKING (found 2026-08-11 while migrating
  // Oportunidades). It called `findWhitespace(items, trends)` with NO catalog —
  // and that function returns [] immediately without one, because a gap is YOUR
  // range against theirs. So `wsByCat` was permanently empty, `wsHit` always
  // undefined, and `assortmentGapDim` has never once seen whitespace evidence.
  //
  // Passing the catalog in would have "fixed" it into the browser-classified
  // second truth this pass exists to remove. It takes the server's rows like
  // every other surface instead — and with none passed it stays empty, which is
  // what it already was, honestly this time.
  const wsByCat = new Map();
  for (const o of opportunities?.opportunities || []) wsByCat.set(o.category, o);
  const trendCategories = opportunities?.trend_categories || {};
  const out = items.map((item) => {
    const crowding = marketCrowding(item, items);
    const overlap = catalogOverlap(item, catalogProducts);
    const trend = trendLink(item, trends);
    const stage = trend?.stage || null;
    const win = trend
      ? buyWindow(stage, leadWeeks)
      : { ok: false, note: "sin vínculo confiable con una tendencia — timing no evaluado" };
    const price = pricePosition(item, items);
    const adapt = adaptation(dna);
    const dnaRead = scoreProductDna(item, dna);
    const verdict = verdictOf({ fit: dnaRead.score, crowding, overlap, window: win });
    const g = garmentOf(`${item.title} ${item.product_type}`);
    // The engine's own reading, via the trend this item is linked to — never a
    // browser classification of the item's own merchant label.
    const wsHit = wsByCat.get(trendCategories[trend?.name]);
    const dims = [
      marketEvidenceDim(crowding, totalBrands, trend),
      assortmentGapDim(overlap, wsHit),
      {
        ...brandFitDim(Math.round(dnaRead.score * 100), dnaRead.reasons.length > 0),
        note: dnaRead.reasons.length
          ? `${Math.round(dnaRead.score * 100)}/100 por vocabulario compartido (${dnaRead.reasons.join(", ")}) — no calibrado visualmente`
          : "sin coincidencias distintivas con el ADN textual — requiere revisión humana",
      },
      commercialFitDim(item, dna, price),
      timingDim(win),
      confidenceDim(item.fetched_at, true),
    ];
    const lineage = [
      fmtShortDate(item.fetched_at) ? `crawl ${fmtShortDate(item.fetched_at)}` : null,
      fmtShortDate(generatedAt) ? `corrida ${fmtShortDate(generatedAt)}` : null,
    ].filter(Boolean).join(" · ");
    const proposal = {
      dims,
      lineage: lineage ? `fuente: ${lineage}` : null,
      kind: "product",
      key: `prod-${item.id}`,
      item,                                 // the real crawled garment
      g,
      fit: Math.round(dnaRead.score * 100),
      fitReal: false,                       // lexical fit never passes the production gate
      // trendLink only returns a trend on a live run, so a matched trend here is
      // real evidence — a bare/demo trend never sets this and can't pass the gate.
      trendReal: !!trend,
      fitWords: dnaRead.reasons,
      crowding, overlap, trend, price, adapt, verdict,
      stage, window: win,
      qty: testQuantity(Math.round(dnaRead.score * 100), stage),
      score:
        dnaRead.score * 55 +
        // "unknown" (no catalog to check against) neither rewards nor
        // penalises — an unmeasured overlap must not move the score.
        (overlap.kind === "gap" ? 18 : overlap.kind === "adjacent" ? 8
          : overlap.kind === "unknown" ? 0 : -12) +
        Math.max(0, 12 - crowding.brands.length * 4) +
        (trend ? 10 : 0) +
        (win.ok ? 5 : -25),
    };
    // §8 gates + §11 trust record — the honesty layer over the evidence above.
    const g8 = computeGates(proposal);
    proposal.gates = g8.gates;
    proposal.recommendable = g8.recommendable;
    proposal.stance = g8.stance;
    proposal.abstainReason = g8.abstainReason;
    proposal.trust = buildTrustRecord(proposal);
    return proposal;
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}
