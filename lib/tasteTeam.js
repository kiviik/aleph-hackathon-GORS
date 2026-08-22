// The taste team — eight roles, and what each one is allowed to speak from.
//
// This client renders positions; it never merges them. The disagreement IS the
// output, and a UI that summarised it into a headline would throw away the
// only thing that makes an eight-role panel worth more than one assistant.
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export async function getTasteTeam(brandId, slotId) {
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/slots/${slotId}/taste-team`,
    { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`taste-team ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const POSITION_LABEL = {
  object: "objeta",
  concern: "con reservas",
  support: "a favor",
  abstain: "se abstiene",
};

// What the synthesis asks a human to do. The panel never does any of these
// itself — that is the point of naming them as actions rather than verdicts.
export const ACTION_LABEL = {
  resolve_objection: "Hay que resolver una objeción",
  accept_or_revise: "Hay que decidir sobre las reservas",
  human_approval: "Falta que alguien lo apruebe",
  decide_under_uncertainty: "Decisión sin evidencia suficiente",
};
