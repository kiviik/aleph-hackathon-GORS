// Import Centre — the pure half, so `node --test` covers it directly.
//
// Everything in here answers one question: what is this screen allowed to SAY
// about a file? The engine already refuses to import an unconfirmed mapping;
// these helpers exist so the screen cannot describe a file as further along
// than it is, which is the only way the chain
//
//     subido → interpretado → campos mapeados → CONFIRMADO POR VOS → incorporado
//
// stays worth showing. A progress bar that fills itself is decoration.

/** The chain, in order. The server sends the same keys on every import. */
export const CHAIN = ["uploaded", "interpreted", "mapped", "confirmed", "incorporated"];

/** How a mapping was arrived at, said plainly. Never a percentage. */
export const HOW = {
  exacta: { label: "coincidencia exacta", tone: "ok" },
  parecido: { label: "por parecido", tone: "warn" },
  modelo: { label: "propuesta por el modelo", tone: "warn" },
  elegida: { label: "elegida por vos", tone: "ok" },
};

export const KIND_LABELS = {
  ventas: "Ventas",
  stock: "Stock",
  devoluciones: "Devoluciones",
  catalogo: "Catálogo de productos",
  materiales: "Ficha de materiales",
};

/**
 * How far the file actually got. Returns the LAST step whose `done` is true,
 * and stops at the first one that is not — a later `done` after a gap is a
 * server bug, and rendering past the gap would hide it.
 */
export function reached(steps = []) {
  let last = null;
  for (const key of CHAIN) {
    const step = steps.find((s) => s.key === key);
    if (!step || !step.done) break;
    last = key;
  }
  return last;
}

/** Is this file waiting on a person? The number the screen leads with. */
export function awaitingConfirmation(imports = []) {
  return imports.filter((i) => i.status === "interpreted").length;
}

/**
 * The one-line status, in the brand's language. Deliberately says "nada se
 * incorporó todavía" rather than "listo" for an interpreted file: a preview
 * that reads as done is the misunderstanding this whole feature is against.
 */
export function statusLine(imp) {
  if (!imp) return "";
  switch (imp.status) {
    case "unreadable":
      return `No se pudo leer: ${imp.error || "motivo no informado"}`;
    case "discarded":
      return "Descartado — no se incorporó nada";
    case "incorporated":
      return `Incorporado${imp.confirmed_by ? ` · confirmado por ${imp.confirmed_by}` : ""}`;
    case "interpreted":
      return imp.blocking?.length
        ? `Falta responder: ${imp.blocking[0].question}`
        : `${imp.row_count} fila(s) listas — nada se incorporó todavía, falta que lo confirmes`;
    default:
      return imp.status || "";
  }
}

/**
 * Can this import be confirmed right now, and if not, exactly why not.
 * Mirrors the engine's refusals — the button must not be enabled into a 422 —
 * but the engine remains the authority: this never lets anything through that
 * the server would refuse, it only avoids asking.
 */
export function confirmBlockers(imp, answers = {}) {
  const out = [];
  if (!imp) return ["No hay ningún archivo seleccionado."];
  if (imp.status !== "interpreted") {
    out.push(`Este archivo está en estado «${imp.status}» y ya no se puede confirmar.`);
    return out;
  }
  for (const f of imp.missing_required || []) {
    out.push(`Falta mapear un campo obligatorio: ${f.label}. Elegí la columna del archivo o subí otro archivo.`);
  }
  for (const q of imp.questions || []) {
    if (q.blocking && !answers[q.id]) out.push(q.question);
  }
  if (!imp.row_count && imp.kind !== "devoluciones") {
    out.push("Con este mapeo no queda ninguna fila legible. No se incorpora nada.");
  }
  return out;
}

/**
 * The mapping table rows, in the order a person reads them: required fields
 * first, then the resemblance matches that need a look, then the rest.
 */
export function mappingRows(mapping = {}) {
  const rank = (m) => (m.required ? 0 : m.how === "parecido" || m.how === "modelo" ? 1 : 2);
  return Object.entries(mapping)
    .map(([field, m]) => ({
      field,
      label: m.label || field,
      column: m.column,
      how: m.how,
      howLabel: HOW[m.how]?.label || m.how,
      tone: HOW[m.how]?.tone || "warn",
      required: !!m.required,
    }))
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

/**
 * What actually landed, as a sentence. Zero counts are DROPPED rather than
 * printed as "0 estilos creados", except when everything is zero — in which
 * case saying so is the whole point.
 */
export function resultLine(result) {
  if (!result) return null;
  const words = {
    rows: "filas", superseded_rows: "filas reemplazadas",
    styles_created: "estilos nuevos", styles_existing: "estilos que ya existían",
    colourways_created: "colores nuevos", colourways_existing: "colores que ya existían",
    skus_created: "SKUs nuevos", skus_existing: "SKUs que ya existían",
    rows_without_colour: "filas sin color (quedaron como estilo)",
    rows_without_size: "filas sin talle (no generan SKU)",
    rows_without_sku_code: "filas sin código de SKU (no se inventa uno)",
    created: "materiales nuevos", updated: "materiales actualizados",
    priced_without_currency: "con precio sin moneda (precio no guardado)",
  };
  const parts = Object.entries(result)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${v} ${words[k] || k.replace(/_/g, " ")}`);
  if (!parts.length) return "No se creó ningún registro nuevo.";
  return parts.join(" · ");
}

/** Base64 for the binary path (XLSX), chunked so a big sheet does not blow the
 *  argument limit of String.fromCharCode. */
export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Text file or binary? Only what we can prove is text goes down the text path. */
export function isTextFile(filename = "") {
  return /\.(csv|tsv|txt)$/i.test(filename);
}
