// The world layer's RULES, with no fetch in them — so they can be tested.
//
// Split from `lib/worldApi.js` for the reason every `.mjs` twin in this
// directory exists: the transport needs a browser and the rules do not, and a
// rule nobody can test is a rule that drifts. What lives here is everything
// that decides what a reader is shown — including the one that matters most,
// `assertBrandFree`.
//
// WHY THAT ONE IS CODE AND NOT A COMMENT. `world_observations` has no brand
// column and a test in the engine asserts its absence on both ledger tables.
// The client side of that invariant has to be equally hard: if a world request
// could carry a tenant, two brands asking the same question could get two
// different answers, and the entire argument for a shared evidence network is
// that they cannot. So the refusal is a function, and it is tested.

// Names that would smuggle a tenant into a shared question. Checked by NAME
// because that is how it would arrive: somebody adds `?brand_id=` "just to
// filter the view".
export const TENANT_PARAMS = ["brand_id", "brandid", "brand", "tenant_id", "tenant"];

export class WorldRequestRefused extends Error {}

export function assertBrandFree(path) {
  const query = String(path).split("?")[1] || "";
  for (const key of new URLSearchParams(query).keys()) {
    if (TENANT_PARAMS.includes(key.toLowerCase())) {
      throw new WorldRequestRefused(
        `una consulta al mundo no lleva «${key}»: si dos marcas preguntan lo ` +
        `mismo tienen que recibir la misma respuesta, y ese es todo el ` +
        `argumento de una red de evidencia compartida.`
      );
    }
  }
  return path;
}

// --------------------------------------------------------------------------
// reading the record, without re-deciding anything
// --------------------------------------------------------------------------

// The engine decides these. The screen's job is to render the verdict it was
// given, not to form a second one — a threshold in the browser is the opinion
// nobody can trace back to a policy row.
export const STATUS_LABEL = {
  published: "Publicado",
  indicative: "Indicativo",
  refused: "Rechazado",
  draft: "Borrador",
  superseded: "Reemplazado",
};

export const TRAJECTORY_LABEL = {
  accelerating: "Acelerando",
  declining: "Cayendo",
  flat: "Estable",
  emerging: "Emergiendo",
  peaking: "En pico",
  insufficient_evidence: "Sin evidencia suficiente",
};

/** Is this forecast something a brand may build on?
 *  `published` only — which is exactly what `resolve_citation` enforces
 *  engine-side, and the screen must not be more permissive than the contract. */
export function isCitable(forecast) {
  return forecast?.status === "published";
}

/** A share as a percentage, or null. NEVER a zero for a missing number:
 *  "no measurement" and "measured zero" are different facts and this codebase
 *  has been bitten by conflating them before (returns rate, margin gap). */
export function sharePct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : null;
}

/** THE MEASUREMENT DECIDES THE UNIT, and getting this wrong prints a number
 *  that is off by two orders of magnitude with a straight face.
 *
 *  A SHARE is a fraction of a counted population: 0.16 is 16%. An INDEX is not
 *  a share and has no percent sign — Google Trends returns 0–100 scaled to the
 *  peak of its own request, so an index forecast of 42 is «42», and rendering
 *  it as 4200% is the exact confusion `atelier/market/observations.py` was
 *  written to prevent ("both quantities are a number between 0 and 100, so
 *  nothing failed; the forecast was simply wrong"). The engine has kept these
 *  apart in the ledger, in the model space and in the domain check since
 *  08-07; the screen collapsed them again on the way out.
 *
 *  An unknown measurement formats as a plain number rather than guessing a
 *  unit — a wrong unit is worse than none. */
export function forecastValue(value, measurement, digits = 1) {
  if (!Number.isFinite(value)) return null;
  if (measurement === "share") return `${(value * 100).toFixed(digits)}%`;
  // An index is a level with no ceiling. Two decimals would imply a precision
  // the 0–100 scaling does not have.
  if (measurement === "index") return `${Math.round(value * 10) / 10}`;
  return `${Math.round(value * 100) / 100}`;
}

/** The unit's own name, for the one place a reader needs it spelled out. */
export const MEASUREMENT_LABEL = {
  share: "cuota del surtido observado",
  index: "índice relativo (0–100, escalado al pico de SU consulta — no es una cuota)",
};

/** ONE CURRENT ANSWER PER SCOPE, newest first.
 *
 *  `/world/forecasts` returns stored rows in any state, which is right for the
 *  endpoint and wrong for a feed: a scope forecast every week for a year has
 *  fifty-two rows and fifty-one of them are `superseded`. Showing all of them
 *  makes the layer look busy and makes the current answer impossible to find.
 *
 *  The six axes are the identity of a question (`world_runs.IDENTITY`), so the
 *  newest row per six-axis key IS the current answer — including when that
 *  answer is `refused`, which is a real verdict about a scope and not a gap.
 *  History stays reachable by id; it just does not compete with the present. */
export function latestPerScope(forecasts) {
  const byScope = new Map();
  for (const f of forecasts || []) {
    const key = [f.trend_id, f.channel, f.geography, f.segment ?? "",
                 f.category ?? "", f.horizon_weeks].join("|");
    const seen = byScope.get(key);
    if (!seen || String(f.created_at || "") > String(seen.created_at || "")) {
      byScope.set(key, f);
    }
  }
  return [...byScope.values()];
}

/** How stale the newest evidence is, in plain words, or null when unknown. */
export function freshness(iso, now = new Date()) {
  if (!iso) return null;
  const started = new Date(iso);
  if (Number.isNaN(started.getTime())) return null;
  const days = Math.floor((now - started) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  return `hace ${weeks} semanas`;
}

/** What a cycle's outcome means, for the one line a reader actually needs.
 *  `partial` is its own answer: a pass that did real work and lost some of it
 *  is not the same as one that could not run, and collapsing them is how a
 *  half-broken feed reads as a healthy one. */
export function cycleVerdict(cycle) {
  if (!cycle) return { tone: "unknown", text: "el ciclo nunca corrió" };
  const failures = cycle.failures?.length || 0;
  // ⚠ SCOPES THAT WERE NEVER ASKED COUNT TOO. When a source rate limits, the
  // engine records ONE failure and defers the rest — so counting only
  // `failures` would describe a pass that covered one scope out of eighteen as
  // "1 falla", which is true and reads as almost nothing having gone wrong.
  // The deferrals are the size of the gap, and the gap is the story.
  const deferred = cycle.deferred?.length || 0;
  const lost = failures + deferred;
  // Said separately, because they are different facts: one is the world
  // declining to answer, the other is us deciding not to ask again.
  const detail = deferred
    ? `${failures} falla(s) y ${deferred} alcance(s) sin consultar`
    : `${failures} alcance(s) perdido(s)`;
  if (cycle.status === "ok") {
    // ⚠ A GREEN ZERO IS THE WORST OF BOTH. Found by running the real pipeline
    // on 2026-08-10: the cycle attempted 22 forecasts, every one refused for
    // `insufficient_evidence` (one week of history), nothing errored — so the
    // engine said `ok`, correctly, and this rendered a green "0 observaciones
    // nuevas" over a world layer that had not advanced at all.
    //
    // The ENGINE is right to say `ok`: 22 correct refusals are a working
    // system, and reporting `partial` would fire an alert every week during
    // normal operation on a correct state. What was wrong is here — the
    // presentation was better than the fact. A pass that added no evidence and
    // produced no usable answer is not green, however cleanly it ran.
    const f = cycle.forecasts || {};
    const usable = (f.published || 0) + (f.indicative || 0);
    const written = cycle.observations_written || 0;
    if (!written && !usable) {
      const refused = f.refused || 0;
      return {
        tone: "warn",
        text: refused
          ? `corrió sin incidentes y no dejó nada: ${refused} pronóstico(s) rechazado(s)`
          : "corrió sin incidentes y no dejó nada",
      };
    }
    return { tone: "ok", text: `${written} observaciones nuevas` };
  }
  if (cycle.status === "partial") {
    return { tone: "warn", text: `corrió con ${detail}` };
  }
  if (cycle.status === "running") return { tone: "warn", text: "corriendo ahora" };
  return { tone: "bad", text: `no pudo completarse (${lost} alcance(s): ${detail})` };
}

/** Group forecasts by trajectory, keeping the engine's own vocabulary.
 *  `insufficient_evidence` is a REAL group and not a gap: a market with too
 *  little history is a row in the answer, and hiding it would make the feed
 *  look more complete than the evidence is. */
export function byTrajectory(forecasts) {
  const groups = new Map();
  for (const f of forecasts || []) {
    const key = f.trajectory || "flat";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return groups;
}
