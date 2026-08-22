// Asking the brand's own data a question — the read layer, on screen.
//
// ⚠ THE POINT IS THE ANSWERS THAT ARE NOT ANSWERS. The engine returns one of
// four states and they must not render alike, because the whole difference
// between this and a chat box is that this one admits what it does not know:
//
//   rows        answered from rows, and it names which rows it read
//   empty       "no hay filas" — the query found nothing and was NOT widened
//   unsupported it cannot answer that yet, and says what it CAN answer
//   refused     it will never answer that — verdicts about your own product
//               come from the gates, not from a sentence
//
// `unsupported` and `refused` are deliberately different: one means "not yet",
// the other means "not ever". Collapsing them into a single "sorry" would
// promise a future where this product ranks your suppliers in prose.

import { engineFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

/** Ask one question. Returns the engine's answer, or a transport-failure
 *  shape — never a fabricated answer, and never null, because a blank panel
 *  is the one thing worse than a refusal. */
export async function ask(brandId, question) {
  if (!brandId || !question?.trim()) return null;
  try {
    const res = await engineFetch(`${API_BASE}/brands/${brandId}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: question.trim() }),
    });
    if (!res.ok) {
      return {
        status: "unreachable",
        summary: `El motor respondió ${res.status}. No te invento una respuesta.`,
      };
    }
    return await res.json();
  } catch {
    return {
      status: "unreachable",
      summary: "No pude alcanzar el motor. No te invento una respuesta.",
    };
  }
}

/** What this brand can be asked, served by the engine so the box can never
 *  advertise a question the router does not implement. */
export async function supported(brandId) {
  if (!brandId) return [];
  try {
    const res = await engineFetch(`${API_BASE}/brands/${brandId}/ask/supported`);
    if (!res.ok) return [];
    return (await res.json()).supported || [];
  } catch {
    return [];
  }
}

/** How each state should READ. Colour and label live together so a refusal
 *  can never be styled like an answer by accident. */
export const STATE_STYLE = {
  // ⚠ The palette's semantic roles, not a new colour vocabulary. --positive
  // means the rows answered, --warning means absent-or-not-yet, --danger means
  // the product will not answer it. `unsupported` and `refused` share no tone
  // because "not yet" and "not ever" are different promises.
  rows: { label: "Desde tus filas", tone: "var(--positive)" },
  empty: { label: "No hay filas", tone: "var(--warning)" },
  unsupported: { label: "Todavía no sé", tone: "var(--ink-3)" },
  refused: { label: "No contesto eso", tone: "var(--danger)" },
  unreachable: { label: "Sin motor", tone: "var(--danger)" },
};
