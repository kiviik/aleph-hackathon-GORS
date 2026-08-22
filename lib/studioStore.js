// Where the design workspace lives.
//
// Until 2026-07-21 collections existed only in this browser's localStorage: a
// cleared browser lost the work, and two designers never saw the same board
// (audit finding). The engine now owns them. This module hides which backing
// store answered, but NEVER hides it from the user — `scope` travels with
// every result so the UI can say "guardado en el equipo" vs "solo en este
// navegador", and a silent downgrade to local is impossible.
//
// Local remains the fallback (the engine is optional in pilot environments)
// and the mirror (an offline reload still shows your board).
import { getBrandId } from "@/lib/api";
import { engineFetch, getToken, setToken } from "@/lib/auth";
import { scopedKey } from "@/lib/brandStore";

export { getToken, setToken };

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";
const LEGACY_KEY = "atelier-studio-collections-v1";

// The mirror is PER BRAND. It used to be one global key, so switching tenants in
// the topbar left the previous brand's collections in the offline fallback — the
// localStorage half of the 2026-07-24 cross-tenant bug (ROADMAP §1).
//
// Uses the SHARED scoping scheme (lib/brandStore) rather than its own: this
// module had a `key:brandId` form while everything else moved to
// `key::brand:id`, so Materials could not find the very mirror this writes.
const keyFor = (brandId) => scopedKey(LEGACY_KEY, brandId);

// The scheme this module used between the two 2026-07-24 fixes: `key:brandId`,
// before everything converged on brandStore's `key::brand:id`. It already
// encoded the brand, so migrating it to the SAME brand's bucket is safe — the
// leak risk that killed the earlier legacy migration does not apply here.
const priorSchemeKey = (brandId) => `${LEGACY_KEY}:${brandId || "local"}`;

const loadLocal = (brandId) => {
  const key = keyFor(brandId);
  try {
    const own = JSON.parse(localStorage.getItem(key) || "null");
    if (Array.isArray(own)) return own;

    const prior = JSON.parse(localStorage.getItem(priorSchemeKey(brandId)) || "null");
    if (Array.isArray(prior) && prior.length) {
      localStorage.setItem(key, JSON.stringify(prior));
      localStorage.removeItem(priorSchemeKey(brandId));
      return prior;
    }
    // The legacy global key held whichever brand happened to be active last, so
    // it CANNOT be claimed by a named brand — doing that is the same
    // cross-tenant leak in a new coat (caught in verification: Meridian adopted
    // Complot's old mirror). A brand bucket refills from the server on the next
    // successful load; only the no-brand bucket inherits it, because offline
    // work with no brand resolved has nowhere else to live.
    if (!brandId) {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if (Array.isArray(legacy) && legacy.length) {
        localStorage.setItem(key, JSON.stringify(legacy));
        localStorage.removeItem(LEGACY_KEY);
        return legacy;
      }
    }
    return [];
  } catch { return []; }
};
const saveLocal = (list, brandId) => {
  try { localStorage.setItem(keyFor(brandId), JSON.stringify(list)); return { ok: true }; }
  catch (e) {
    return { ok: false, message: e?.name === "QuotaExceededError"
      ? "El navegador se quedó sin espacio. Exportá o eliminá imágenes antes de seguir."
      : "No se pudo guardar en este navegador." };
  }
};

async function req(path, options = {}) {
  const res = await engineFetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    err.body = await res.json().catch(() => null);
    throw err;
  }
  return res.json();
}

// The engine's row shape -> the shape the studio already renders.
const fromRow = (row) => ({
  id: row.id, name: row.name, items: row.items || [],
  version: row.version, updatedBy: row.updated_by,
  at: row.created_at, updatedAt: row.updated_at,
});

// AN EMPTY LIST AND A FAILED REQUEST ARE DIFFERENT ANSWERS.
//
// This used to swallow every error and return the local mirror, so a 403, a
// timeout or a dropped engine all surfaced as `colls: []` — and every screen
// above it printed "todavía no hay colecciones". That is the confident zero
// this product refuses everywhere else: the engine will not report a 0% return
// rate without a returns feed, and then the frontend reported "no collections"
// for a request that never succeeded.
//
// `reachable` carries the distinction up. The mirror is still used, because a
// board you can still read offline is better than a blank screen — but the
// caller is now told which of the two it is looking at.
// ⚠ `mirror: false` FOR READERS THAT DO NOT OWN THE BOARD (found 2026-08-12 by
// mounting Studio in a test). Two components call this — DesignStudio, which
// owns the board, and CollectionProvider, which only needs names and ids for
// the switcher — and the mirror write is a SIDE EFFECT OF A READ. So
// CollectionProvider's load landed after Studio had just written a new design
// into the mirror and replaced it with the server's item-less copy.
//
// The design still existed in React state and in the debounced server write, so
// nothing looked wrong; but an offline reload before that debounce fired had
// lost it. A read that can destroy newer local state is not a read.
export async function loadCollections({ mirror = true } = {}) {
  const brandId = await getBrandId().catch(() => null);
  if (!brandId) {
    return { colls: loadLocal(null), scope: "local", brandId: null,
             reachable: false, error: "no hay una marca resuelta" };
  }
  try {
    const rows = await req(`/brands/${brandId}/studio/collections`);
    const colls = rows.map(fromRow);
    if (mirror) saveLocal(colls, brandId); // so an offline reload still shows the board
    return { colls, scope: "team", brandId, reachable: true, error: null };
  } catch (e) {
    // The brand resolved but the engine did not answer. Fall back to THAT
    // brand's mirror, never another tenant's — and say that is what happened.
    return {
      colls: loadLocal(brandId), scope: "local", brandId,
      reachable: false,
      error: e?.status ? `el motor respondió ${e.status}` : "el motor no respondió",
    };
  }
}

export async function createCollection(brandId, { name, items = [], updatedBy }) {
  if (!brandId) return null;
  return fromRow(await req(`/brands/${brandId}/studio/collections`, {
    method: "POST",
    body: JSON.stringify({ name, items, updated_by: updatedBy }),
  }));
}

// Returns { ok, scope, collection?, conflict? }. A 409 means someone else
// wrote first: the caller gets THEIR document back and must reconcile — we
// never overwrite a colleague's work to make a save look successful.
export async function saveCollection(brandId, coll, { updatedBy } = {}) {
  if (brandId && coll.version != null) {
    try {
      const row = await req(`/brands/${brandId}/studio/collections/${coll.id}`, {
        method: "PUT",
        body: JSON.stringify({
          version: coll.version, name: coll.name, items: coll.items,
          updated_by: updatedBy,
        }),
      });
      return { ok: true, scope: "team", collection: fromRow(row) };
    } catch (e) {
      if (e.status === 409) {
        return { ok: false, scope: "team", conflict: fromRow(e.body?.detail?.current || {}) };
      }
      // Engine unreachable: keep working locally, and say so.
    }
  }
  const result = saveLocal(loadLocal(brandId).map((c) => (c.id === coll.id ? coll : c)), brandId);
  return { ok: result.ok, scope: "local", message: result.message };
}

// Full-list local persistence, used while the engine is absent. Callers pass the
// brandId they loaded with so the mirror stays in that tenant's bucket.
export function saveAllLocal(colls, brandId) {
  return saveLocal(colls, brandId);
}

export async function archiveCollection(brandId, collectionId) {
  if (!brandId) return false;
  try {
    await req(`/brands/${brandId}/studio/collections/${collectionId}`, { method: "DELETE" });
    return true;
  } catch { return false; }
}
