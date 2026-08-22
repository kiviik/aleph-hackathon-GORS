// Signals (Trend Radar) data + scoring helpers, ported from atelier-runtime.js.
//
// 2026-08-07: `IMG` (eleven Unsplash stock photographs standing in for market
// signal imagery) and `photoFor` are DELETED, along with their only consumer
// `lib/studio.js`, which nothing imported. The 2026-07-24 audit note kept them
// "marked, until the engine serves real crawl imagery" — but a stock photograph
// attached to a trend card is a resemblance, and the redesign's first rule is
// that an image is the object's OWN or it is nothing. There is no marking that
// makes a borrowed photo evidence.
//
// TRENDS / ATTRIBUTES / COLOR_TRENDS survive because the sample-mode maquette
// (no engine at all) still renders them and labels them "Datos de muestra".
// They must never reach a connected brand: `Signals.jsx` sends connected-but-
// not-live brands to Dirección instead, and as of today the attribute and
// colour tabs refuse to render for a LIVE brand rather than serving these.
export const TRENDS = [
  { g: "knit", cat: "Knitwear", gd: "women", name: "Sheer rib knit", fabric: "Rib knit", mood: "Minimal", tag: "make", score: 94, demand: { d: 91, f: 96, m: 88 }, yoy: "+212%", geo: "Seoul · Paris", age: "24–34", brand: true, price: 240, signals: 914, matches: 12, resale: "+160%", col: "#9A968B" },
  { g: "trousers", cat: "Tailoring", gd: "women", name: "Architectural wide trouser", fabric: "Twill", mood: "Editorial", tag: "make", score: 91, demand: { d: 88, f: 94, m: 82 }, yoy: "+148%", geo: "Milan · NYC", age: "28–42", brand: true, price: 280, signals: 760, matches: 9, resale: "+120%", col: "#4A4944" },
  { g: "coat", cat: "Outerwear", gd: "men", name: "Unlined chore coat", fabric: "Twill", mood: "Minimal", tag: "make", score: 88, demand: { d: 86, f: 90, m: 78 }, yoy: "+96%", geo: "Tokyo · Berlin", age: "27–40", brand: true, price: 560, signals: 540, matches: 7, resale: "+85%", col: "#3C4C68" },
  { g: "trousers", cat: "Denim", gd: "women", name: "Washed indigo barrel jean", fabric: "Denim", mood: "On-brand", tag: "test", score: 86, demand: { d: 84, f: 79, m: 90 }, yoy: "+131%", geo: "LA · London", age: "22–32", brand: true, price: 230, signals: 611, matches: 14, resale: "+131%", col: "#3C4C68" },
  { g: "dress", cat: "Dress", gd: "women", name: "Bias-cut slip dress", fabric: "Satin", mood: "Romantic", tag: "make", score: 82, demand: { d: 91, f: 98, m: 78 }, yoy: "+74%", geo: "Paris · Copenhagen", age: "25–38", brand: true, price: 320, signals: 828, matches: 17, resale: "+180%", col: "#1B1A14" },
  { g: "blazer", cat: "Tailoring", gd: "men", name: "Soft-shoulder blazer", fabric: "Merino wool", mood: "Elevated", tag: "test", score: 79, demand: { d: 76, f: 84, m: 71 }, yoy: "+58%", geo: "Florence · Seoul", age: "30–48", brand: true, price: 480, signals: 430, matches: 8, resale: "+60%", col: "#4A4944" },
  { g: "tee", cat: "Knitwear", gd: "kids", name: "Garment-dyed mini tee", fabric: "Organic cotton", mood: "Minimal", tag: "test", score: 74, demand: { d: 72, f: 80, m: 66 }, yoy: "+41%", geo: "Amsterdam · NYC", age: "3–8", brand: true, price: 60, signals: 300, matches: 11, resale: "+30%", col: "#8B9079" },
  { g: "skirt", cat: "Dress", gd: "women", name: "Drop-waist midi skirt", fabric: "Tencel", mood: "Romantic", tag: "test", score: 71, demand: { d: 70, f: 74, m: 64 }, yoy: "+38%", geo: "London · Stockholm", age: "24–36", brand: false, price: 220, signals: 280, matches: 9, resale: "+44%", col: "#8B9079" },
  { g: "coat", cat: "Outerwear", gd: "women", name: "Cropped puffer", fabric: "Technical shell", mood: "On-brand", tag: "watch", score: 67, demand: { d: 70, f: 58, m: 60 }, yoy: "+22%", geo: "Seoul · Toronto", age: "18–28", brand: false, price: 340, signals: 240, matches: 6, resale: "+22%", col: "#1B1A14" },
  { g: "tee", cat: "Knitwear", gd: "men", name: "Heavyweight box tee", fabric: "Organic cotton", mood: "Minimal", tag: "watch", score: 64, demand: { d: 62, f: 60, m: 55 }, yoy: "+19%", geo: "LA · Tokyo", age: "20–34", brand: false, price: 95, signals: 210, matches: 18, resale: "+12%", col: "#E7E1D3" },
  { g: "trousers", cat: "Denim", gd: "men", name: "Loose carpenter pant", fabric: "Denim", mood: "On-brand", tag: "watch", score: 61, demand: { d: 60, f: 54, m: 50 }, yoy: "+17%", geo: "Berlin · NYC", age: "19–30", brand: false, price: 210, signals: 190, matches: 7, resale: "+17%", col: "#3C4C68" },
  { g: "dress", cat: "Dress", gd: "kids", name: "Pinafore dress", fabric: "Linen", mood: "Romantic", tag: "watch", score: 58, demand: { d: 56, f: 62, m: 48 }, yoy: "+12%", geo: "Paris · London", age: "4–9", brand: false, price: 90, signals: 170, matches: 5, resale: "+8%", col: "#3C4C68" },
];

export const LIFECYCLE = {
  "Sheer rib knit": { stage: "Accelerating", pos: 42 },
  "Architectural wide trouser": { stage: "Accelerating", pos: 52 },
  "Unlined chore coat": { stage: "Emerging", pos: 24 },
  "Washed indigo barrel jean": { stage: "Accelerating", pos: 48 },
  "Bias-cut slip dress": { stage: "Peaking", pos: 74 },
  "Soft-shoulder blazer": { stage: "Emerging", pos: 30 },
  "Garment-dyed mini tee": { stage: "Emerging", pos: 18 },
  "Drop-waist midi skirt": { stage: "Accelerating", pos: 40 },
  "Cropped puffer": { stage: "Declining", pos: 86 },
  "Heavyweight box tee": { stage: "Peaking", pos: 70 },
  "Loose carpenter pant": { stage: "Declining", pos: 82 },
  "Pinafore dress": { stage: "Declining", pos: 78 },
};

export const STAGE_COL = { Emerging: "var(--cobalt)", Accelerating: "var(--sage)", Peaking: "var(--ochre)", Declining: "var(--clay)",
  // Not a stage on the curve — the answer when there is no curve yet. Grey on
  // purpose: it must never read as an early-but-promising position.
  Insuficiente: "var(--ink-3)" };
export const STAGE_ADVICE = {
  Emerging: "Early — brief a moodboard, hold the buy",
  Accelerating: "Act now — the buy window is open",
  Peaking: "At peak — only enter with a fast lead time",
  Declining: "Too late to start — skip or exit",
  // No advice, because there is no reading to advise from. The engine needs two
  // observations before a trajectory exists, and one is not "early".
  Insuficiente: "Sin trayectoria todavía — hace falta una observación más",
};

// Fallbacks (demo map / default) are NOT measurements — flag them so the UI
// never attaches a market-timing claim to an asserted stage.
export function lifecycleOf(t) {
  if (t._lc) return t._lc;
  const demo = LIFECYCLE[t.name];
  return demo ? { ...demo, measured: false } : { stage: "Emerging", pos: 28, measured: false };
}
export function signalMomentum(t) { return t.score; }
export function signalEvidence(t) {
  if (t.live) {
    // Engine trends: breadth of independent sources is the evidence read.
    const n = (t.sources || []).length;
    return n >= 8 ? ["High", "var(--sage)"] : n >= 4 ? ["Medium", "var(--ochre)"] : ["Limited", "var(--clay)"];
  }
  const groups = (t.geo ? 1 : 0) + (t.resale ? 1 : 0) + (t.signals > 400 ? 1 : 0) + (t.brand ? 1 : 0) + 1;
  return groups >= 4 ? ["High", "var(--sage)"] : groups >= 3 ? ["Medium", "var(--ochre)"] : ["Limited", "var(--clay)"];
}
export function peakWindow(lc) {
  // No invented precision: an unmeasured stage gets no timing claim at all, and
  // even a measured one gets a qualitative read — never a fake "8–16 weeks".
  if (lc.stage === "Insuficiente") {
    return "una sola observación — todavía no se puede decir hacia dónde va";
  }
  if (!lc.measured) return "etapa estimada, no medida — sin ventana temporal";
  if (lc.stage === "Emerging") return "señal temprana — la ventana no abrió todavía";
  if (lc.stage === "Accelerating") return "ventana abierta — en aceleración medida";
  if (lc.stage === "Peaking") return "en pico medido — defender, no expandir";
  return "pasado el pico — en declive medido";
}
export function productsObs(t) { return t.signals.toLocaleString(); }

export const ATTRIBUTES = {
  women: {
    Silhouettes: [
      { n: "Bias / fluid column", ad: 34, yoy: "+58%", dir: "up", fit: 96, g: "dress" },
      { n: "Wide / barrel leg", ad: 41, yoy: "+148%", dir: "up", fit: 94, g: "trousers" },
      { n: "Drop waist", ad: 18, yoy: "+38%", dir: "up", fit: 78, g: "skirt" },
      { n: "Oversized shoulder", ad: 22, yoy: "−12%", dir: "down", fit: 54, g: "blazer" },
      { n: "Cropped / boxy", ad: 29, yoy: "−8%", dir: "down", fit: 48, g: "coat" },
    ],
    Fabrics: [
      { n: "Sheer / translucent knit", ad: 26, yoy: "+212%", dir: "up", fit: 92, g: "knit" },
      { n: "Bias satin", ad: 31, yoy: "+74%", dir: "up", fit: 98, g: "dress" },
      { n: "Washed indigo denim", ad: 38, yoy: "+131%", dir: "up", fit: 79, g: "trousers" },
      { n: "Technical shell", ad: 24, yoy: "−18%", dir: "down", fit: 42, g: "coat" },
      { n: "Fine merino", ad: 44, yoy: "+22%", dir: "flat", fit: 90, g: "knit" },
    ],
    Necklines: [
      { n: "Boat / bateau", ad: 28, yoy: "+96%", dir: "up", fit: 88, g: "knit" },
      { n: "Cowl", ad: 19, yoy: "+44%", dir: "up", fit: 82, g: "dress" },
      { n: "High funnel", ad: 23, yoy: "+31%", dir: "up", fit: 80, g: "knit" },
      { n: "Halter", ad: 14, yoy: "−22%", dir: "down", fit: 46, g: "dress" },
    ],
  },
  men: {
    Silhouettes: [
      { n: "Unlined soft tailoring", ad: 32, yoy: "+96%", dir: "up", fit: 90, g: "coat" },
      { n: "Wide pleated trouser", ad: 36, yoy: "+78%", dir: "up", fit: 86, g: "trousers" },
      { n: "Camp / open collar", ad: 27, yoy: "+52%", dir: "up", fit: 84, g: "tee" },
      { n: "Heavy outerwear", ad: 21, yoy: "−14%", dir: "down", fit: 50, g: "coat" },
    ],
    Fabrics: [
      { n: "Fluid wool / merino", ad: 34, yoy: "+58%", dir: "up", fit: 88, g: "blazer" },
      { n: "Garment-dyed cotton", ad: 29, yoy: "+41%", dir: "up", fit: 82, g: "tee" },
      { n: "Washed indigo", ad: 31, yoy: "+62%", dir: "up", fit: 78, g: "trousers" },
      { n: "Technical nylon", ad: 18, yoy: "−20%", dir: "down", fit: 44, g: "coat" },
    ],
    Necklines: [
      { n: "Open camp collar", ad: 30, yoy: "+52%", dir: "up", fit: 84, g: "tee" },
      { n: "Crew (heavy gauge)", ad: 35, yoy: "+18%", dir: "flat", fit: 80, g: "knit" },
      { n: "Funnel zip", ad: 16, yoy: "−10%", dir: "down", fit: 52, g: "knit" },
    ],
  },
  kids: {
    Silhouettes: [
      { n: "Relaxed / easy fit", ad: 38, yoy: "+44%", dir: "up", fit: 86, g: "tee" },
      { n: "Pinafore / overall", ad: 22, yoy: "+12%", dir: "flat", fit: 62, g: "dress" },
      { n: "Boxy tee", ad: 30, yoy: "+28%", dir: "up", fit: 78, g: "tee" },
    ],
    Fabrics: [
      { n: "Garment-dyed organic cotton", ad: 34, yoy: "+41%", dir: "up", fit: 84, g: "tee" },
      { n: "Soft jersey", ad: 40, yoy: "+18%", dir: "flat", fit: 80, g: "tee" },
      { n: "Linen blend", ad: 18, yoy: "+22%", dir: "up", fit: 70, g: "dress" },
    ],
    Necklines: [
      { n: "Crew", ad: 42, yoy: "+8%", dir: "flat", fit: 82, g: "tee" },
      { n: "Henley", ad: 16, yoy: "+24%", dir: "up", fit: 68, g: "tee" },
    ],
  },
};

export const COLOR_TRENDS = {
  women: [
    { n: "Bone", h: "#E7E1D3", ad: 38, yoy: "+42%", dir: "up", fit: 96 },
    { n: "Washed indigo", h: "#3C4C68", ad: 34, yoy: "+131%", dir: "up", fit: 84 },
    { n: "Clay", h: "#B07A5B", ad: 28, yoy: "+58%", dir: "up", fit: 88 },
    { n: "Ink", h: "#1B1A14", ad: 44, yoy: "+8%", dir: "flat", fit: 98 },
    { n: "Sage", h: "#8B9079", ad: 24, yoy: "+36%", dir: "up", fit: 90 },
    { n: "Neon lime", h: "#C6F23C", ad: 9, yoy: "−40%", dir: "down", fit: 12 },
  ],
  men: [
    { n: "Char", h: "#4A4944", ad: 40, yoy: "+18%", dir: "flat", fit: 92 },
    { n: "Washed indigo", h: "#3C4C68", ad: 32, yoy: "+62%", dir: "up", fit: 80 },
    { n: "Oat", h: "#CDBFA6", ad: 26, yoy: "+44%", dir: "up", fit: 84 },
    { n: "Ink", h: "#1B1A14", ad: 38, yoy: "+6%", dir: "flat", fit: 94 },
    { n: "Rust", h: "#9C4A2E", ad: 18, yoy: "+28%", dir: "up", fit: 72 },
  ],
  kids: [
    { n: "Sage", h: "#8B9079", ad: 34, yoy: "+38%", dir: "up", fit: 86 },
    { n: "Oat", h: "#CDBFA6", ad: 30, yoy: "+22%", dir: "up", fit: 82 },
    { n: "Clay", h: "#B07A5B", ad: 24, yoy: "+30%", dir: "up", fit: 78 },
    { n: "Bone", h: "#E7E1D3", ad: 28, yoy: "+12%", dir: "flat", fit: 88 },
  ],
};

export function attrDir(d) {
  return d === "up" ? ["↑", "var(--sage)"] : d === "down" ? ["↓", "var(--clay)"] : ["→", "var(--ink-3)"];
}

// Trend swatch palettes (used by the Home hero narrative), keyed by trend name.
export const TREND_SW = {
  "Sheer rib knit": ["#E7E1D3", "#9A968B", "#1B1A14"],
  "Architectural wide trouser": ["#4A4944", "#1B1A14", "#CDBFA6"],
  "Unlined chore coat": ["#3C4C68", "#8B9079", "#4A4944"],
  "Washed indigo barrel jean": ["#3C4C68", "#9A968B", "#1B1A14"],
  "Bias-cut slip dress": ["#1B1A14", "#B07A5B", "#E7E1D3"],
  "Soft-shoulder blazer": ["#4A4944", "#1B1A14", "#9A968B"],
  "Garment-dyed mini tee": ["#8B9079", "#CDBFA6", "#B07A5B"],
  "Drop-waist midi skirt": ["#4A4944", "#9A968B", "#CDBFA6"],
};

const COLOR_NAMES = {
  "#1B1A14": "Ink", "#E7E1D3": "Bone", "#3C4C68": "Washed indigo", "#B07A5B": "Clay",
  "#8B9079": "Sage", "#1F2BD6": "Cobalt", "#CDBFA6": "Oat", "#4A4944": "Char",
  "#9C4A2E": "Rust", "#9A968B": "Stone",
  // Real Complot colourways (from product imagery)
  "#2A3550": "Marino", "#2F5A3C": "Verde", "#E3C24B": "Amarillo", "#B03A2E": "Rojo", "#5C2430": "Bordo",
};
export function colName(hex) { return COLOR_NAMES[hex] || (hex || "").toUpperCase(); }

// Catalog coverage (garment|category pairs), for the "duplicate" penalty + collection-need read.
export const CATALOG_KEYS = new Set([
  "tee|Tops", "hoodie|Hoodies", "shirt|Shirts", "skirt|Skirts",
  "shorts|Shorts", "knit|Knitwear", "coat|Outerwear",
]);

