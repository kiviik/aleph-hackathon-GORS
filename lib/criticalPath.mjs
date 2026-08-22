// The critical path, read honestly.
//
// The engine shipped `api/app/routers/milestones.py` + `api/app/critical_path.py`
// with ZERO frontend callers. What it computes is narrow and it says so in
// every answer: ARITHMETIC OVER RECORDED DATES. A done milestone is fixed at
// the date it happened, an undone one can never land before today, and nothing
// lands before what it waits on. There are no default durations anywhere,
// because "a typical duration is a guess wearing a number".
//
// This module's whole job is to keep that narrowness intact on screen:
//
//   · THE STATE IS THE ENGINE'S WORD. `late`, `at_risk`, `on_track`, `done`,
//     `unplanned` arrive computed, together with the `why` sentence that
//     justifies each one. Nothing here compares a date to `Date.now()` — a
//     second opinion formed in the browser is the one nobody could trace, and
//     it would disagree with the engine the first time a timezone did.
//   · A STATE THIS DOES NOT RECOGNISE IS SHOWN, NOT SWALLOWED (the
//     statusVocabulary rule). An engine that grows a sixth state must not
//     render as the fifth.
//   · `duplicate_milestones` IS A WARNING, NEVER A DEDUPE. Two rows sharing a
//     key in one scope used to collapse silently — a style's own ex-factory
//     could vanish, or replace the collection's and move everybody's launch.
//     The engine now keeps the first and NAMES the loser; a screen that
//     quietly dropped the name would restore the bug it fixed.
//   · THREE STATES KEPT APART. undefined = not asked · null = could not ask ·
//     `milestones: []` = asked, and this collection has no calendar yet. The
//     third has its own engine sentence pointing at the seed endpoint.
//
// Dependency-free (.mjs) so it is unit-tested without a DOM, like money.mjs
// and suppliers.mjs.

/** The five states `critical_path.project` can emit, with the word the screen
 *  shows and the tone it wears. An unknown key resolves to `null` on purpose —
 *  see `stateRead`. */
export const MILESTONE_STATES = {
  done: { label: "Hecho", tone: "done" },
  late: { label: "Atrasado", tone: "bad" },
  at_risk: { label: "En riesgo", tone: "warn" },
  on_track: { label: "En fecha", tone: "ok" },
  unplanned: { label: "Sin fecha", tone: "absent" },
};

/** The order the buckets are read in: what is wrong first, what is settled
 *  last. Triage, not a filing cabinet. */
export const STATE_ORDER = ["late", "at_risk", "unplanned", "on_track", "done"];

/**
 * The engine's state as something renderable, or `null` when the engine said
 * a word this build does not know.
 *
 * ⚠ NOT COERCED TO A DEFAULT. Rendering an unrecognised state as "En fecha"
 * would be the screen claiming something it never checked — the same rule
 * `lib/statusVocabulary.mjs` carries for plan status.
 */
export function stateRead(state) {
  if (typeof state !== "string" || !state) return null;
  return MILESTONE_STATES[state] || null;
}

/** Slip as a signed sentence. Late and early are different conversations, and
 *  `0` is a third one — it is the plan being met, not the absence of an answer.
 *  `null` (no planned date) stays null: there is nothing to measure against. */
export function slipText(days) {
  if (days === null || days === undefined) return null;
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  if (n > 0) return `${n} día(s) más tarde que lo planificado`;
  if (n < 0) return `${Math.abs(n)} día(s) antes de lo planificado`;
  return "en la fecha planificada";
}

/**
 * Same-scope duplicates, as sentences somebody can act on.
 *
 * The engine keeps the FIRST row and reports the rest. That is deterministic
 * rather than correct — the loser is real data nobody can see in the calendar
 * — so this is a warning with a fix in it, not a footnote.
 */
export function duplicateWarnings(payload) {
  const rows = payload && Array.isArray(payload.duplicate_milestones)
    ? payload.duplicate_milestones : [];
  return rows.filter((d) => d && typeof d.key === "string").map((d) => ({
    key: d.key,
    styleId: d.style_id ?? null,
    text: `«${d.key}» está cargado dos veces en el mismo alcance`
      + (d.style_id ? ` (estilo ${String(d.style_id).slice(0, 8)})`
                    : " (calendario de la colección)")
      + " — el motor conserva la primera fila y la segunda no entra en ningún"
      + " cálculo. Hay que borrar la que sobra.",
  }));
}

/**
 * One `GET …/critical-path` payload resolved into a renderable state.
 *
 *   loading      we have not asked yet                    (undefined)
 *   unavailable  we could not ask, or the shape drifted   (null / not an object)
 *   unseeded     we asked; this collection has no calendar (milestones: [])
 *   ready        the projection, with everything it named
 *
 * "Sin hitos" over a failed request is the lie this separation exists to stop.
 */
export function pathRead(payload) {
  if (payload === undefined) return { state: "loading" };
  if (!payload || typeof payload !== "object") return { state: "unavailable" };
  const rows = Array.isArray(payload.milestones) ? payload.milestones : null;
  if (rows === null) return { state: "unavailable" };

  const shared = {
    basis: typeof payload.basis === "string" ? payload.basis : null,
    duplicates: duplicateWarnings(payload),
    missing: Array.isArray(payload.missing_milestones) ? payload.missing_milestones : [],
    unplanned: Array.isArray(payload.unplanned_milestones) ? payload.unplanned_milestones : [],
    unresolvable: Array.isArray(payload.unresolvable) ? payload.unresolvable : [],
    launch: payload.launch || null,
  };
  if (rows.length === 0) return { state: "unseeded", rows: [], ...shared };
  return { state: "ready", rows, ...shared };
}

/**
 * Display order. Two modes, and NEITHER invents a fact:
 *
 *   "sequence"  the engine's own order — dependency sequence, style overrides
 *               riding directly after the collection row they shadow. Untouched.
 *   "date"      ascending by the PROJECTED date the engine computed. A row it
 *               could not project (a dependency cycle) sorts last rather than
 *               being assigned a date to sort by.
 *
 * Stable in both: the engine's index breaks every tie, so two rows on the same
 * day keep the order the calendar gave them.
 */
export function orderRows(rows, mode = "sequence") {
  const list = Array.isArray(rows) ? rows : [];
  if (mode !== "date") return list.slice();
  return list
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const da = a.row?.projected_date || null;
      const db = b.row?.projected_date || null;
      if (da === db) return a.index - b.index;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    })
    .map((x) => x.row);
}

/** How many rows sit in each state, using the ENGINE's field and nothing else.
 *  States this build does not know are counted under their raw key so a new
 *  one shows up as a number rather than disappearing. */
export function stateCounts(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = typeof row?.state === "string" ? row.state : "desconocido";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/** The scope a row belongs to: the collection's base calendar, or one style's
 *  overlay. The engine tags overlays with `style_id`; a row without one is the
 *  calendar everybody shares. */
export function scopeOf(row) {
  const styleId = row?.style_id ?? null;
  return styleId
    ? { scope: "style", styleId, label: `Excepción del estilo ${String(styleId).slice(0, 8)}` }
    : { scope: "collection", styleId: null, label: "Calendario de la colección" };
}

/**
 * Whether this screen may edit a row, and why not when it may not.
 *
 * ⚠ THE ENGINE'S WRITE IS COLLECTION-SCOPED. `PUT …/milestones/{key}` selects
 * `style_id IS NULL` — a style's override is created through `POST …/milestones`
 * with a `style_id` and there is no keyed update for it. So a style overlay is
 * READ-ONLY here, and the screen says that instead of offering a control whose
 * save would 404 or, worse, edit the collection-wide row underneath it.
 */
export function editable(row) {
  if (!row || typeof row.key !== "string") {
    return { can: false, why: "fila sin clave — no hay nada que el motor pueda actualizar" };
  }
  if (row.style_id) {
    return {
      can: false,
      why: "es la excepción de un estilo: el motor sólo actualiza por clave el "
         + "calendario de la colección (PUT …/milestones/{key} filtra "
         + "style_id IS NULL), así que esta fila se edita donde se creó",
    };
  }
  return { can: true, why: null };
}

/**
 * The body for `PUT …/milestones/{key}` — ONLY the fields the user touched.
 *
 * The engine reads it with `exclude_unset`, so an omitted key is left alone and
 * a key sent as `null` is CLEARED. That difference is the whole contract: a
 * builder that helpfully filled in the untouched field would wipe it.
 *
 * `""` from an emptied `<input type="date">` means "clear this", which is a
 * decision; `undefined` means "not touched", which is not.
 */
export function milestonePatch(edits = {}) {
  const body = {};
  for (const [field, key] of [["plannedDate", "planned_date"],
                              ["actualDate", "actual_date"],
                              ["supplierId", "supplier_id"],
                              ["owner", "owner"]]) {
    if (!(field in edits)) continue;
    const value = edits[field];
    if (value === undefined) continue;
    body[key] = value === "" || value === null ? null : value;
  }
  return body;
}

/** Did the user actually change anything? An empty patch must never be sent:
 *  the engine would re-project and re-render for nothing, and a "guardado" for
 *  a no-op is a claim that something happened. */
export function hasEdits(body) {
  return !!body && Object.keys(body).length > 0;
}

/**
 * The launch verdict — the only reason any of the upstream rows are
 * interesting. `null` is a real answer: a calendar with no `launch` row (or a
 * cycle that could not be projected) has no projected drop, and that is not a
 * number to fill in.
 */
export function launchRead(read) {
  const row = read?.launch || null;
  if (!row) {
    return {
      known: false,
      why: "esta colección no tiene un hito de lanzamiento proyectado, así que "
         + "no hay fecha de salida que derivar del calendario",
    };
  }
  return {
    known: true,
    row,
    state: row.state || null,
    plannedDate: row.planned_date || null,
    projectedDate: row.projected_date || null,
    slip: slipText(row.slip_days),
    why: row.why || null,
  };
}

/**
 * What the calendar could NOT walk, as sentences. Every one of these is a real
 * count from the payload — an empty list produces no sentence at all rather
 * than "0 hitos faltantes", which reads as a clean bill of health.
 */
export function coverageNotes(read) {
  const notes = [];
  const missing = read?.missing || [];
  const unplanned = read?.unplanned || [];
  const unresolvable = read?.unresolvable || [];
  if (missing.length) {
    notes.push({
      kind: "missing",
      text: `${missing.length} paso(s) de la secuencia estándar no existen en `
          + `este calendario (${missing.join(", ")}). La fecha proyectada se `
          + `calculó sin ellos.`,
    });
  }
  if (unplanned.length) {
    notes.push({
      kind: "unplanned",
      text: `${unplanned.length} hito(s) sin fecha planificada `
          + `(${unplanned.join(", ")}) — el motor no asume una.`,
    });
  }
  if (unresolvable.length) {
    notes.push({
      kind: "unresolvable",
      text: `${unresolvable.length} hito(s) no se pueden proyectar porque sus `
          + `dependencias forman un ciclo (${unresolvable.join(", ")}).`,
    });
  }
  return notes;
}

/**
 * ⚠ WHAT THE CALENDAR READ CANNOT ANSWER, AND WHY IT IS NOT DRAWN.
 *
 * `collection_milestones.supplier_id` exists (engine migration 0071) and
 * `GET /suppliers/{id}/performance` is computed from exactly those rows. But
 * `critical_path.project` does not put `supplier_id` on the rows it returns —
 * the projection emits key, style_id, label, dates, slip, state, owner,
 * depends_on, blocked_by, why, and nothing else. There is no other read of the
 * milestone table anywhere in the engine.
 *
 * So NO client can list "this factory's milestones", and a screen that filtered
 * a brand-wide calendar under one factory's name would be re-creating the
 * exact defect 0071 fixed: brand-wide numbers presented as one supplier's
 * record. This constant is the sentence both screens render instead.
 */
export const SUPPLIER_ATTRIBUTION_UNREADABLE =
  "El motor guarda a qué fábrica corresponde cada hito (migración 0071) y "
  + "calcula el cumplimiento con esas filas, pero su proyección del calendario "
  + "no devuelve ese campo: `GET …/critical-path` entrega clave, fechas, estado "
  + "y responsable, nunca el proveedor. Por eso esta pantalla no arma una lista "
  + "de «los hitos de esta fábrica»: filtrar el calendario de toda la marca bajo "
  + "un solo nombre es precisamente el error que 0071 corrigió.";
