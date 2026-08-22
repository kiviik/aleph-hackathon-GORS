// The collection command centre — one read, eight answers.
//
// THE RULE THIS CLIENT OBEYS: it derives nothing. Not a state, not a total, not
// a "looks fine". Every judgement on the screen is the engine's, because the
// alternative is two implementations of "is this collection in trouble" and no
// way to know which one is right when they disagree.
//
// The engine's answers are allowed to be `unknown`, and an `unknown` always
// carries `missing` — the exact data that would answer it. The screen renders
// that verbatim. A dashboard that shows a confident zero where it has no input
// is the most expensive thing this product could ship, because a zero gets
// believed.
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export async function getCommandCentre(brandId, collectionId) {
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/collections/${collectionId}/command-centre`,
    { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`command-centre ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// The engine names an action; this maps it to the screen that resolves it.
// Kept HERE rather than in the engine: which screen owns a decision is a
// frontend fact, and baking route names into the API would make the engine
// wrong every time the navigation moves.
export const ACTION_VIEW = {
  write_brief: "collectionbrief",
  submit_brief: "collectionbrief",
  approve_brief: "collectionbrief",
  open_plan: "lineplan",
  add_slots: "lineplan",
  submit_plan: "lineplan",
  approve_plan: "lineplan",
  clear_blockers: "lineplan",
  rescope_delivery: "lineplan",
  assign_concepts: "studio",
  approve_concepts: "review",
  record_launch: "launch",
  record_outcomes: "launchresults",
};

// Spanish labels for the eight questions. The engine returns stable keys, not
// display text — a UI string in an API response is a string no translator can
// reach and no screen can shorten.
export const QUESTION_LABEL = {
  intent: "Qué busca esta colección",
  stage: "En qué etapa está",
  next_decision: "Qué decisión sigue",
  blocked: "Qué está bloqueado",
  budget: "Presupuesto",
  approvals: "Aprobaciones pendientes",
  styles_at_risk: "Estilos en riesgo",
  on_time: "¿Llega a tiempo?",
};

export const STATE_LABEL = {
  ok: "en orden",
  at_risk: "atención",
  blocked: "bloqueado",
  unknown: "sin datos",
};

export const STAGE_LABEL = {
  brief: "Brief", range: "Plan de rango", develop: "Desarrollo",
  review: "Revisión", launch: "Lanzamiento", results: "Resultados",
};

// The `blocked` and `styles_at_risk` cards pass through `planning.py`'s own
// blockers, whose prose is English — the Range grid has rendered it that way
// since 0032 and changing it there would churn a rule the whole plan depends on.
//
// So the CODE is the contract and the prose is display: translate what we know,
// fall back to the engine's own words for anything new. A missing translation
// degrades to English, never to a blank card — a rule that silently disappears
// because nobody wrote a Spanish string for it is far worse than one that reads
// awkwardly.
const BLOCKER_ES = {
  empty_plan: "un plan sin filas no compromete nada",
  missing_currency: "el plan no tiene moneda — sus totales no significan nada",
  mixed_currencies: "el plan mezcla monedas sin un tipo de cambio registrado",
  no_approved_brief: "no hay brief aprobado — un presupuesto sin argumento detrás",
  missing_price: "sin precio de venta",
  missing_units: "sin unidades planificadas",
  missing_cost: "sin costo puesto — no se puede calcular el margen",
  below_moq: "por debajo del MOQ",
  delivery_before_lead_time: "la entrega es antes de lo que permite el lead time",
  over_budget: "la inversión planificada supera el presupuesto",
};

export const blockerText = (item) =>
  (item.code && BLOCKER_ES[item.code]) || item.message;

// The portfolio — every collection at a glance, worst first.
//
// The engine sorts and counts; this client renders. That is not fussiness: the
// portfolio runs the SAME assembly as the collection screen, so re-sorting or
// re-counting here would reintroduce exactly the disagreement the shared
// assembly exists to prevent.
export async function getPortfolio(brandId) {
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/collections/portfolio`, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`portfolio ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
