// The screen a brand meets before it has any evidence (reference screen 06).
//
// ⚠ THE PROBLEM THIS SOLVES IS NOT THE EMPTY STATES. Every screen in Atelier is
// already honest about having nothing, and that is right. What is discouraging
// is that the honesty arrives with NOTHING TO DO: a new brand reads "sin
// dirección · sin filas · sin datos" across the product before anything pays
// off. `SOLO-DESIGNER.md` names this as the last open gap of the four, and the
// fix is an ACTION beside each absence, not a friendlier word for "no data".
//
// ⚠ AND THE RULE THAT OUTRANKS EVERYTHING HERE: *manual work is not a degraded
// mode, it is the base product*. A brief, a reference with its rights recorded,
// a Style and its technical record are all available on day one with zero
// evidence connected. This module lists them FIRST and the absences second.
//
// Everything is pure: it takes what the caller already fetched and returns
// sentences. It asks nothing, computes no counts of its own, and invents no
// state — an unknown answer stays unknown.

/** The three states an absence can be in, kept apart on purpose.
 *
 *  `asked_none`    — we asked and the answer was genuinely empty
 *  `not_connected` — there is no connector; nobody has been asked anything
 *  `unknown`       — we could not ask (engine down, request failed)
 *
 *  ⚠ Collapsing these into "sin datos" is the single defect screen 06 exists to
 *  prevent. They have different next actions, and one of them ("we could not
 *  ask") is not the brand's fault at all. */
export const ASKED_NONE = "asked_none";
export const NOT_CONNECTED = "not_connected";
export const UNKNOWN = "unknown";

export const STATE_LABEL = {
  [ASKED_NONE]: "preguntamos · no hay nada todavía",
  [NOT_CONNECTED]: "sin conectar",
  [UNKNOWN]: "no pudimos preguntar",
};

/** What Atelier will not do, no matter how empty it is. Not copy: each line is
 *  a refusal the engine actually implements, and the screen states them up
 *  front so the first impression is what the product will not fake. */
export const REFUSALS = [
  "un pronóstico de demanda sin ventas propias validadas",
  "un mejor proveedor sin cotizaciones comparables",
  "un margen calculado sobre campos vacíos",
  "una medida deducida de un render",
  "un cero donde el estado real es «sin conectar»",
];

/** Work that pays off today, with nothing connected. Ordered by what costs her
 *  least to start. */
export const MANUAL_FIRST = [
  { key: "import", title: "Importá lo que ya tenés",
    text: "Una planilla de productos, materiales o ventas. Se mapea columna por "
        + "columna y no se incorpora nada hasta que lo confirmes.",
    view: "integrations" },
  { key: "brief", title: "Escribí el brief de la colección",
    text: "La temporada, el objetivo y las restricciones. Es un documento "
        + "versionado, no un campo de texto.",
    view: "collectionbrief" },
  { key: "direction", title: "Elegí colores, siluetas y telas",
    text: "La dirección creativa condiciona lo que se genera después, y una "
        + "tela elegida acá llega al BOM con su proveedor.",
    view: "direction" },
  { key: "style", title: "Creá un estilo y su ficha",
    text: "Medidas, construcción y BOM se cargan a mano desde el primer día.",
    view: "style" },
];

const count = (value) => (Array.isArray(value) ? value.length : 0);

/**
 * The absences worth naming, each with the state it is really in.
 *
 * `catalog` and `sales` are what `getBrandCatalog` / `getSalesSummary`
 * returned: `null` means the request failed (UNKNOWN), an object means we
 * asked. `integrations` is `getBrandIntegrations`.
 */
export function absences({ catalog, sales, integrations } = {}) {
  const out = [];

  if (catalog === null || catalog === undefined) {
    out.push({ key: "catalog", title: "Catálogo", state: UNKNOWN,
               text: "El motor no respondió, así que no sabemos qué hay.",
               action: null });
  } else if (!count(catalog.products)) {
    out.push({ key: "catalog", title: "Catálogo", state: ASKED_NONE,
               text: "Preguntamos y esta marca todavía no tiene productos "
                   + "cargados.",
               action: { label: "Importar productos", view: "integrations" } });
  }

  // ⚠ Sales are NOT_CONNECTED rather than asked-and-empty when no integration
  // is enabled: nobody has been asked anything, and "0 ventas" would be a
  // number where the truth is an absent connector.
  const connected = Array.isArray(integrations?.integrations)
    ? integrations.integrations.filter((i) => i.enabled_for_brand).length
    : null;
  if (sales === null || sales === undefined) {
    out.push({ key: "sales", title: "Ventas", state: UNKNOWN,
               text: "El motor no respondió, así que no sabemos qué hay.",
               action: null });
  } else if (!sales.sales_rows) {
    const noConnector = connected === 0 || connected === null;
    out.push({
      key: "sales", title: "Ventas",
      state: noConnector ? NOT_CONNECTED : ASKED_NONE,
      text: noConnector
        ? "No hay ninguna integración de ventas encendida para esta marca. "
          + "Sin eso no hay margen, ni probabilidad, ni reposición — y un cero "
          + "acá sería inventado."
        : "La integración está encendida y todavía no trajo filas.",
      action: { label: noConnector ? "Conectar o importar ventas"
                                   : "Ver el estado de la integración",
                view: "integrations" },
    });
  }

  return out;
}

/**
 * Whether this brand is genuinely at the start.
 *
 * ⚠ DELIBERATELY STRICT. A brand with one decision waiting, or a catalog, or
 * any sales, is not cold-starting — showing it a first-run panel would be the
 * product telling a working brand it has not begun. `unknown` never counts as
 * empty: a failed request is not an empty brand.
 */
export function isColdStart({ catalog, sales, cases } = {}) {
  if (catalog === null || catalog === undefined) return false;
  if (sales === null || sales === undefined) return false;
  if (count(cases)) return false;
  return !count(catalog.products) && !sales.sales_rows;
}
