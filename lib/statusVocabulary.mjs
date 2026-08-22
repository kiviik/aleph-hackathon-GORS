// One status vocabulary for every versioned object — the RULE, dependency-free
// so it can be tested without a DOM. `components/ui/StatusChip.jsx` renders it.
//
// WHY THIS EXISTS. Owner design audit, 2026-08-12: the same state machine
// renders four different ways today — "En rango" as a yellow pill, "BORRADOR"
// as an outline pill, "sin versión aprobada" as a tab subtitle, and "Aprobado y
// congelado" as green prose. A reader cannot learn a vocabulary that changes
// shape per screen.
//
// ⚠ THE VOCABULARY IS THE ENGINE'S, NOT A NEW ONE. `draft` / `in_review` /
// `approved` / `superseded` are the statuses the brief and plan-version state
// machines already use. Two derived states are added because a screen genuinely
// distinguishes them: `frozen` (approved AND immutable) and `blocked`
// (readiness refuses). Inventing a fifth would be a second model of the same
// fact, which is the defect this audit thread keeps finding.

//: The engine's own strings. Anything absent stays unknown — see `statusOf`.
const FROM_ENGINE = {
  draft: "draft",
  in_review: "in_review",
  approved: "approved",
  superseded: "superseded",
};

export const STATUS_LABELS = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobada",
  frozen: "Congelada",
  superseded: "Reemplazada",
  blocked: "Bloqueada",
};

/**
 * Resolve an engine status (plus the two derived flags) to one vocabulary key.
 *
 * ⚠ RETURNS NULL FOR ANYTHING UNRECOGNISED, never a default. A chip that
 * renders "Borrador" for a state it does not understand is a screen claiming
 * something it never checked — and this codebase has shipped that exact bug at
 * three different layers already.
 */
export function statusOf(status, { frozen = false, blocked = false } = {}) {
  // Blocked wins: it is the state that stops you acting, and a reader who is
  // about to be refused needs that before they need the lifecycle stage.
  if (blocked) return "blocked";
  const known = FROM_ENGINE[String(status || "").toLowerCase()];
  if (known === "approved" && frozen) return "frozen";
  return known || null;
}
