// The approvals ledger — client side.
//
// The engine has had disciplined, append-only approvals since migration 0039
// (`api/app/routers/approvals.py`) and NOTHING in the frontend called them. The
// review screen was signing `approved: true` on a studio card instead, which is
// the mutable-blob approval the concept registry was built to replace.
//
// Two rules this module keeps out of the components:
//   · readiness is asked for, never computed here;
//   · a rejection carries its reason to the server, because the engine refuses
//     one without it (and the database has a check constraint saying the same).
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function req(path, options = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    // The refusals here are the product: "no tenés la firma técnica — tenés:
    // creativa" is what stops someone going to borrow a colleague's token.
    err.body = await res.json().catch(() => null);
    throw err;
  }
  return res.json();
}

export const getReadiness = (brandId, subjectType, subjectId) =>
  req(`/brands/${brandId}/approvals/${subjectType}/${subjectId}`);

export const decide = (brandId, subjectType, subjectId, body) =>
  req(`/brands/${brandId}/approvals/${subjectType}/${subjectId}`, {
    method: "POST", body: JSON.stringify(body),
  });

export const getApprovalPolicy = (brandId) =>
  req(`/brands/${brandId}/approval-policy`);

/** Say which lanes this brand requires for one kind of object.
 *
 *  `disciplines: []` is a real answer and the engine honours it — a brand may
 *  state that a range plan needs no discipline sign-off. It is NOT the same as
 *  never having said anything, which falls back to the engine's default, so
 *  this always sends the list and never omits the field to mean "none".
 *
 *  Goes through `req` like everything else here, because that is what carries
 *  the bearer token: the engine refuses a policy change from an unverified
 *  identity (403), so a raw `fetch` would BE that refusal, by construction.
 *
 *  Returns the whole policy as the server now holds it — the same shape
 *  `getApprovalPolicy` returns — so the caller can render the server's answer
 *  instead of the state it just guessed at.
 */
export const setApprovalPolicy = (brandId, subjectType, disciplines) =>
  req(`/brands/${brandId}/approval-policy/${subjectType}`, {
    method: "PUT",
    body: JSON.stringify({ required_disciplines: disciplines }),
  });

export {
  DISCIPLINES, LANE_LABEL, LANE_QUESTION, LANE_SHORT, LANE_WHO,
  POLICY_SUBJECTS, SUBJECT_LABEL, laneState, lanesToShow, mayISign,
  policySentence, verdict,
} from "@/lib/approvals.mjs";
