// Minimal IndexedDB key/value store for exploration images.
// localStorage tops out around 5 MB — a 240-concept run of compacted JPEGs is
// ~15-25 MB, so pixels live here and only metadata stays in localStorage.
// No dependencies; the native API is enough for put/get/delete/clear.
const DB_NAME = "atelier-explore";
const STORE = "images";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result ?? true); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const idbPut = (key, value) => tx("readwrite", (s) => s.put(value, key));
export const idbDelete = (key) => tx("readwrite", (s) => s.delete(key));
export const idbClear = () => tx("readwrite", (s) => s.clear());
export const idbGet = (key) => tx("readonly", (s) => s.get(key));

// Fetch many keys in one transaction; resolves to { key: value } (missing keys omitted).
export async function idbGetMany(keys) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readonly");
    const store = t.objectStore(STORE);
    const out = {};
    keys.forEach((k) => {
      const req = store.get(k);
      req.onsuccess = () => { if (req.result != null) out[k] = req.result; };
    });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}
