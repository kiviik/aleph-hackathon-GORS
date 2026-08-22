// The collection's work areas — ONE definition, used by the navigation.
//
// 2026-08-06. History worth keeping, because this list has now moved three
// times and the reasons are the useful part:
//
//   · It was 11 flat items in the sidebar, peers of "Hoy". That made a coherent
//     collection graph read as a toolbox — you had to learn Atelier's
//     architecture before doing your own work.
//   · Removing it left 14 screens routable but unreachable, which is a routing
//     fact, not a product one.
//   · Putting it back as a panel inside the screens hid it: on the collection
//     overview it sat below the fold, and on the portfolio it interrupted the
//     list of collections with an index for just one of them.
//
// So it lives in the sidebar, where people look for navigation, but grouped by
// the QUESTION you are trying to answer rather than listed flat. Five groups
// you can scan beats twenty-one names you have to read.
//
// GROUPED BY QUESTION, NOT BY FEATURE. "Dónde trabajo la paleta" and "dónde
// apruebo" are different questions; one alphabetical list answered neither.

export const COLLECTION_AREAS = [
  {
    key: "direccion",
    label: "Dirección creativa",
    note: "Qué va a ser esta colección: color, silueta, tela, referencias.",
    items: [
      { view: "direction", label: "Dirección", note: "Paleta, siluetas y telas aprobadas" },
      { view: "inspiration", label: "Inspiración", note: "Referencias e historias visuales" },
      { view: "collections", label: "Render de cápsula", note: "La colección vista junta" },
    ],
  },
  {
    key: "comercial",
    label: "Plan comercial",
    note: "Cuánto, a qué precio y con qué margen.",
    items: [
      { view: "collectionbrief", label: "Brief de colección", note: "El contrato que aprueba dirección", stage: "brief" },
      { view: "lineplan", label: "Plan de rango", note: "Posiciones, unidades, precio y margen", stage: "range" },
      { view: "whitespace", label: "Oportunidades", note: "Huecos de surtido contra el mercado" },
    ],
  },
  {
    key: "diseno",
    label: "Diseño",
    note: "Dibujar los productos y moverlos hasta que estén listos.",
    items: [
      // ⚠ FIRST IN THIS GROUP, 2026-08-18. The rest of Diseño is forms and
      // generated cards: you describe a garment and the product answers with a
      // grid. The canvas is the other direction — the designer's own material
      // on a surface she arranges, with the model working INSIDE it ("hacé la
      // manga más ancha", over the region she selected) rather than producing
      // outputs alongside the workflow. That is the shape of the work, so it
      // opens the group.
      { view: "canvas", label: "Lienzo", note: "Las imágenes en la mano: referencias, marcas propias y edición por región" },
      { view: "studio", label: "Estudio de concepto", note: "Generar y comparar conceptos", stage: "develop" },
      { view: "feed", label: "Propuestas", note: "Lo que el motor propone incorporar" },
      { view: "boards", label: "Desarrollo", note: "El tablero de lo que está en curso" },
      // ⚠ THE STYLE SITS ABOVE THE FICHA ON PURPOSE. A pack is one document
      // ABOUT a garment; the Style IS the garment — linaje visual, ficha,
      // colores, medidas y cotizaciones en un solo hilo. That thread only
      // became real on 2026-08-16, when 0074 wrote `slot.style_id` and carried
      // `tech_pack_drafts.style_id` through revision.
      { view: "style", label: "Estilo", note: "La prenda: linaje, ficha, colores, medidas y cotizaciones" },
      // ⚠ BEFORE THE FICHA, because it is the road to it: inspo → imagen →
      // 3D (rama) → ficha, with each stage stating its own state. The four
      // objects existed separately for months and the product read as four
      // tools that share a database.
      { view: "chain", label: "La cadena", note: "De la inspiración a la ficha, con el estado de cada paso" },
      { view: "techpack", label: "Ficha técnica", note: "El documento que la fábrica necesita para cotizar" },
    ],
  },
  {
    key: "salida",
    label: "Revisión y salida",
    note: "Aprobar, lanzar y medir lo que pasó.",
    items: [
      // The calendar first: it is the one area that answers "when", and a slip
      // here is what moves everything below it.
      { view: "criticalpath", label: "Ruta crítica", note: "Las fechas del calendario y qué le hacen al lanzamiento" },
      { view: "contradictions", label: "Lo que no cierra", note: "Todo lo que no cuadra, junto y con su origen" },
      { view: "review", label: "Revisión", note: "Aprobar una versión exacta", stage: "review" },
      { view: "launch", label: "Lanzamiento", note: "Registrar qué salió y cuándo", stage: "launch" },
      { view: "launchresults", label: "Resultado de lanzamiento", note: "Qué vendió y qué enseñó", stage: "results" },
    ],
  },
];

// ⚠ WHAT WAS REMOVED FROM HERE, 2026-08-14, AND WHY IT IS NOT A LOSS.
//
// This list used to carry a sixth group, "Evidencia de mercado" (Dirección de
// mercado · Señales · Competidores · Búsqueda visual · Biblioteca), plus
// Catálogo, Materiales and Memoria de decisiones. Every one of those is owned
// by a DIFFERENT global in lib/nav.js VIEW_SECTIONS — so clicking one from
// inside the collection drawer moved the sidebar to Inteligencia, or to
// Marca & datos, or to Resultados, and the collection you were working in
// disappeared underneath you. The owner reviewed all 30 routed views and
// described it as the product "teleporting" between contexts.
//
// The rule that replaced it (owner's words): contextual links may OPEN those
// objects, but they must not duplicate the navigation hierarchy. So this file
// now lists only what the collection actually owns, and the removed views stay
// reachable under the global that does own them — nothing became unreachable,
// it stopped being claimed twice. `tests/navOwnership.test.mjs` enforces it.

// Which group holds a view — so the sidebar opens the one you are standing in
// rather than making you remember which drawer you came out of.
export function areaForView(view) {
  const hit = COLLECTION_AREAS.find((g) => g.items.some((i) => i.view === view));
  return hit ? hit.key : null;
}

// Every view these areas can reach. Used by the reachability check: if a view
// exists in the router and appears in neither this list nor GLOBAL_NAV, it is
// unreachable by clicking, which is the bug this file exists to prevent.
export const AREA_VIEWS = COLLECTION_AREAS.flatMap((g) => g.items.map((i) => i.view));
