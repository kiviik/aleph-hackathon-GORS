// Import Centre — the network half. The rules live in `imports.mjs`.
//
// Unlike most of `lib/api.js`, these calls THROW instead of degrading to demo
// data. Everywhere else a dead engine should leave the app usable; here a
// silent failure would mean the user believes a file was accepted. There is no
// honest fallback for "did my catalogue import".

import { engineFetch } from "./auth";
import { bytesToBase64, isTextFile } from "./imports.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export * from "./imports.mjs";

async function call(path, options = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const err = new Error(
      (typeof detail === "string" && detail) ||
      detail?.message ||
      `La operación falló (${res.status}).`,
    );
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return body;
}

export function getImportKinds(brandId) {
  return call(`/brands/${brandId}/imports/kinds`);
}

export function listImports(brandId) {
  return call(`/brands/${brandId}/imports`);
}

export function getImport(brandId, importId) {
  return call(`/brands/${brandId}/imports/${importId}`);
}

/**
 * Upload + interpret. WRITES NOTHING — the returned object is a preview with
 * an id, and the id is what `confirmImport` later acts on.
 *
 * A File is read as text only when its extension proves it is text; anything
 * else goes down the base64 path, because guessing wrong on an .xlsx produces
 * mojibake that then parses into plausible garbage.
 */
export async function createImport(brandId, kind, file) {
  const payload = { kind, filename: file.name || null };
  if (isTextFile(file.name || "")) {
    payload.content = await file.text();
  } else {
    payload.content_b64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  }
  return call(`/brands/${brandId}/imports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Re-read the same file with a corrected mapping. Still writes nothing. */
export function reinterpretImport(brandId, importId, { mapping, currency, numberFormat } = {}) {
  return call(`/brands/${brandId}/imports/${importId}/reinterpret`, {
    method: "POST",
    body: JSON.stringify({
      mapping: mapping || {},
      currency: currency || null,
      number_format: numberFormat || null,
    }),
  });
}

/** The only call in this module that changes the brand's data. */
export function confirmImport(brandId, importId,
                              { mapping, currency, numberFormat, answers, supersede } = {}) {
  return call(`/brands/${brandId}/imports/${importId}/confirm`, {
    method: "POST",
    body: JSON.stringify({
      mapping: mapping || {},
      currency: currency || null,
      number_format: numberFormat || null,
      answers: answers || {},
      supersede_overlapping: !!supersede,
    }),
  });
}

export function discardImport(brandId, importId) {
  return call(`/brands/${brandId}/imports/${importId}/discard`, { method: "POST" });
}

export function listMaterials(brandId) {
  return call(`/brands/${brandId}/materials`);
}
