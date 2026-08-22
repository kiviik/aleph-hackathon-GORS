// Catalog data + diagnostics, ported from atelier-runtime.js.
// The prototype enriches each style at load (rollups, benchmark, status); we do
// the same once here and export the enriched array.
import { colName } from "./signals";

const SIZE_RUNS = { adult: ["XS", "S", "M", "L", "XL"], adultS: ["S", "M", "L", "XL"], kids: ["3y", "4y", "5y", "6y", "7y", "8y"] };

function vel(profile) {
  return profile.map(([stock, sold]) => ({ stock, sold, st: Math.round((sold / (stock + sold)) * 100) }));
}

// Complot — pilot brand catalog (complot.com.ar).
// Identity fields (style/name/price/category/fabric/image/url/colour) are REAL
// scraped Complot data (2026-07-11); per-size velocity/returns/weeks-on-sale
// are SAMPLE — generated deterministically from the product index below, NOT
// random at runtime. Real values must come from the brand's sales feed.
// Prices in ARS. Style codes derived from the real product slugs.
const REAL = [
  { style: "CP-NEW-MANHATTAN", n: "Body New Manhattan", cat: "Tops", g: "tee", f: "Cotton lycra", price: 29000, hex: "#E7E1D3",
    url: "https://complot.com.ar/body-new-manhattan.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01060403_blanco_1_p_3.jpg" },
  { style: "CP-COPENHAGUE", n: "Bomber Copenhague", cat: "Outerwear", g: "coat", f: "Technical shell", price: 129999, hex: "#2A3550",
    url: "https://complot.com.ar/bomber-copenhague.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01113102_marino_1_p_1.jpg" },
  { style: "CP-ANGEL", n: "Buzo Angel", cat: "Hoodies", g: "hoodie", f: "Cotton fleece", price: 64999, hex: "#1B1A14",
    url: "https://complot.com.ar/buzo-angel.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130513_negro_1_p.jpg" },
  { style: "CP-BANDERAS", n: "Buzo Banderas", cat: "Hoodies", g: "hoodie", f: "Cotton fleece", price: 74999, hex: "#1B1A14",
    url: "https://complot.com.ar/buzo-banderas-.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130518_negro_4_2_1.jpg" },
  { style: "CP-STEVE", n: "Buzo Steve", cat: "Hoodies", g: "hoodie", f: "Cotton fleece", price: 59999, hex: "#1B1A14",
    url: "https://complot.com.ar/buzo-steve.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130505_negro_3_2_1.jpg" },
  { style: "CP-DEBBIE", n: "Camisa Debbie", cat: "Shirts", g: "shirt", f: "Denim", price: 69999, hex: "#3C4C68",
    url: "https://complot.com.ar/camisa-debbie.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01125400_azul_1_p_1.jpg" },
  { style: "CP-NIRVANA", n: "Camisa Nirvana", cat: "Shirts", g: "shirt", f: "Viyella flannel", price: 89999, hex: "#2F5A3C",
    url: "https://complot.com.ar/camisa-nirvana.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01133000_verde_1_p.jpg" },
  { style: "CP-SERGE", n: "Camisa Serge", cat: "Shirts", g: "shirt", f: "Cotton poplin", price: 74999, hex: "#1B1A14",
    url: "https://complot.com.ar/camisa-serge.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01133001_negro_1_p.jpg" },
  { style: "CP-JUSTIN", n: "Campera Justin", cat: "Outerwear", g: "coat", f: "Ciré shell", price: 169999, hex: "#1B1A14",
    url: "https://complot.com.ar/campera-justin.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01133105_negro_1_p.jpg" },
  { style: "CP-MIKE", n: "Canguro Mike", cat: "Hoodies", g: "hoodie", f: "Cotton fleece", price: 85000, hex: "#1B1A14",
    url: "https://complot.com.ar/canguro-mike.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130504_negro_1_p.jpg" },
  { style: "CP-PATTI", n: "Falda Patti", cat: "Skirts", g: "skirt", f: "Gabardine", price: 49999, hex: "#1B1A14",
    url: "https://complot.com.ar/falda-patti.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01135200_negro_1_p.jpg" },
  { style: "CP-CLAIRE", n: "Musculosa Claire", cat: "Tops", g: "tee", f: "Cotton lycra", price: 15000, hex: "#1B1A14",
    url: "https://complot.com.ar/musculosa-claire.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130210_negro_1_p.jpg" },
  { style: "CP-CHINATOWN", n: "Polera Chinatown", cat: "Knitwear", g: "knit", f: "Brushed microfibre", price: 24999, hex: "#B03A2E",
    url: "https://complot.com.ar/polera-chinatown.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130141_rojo_1_p.jpg" },
  { style: "CP-ARGENTINA", n: "Remera Argentina", cat: "Tops", g: "tee", f: "Rib knit", price: 26999, hex: "#E7E1D3",
    url: "https://complot.com.ar/remera-argentina-.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130176_blanco_1_p_1_3.jpg" },
  { style: "CP-BERGHAIN", n: "Remera Berghain", cat: "Tops", g: "tee", f: "Cotton jersey", price: 40000, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-berghain.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01140101_negro_1_p.jpg" },
  { style: "CP-BEVERLY-HILL-ML", n: "Remera Beverly Hill M/L", cat: "Tops", g: "tee", f: "Rib knit", price: 24000, hex: "#9A968B",
    url: "https://complot.com.ar/remera-beverly-hill-m-l.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01030104_grismelange_1_p_1.jpg" },
  { style: "CP-BEVERLY-HILLS", n: "Remera Beverly Hills", cat: "Tops", g: "tee", f: "Rib knit", price: 19000, hex: "#9A968B",
    url: "https://complot.com.ar/remera-beverly-hills.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01040106_grismelange_1_p_2.jpg" },
  { style: "CP-DRAGON", n: "Remera Dragon", cat: "Tops", g: "tee", f: "Cotton jersey", price: 39999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-dragon--.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130149_negro_1_p.jpg" },
  { style: "CP-EGG", n: "Remera Egg", cat: "Tops", g: "tee", f: "Cotton jersey", price: 19999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-egg.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130163_negro_1_p.jpg" },
  { style: "CP-FIRENZE", n: "Remera Firenze", cat: "Tops", g: "tee", f: "Cotton jersey", price: 19999, hex: "#E3C24B",
    url: "https://complot.com.ar/remera-firenze.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01120167_amarillo_1_p_1_4.jpg" },
  { style: "CP-GODARD", n: "Remera Godard", cat: "Tops", g: "tee", f: "Cotton jersey", price: 39999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-godard.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130153_negro_3_2.jpg" },
  { style: "CP-LOS-ANGELES-ML", n: "Remera Los Angeles ML", cat: "Tops", g: "tee", f: "Rib knit", price: 24000, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-los-angeles-ml.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01030102_negro_1_p_1_1.jpg" },
  { style: "CP-LUXX", n: "Remera Luxx", cat: "Tops", g: "tee", f: "Cotton jersey", price: 29999, hex: "#CDBFA6",
    url: "https://complot.com.ar/remera-luxx.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130162_crudo_1_p.jpg" },
  { style: "CP-MC-APPLE", n: "Remera MC Apple", cat: "Tops", g: "tee", f: "Stretch crepe", price: 19000, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-mc-apple.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130146_negro_1_p.jpg" },
  { style: "CP-ML-APPLE", n: "Remera ML Apple", cat: "Tops", g: "tee", f: "Stretch crepe", price: 21999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-ml-apple.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130145_negro_1_p.jpg" },
  { style: "CP-ML-MAGNET", n: "Remera ML Magnet", cat: "Tops", g: "tee", f: "Stretch lace", price: 25999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-ml-magnet.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130177_negro_1_p.jpg" },
  { style: "CP-ML-WHO-CARES", n: "Remera ML Who Cares", cat: "Tops", g: "tee", f: "Cotton jersey", price: 24999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-ml-who-cares.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130160_negro_1_p.jpg" },
  { style: "CP-PUNK", n: "Remera Punk", cat: "Tops", g: "tee", f: "Cotton lycra", price: 19999, hex: "#E7E1D3",
    url: "https://complot.com.ar/remera-punk-.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130114_blanco_1_p_2.jpg" },
  { style: "CP-TV-GIRL", n: "Remera TV Girl", cat: "Tops", g: "tee", f: "Cotton jersey", price: 39999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-tv-girl.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130175_negro_1_p.jpg" },
  { style: "CP-ULTRASOUND", n: "Remera Ultrasound", cat: "Tops", g: "tee", f: "Cotton jersey", price: 39999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-ultrasound.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130174_negro_1_p.jpg" },
  { style: "CP-WORLD-CUP", n: "Remera World Cup", cat: "Tops", g: "tee", f: "Cotton jersey", price: 42999, hex: "#1B1A14",
    url: "https://complot.com.ar/remera-world-cup-.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130179_negro_5_2_1.jpg" },
  { style: "CP-BRUCE", n: "Short Bruce", cat: "Shorts", g: "shorts", f: "Coated bengaline", price: 49999, hex: "#1B1A14",
    url: "https://complot.com.ar/short-bruce.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01135100_negro_1_p.jpg" },
  { style: "CP-ACTIVE", n: "Top Active", cat: "Tops", g: "tee", f: "Heavy tricot", price: 29999, hex: "#1B1A14",
    url: "https://complot.com.ar/top-active.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130211_negro_1_p.jpg" },
  { style: "CP-MAGNET", n: "Top Magnet", cat: "Tops", g: "tee", f: "Stretch lace", price: 19999, hex: "#5C2430",
    url: "https://complot.com.ar/top-magnet.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130312_bordo_1_p_1.jpg" },
  { style: "CP-MIST", n: "Top Mist", cat: "Tops", g: "tee", f: "Lace", price: 17999, hex: "#1B1A14",
    url: "https://complot.com.ar/top-mist.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130304_negro_1_p.jpg" },
  { style: "CP-WING", n: "Top Wing", cat: "Tops", g: "tee", f: "Shiny microfibre", price: 19999, hex: "#1B1A14",
    url: "https://complot.com.ar/top-wing.html",
    img: "https://complot.com.ar/media/catalog/product/cache/1eeb390cd1cc37ec3691513d668f0302/c/o/complot_01130307_negro_1_p.jpg" },
];

// ---- SAMPLE analytics (deterministic, seeded from the product index) ----
// Everything below is demo-sample data: the scrape has no sales feed, so
// per-size stock/sold/sell-through, returns % and weeks-on-sale are generated
// with a fixed-seed PRNG. Same inputs -> same numbers on every load.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SIZE_CURVE = [0.62, 1, 1.2, 0.95, 0.55]; // demand bell across the size run
function sampleVelocity(i, sizes) {
  const rnd = mulberry32(1000 + i * 97);
  const tier = i % 5; // spread of winners / healthy / slow styles
  const stTarget = [0.78, 0.58, 0.47, 0.3, 0.65][tier] + (rnd() - 0.5) * 0.06;
  const base = 18 + Math.round(rnd() * 22); // units per size at mid-curve
  return sizes.map((_, k) => {
    const curve = SIZE_CURVE[Math.min(k, SIZE_CURVE.length - 1)] * (0.85 + rnd() * 0.3);
    const total = Math.max(4, Math.round(base * curve));
    const sold = Math.max(1, Math.round(total * Math.min(0.96, Math.max(0.05, stTarget + (rnd() - 0.5) * 0.12))));
    return [total - sold, sold];
  });
}
const RETURNS_BASE = { Tops: 5.5, Hoodies: 5, Outerwear: 7.5, Shirts: 8.5, Skirts: 11, Shorts: 10, Knitwear: 10.5 };
function sampleReturns(i, cat) {
  const rnd = mulberry32(2000 + i * 131)();
  const bump = i % 9 === 4 ? 9 : 0; // a few return exceptions for the demo flows
  return Math.round(((RETURNS_BASE[cat] ?? 8) + rnd * 5 + bump) * 10) / 10;
}
const weeksFor = (i) => 5 + ((i * 7) % 6); // SAMPLE weeks-on-sale, 5–10
const sizesFor = (cat) => (cat === "Outerwear" || cat === "Skirts" || cat === "Shorts" ? SIZE_RUNS.adult : SIZE_RUNS.adultS);
const bandFor = (price) => (price < 30000 ? "Entry" : price < 90000 ? "Core" : "Premium");

const RAW = REAL.map((p, i) => {
  const sizes = sizesFor(p.cat);
  return {
    ...p,
    gd: "Women", season: "AW26",
    band: bandFor(p.price),
    returns: sampleReturns(i, p.cat),
    colorways: [{ hex: p.hex, sizes, velocity: vel(sampleVelocity(i, sizes)) }],
  };
});
const benchAt = (week) => Math.min(95, Math.round(8 + week * 5.2));

function buildSkus(styleId, hex, sizes, velocity) {
  return sizes.map((sz, i) => ({
    sku: `${styleId}-${hex.slice(1, 4)}-${sz.replace(/[^A-Za-z0-9]/g, "")}`,
    size: sz, stock: velocity[i]?.stock ?? 0, sold: velocity[i]?.sold ?? 0, st: velocity[i]?.st ?? 0,
  }));
}

function deriveStatus(p) {
  const reasons = [];
  let status = "ok";
  if (p.benchVar >= 15 && p.returns < 14) { status = "win"; reasons.push(`${p.benchVar} pts ahead of the week-${p.weeks} benchmark`); }
  else if (p.benchVar <= -12 || p.st < 35) { status = "warn"; if (p.benchVar <= -12) reasons.push(`${Math.abs(p.benchVar)} pts behind benchmark`); if (p.st < 35) reasons.push(`${p.st}% sell-through`); }
  else reasons.push(`within benchmark range (${p.benchVar >= 0 ? "+" : ""}${p.benchVar} pts)`);
  if (p.returns > 15) reasons.push(status !== "warn" ? `but ${p.returns}% returns — above the 15% line` : `${p.returns}% returns`);
  return { status, reasons };
}

// Build the enriched catalog once.
export const CATALOG = RAW.map((s, i) => {
  let stock = 0, sold = 0;
  s.colorways.forEach((cw) => {
    cw.skus = buildSkus(s.style, cw.hex, cw.sizes, cw.velocity);
    cw.skus.forEach((k) => { stock += k.stock; sold += k.sold; });
    cw.sold = cw.skus.reduce((a, k) => a + k.sold, 0);
    cw.stock = cw.skus.reduce((a, k) => a + k.stock, 0);
    cw.st = Math.round((cw.sold / (cw.sold + cw.stock)) * 100);
  });
  s.units = stock; s.sold = sold;
  s.skuCount = s.colorways.reduce((a, c) => a + c.skus.length, 0);
  s.colors = s.colorways.map((c) => c.hex);
  s.sizes = s.colorways[0].sizes[0] + "–" + s.colorways[0].sizes.slice(-1)[0];
  s.st = Math.round((sold / (sold + stock)) * 100);
  s.weeks = weeksFor(i);
  s.bench = benchAt(s.weeks);
  s.benchVar = s.st - s.bench;
  const d = deriveStatus(s);
  s.status = d.status; s.statusReasons = d.reasons;
  return s;
});

export function catStatusInfo(s) {
  return { win: ["Scaling", "var(--sage)", "#EDF3EF"], ok: ["Healthy", "var(--cobalt)", "var(--cobalt-wash)"], warn: ["At risk", "var(--clay)", "var(--clay-wash)"] }[s];
}

export function styleDiag(p) {
  const cwSold = p.colorways.map((cw) => ({ hex: cw.hex, sold: cw.skus.reduce((a, k) => a + k.sold, 0) }));
  const totalSold = cwSold.reduce((a, c) => a + c.sold, 0) || 1;
  const lead = cwSold.slice().sort((a, b) => b.sold - a.sold)[0];
  const leadShare = Math.round((lead.sold / totalSold) * 100);
  const allSkus = p.colorways.flatMap((cw) => cw.skus.map((k) => ({ ...k, hex: cw.hex })));
  const hot = allSkus.filter((k) => k.st >= 80 && k.stock <= 12);
  const cold = allSkus.filter((k) => k.st < 45);
  const salesFlags = [];
  if (p.status === "win" && hot.length) salesFlags.push({ sev: "sage", t: "Low stock", d: `${[...new Set(hot.map((k) => k.size))].join("/")} nearly gone — reorder window` });
  if (cold.length >= 3) salesFlags.push({ sev: "ochre", t: "Slow sizes", d: `${[...new Set(cold.map((k) => k.size))].join("/")} sitting` });
  if (p.status === "warn" && p.st < 30) salesFlags.push({ sev: "clay", t: "Weak demand", d: `${p.st}% sell-through` });
  const cxFlags = [];
  if (p.returns > 15) cxFlags.push({ sev: "clay", t: "Return exception", d: `${p.returns}% — above the 15% line` });
  else if (p.returns > 11) cxFlags.push({ sev: "ochre", t: "Returns to watch", d: `${p.returns}% — near the line` });
  return { leadHex: lead.hex, leadShare, hot, cold, salesFlags, cxFlags, flags: [...salesFlags, ...cxFlags] };
}

export function catInterp(p) {
  const d = styleDiag(p);
  const bench = p.benchVar >= 10 ? `${p.benchVar} pts ahead of the week-${p.weeks} benchmark` : p.benchVar <= -10 ? `${Math.abs(p.benchVar)} pts behind the week-${p.weeks} benchmark` : `tracking its week-${p.weeks} benchmark`;
  if (p.status === "win" && d.hot.length) { const sizes = [...new Set(d.hot.map((k) => k.size))].join("/"); return `${bench} · ${colName(d.leadHex)} drives ${d.leadShare}% of demand, ${sizes} nearly gone.`; }
  if (p.status === "warn") return `${bench}${p.returns > 15 ? `, ${p.returns}% returns` : ""} — a decision is due.`;
  if (p.returns > 15) return `${bench}, but ${p.returns}% returns — check fit before reordering.`;
  if (d.cold.length >= 3) { const sizes = [...new Set(d.cold.map((k) => k.size))].join("/"); return `${bench}; ${sizes} slow — weight the next curve lighter.`; }
  return `${bench} · ${colName(d.leadHex)} leads at ${d.leadShare}% of demand.`;
}

export function catalogIntel() {
  return {
    heroes: CATALOG.filter((p) => p.status === "win"),
    atRisk: CATALOG.filter((p) => p.status === "warn"),
    stockoutRisk: CATALOG.filter((p) => p.status === "win" && styleDiag(p).hot.length > 0),
    returnExc: CATALOG.filter((p) => p.returns > 15),
    extend: CATALOG.filter((p) => p.status === "win" && p.returns < 12),
  };
}

export function primaryAction(p) {
  const d = styleDiag(p);
  if (p.returns > 15) return { label: "Review fit", col: "var(--clay)" };
  if (p.status === "win" && d.hot.length) return { label: "Reorder", col: "var(--sage)" };
  if (p.status === "win") return { label: "Extend", col: "var(--cobalt)" };
  if (p.status === "warn") return { label: "Plan markdown", col: "var(--ochre)" };
  return { label: "Review", col: "var(--ink-3)" };
}

// ---- Visual search: similarity over our own catalog ----
export const FAB_FAMILY = {
  Satin: "fluid", Tencel: "fluid", Linen: "fluid", "Stretch crepe": "fluid", "Stretch lace": "fluid", Lace: "fluid", "Shiny microfibre": "fluid",
  "Merino wool": "knit", "Rib knit": "knit", "Cotton jersey": "knit", "Cotton fleece": "knit", "Cotton lycra": "knit", "Heavy tricot": "knit", "Brushed microfibre": "knit",
  Twill: "structured", Denim: "structured", "Organic cotton": "structured", "Cotton poplin": "structured", Gabardine: "structured", "Viyella flannel": "structured", "Coated bengaline": "structured",
  "Technical shell": "technical", "Ciré shell": "technical",
};

export function vsScore(src, cand) {
  const sameFabFamily = FAB_FAMILY[src.f] && FAB_FAMILY[src.f] === FAB_FAMILY[cand.f];
  const price = Math.round(Math.max(0, 100 - (Math.abs(src.price - cand.price) / Math.max(src.price, cand.price)) * 140));
  const colShare = src.colors.filter((c) => cand.colors.includes(c)).length;
  const colMax = Math.max(src.colors.length, cand.colors.length) || 1;
  const colour = Math.round((colShare / colMax) * 100);
  const garment = src.g === cand.g ? 92 : src.cat === cand.cat ? 70 : 35;
  const fabric = src.f === cand.f ? 92 : sameFabFamily ? 62 : 28;
  const overall = Math.round(garment * 0.5 + fabric * 0.3 + colour * 0.2);
  return { overall, garment, fabric, colour, price };
}

export const ars = (v) => "AR$" + Math.round(v).toLocaleString("es-AR");

export function vsMatchWhy(src, cand) {
  const same = [], diff = [];
  (src.g === cand.g ? same : diff).push(src.g === cand.g ? "misma tipología" : "otra tipología");
  (src.f === cand.f ? same : diff).push(src.f === cand.f ? `mismo ${src.f.toLowerCase()}` : `${cand.f.toLowerCase()} vs ${src.f.toLowerCase()}`);
  if (src.colors.some((c) => cand.colors.includes(c))) same.push("paleta compartida"); else diff.push("otra paleta");
  const rel = Math.abs(src.price - cand.price) / Math.max(src.price, cand.price);
  if (rel <= 0.15) same.push("precio cercano"); else diff.push(`${ars(cand.price)} vs ${ars(src.price)}`);
  return `Coincide en ${same.slice(0, 2).join(" y ") || "la categoría"}. Difiere en ${diff.slice(0, 2).join(" y ") || "detalles menores"}.`;
}

export function vsResults(src, region) {
  if (!src) return [];
  return CATALOG.filter((p) => p.style !== src.style).map((p) => {
    const sc = vsScore(src, p);
    const regionScore = { whole: sc.overall, silhouette: sc.garment, fabric: sc.fabric, colour: sc.colour, price: sc.price }[region];
    return { p, sc, head: Math.round(regionScore), why: vsMatchWhy(src, p) };
  }).sort((a, b) => b.head - a.head);
}

export function vsOverlap(src) {
  const near = CATALOG.filter((p) => p.style !== src.style && vsScore(src, p).garment >= 70 && vsScore(src, p).fabric >= 60);
  const level = near.length >= 3 ? ["Alto", "var(--clay)"] : near.length >= 1 ? ["Medio", "var(--ochre)"] : ["Bajo", "var(--sage)"];
  return { near, level };
}

// Rank REAL crawled competitor items against a catalog source style.
// Pure lexical/attribute computation — the matched words travel with each
// result so the score is inspectable evidence, never an oracle. Price
// proximity only contributes within the same currency (ARS vs ARS).
export function vsMarketRank(src, items, colNameFn) {
  if (!src || !items?.length) return [];
  const srcWords = new Set(
    [src.n, src.cat, src.g, src.f, ...(src.colors || []).map((h) => (colNameFn ? colNameFn(h) : ""))]
      .join(" ").toLowerCase().split(/[^a-záéíóúüñ]+/).filter((w) => w.length > 3),
  );
  return items.map((it) => {
    const text = `${it.title || ""} ${it.product_type || ""} ${(it.tags || []).join(" ")}`.toLowerCase();
    const matched = [...srcWords].filter((w) => text.includes(w));
    let score = matched.length * 30;
    const type = (it.product_type || "").toLowerCase();
    if (type && (src.g.toLowerCase().includes(type) || type.includes(src.g.toLowerCase()) ||
                 src.cat.toLowerCase().includes(type) || type.includes(src.cat.toLowerCase()))) {
      score += 40;
      matched.unshift(it.product_type);
    }
    if (it.currency === "ARS" && it.price > 0) {
      const rel = Math.abs(src.price - it.price) / Math.max(src.price, it.price);
      if (rel <= 0.25) { score += 15; matched.push("precio cercano"); }
    }
    return { it, score, matched: [...new Set(matched)].slice(0, 4) };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

export const CAT_SORTERS = {
  recommended: (a, b) => (b.status === "warn") - (a.status === "warn") || Math.abs(b.benchVar) - Math.abs(a.benchVar),
  urgent: (a, b) => (b.status === "warn") - (a.status === "warn") || b.returns - a.returns,
  sthi: (a, b) => b.st - a.st,
  stlo: (a, b) => a.st - b.st,
  bench: (a, b) => b.benchVar - a.benchVar,
  returns: (a, b) => b.returns - a.returns,
  stock: (a, b) => b.units - a.units,
};
