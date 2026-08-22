// Pure rules for reading a collection's creative direction (ROADMAP §3b).
//
// Split out from `direction.js` so every judgement a screen makes can be
// exercised without a network — the same split as `collectionBrief.mjs` and
// `imports.mjs`.
//
// THE RULE THIS FILE EXISTS TO HOLD: it computes NOTHING the engine already
// answered. Sourceability verdicts, price reconciliation and rule violations all
// arrive decided; this module only arranges them for reading. A frontend that
// re-derives "can this fabric be bought" would eventually disagree with the
// server, and the disagreement would surface as a designer being told two
// different things by two screens.

/** Affordances derived from the SERVER's status, never from local optimism. */
export function affordances(directionPayload) {
  const working = directionPayload?.working_version || null;
  const status = directionPayload?.status || "empty";
  if (!working) {
    return {
      exists: Boolean(directionPayload?.exists),
      status,
      editable: false,
      submittable: false,
      approvable: false,
      canOpenNextVersion: Boolean(directionPayload?.exists),
      frozen: false,
    };
  }
  return {
    exists: true,
    status,
    editable: working.editable === true,
    submittable: working.status === "draft",
    // Whether THIS user may approve is the engine's call (it refuses an
    // unverified identity with a 403). The screen offers the control when the
    // version is in review and lets the server be the authority on who.
    approvable: working.status === "in_review",
    // Only when nothing is already open — the engine 409s a second draft.
    canOpenNextVersion: working.editable !== true,
    frozen: working.immutable === true,
  };
}

// --------------------------------------------------------------------------- //
// palette
// --------------------------------------------------------------------------- //

export const COLOUR_ROLE_LABEL = {
  hero: "Protagonista",
  support: "Acompaña",
  neutral: "Neutro",
  accent: "Acento",
};

const ROLE_ORDER = ["hero", "support", "neutral", "accent"];

/**
 * The palette grouped by role, with its declared share.
 *
 * `shareTotal` is reported as a NUMBER and a state, never silently normalised.
 * A palette whose shares sum to 140% is a mistake worth seeing; rescaling it to
 * 100 would hide the mistake and invent intent nobody expressed.
 */
export function palette(colours = []) {
  const rows = Array.isArray(colours) ? colours : [];
  const byRole = ROLE_ORDER.map((role) => ({
    role,
    label: COLOUR_ROLE_LABEL[role],
    colours: rows.filter((c) => c.role === role),
  })).filter((g) => g.colours.length > 0);

  const declared = rows.filter((c) => c.share_pct != null);
  // Strings from the engine (NUMERIC never becomes a float in transit), summed
  // as numbers only for display.
  const shareTotal = declared.reduce((sum, c) => sum + Number(c.share_pct), 0);

  let shareState = "none";
  if (declared.length > 0) {
    if (declared.length < rows.length) shareState = "partial";
    else if (Math.abs(shareTotal - 100) < 0.01) shareState = "complete";
    else shareState = shareTotal > 100 ? "over" : "under";
  }

  return {
    byRole,
    total: rows.length,
    heroes: rows.filter((c) => c.role === "hero").length,
    shareTotal: declared.length ? Number(shareTotal.toFixed(2)) : null,
    shareDeclared: declared.length,
    shareState,
  };
}

// --------------------------------------------------------------------------- //
// fabrics
// --------------------------------------------------------------------------- //

export const SOURCEABILITY_LABEL = {
  ok: "Se puede comprar para este rango",
  blocked: "No se puede comprar para este rango",
  unknown: "No lo podemos saber con los datos que hay",
};

/**
 * Group the fabric picks by what the engine said about sourcing them.
 *
 * `unknown` is deliberately its OWN group and is not folded in with `ok`. A
 * material sheet with an empty MOQ column is the normal case, and a screen that
 * showed those as fine would be making exactly the promise the engine refused to
 * make.
 */
export function fabricGroups(fabrics = []) {
  const rows = Array.isArray(fabrics) ? fabrics : [];
  const of = (verdict) => rows.filter((f) => f.sourceability?.verdict === verdict);
  return {
    ok: of("ok"),
    blocked: of("blocked"),
    unknown: of("unknown"),
    // A pick whose material row could not be read at all. Distinct from
    // `unknown`, which means the row was read and is incomplete.
    unresolved: rows.filter((f) => !f.material),
    total: rows.length,
  };
}

// code -> (params) => Spanish, or null when the params cannot support the
// sentence. The engine sends `{code, need, have}` alongside an English
// `message`, and the PRECEDENCE MATTERS: a known code is worded here, and the
// server's sentence is the FALLBACK for codes this build has not learned yet.
//
// Getting that order backwards is not a style question — it is how English
// lands on a client-facing Spanish screen, which is exactly the defect the
// 07-25 reason-code policy exists to stop. (It is also how this module was
// first written, and the reconciliation strings below reached a real screen in
// English before anyone looked.)
// `Number(null)` is 0 and `Number("")` is 0, both finite — so a bare
// `Number.isFinite(Number(v))` turns a MISSING value into a confident zero and
// prints "the supplier minimum is 0". Absent is rejected explicitly, and the
// caller then falls back to the engine's own sentence.
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const FABRIC_REASON = {
  below_moq: ({ need, have }) => {
    const [n, h] = [num(need), num(have)];
    return n == null || h == null
      ? null
      : `el mínimo del proveedor es ${n} y el rango planea ${h}`;
  },
  lead_time_exceeds_window: ({ need, have }) => {
    const [n, h] = [num(need), num(have)];
    return n == null || h == null
      ? null
      : `la tela tarda ${n} días y quedan ${h} hasta la entrega`;
  },
  // A window that already closed is its own sentence. "La entrega empieza en
  // -147 días" is arithmetically true and unreadable, and it points at the
  // fabric when the thing to fix is the date.
  delivery_window_passed: ({ days_ago }) => {
    const d = num(days_ago);
    return d == null
      ? null
      : `la fecha de entrega pasó hace ${d} días: ningún tiempo de producción `
        + "puede cumplirla, hay que corregir la fecha";
  },
};

/** The human sentence for one blocked reason. Never blank: a gate that blocked
 *  something and will not say why reads as "no reason", the one thing this
 *  product refuses to say. */
export function reasonText(reason) {
  if (!reason) return null;
  const write = FABRIC_REASON[reason.code];
  const ours = write ? write(reason) : null;
  if (ours) return ours;
  if (reason.message) return reason.message;
  return reason.code ? `el motor informó ${reason.code}` : null;
}

// The reconciliation states carry the same pairing: `message` (the engine's
// fallback) plus `message_code` = {code, params}.
const RECONCILE_REASON = {
  plan_outside_band: ({ rows, category }) => {
    const n = num(rows);
    return n == null
      ? null
      : `${n} fila(s) del plan quedan fuera de la banda de ${category}`;
  },
  band_currency_mismatch: ({ currency, rows }) => {
    const n = num(rows);
    return n == null
      ? null
      : `la banda está en ${currency} y ${n} fila(s) del plan no — no se puede `
        + "comparar sin inventar un tipo de cambio";
  },
  plan_not_directed: ({ rows, category }) => {
    const n = num(rows);
    return n == null
      ? null
      : `el plan tiene ${n} fila(s) en ${category} y la dirección no fija banda`;
  },
  band_not_planned: ({ category }) =>
    `la dirección fija una banda para ${category} y el plan no tiene filas ahí`,
};

/** Spanish for one reconciliation category, same fallback chain as above. */
export function reconcileText(entry) {
  if (!entry) return null;
  const spec = entry.message_code;
  const write = spec ? RECONCILE_REASON[spec.code] : null;
  const ours = write ? write(spec.params || {}) : null;
  if (ours) return ours;
  if (entry.message) return entry.message;
  return spec?.code ? `el motor informó ${spec.code}` : null;
}

/** Which fields a material sheet is missing, in words a designer can act on. */
export const UNKNOWN_FIELD_LABEL = {
  moq_units: "el mínimo de compra (MOQ)",
  lead_time_days: "el tiempo de producción",
  planned_units: "unidades planificadas en el rango",
  delivery_start: "fecha de entrega en el brief",
  currency: "la moneda del precio",
};

export function unknownFieldsText(fields = []) {
  const named = (fields || []).map((f) => UNKNOWN_FIELD_LABEL[f] || f);
  if (named.length === 0) return null;
  if (named.length === 1) return `falta ${named[0]}`;
  return `faltan ${named.slice(0, -1).join(", ")} y ${named[named.length - 1]}`;
}

// --------------------------------------------------------------------------- //
// price reconciliation
// --------------------------------------------------------------------------- //

export const RECONCILE_LABEL = {
  agrees: "Coincide con el plan",
  outside_band: "El plan queda fuera de la banda",
  currency_mismatch: "Monedas distintas — no se puede comparar",
  not_planned: "Sin filas en el plan",
  not_directed: "El plan va más allá de la dirección",
};

/**
 * Split the reconciliation into what disagrees and what does not.
 *
 * `not_directed` is NOT a disagreement — a plan may legitimately go beyond the
 * direction, and calling that an error would push someone to delete a real
 * commercial row to silence a warning.
 */
export function reconciliation(payload) {
  const categories = payload?.categories || [];
  const disagreeing = categories.filter(
    (c) => c.state === "outside_band" || c.state === "currency_mismatch");
  return {
    categories,
    disagreeing,
    agreeing: categories.filter((c) => c.state === "agrees"),
    // Named separately so a screen can show them without alarm.
    informational: categories.filter(
      (c) => c.state === "not_planned" || c.state === "not_directed"),
    reconciled: payload?.reconciled === true,
    contradictions: payload?.contradictions || 0,
  };
}

// --------------------------------------------------------------------------- //
// references
// --------------------------------------------------------------------------- //

export const PURPOSE_LABEL = {
  colour: "Color",
  silhouette: "Silueta",
  styling: "Styling",
  mood: "Clima",
  detail: "Detalle",
  fabric: "Tela",
};

export const RIGHTS_LABEL = {
  own_archive: "Archivo propio",
  licensed: "Con licencia",
  supplier_provided: "La dio el proveedor",
  public_reference: "Referencia pública",
  unknown: "Origen sin confirmar",
};

/**
 * References grouped by what they teach, plus the rights picture.
 *
 * `rightsUnclear` counts `unknown` and `public_reference` TOGETHER, because for
 * the question "can we generate from this and show a client" they carry the same
 * risk, and separating them on screen would suggest one is settled when it is
 * not. Both remain individually visible on the card itself.
 */
export function references(refs = []) {
  const rows = Array.isArray(refs) ? refs : [];
  const byPurpose = Object.keys(PURPOSE_LABEL)
    .map((purpose) => ({
      purpose,
      label: PURPOSE_LABEL[purpose],
      refs: rows.filter((r) => r.purpose === purpose),
    }))
    .filter((g) => g.refs.length > 0);

  return {
    byPurpose,
    total: rows.length,
    rightsUnclear: rows.filter(
      (r) => r.rights === "unknown" || r.rights === "public_reference").length,
    ownArchive: rows.filter((r) => r.rights === "own_archive").length,
    // Which KINDS are missing. A board that is all "mood" and no "silhouette" is
    // a specific gap, and it is invisible from a total.
    missingPurposes: Object.keys(PURPOSE_LABEL).filter(
      (p) => !rows.some((r) => r.purpose === p)),
  };
}

// --------------------------------------------------------------------------- //
// rules
// --------------------------------------------------------------------------- //

export const RULE_SCOPE_LABEL = {
  category: "categoría",
  colour: "color",
  fabric: "tela",
  silhouette: "silueta",
  styling: "styling",
  detail: "detalle",
  any: "cualquier campo",
};

export function rules(all = []) {
  const rows = Array.isArray(all) ? all : [];
  return {
    mustInclude: rows.filter((r) => r.kind === "must_include"),
    mustAvoid: rows.filter((r) => r.kind === "must_avoid"),
    total: rows.length,
    // A rule with no reason is the one that gets overridden by the first person
    // in a hurry. Counted so the screen can say so.
    withoutReason: rows.filter((r) => !r.reason).length,
  };
}
