// Writes the Studio board's concepts into the engine so every server-derived
// surface (stage rail, command centre, portfolio, Review, Launch) is looking at
// the same set the board is. The rules live in conceptRegistry.mjs; this file
// is only the network half.
//
// Why a sync pass and not only a write-on-generate: the board is authoritative
// and it survives an unreachable engine (studioStore falls back to the local
// mirror). So "register on generate" alone would leave a permanent gap every
// time a generation happened offline, and it would do nothing for the work
// already on the boards. The pass is a projection refresh — it derives entirely
// from stored board content and invents nothing.
//
// Every call is idempotent by client_key: the concept upsert returns the
// existing row, the version append returns the ORIGINAL row untouched. So this
// is safe to run on every load and safe to retry.
import { engineFetch } from "@/lib/auth";
import {
  boardConceptCount, conceptRecord, unregistered, versionRecords,
} from "@/lib/conceptRegistry.mjs";

export {
  boardConceptCount, boardConcepts, conceptRecord, hasConcept, reconciles,
  registrableVersions, unregistered, versionKey, versionRecords,
} from "@/lib/conceptRegistry.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function req(path, options = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const listBrandConcepts = (brandId) => req(`/brands/${brandId}/concepts`);

// One board item -> its Concept row + every version it carries. Returns the
// engine's concept record, or throws — the caller decides whether that matters.
export async function registerBoardConcept(brandId, coll, item) {
  const concept = await req(`/brands/${brandId}/concepts`, {
    method: "POST", body: JSON.stringify(conceptRecord(coll, item)),
  });
  for (const version of versionRecords(item)) {
    await req(`/brands/${brandId}/concepts/${concept.id}/versions`, {
      method: "POST", body: JSON.stringify(version),
    });
  }
  return concept;
}

// Bring the engine's record up to date with the boards Studio has loaded.
//
// The diff is computed from ONE list call for the whole brand, so a board that
// is already projected costs a single request and writes nothing. Failures are
// swallowed per item: this must never block the studio from rendering, and a
// half-finished pass is corrected by the next one (idempotency).
//
// Returns { registered, checked, ok } — `ok:false` means the engine could not
// be read at all, which is the one case where a caller must NOT claim the two
// surfaces agree.
export async function syncBoardConcepts(brandId, colls) {
  const boards = (Array.isArray(colls) ? colls : []).filter((c) => c?.id);
  if (!brandId || !boards.length) return { registered: 0, checked: 0, ok: false };

  let serverConcepts;
  try {
    serverConcepts = await listBrandConcepts(brandId);
  } catch {
    return { registered: 0, checked: 0, ok: false };
  }

  let registered = 0;
  let checked = 0;
  for (const coll of boards) {
    checked += boardConceptCount(coll);
    for (const item of unregistered(coll, serverConcepts)) {
      try {
        await registerBoardConcept(brandId, coll, item);
        registered += 1;
      } catch { /* next pass retries; the board is unaffected either way */ }
    }
  }
  return { registered, checked, ok: true };
}
