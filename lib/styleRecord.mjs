// The Style record's tab set — and, for each one, WHAT WE ACTUALLY KNOW.
//
// The owner's reference (`design/atelier-redesign/03-product-tech-pack.png`)
// shows eleven discipline tabs: Overview · Construction · BOM · Measurements ·
// Grading · Colorways · Artwork · Labels & packaging · Costing · Samples ·
// History. Drawing eleven and wiring six is how a mockup becomes a lie, so this
// module classifies every one of them against a real engine contract and the
// screen renders the classification rather than the picture.
//
// ⚠ THREE STATES, NOT TWO. `undefined`, `null` and `[]` mean different things
// and the interface must not collapse them:
//
//   loading      we have not resolved it yet            (value === undefined)
//   unavailable  WE COULD NOT ASK — engine down, 403,   (value === null)
//                a request that never answered
//   empty        we asked, it answered, there is none   (value === [])
//
// "Sin filas" over a failed request is the most expensive lie a data screen can
// tell, because it looks like an answer. The distinction is the whole reason
// this is a module with tests instead of `items?.length` at each call site.

/** REAL — a shipped engine contract backs every field this tab shows. */
export const REAL = "real";
/** PROPOSED — designed, drawn in the reference, no contract yet. Shown as a
 *  named absence so the roadmap is visible instead of the tab silently missing. */
export const PROPOSED = "proposed";

export const TABS = [
  {
    key: "overview",
    label: "Resumen",
    status: REAL,
    source: "GET /brands/{id}/styles/{style_id}",
  },
  {
    key: "lineage",
    label: "Linaje visual",
    status: REAL,
    source: "GET /brands/{id}/assets?style_id=",
    // 0075's parent_asset_id chain + 0080's intent. This is the tab that makes
    // the Style a product record rather than a row: it is where an exploratory
    // image becomes the thing being made.
  },
  {
    key: "techpack",
    label: "Ficha técnica",
    status: REAL,
    source: "GET /brands/{id}/tech-packs",
    // Per-FIELD provenance, and PUT …/fields/{key} means every professional
    // value is manually editable. That is the product principle, not a nicety.
  },
  {
    key: "colourways",
    label: "Colores y SKUs",
    status: REAL,
    source: "GET /brands/{id}/styles/{style_id}/colourways",
  },
  {
    key: "measurements",
    label: "Medidas",
    status: REAL,
    source: "GET /brands/{id}/measurement-blocks/{block_id}",
    // 0077 put the block id ON the pack, so a POM chart can name the standard
    // it was cut from. A chart that cannot is one a factory takes on faith.
  },
  {
    key: "quotes",
    label: "Cotizaciones",
    status: REAL,
    source: "GET /brands/{id}/styles/{style_id}/quotes",
  },
  {
    key: "construction",
    label: "Construcción",
    status: REAL,
    source: "GET /brands/{id}/styles/{style_id}/drawings",
    // 0082 — the first of the five declared absences to earn its contract.
    // A callout POINTS at a pack field: the value and its provenance stay in
    // the ficha, and whether the key resolves is the ENGINE's read-time
    // answer against the style's latest pack — null when there is no pack,
    // which is "unknown", not "wrong". See calloutResolutionText below.
  },
  {
    key: "bom",
    label: "BOM",
    status: REAL,
    source: "GET /brands/{id}/styles/{style_id}/bom",
    // 0083 — the second declared absence to earn its contract. The line CITES
    // a brand_materials row; price is read through the link, so a re-imported
    // sheet moves the cost without anybody editing the BOM. The roll-up is
    // the ENGINE's: it refuses a partial total and names the lines at fault.
  },
  {
    key: "samples",
    label: "Muestras",
    status: REAL,
    source: "GET /brands/{id}/styles/{style_id}/samples",
    // 0084 — the third declared absence to earn its contract. The round PINS
    // the tech pack it was cut from, and `changed_since_previous` names the
    // areas the newest round stopped mentioning as UNMENTIONED, never fixed.
  },
  // ⚠ BELOW HERE NOTHING IS BACKED. Each is in the reference image and each
  // would have to invent data to render, so each is declared rather than drawn.
  // Deleting them would hide the gap; faking them would be the failure this
  // product exists to refuse.

  {
    key: "grading",
    label: "Progresión",
    status: PROPOSED,
    needs: "reglas de progresión por talle; los bloques guardan la tabla, "
         + "no las reglas que la generan",
  },
  {
    key: "artwork",
    label: "Arte y etiquetas",
    status: PROPOSED,
    needs: "artwork, etiquetas de cuidado, packaging y código HS — ninguno "
         + "existe en el esquema",
  },

];

export const REAL_TABS = TABS.filter((t) => t.status === REAL);

/**
 * Resolve one loaded resource into a state a screen can render honestly.
 *
 * @param value  undefined = not resolved · null = could not ask · array/object
 * @returns {{state: "loading"|"unavailable"|"empty"|"ready", items}}
 */
export function resolve(value) {
  if (value === undefined) return { state: "loading", items: [] };
  if (value === null) return { state: "unavailable", items: [] };
  const items = Array.isArray(value) ? value : [value];
  if (!items.length) return { state: "empty", items: [] };
  return { state: "ready", items };
}

/** The sentence each state gets. Never "sin filas" for a request that failed. */
export function stateText(state, noun = "datos") {
  switch (state) {
    case "loading":
      return `Consultando ${noun}…`;
    case "unavailable":
      // ⚠ The important one. It says WE could not ask — it does not say the
      // brand has nothing, because we do not know that.
      return `No pudimos consultar ${noun}. El motor no respondió, así que esto `
           + `no dice que no existan.`;
    case "empty":
      return `Consultado: esta marca todavía no tiene ${noun}.`;
    default:
      return null;
  }
}

/**
 * Per-field provenance, straight from the engine's vocabulary
 * (`api/app/tech_pack.py`). The client NEVER derives this — it renders what
 * the field carries, and an unknown value is shown as unknown rather than
 * defaulted to something reassuring.
 */
export const PROVENANCE_LABEL = {
  ai_proposed: "Propuesto por IA · sin verificar",
  imported: "Importado",
  calculated: "Calculado",
  human_verified: "Verificado por una persona",
  supplier_confirmed: "Confirmado por el proveedor",
};

export function provenanceLabel(p) {
  if (!p) return "Sin procedencia registrada";
  return PROVENANCE_LABEL[p] || `Procedencia desconocida (${p})`;
}

/**
 * The engine's read-time answer for a callout that names a pack field, as a
 * sentence. THREE STATES, deliberately kept apart: `true` = the key exists in
 * the style's latest pack · `false` = it does not · `null` = there is no pack
 * to check against, OR the callout names no field. Collapsing null into false
 * would tell a designer their key is wrong when the truth is there is nothing
 * to be wrong about yet — the same lie `stateText` exists to prevent, one
 * level down.
 */
// 0091 — the OTHER pointer. A pack-field callout resolves against the pack;
// a measurement anchor resolves against the block, per size, with tolerance.
// ⚠ The three failures do not read alike, because they are not alike:
// no_block is UNKNOWN (this Style has not been measured), no_such_pom is a
// real MISMATCH (the chart exists and does not declare this point), and
// no_such_size names the sizes the block does offer.
export function pomResolutionText(m) {
  if (!m) return null;
  if (m.state === "resolved") {
    const tol = m.tolerance ? ` ±${m.tolerance}` : " · sin tolerancia declarada";
    return `${m.value} ${m.unit || ""}${tol} · talle ${m.size}`;
  }
  return m.why || m.state;
}

export function pomResolutionTone(m) {
  if (!m) return "unknown";
  if (m.state === "resolved") return "ok";
  if (m.state === "no_block") return "unknown";
  return "miss";
}

export function calloutResolutionText(callout) {
  if (!callout || !callout.field_key) return null;
  if (callout.resolved === true) {
    return `apunta a «${callout.field_key}» en la ficha`;
  }
  if (callout.resolved === false) {
    return `«${callout.field_key}» no está en la ficha — revisá la clave`;
  }
  return `«${callout.field_key}» — todavía no hay ficha contra la cual comprobar`;
}

/** A field is a release blocker while a machine is still the only one who
 *  vouched for it. Mirrors the engine's `can_be_quoted` reasoning; the ENGINE
 *  decides releasability, this only explains it. */
export function blocksRelease(field) {
  return !!field && field.provenance === "ai_proposed";
}

/**
 * The commitment footer's summary. Counts, never a verdict: the engine owns
 * `can_be_quoted` and this must not compute a second opinion beside it.
 */
export function releaseSummary(pack) {
  const fields = (pack && pack.fields) || {};
  const keys = Object.keys(fields);
  const unverified = keys.filter((k) => blocksRelease(fields[k]));
  const missing = keys.filter((k) => fields[k] && fields[k].value == null);
  return {
    total: keys.length,
    unverified: unverified.length,
    missing: missing.length,
    unverifiedKeys: unverified,
    // `null` when the engine did not say — NOT false. "We were not told" and
    // "the engine says no" are different answers to a factory.
    canBeQuoted: pack && "can_be_quoted" in pack ? pack.can_be_quoted : null,
  };
}

/**
 * The release-decision rail's one input (reference 05: "the exact reasons
 * this draft cannot be released"). Derived from the pack's own stored audit —
 * the preflight report that rode in with the document — never recomputed
 * client-side.
 *
 * THREE STATES plus absence, deliberately:
 *   none     there is no pack — nothing to decide about
 *   refused  the engine said can_be_quoted === false; `open` carries the
 *            named deficiencies (status !== "present"), in the engine's order
 *   ready    the engine said true
 *   unsaid   the engine did not say. NOT rendered as refused: a missing
 *            verdict with painted reasons would be a verdict we invented.
 */
export function releaseDecision(pack) {
  // ⚠ `open` is ALWAYS an array, in every state. It was once absent on
  // "none", and the rail read `decision.open.length` straight into a runtime
  // TypeError on any style without a pack — the most common state a real
  // pilot has. A shape that varies by branch is a trap for every caller.
  if (!pack) return { state: "none", version: null, open: [] };
  const audit = pack.audit || {};
  const summary = audit.summary || {};
  const open = (Array.isArray(audit.flags) ? audit.flags : [])
    .filter((f) => f.status !== "present");
  if (summary.can_be_quoted === true) {
    return { state: "ready", version: pack.version, open };
  }
  if (summary.can_be_quoted === false) {
    return { state: "refused", version: pack.version, open };
  }
  return { state: "unsaid", version: pack.version, open };
}


/**
 * Where one sample round stands, as a state and a sentence.
 *
 * ⚠ FOUR STATES, AND "RECEIVED BUT UNJUDGED" IS ONE OF THEM. Collapsing it
 * into "pending" would hide the only state a technical designer can act on:
 * the garment is on the desk and nobody has decided. The engine refuses a
 * verdict before `received_at` (409), so this mirrors a rule it enforces
 * rather than inventing one.
 */
export function roundState(round) {
  if (!round) return { state: "none", text: null };
  if (round.verdict && round.verdict !== "pending") {
    return {
      state: round.verdict,
      text: {
        approved: "Aprobada",
        rejected: "Rechazada",
        resample: "Pide otra muestra",
      }[round.verdict] || round.verdict,
    };
  }
  if (round.received_at) {
    return { state: "received", text: "Recibida — falta decidir" };
  }
  return { state: "awaiting", text: "Pedida — todavía no llegó" };
}

/**
 * What the newest round says about the previous one, as sentences.
 *
 * ⚠ THE UNMENTIONED LIST IS NOT A FIX LIST. The engine names areas the
 * previous round raised and the newest does not mention; nobody said they
 * were resolved, and wording it as "arreglado" would put a claim in a
 * technical designer's mouth that they never made.
 */
export function changeSentences(changed) {
  if (!changed) return [];
  const out = [];
  if (changed.still_raised?.length) {
    out.push({
      tone: "open",
      text: `Sigue observado en la ronda ${changed.to_round}: `
          + `${changed.still_raised.join(", ")}.`,
    });
  }
  if (changed.no_longer_mentioned?.length) {
    out.push({
      tone: "unmentioned",
      text: `La ronda ${changed.to_round} no menciona `
          + `${changed.no_longer_mentioned.join(", ")} — nadie dijo que esté `
          + `resuelto, sólo que no se comentó.`,
    });
  }
  if (changed.new_in_latest?.length) {
    out.push({
      tone: "new",
      text: `Nuevo en la ronda ${changed.to_round}: `
          + `${changed.new_in_latest.join(", ")}.`,
    });
  }
  return out;
}

/**
 * The first transition, said in Spanish (engine 0085).
 *
 * `category_scope` has FOUR values because three of them are not "no", and the
 * screen has to keep them apart. Collapsing `unscoped` into `other_categories`
 * would tell a designer the Dirección ruled a fabric out of this garment when
 * all it did was stay silent about categories; collapsing it the other way
 * would claim an intention nobody stated.
 *
 * An unknown key falls through as null rather than being dressed as one of the
 * four — if the engine grows a fifth answer, the screen must say nothing about
 * it instead of guessing which of these it resembles.
 */
export const SCOPE_LABEL = {
  matches: "elegida para esta categoría",
  unscoped: "sin categoría declarada",
  other_categories: "elegida para otra categoría",
  style_has_no_category: "este estilo no tiene categoría",
};

export const SCOPE_TONE = {
  matches: "match",
  unscoped: "quiet",
  other_categories: "other",
  style_has_no_category: "unknown",
};

export function scopeLabel(scope) {
  return SCOPE_LABEL[scope] ?? null;
}

/**
 * What the Dirección chip on an existing BOM line says.
 *
 * ⚠ null means TWO things and the screen must not pick one: the line was never
 * proposed by a pick, or the pick was deleted with its direction version
 * (0085's accepted loss). Saying "agregada a mano" would be a claim about the
 * first case that is wrong in the second, so the chip simply does not render.
 */
export function directionOrigin(line) {
  const from = line?.from_direction;
  if (!from) return null;
  const version = from.version_number == null ? null : `v${from.version_number}`;
  const parts = ["de Dirección"];
  if (version) parts.push(version);
  if (from.version_status && from.version_status !== "approved") {
    parts.push(`(${from.version_status})`);
  }
  return {
    text: parts.join(" · "),
    // Read through the link on every request, so withdrawing permission in
    // Dirección moves this without anybody touching the BOM.
    substitution: from.substitution_allowed
      ? (from.substitution_note || "admite reemplazo")
      : null,
  };
}

/**
 * The third transition, said in Spanish (engine 0087).
 *
 * ⚠ THE ONE RULE: nothing here may imply the correction is resolved. Opening a
 * version is INTENT — the document has promised, the garment has not proved.
 * Only a later ROUND resolves (0084), and `tests/styleRecord.test.mjs` asserts
 * that none of these strings contains a word for "fixed".
 */
export function openedVersionsText(comment) {
  const versions = comment?.opened_pack_versions || [];
  if (!versions.length) return null;
  const names = versions.map((v) => `v${v.version}`).join(", ");
  return versions.length === 1
    ? `ficha ${names} abierta por esta corrección`
    : `fichas ${names} abiertas por esta corrección`;
}

/**
 * What just happened when a designer opened a revision.
 *
 * Two outcomes that are NOT the same thing: a new version was minted from the
 * released one, or the corrections were added to a draft that was already open.
 * Saying "se abrió la v3" in the second case would claim a document that does
 * not exist, and a designer would go looking for it.
 */
export function revisionOutcomeText(result) {
  if (!result?.target_pack) return null;
  const v = result.target_pack.version;
  const n = (result.corrections || []).length;
  const what = n === 1 ? "1 corrección" : `${n} correcciones`;
  const head = result.already
    ? `Estas correcciones ya estaban citadas en la ficha v${v}.`
    : result.opened_new_version
      ? `Se abrió la ficha v${v} para responder ${what}.`
      : `Se sumaron ${what} a la ficha v${v}, que ya estaba abierta.`;
  // The sentence the screen must be able to show verbatim, in the engine's
  // words when it sent them.
  return {
    head,
    caveat: result.note
      || "abrir la versión no resuelve nada — sólo una ronda posterior puede "
         + "decir que la prenda quedó bien",
  };
}
