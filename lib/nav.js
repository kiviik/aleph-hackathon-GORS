// Sidebar structure + view titles.
// Each item: { view, label, badge? }. Groups render as .nav-label headers.
//
// 2026-07-19 (later): the six-section collapse (Hoy/Mercado/…) is ROLLED BACK
// by owner request — back to the full navigation where every view is a
// first-class destination. The section wrappers (Today/Market/LinePlan/
// Concepts/Results) stay on disk, and their hash ids still resolve through
// ALIASES below, so "#/market:signals"-era deep links keep landing correctly.
//
// 2026-07-21 — restructured around the CREATION JOURNEY (TRUST-ARCHITECTURE
// vision). The front door is what a brand-conditioned product-development
// partner does: see an opportunity → create → develop → review → learn. Market
// intelligence (Observatory, Signals, Competitors, gaps) is demoted to
// supporting EVIDENCE, not the front door. View ids are unchanged so all
// routing/aliases/deep-links keep working — only grouping, order and labels
// move. Fabrics and Try-on are steps 3-4 of the journey; they live inside
// Concept Studio (the fabric library + the item editor's try-on), so the
// journey names them in the group note rather than as dead top-level links.

// 2026-07-24 — FIVE WORK-SHAPED GLOBALS (owner reorg audit): Hoy · Colección ·
// Mercado · Resultados · Datos & Marca. Navigation reflects the collection-
// development loop, not Atelier's feature architecture. Every view id is
// unchanged (routing/aliases/deep-links intact) and every view stays reachable
// — this is regrouping, NOT the six-section wrapper collapse rolled back on
// 07-19. "The Brief" is renamed "Market Direction": it is honestly a market
// discovery card today; the structured, versioned collection Brief is a
// separate object to build (owner audit #2).
// Five global workspaces. The old sidebar rendered every feature as a peer:
// 21 destinations under five headings. That made a coherent collection graph
// feel like a toolbox. The globals below are the durable product shape; the
// smaller lists under CONTEXT_NAV are tools shown only inside the workspace
// where they make sense. Collection stages themselves live in StageRail.
// 2026-08-06 — FOUR DESTINATIONS (owner reference designs).
//
// The previous shell offered five globals and 22 secondary destinations, and a
// six-stage rail described a third, overlapping model. A user had to learn
// Atelier's internal architecture before doing their own work.
//
// The rule now: a DESTINATION is a place you go. A TOOL is something you open
// where you already are. Only four things are destinations. Everything else
// opens inside the collection workspace, which is why CONTEXT_NAV below is no
// longer rendered as a parallel menu — it is kept only so the ids it names
// stay documented in one place, and every view id remains routable.
export const GLOBAL_NAV = [
  { key: "today", view: "today", label: "Hoy", icon: "home", note: "Decisiones del día" },
  { key: "collection", view: "portfolio", label: "Colecciones", icon: "grid", note: "Desarrollo de colecciones" },
  { key: "intelligence", view: "observatory", label: "Inteligencia", icon: "chart", note: "Mercado y señales" },
  { key: "results", view: "decisions", label: "Resultados", icon: "check", note: "Evaluación y aprendizaje" },
  { key: "library", view: "brand", label: "Marca & datos", icon: "book", note: "Activos y configuración" },
];

// ⚠ `collection` USED TO BE A KEY HERE AND IS DELETED (2026-08-14). It was a
// FOURTH map of the same territory, kept only "so the ids it names stay
// documented in one place" — and Sidebar.jsx never rendered it, because the
// collection drawer comes from COLLECTION_AREAS. An unrendered list nobody
// reads is a list nobody maintains: this one still named `dashboard` and
// `materials` as collection tools after both had moved, which is exactly the
// drift that produced the teleport. Documentation that can go stale silently
// is worse than no documentation, and COLLECTION_AREAS is the real thing.
export const CONTEXT_NAV = {
  market: {
    label: "Herramientas de mercado",
    items: [
      // FIRST, and not by accident: it is the only view here that is not about
      // this brand. Everything below it is this brand's reading of the market;
      // this is the market, shared, identical for every tenant.
      { view: "world", label: "Inteligencia mundial" },
      { view: "observatory", label: "Observatorio" },
      { view: "trends", label: "Señales" },
      { view: "competitors", label: "Competidores" },
      { view: "library", label: "Biblioteca de evidencia" },
      { view: "products", label: "Búsqueda visual" },
      // Collection-linked in feel, market evidence in fact — and it has to be
      // reachable under the global that owns it, not the one it talks about.
      { view: "dashboard", label: "Dirección de mercado" },
    ],
  },
  results: {
    label: "Lecturas de resultado",
    // Only what is read ACROSS collections. `launchresults` moved to the
    // collection that launched it — see VIEW_SECTIONS below.
    items: [
      { view: "decisions", label: "Memoria de decisiones" },
    ],
  },
  data: {
    label: "Datos y gobierno",
    items: [
      { view: "catalog", label: "Catálogo" },
      { view: "materials", label: "Materiales" },
      // The factories the brand works with are a brand asset exactly like a
      // fabric: they outlive any one collection, and their performance is
      // computed by the engine from the critical path — never entered here.
      { view: "suppliers", label: "Proveedores" },
      { view: "brand", label: "ADN de marca" },
      { view: "calibration", label: "Calibración" },
      { view: "integrations", label: "Integraciones" },
    ],
  },
};

// Every view id still resolves — nothing became unreachable, it stopped being
// a MENU ENTRY. The collection owns its whole life including its outcome, so
// `decisions` and `launchresults` live under it rather than in a fifth global
// that split one collection's story across two destinations.
// ⚠ ONE CANONICAL OWNER PER ROUTE (owner review 2026-08-14). THIS MAP IS THE
// ONLY AUTHORITY. Three maps used to claim a view independently — this one,
// CONTEXT_NAV above, and COLLECTION_AREAS in lib/collectionAreas.js — and they
// disagreed. "Biblioteca de evidencia" was listed under Inteligencia AND
// inside the collection drawer, while this map filed it under Marca & datos,
// so clicking it lit a third thing. Catálogo opened from the collection's
// commercial plan threw you out of the collection.
//
// The owner's word was "teleport", and it was accurate: the sidebar answered a
// different question from the one that had just been clicked.
//
// `tests/navOwnership.test.mjs` now fails if any menu lists a view under a
// section this map does not assign it to, so the drawers cannot drift by hand.
const VIEW_SECTIONS = {
  today: "today",

  // Colecciones — the collection workspace and every stage inside it.
  portfolio: "collection",
  recorrido: "collection",
  command: "collection",
  collectionbrief: "collection",
  direction: "collection",
  whitespace: "collection",
  contradictions: "collection",
  feed: "collection",
  inspiration: "collection",
  studio: "collection",
  // The canvas is a place inside the collection's design work, not a global
  // tool: every reference on it is this brand's, every generation it sends
  // carries the collection, and the board is stored per brand.
  canvas: "collection",
  lineplan: "collection",
  boards: "collection",
  // The Style is a collection STAGE, not a global directory. A garment is
  // developed inside the collection making it, and its landed cost and margin
  // are per season for exactly that reason (STYLE-DECISIONS D6) — a Style can
  // be made by a different factory next season without becoming a new Style.
  style: "collection",
  chain: "collection",
  techpack: "collection",
  review: "collection",
  // The critical path is the collection's CALENDAR — brief approved through
  // ex-factory to the drop. It is collection-scoped in the engine too: every
  // route is `/brands/{b}/collections/{c}/…`, because a calendar belongs to one
  // drop and a brand-wide one would be a list of other people's dates.
  criticalpath: "collection",
  launch: "collection",
  collections: "collection",

  // The collection owns its whole life, INCLUDING its outcome: brief → range
  // → concepts → development → review → launch → result. A single launch's
  // result belongs to the collection that launched it.
  launchresults: "collection",

  // Resultados — ONLY what is read ACROSS collections. The ledger qualifies;
  // one launch's numbers do not, and splitting a single collection's story
  // across two destinations is what made "result" feel like a different
  // product from the collection that produced it.
  decisions: "results",

  // Inteligencia — external evidence, which exists to serve a collection.
  //
  // ⚠ `world` WAS MISSING FROM THIS MAP (owner review 2026-08-11, finding #8)
  // and its absence had two effects, not one. It could not be reached from the
  // sidebar at all — only by typing `#/world` — and when reached that way
  // `sectionForView` fell through to its default and lit "Hoy", so the one
  // screen that is NOT about this brand was filed under the brand's own day.
  world: "intelligence",
  observatory: "intelligence",
  trends: "intelligence",
  competitors: "intelligence",
  products: "intelligence",
  dashboard: "intelligence",

  // Inteligencia, continued: the evidence library is the CITED half of the
  // market — everything the observatory saw, kept with its origin. Its own
  // breadcrumb has always read "INTELIGENCIA · MERCADO GLOBAL"; only this map
  // disagreed, which is precisely why clicking it moved the sidebar somewhere
  // the screen did not claim to be.
  library: "intelligence",

  // Marca & datos — what the brand is made of, and how it is governed. These
  // outlive any one collection: a fabric with its MOQ and lead time is a brand
  // asset that collections draw on, not a possession of the collection open at
  // the time you happened to open it.
  catalog: "library",
  materials: "library",
  // Suppliers live with the brand's assets, not inside a collection: the award
  // is per season (STYLE-DECISIONS D6), but the factory itself — its MOQ, its
  // lead time, its delivery history — is something every collection draws on.
  suppliers: "library",
  brand: "library",
  calibration: "library",
  integrations: "library",
};

export function sectionForView(view) {
  return VIEW_SECTIONS[view] || "today";
}

// Kept as a compatibility export for any external prototype importing NAV.
// New product chrome uses GLOBAL_NAV + CONTEXT_NAV.
export const NAV = GLOBAL_NAV.map((item) => ({ group: null, items: [item] }));

// Footer links under the main nav (unused since the rollback; Sidebar still maps it).
export const FOOTER_NAV = [];

// ONE CLIENT-FACING LANGUAGE. The product is Spanish-first — Argentine pilot
// brand, Spanish copy everywhere else — and it was showing "Range Plan",
// "Review Room", "Market Direction", "Materials Library", "Brand Genome" and
// "Concept Studio" in the middle of it. Mixed chrome reads as an unfinished
// product regardless of what the screens say, and it is the first thing a
// client notices.
//
// The terms kept in English are the ones the industry uses in English in
// Spanish-speaking studios too (drop, newness, open-to-buy, lead time, MOQ).
// Translating those would be worse: nobody in a showroom says "tiempo de
// entrega de fábrica".
export const TITLES = {
  today: "Hoy",
  portfolio: "Colecciones",
  recorrido: "Recorrido de la colección",
  command: "Centro de colección",
  dashboard: "Dirección de mercado",
  inspiration: "Inspiración",
  feed: "Propuestas",
  studio: "Estudio de concepto",
  canvas: "Lienzo",
  materials: "Biblioteca de materiales",
  collectionbrief: "Brief de colección",
  direction: "Dirección de la colección",
  launch: "Lanzamiento",
  launchresults: "Resultados de lanzamiento",
  lineplan: "Plan de rango",
  review: "Sala de revisión",
  criticalpath: "Ruta crítica",
  collections: "Render de cápsula",
  world: "Inteligencia mundial",
  observatory: "Observatorio",
  library: "Biblioteca",
  trends: "Señales",
  competitors: "Competidores",
  whitespace: "Oportunidades",
  contradictions: "Lo que no cierra",
  catalog: "Catálogo",
  suppliers: "Proveedores",
  products: "Búsqueda visual",
  boards: "Desarrollo",
  style: "Estilo",
  chain: "La cadena",
  techpack: "Ficha técnica",
  decisions: "Resultados",
  brand: "ADN de marca",
  calibration: "Ajuste de marca (calibración)",
  integrations: "Integraciones",
};

// Six-section-era ids → the views they composed. Tab-qualified keys
// ("market:observatory") win over bare heads ("market"), so every deep link
// from the collapsed era lands on the right first-class view.
export const ALIASES = {
  // "today" is now a first-class view (the decision screen) — no longer an
  // alias of the dashboard.
  "market:observatory": "observatory",
  "market:signals": "trends",
  "market:competitors": "competitors",
  market: "trends",
  "lineplan:huecos": "whitespace",
  "lineplan:catalogo": "catalog",
  lineplan: "lineplan",
  "concepts:propuestas": "feed",
  "concepts:studio": "studio",
  "concepts:capsulas": "collections",
  concepts: "feed",
  "results:pipeline": "boards",
  "results:decisiones": "decisions",
  results: "decisions",
};

// Resolve any navigation id (six-section alias, view id, or "view:tab") to
// { view, tab }. Unknown ids fall back to the landing view.
// Land on the operational inbox — work first, not a feed of proposals.
export const DEFAULT_VIEW = "today";

// The collection travels in the hash as a query suffix: "#/studio?collection=<id>".
// A suffix rather than a path segment because every existing deep link and every
// alias below is bare "view" or "view:tab" — restructuring to "#/c/:id/:stage"
// would invalidate all of them. No existing hash contains "?", so this is
// backwards compatible by construction (2026-07-24, ROADMAP §2).
export function splitCollection(raw) {
  const str = String(raw || "");
  const q = str.indexOf("?");
  if (q === -1) return { path: str, collectionId: null };
  const params = new URLSearchParams(str.slice(q + 1));
  return { path: str.slice(0, q), collectionId: params.get("collection") || null };
}

/**
 * The same hash with a different collection on it — path, tab and any other
 * query parameter left exactly as they were.
 *
 * ⚠ WHY THIS IS A FUNCTION AND NOT A TEMPLATE STRING AT EACH CALL SITE (owner
 * review, 2026-08-13). Three places wrote this URL by hand and each wrote a
 * different subset of it, which is how "which collection am I on" ended up with
 * three writers that disagreed. Composing the hash from scratch is also what
 * would silently drop a tab or an unrelated parameter; this edits only the one
 * key it owns and copies the rest through.
 */
export function withCollection(hash, collectionId) {
  const raw = String(hash || "").replace(/^#\/?/, "");
  const q = raw.indexOf("?");
  const path = q === -1 ? raw : raw.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
  if (collectionId) params.set("collection", collectionId);
  else params.delete("collection");
  const query = params.toString();
  return `#/${path}${query ? `?${query}` : ""}`;
}

export function resolveView(rawIn) {
  const { path: raw } = splitCollection(rawIn);
  const [head, tabIn] = String(raw || "").split(":");
  const target = ALIASES[tabIn ? `${head}:${tabIn}` : head] || ALIASES[head] || head;
  const [view, tabAlias] = target.split(":");
  if (!TITLES[view]) return { view: DEFAULT_VIEW, tab: null };
  // A resolved alias ("market:signals" → "trends") consumes the tab; only an
  // explicit tab on a real view id ("trends:foo") passes through.
  const tab = target.includes(":") ? tabAlias : ALIASES[`${head}:${tabIn}`] ? null : tabIn || null;
  return { view, tab };
}

// The honesty line: what each view's data actually is.
//   live   — everything shown comes from the engine
//   mixed  — engine data present, but some numbers are still sample
//   sample — not connected to the engine at all yet
export const VIEW_DATA_STATUS = {
  today: "live", // reads decision_cases straight from the engine; nothing sample
  // Every answer is the engine's, including the ones that refuse to answer.
  command: "live",
  portfolio: "live",
  recorrido: "live",
  dashboard: "mixed",
  // "live" here only to suppress the engine banners: the Inspiration Room shows
  // the designer's OWN uploads/notes, no engine data is involved, and the
  // in-view chip states the real scope ("solo en este navegador").
  inspiration: "live",
  feed: "mixed",
  studio: "mixed",
  // Everything on the canvas is the designer's own material or the engine's
  // own answer: dropped files, rows from this brand's ledger, generations that
  // came back with a control mapping, and refusals rendered verbatim. Nothing
  // is sample — and the board's browser-only scope is stated in the view, not
  // implied by this label.
  canvas: "live",
  materials: "live",
  collectionbrief: "live",
  direction: "live",
  launch: "live",
  launchresults: "live",
  lineplan: "live",
  review: "live",
  // Every date, every state and every refusal is the engine's. The screen
  // never compares a date to the browser clock — `late` and `at_risk` arrive
  // computed, with the sentence that justifies them.
  criticalpath: "live",
  collections: "live",
  // The only view here with NO sample mode at all. `lib/worldApi.js` has no
  // demo fallback on purpose — plausible market evidence with no source is the
  // false intelligence the 08-07 purge removed — so an unreachable engine
  // renders a refusal, never numbers. Marking it anything but "live" would put
  // a "do not use these numbers" banner over the one screen whose numbers are
  // always the engine's.
  world: "live",
  observatory: "live",
  library: "live", // todo sale del crawl fechado; sin crawl no hay tarjetas
  trends: "mixed",
  competitors: "mixed",
  // Every row comes from something the engine already computed; nothing here
  // is sample, and an empty list is a real answer about a real collection.
  contradictions: "live",
  // brand side = the brand's own engine catalog, competitor side = the real
  // crawl; the SCORE is a computed heuristic, hence mixed rather than live.
  whitespace: "mixed",
  catalog: "sample",
  // Directory rows and performance both come from the engine, and performance
  // is DERIVED from the critical path — when there is not enough history the
  // screen renders the engine's own "why not" sentence, never a number.
  suppliers: "live",
  products: "mixed", // catálogo real + mercado crawleado real; similitud = heurística por atributos
  boards: "live",
  // Every tab it renders reads an engine contract, and the five disciplines it
  // CANNOT back (construcción, BOM, progresión, arte, muestras) are declared as
  // absences rather than drawn — see lib/styleRecord.mjs. "live" is the honest
  // label precisely because nothing on it is sample.
  style: "live",
  // Every stage is read from the engine, including the ones that answer
  // "no provider" and "no rows" — those are engine answers too.
  chain: "live",
  techpack: "live",
  decisions: "live",
  brand: "mixed", // engine DNA + bands derived here from the brand's own catalog
  calibration: "live", // judgments + held-out accuracy, all real
  integrations: "mixed",
};

// Views ported to real React so far. Everything else renders a migration
// placeholder (which deep-links to the working prototype) in the same shell.
export const PORTED = new Set([
  "world",
  "today",
  "portfolio",
  "recorrido",
  "command",
  "dashboard",
  "observatory",
  "library",
  "feed",
  "integrations",
  "boards",
  "decisions",
  "whitespace",
  "competitors",
  "brand",
  "trends",
  "catalog",
  "products",
  "studio",
  "canvas",
  "materials",
  "collectionbrief",
  "direction",
  "launch",
  "launchresults",
  "lineplan",
  "review",
  "collections",
  "calibration",
  "suppliers",
  "criticalpath",
]);
