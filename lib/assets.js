// The brand's own generated images — the door `/studio/generate` never had.
//
// ⚠ WHY THIS MODULE EXISTS AT ALL. `POST /studio/generate` takes no brand: not
// in the path, not in the body, not in any row it writes. So it cannot be
// metered per tenant, its output cannot be attributed, and `/studio/history`
// served every brand's concepts to every token from the day the studio shipped
// until engine migration 0068. That is not a parameter the old route was
// missing — it is why the replacement needed a different shape.
//
// `POST /brands/{id}/assets/generate` (engine 0068–0079) is that shape, and
// every guarantee below is enforced server-side rather than promised here:
//
//   · the brand comes from the PATH and `require_brand_access` checks it
//   · budget is RESERVED before the provider is called and released if the
//     provider was never reached — a request refused for lack of a key does
//     not cost the brand a generation
//   · an `Idempotency-Key` makes a retry free, and 0076 makes it a retry: the
//     key carries a fingerprint of what it asked for, so reusing it with a
//     changed prompt is a 409 instead of the previous image returned as if
//     nothing had changed
//   · a single-flight lock means the loser of a race never reaches the paid
//     provider (0071)
//   · the bytes become a ROW with prompt, references, provider, model, quality
//     and the person — and are served through a tenant-checked route, never
//     `/static`
//
// ⚠ THE CAP IS A 429, NOT AN ERROR CODE. The engine returns the brand's own
// allowance breach as HTTP 429 with `detail.error === "call_cap_reached"`,
// deliberately NOT as `{"error": ...}` in a 200 body — because callers narrow
// unknown codes to "provider" and would blame the provider for the owner's own
// limit. `capReached()` below is how a screen tells those two apart.
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

/** Absolute URL for an asset's bytes. The engine returns a path, because the
 *  row knows nothing about which host is serving it. */
export const assetUrl = (path) =>
  (!path ? null : /^https?:/i.test(path) ? path : `${API_BASE}${path}`);

/** True when this failure is the BRAND'S OWN CAP rather than a provider fault.
 *  Two different sentences for the user, and conflating them tells a designer
 *  the model is broken when the answer is "you set the limit to 20". */
export const capReached = (error) =>
  error?.status === 429 || error?.body?.detail?.error === "call_cap_reached";

/** Generate n images for this brand.
 *
 *  `idempotencyKey` should identify THIS request — the version id the caller
 *  is about to write is ideal, because a retry of the same generation then
 *  costs nothing while a genuinely new prompt gets a new key. Sending a
 *  constant would be worse than sending none: the engine would refuse the
 *  second, different request with a 409 (0076).
 *
 *  THE TYPED CONTRACT (engine reversal, 2026-08-17) rides through this body
 *  untouched: `generation_intent` (the designer's words + the app's context +
 *  structured pickers — the SERVER composes the prompt from it and the legacy
 *  `prompt` field is ignored when it is present), `task` (routing by job),
 *  `tier` (fast|balanced|best) and `model` (expert pin: that model answers or
 *  the request errors, no silent substitute). This module adds nothing and
 *  renames nothing — the engine owns the vocabulary.
 *
 *  Returns the engine's envelope unchanged — `{assets, error, provider,
 *  model, control_mapping, budget}` — because a partial batch is real: the
 *  images that arrived come back WITH the error that stopped the rest.
 *  `model` is the model that was ASKED; each asset row carries the one that
 *  answered. `control_mapping` is the compiler's per-control honesty record
 *  (provider_native | prompt_guidance | unavailable | refused) and the screen
 *  renders IT, never its own claim.
 *
 *  A 422 whose detail is `capability_unavailable` or `intent_refused` is a
 *  REFUSAL — the engine declining to degrade silently — and throws like any
 *  error; `lib/generationIntent.mjs#refusalMessage` reads the verbatim reason
 *  off `err.body` for the error slot. Callers must not swallow it or retry it
 *  against a different generator.
 */
export async function generateAssets(brandId, body, { idempotencyKey } = {}) {
  const res = await engineFetch(`${API_BASE}/brands/${brandId}/assets/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/** This brand's asset library, newest first. */
export const listAssets = async (brandId, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
  const res = await engineFetch(
    `${API_BASE}/brands/${brandId}/assets${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`engine ${res.status}`);
  return res.json();
};
