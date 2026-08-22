// Conservative lexical matching used until the visual ranker is calibrated.
// The old matcher used substring hits ("fit" matched "outfit" and "fits") and
// linked a product to any trend sharing two generic words. These helpers use
// token boundaries, remove operational/fashion-site noise, and require a
// distinctive hit in the trend name.

const MAP = {
  falda: "skirt", minifalda: "skirt", pollera: "skirt", vestido: "dress",
  vestidos: "dress", campera: "jacket", camperas: "jacket", buzo: "hoodie",
  remera: "tee", remeras: "tee", pantalon: "pants", pantalones: "pants",
  tejido: "knit", tejidos: "knit", sweater: "knit", sweaters: "knit",
  saten: "satin", brocado: "brocade", grafica: "graphic", grafico: "graphic",
  estampa: "graphic", estampado: "print", rayado: "stripe", jean: "denim",
  jeans: "denim", oversize: "oversized", trousers: "trouser", dresses: "dress",
  skirts: "skirt", shirts: "shirt", tops: "top", jackets: "jacket",
};

const STOP = new Set([
  "and", "the", "with", "for", "from", "this", "that", "your", "our",
  "new", "style", "styles", "fashion", "collection", "clothing", "wear",
  "womens", "women", "mens", "men", "girls", "girl", "product", "products",
  "fit", "fits", "fitted", "fitting", "outfit", "outfits", "look", "looks",
  "ready", "bold", "chic", "trend", "trending", "core", "essential",
  "black", "white", "grey", "gray", "cream", "pink", "blue", "green", "red",
]);

const clean = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

export function tokenSet(text) {
  const tokens = clean(text).match(/[a-z0-9]+(?:-[a-z0-9]+)?/g) || [];
  return new Set(tokens
    .map((token) => MAP[token] || token)
    .filter((token) => token.length >= 3 && !STOP.has(token)));
}

export function itemTokenSet(item = {}) {
  return tokenSet([
    item.title,
    item.product_type,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join(" "));
}

function intersection(left, right) {
  return [...left].filter((token) => right.has(token));
}

export function linkTrendToItem(item, trends = []) {
  const itemTokens = itemTokenSet(item);
  let best = null;
  for (const trend of trends || []) {
    const nameTokens = tokenSet(trend?.name);
    const summaryTokens = tokenSet(trend?.summary);
    const nameHits = intersection(nameTokens, itemTokens);
    const summaryHits = intersection(summaryTokens, itemTokens)
      .filter((token) => !nameHits.includes(token));
    const score = nameHits.length * 3 + Math.min(2, summaryHits.length);
    // At least one distinctive word from the trend name is mandatory. A
    // summary-only overlap is too easy to manufacture from generic copy.
    if (!nameHits.length || score < 3) continue;
    if (!best || score > best.score) {
      best = { trend, score, reasons: [...nameHits, ...summaryHits].slice(0, 6) };
    }
  }
  return best;
}

function dnaTokens(dna = {}) {
  const fields = ["aesthetic_keywords", "aestheticKeywords", "silhouettes", "materials", "motifs"];
  const labels = [];
  for (const field of fields) {
    for (const value of dna?.[field] || []) {
      labels.push(typeof value === "string" ? value : value?.label || value?.name || "");
    }
  }
  return tokenSet(labels.join(" "));
}

export function scoreProductDna(item, dna) {
  const product = itemTokenSet(item);
  const brand = dnaTokens(dna);
  const reasons = intersection(brand, product).slice(0, 8);
  // Deliberately capped below "high confidence": this is a transparent lexical
  // compatibility read, not a calibrated visual brand-fit model.
  const score = Math.min(0.65, reasons.length * 0.2);
  return { score, reasons, basis: "lexical-unvalidated" };
}

export function sameCurrencyPrices(item, items = []) {
  if (!item?.currency) return [];
  return items
    .filter((candidate) => candidate?.currency === item.currency)
    .map((candidate) => Number(candidate.price))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
}
