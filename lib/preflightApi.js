// Client for the pre-flight brief check (engine: api/app/routers/preflight.py).
//
// Two things here are deliberately unlike lib/api.js, and both follow from what
// this tool is:
//
// 1. ~~**Plain `fetch`, not `engineFetch`.**~~ ⚠ NO LONGER TRUE, AND LEAVING
//    THIS COMMENT IN PLACE WOULD HAVE BEEN THE LIE (owner review, 2026-08-12).
//    `POST /preflight/check` was reclassified as AUTHENTICATED once it turned
//    out that `read_document()` uploads the submitted tech pack to an external
//    model — anonymous, per-call provider spend, someone's proprietary document
//    leaving the building. See `route_policy.py`.
//
//    So the client now sends the token in production, and this file no longer
//    describes the endpoint as anonymous. `GET /preflight/checks` lists only
//    rule names and is still public, but it costs nothing to send a token it
//    does not need, so both go through the same helper.
//
//    The original worry stands and is why `authHeaders` is used rather than a
//    hand-rolled header: when there is no token it adds nothing, so the keyless
//    demo path is byte-for-byte what it was.
//
// 2. **Failures throw, they do not degrade to demo data.** Everywhere else in
//    this app a dead engine falls back to bundled samples so a demo keeps
//    moving. Doing that here would show someone a list of flags about their
//    tech pack that no reader produced, which is the one output this product
//    must never emit.

import { authHeaders } from "./auth";
import { base64FromDataUrl } from "./preflight.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Could not reach the checker. If you're running this locally, the engine " +
      "needs to be up on port 8000."
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && (data.detail || data.message);
    throw new Error(
      typeof detail === "string" ? detail : `The checker answered ${res.status}.`
    );
  }
  return data;
}

export function checkText(text) {
  return post("/preflight/check", { text });
}

export function checkFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => {
      const b64 = base64FromDataUrl(reader.result);
      if (!b64) {
        reject(new Error("That file came through empty."));
        return;
      }
      resolve(post("/preflight/check", { file_b64: b64, filename: file.name }));
    };
    reader.readAsDataURL(file);
  });
}

export function getRuleSet() {
  return fetch(`${API_BASE}/preflight/checks`,
               { cache: "no-store", headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}
