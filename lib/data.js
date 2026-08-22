// Demo constants ported from the prototype runtime (atelier-runtime.js).
//
// 2026-08-07 PURGE. Everything here is a SAMPLE, and the rule now is: a sample
// constant survives in this file only if a component still imports it AND that
// component labels it as a sample on screen. Everything else is deleted, not
// commented out — an unimported fabricated number is a number waiting for a
// future import to make it a lie.
//
// Deleted (verified zero importers first): KPIS (€482k net revenue, 71%
// sell-through, 34 days cover, 8.1% returns), BRIEF (five invented "reorder
// 600 / mark down 20%" cards), WINNERS, WHITESPACE + wsRanked/wsReason,
// BOARD_ARCHIVED, DNA_PROV, DNA_COMMERCIAL, DNA_CONSUMER, COLORS. None of
// them rendered anywhere; all of them read as real revenue if reintroduced.
//
// What survives, and why it is allowed to:
//   FAB_TEX  — a fabric→texture-class lookup, no claim in it (lib/format.js).
//   BOARD    — Pipeline's reference board, rendered under an explicit
//              "Reference only … clearly labelled sample" heading.
//   CMP_*    — Competitors' sample space, demoted into a <details> disclosure
//              beneath the engine-driven body.
//   DNA_CORE — the brand's own declared codes, not a measurement.


export const FAB_TEX = {
  "Organic cotton": "tex-jersey",
  Satin: "tex-satin",
  "Merino wool": "tex-knit",
  "Rib knit": "tex-rib",
  Tencel: "tex-satin",
  Linen: "tex-linen",
  "Recycled poly": "tex-jersey",
  "Technical shell": "tex-twill",
  Denim: "tex-denim",
  Twill: "tex-twill",
};




// None of these are actually connected — no fabricated sync notes ("Synced 4m
// ago · 3,412 orders" over a disconnected connector makes a brand doubt every
// real number). The only live connection is the engine card in Integrations.
// INTG (the five connector cards) is GONE — 2026-08-07. The connectors on the
// Integraciones screen are `integration_catalog` rows from the engine, joined
// to whether this deployment has an adapter and whether this brand turned it
// on. A bundled array could not tell those apart, and that screen is the first
// one a pilot brand opens.


export const BOARD = {
  Brief: [{ n: "Sheer rib knit", cat: "Knitwear", gd: "Women", c: "#9A968B", f: "Rib knit", g: "knit", owner: "Elena", due: "Jul 1", src: "OP-014", blocker: null, review: null }],
  Concept: [{ n: "Washed indigo barrel jean", cat: "Denim", gd: "Women", c: "#3C4C68", f: "Denim", g: "trousers", owner: "Elena", due: "Jul 4", src: "OP-021", blocker: null, review: null }],
  Review: [{ n: "Bias slip dress — D2", cat: "Dress", gd: "Women", c: "#1B1A14", f: "Satin", g: "dress", owner: "Elena", due: "Jun 30", src: "OP-007", blocker: "Fabric opacity not approved", review: "Creative review required" }],
  Development: [{ n: "Unlined chore coat", cat: "Outerwear", gd: "Men", c: "#3C4C68", f: "Twill", g: "coat", owner: "Priya", due: "Jul 8", src: "OP-018", blocker: null, review: null }],
  Sample: [{ n: "Wide trouser — charcoal", cat: "Tailoring", gd: "Women", c: "#4A4944", f: "Twill", g: "trousers", owner: "Priya", due: "Jul 12", src: "OP-002", blocker: null, review: null }],
  Approved: [{ n: "Ribbed merino tank", cat: "Knitwear", gd: "Women", c: "#E7E1D3", f: "Merino wool", g: "knit", owner: "Elena", due: "—", src: "OP-005", blocker: null, review: null }],
};
export const BOARD_ORDER = ["Brief", "Concept", "Review", "Development", "Sample", "Approved"];

// ---- Competitors ----
export const CMP_BRANDS_DATA = [
  // Complot's watchlist: local direct competitors + the international brands
  // it aspires to (more successful, same girl). Sample moves, plausible scale.
  { init: "47", c: "#1B1A14", nm: "47 Street", group: "direct", seg: "Directa · retail AR", crawl: "hace 3 h", covered: 640, depth: "12 meses", conf: "Alta",
    change: { type: "Cambio de surtido", conf: "Alta", headline: "El denim pasó de 18% a 27% del surtido en 45 días — liderado por baggy", detail: "22 SKU nuevos de denim · promedio AR$71k · baggy y2k y cargo · poca rotura de talles", expose: "Ataca directo tu categoría más fuerte, con más profundidad de talles." },
    timeline: [
      { d: "Lun · Jul 6", t: "Drop denim baggy", p: "22 SKUs, tiro bajo", badge: "Drop", bc: "var(--cobalt-wash)", tc: "var(--cobalt-ink)" },
      { d: "Jue · Jul 2", t: "3 cuotas sin interés", p: "toda la tienda", badge: "Promo", bc: "var(--clay-wash)", tc: "var(--clay)" },
    ] },
  { init: "MU", c: "#9C4A2E", nm: "Muaa", group: "direct", seg: "Directa · retail AR", crawl: "hace 5 h", covered: 520, depth: "12 meses", conf: "Media",
    change: { type: "Precio", conf: "Media", headline: "Bajó precios de entrada 12% en tops", detail: "baby tees AR$32k → AR$28k · empata tu precio exacto", expose: "Te alcanzó en precio en tu producto héroe." },
    timeline: [
      { d: "Mar · Jul 7", t: "Baja de precios tops", p: "-12% entrada", badge: "Price", bc: "var(--ochre-wash)", tc: "var(--ochre)" },
      { d: "Vie · Jul 3", t: "Restock minis", p: "cargo y tablead as", badge: "Restock", bc: "#E9F1EC", tc: "var(--sage)" },
    ] },
  { init: "BM", c: "#B07A5B", nm: "Brandy Melville", group: "aspirational", seg: "Aspiracional · global", crawl: "hace 6 h", covered: 1450, depth: "24 meses", conf: "Alta",
    change: { type: "Señal de categoría", conf: "Alta", headline: "Baby tees gráficas: 40+ estampas activas, rotación semanal", detail: "promedio USD 22 · sin promos · la gráfica ES el producto", expose: "Tu línea gráfica tiene 6 estampas — la de ellos, 40. La profundidad de estampas es el juego." },
    timeline: [
      { d: "Lun · Jul 6", t: "12 gráficas nuevas", p: "rock/americana vintage", badge: "+12", bc: "#E9F1EC", tc: "var(--sage)" },
      { d: "Mié · Jul 1", t: "Sin descuentos", p: "full price desde 2023", badge: "Price", bc: "var(--ink)", tc: "#fff" },
    ] },
  { init: "SU", c: "#4A4944", nm: "Subdued", group: "aspirational", seg: "Aspiracional · UE", crawl: "hace 8 h", covered: 980, depth: "18 meses", conf: "Alta",
    change: { type: "Cambio de surtido", conf: "Alta", headline: "Animal print total: 28 SKUs entre tops, minis y denim", detail: "leopardo en satén y denim · promedio EUR 39 · casi sin talles grandes", expose: "Validación de tu apuesta animal print — pero ellos la llevan a denim, vos todavía no." },
    timeline: [
      { d: "Mar · Jul 7", t: "Leopard denim drop", p: "8 SKUs", badge: "Drop", bc: "var(--cobalt-wash)", tc: "var(--cobalt-ink)" },
      { d: "Sáb · Jul 4", t: "Campaña IG noche", p: "satén + brillo", badge: "Campaign", bc: "var(--ink)", tc: "#fff" },
    ] },
  { init: "MR", c: "#3C4C68", nm: "Motel Rocks", group: "emerging", seg: "Emergente · UK/TikTok", crawl: "hace 12 h", covered: 760, depth: "12 meses", conf: "Media",
    change: { type: "Señal de canal", conf: "Alta", headline: "Los tops metalizados de fiesta explotan en TikTok Shop", detail: "minis liquid-shine y tube tops · agotados en 72 h · mucho contenido de usuarias", expose: "La categoría noche-brillo crece y tu única entrada es el corset que no rota." },
    timeline: [
      { d: "Dom · Jul 5", t: "Metallic drop sold out", p: "72 horas", badge: "Drop", bc: "var(--cobalt-wash)", tc: "var(--cobalt-ink)" },
      { d: "Jue · Jul 2", t: "TikTok Shop push", p: "40+ creators", badge: "Social", bc: "#E9F1EC", tc: "var(--sage)" },
    ] },
  { init: "ZT", c: "#8B9079", nm: "Zara TRF", group: "retailer", seg: "Retailer · referencia", crawl: "hace 4 h", covered: 2100, depth: "12 meses", conf: "Alta",
    change: { type: "Promoción", conf: "Alta", headline: "Adelantó rebajas de temporada una semana", detail: "30% en denim de la temporada pasada · presión de precio en la calle", expose: "Presión directa sobre tu denim core en las próximas 4 semanas." },
    timeline: [
      { d: "Lun · Jul 6", t: "Sale adelantado", p: "-30% denim", badge: "Promo", bc: "var(--clay-wash)", tc: "var(--clay)" },
      { d: "Mié · Jul 1", t: "Cargo everything", p: "12 SKUs cargo nuevos", badge: "+12", bc: "#E9F1EC", tc: "var(--sage)" },
    ] },
];
// Sample-only labels, in the product's language. CMP_* is read by
// components/views/Competitors.jsx and nowhere else.
export const CMP_GROUPS = { direct: "Competencia directa", aspirational: "Aspiracionales", emerging: "Emergentes", retailer: "Retailers y referencias" };
export const CMP_BRANDS = ["Vos", "47 Street", "Muaa", "Brandy M.", "Subdued"];
export const CMP_TABLE = [
  { r: "Precio medio tops", vals: ["AR$34k", "AR$38k", "AR$29k", "USD 22", "EUR 35"] },
  { r: "Cadencia de drops", vals: ["Mensual", "Quincenal", "Mensual", "Semanal", "Semanal"] },
  { r: "Share denim", vals: ["31%", "27% ▲", "18%", "12%", "22%"] },
  { r: "% con descuento", vals: ["14%", "22%", "26%", "0%", "8%"] },
  { r: "Estampas activas", vals: ["6", "14", "9", "40+", "28"] },
];

// ---- Brand DNA ----
// Real Complot DNA: rock / cinema / plastic-arts inspiration, exclusive
// printed fabrics ("estampas propias"), the price/design/quality equation,
// "actitud y funcionalidad".
export const DNA_CORE = {
  codes: ["Estampas propias", "Rock/cine graphics", "Oversize urbano", "Precio/diseño/calidad"],
  forbidden: ["Logomania ajena", "Sastrería formal", "Boho romántico", "Minimalismo austero"],
  always: ["Estampa propia", "Actitud y funcionalidad", "Gráfica rock/cine", "Ecuación precio/diseño/calidad"],
};
