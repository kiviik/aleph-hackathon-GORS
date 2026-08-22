// Everything about a collection that does not add up — read-only client.
//
// The endpoint collects; this module does not interpret. In particular it does
// NOT re-sort: the order arrives already computed from the engine's own
// blocker/warning split, the counted blast radius, and the brand's learned
// resolution rate. Re-ordering in the browser would be a fourth opinion nobody
// can trace.
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export async function getContradictions(brandId, collectionId) {
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/collections/${collectionId}/contradictions`,
    { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// The three families a finding can belong to, derived from its `kind` prefix —
// which the ENGINE names. Used only to group the list visually; nothing here
// changes what a finding says or where it sorts.
export function familyOf(kind = "") {
  const head = String(kind).split(".")[0];
  return ["plan", "approval", "brief", "launch", "import"].includes(head)
    ? head : "otro";
}

export const FAMILY_LABEL = {
  plan: "El plan",
  approval: "Las firmas",
  brief: "El brief",
  launch: "Lo lanzado",
  import: "Lo importado",
  otro: "Otros",
};

/** Where a finding can be resolved. The engine sends the view id; this maps it
 *  to the words the sidebar uses, so a row can offer the screen that fixes it
 *  instead of describing a problem and leaving. */
export const WHERE_LABEL = {
  lineplan: "Plan de rango",
  review: "Revisión",
  collectionbrief: "Brief de colección",
  launch: "Lanzamiento",
  integrations: "Integraciones",
};

/** "9 de cada 10 veces" beats "0.9" for a number about your own team, and the
 *  rate is only ever shown when the engine earned it. */
export function rateText(rate) {
  if (rate == null) return null;
  const outOf10 = Math.round(rate * 10);
  return `tu equipo lo resuelve ${outOf10} de cada 10 veces`;
}
