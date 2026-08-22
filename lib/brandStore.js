// Browser half of the brand-scoped store. The scoping RULE lives in
// brandStore.mjs, dependency-free, so it is unit-testable — these wrappers just
// add localStorage access to it.
import { GLOBAL_KEYS, scopedKey } from "@/lib/brandStore.mjs";

export { GLOBAL_KEYS, scopedKey };

export function readScoped(key, brandId, fallback = null) {
  try {
    const raw = localStorage.getItem(scopedKey(key, brandId));
    return raw == null ? fallback : (JSON.parse(raw) ?? fallback);
  } catch {
    return fallback;
  }
}

export function writeScoped(key, brandId, value) {
  try {
    localStorage.setItem(scopedKey(key, brandId), JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e?.name === "QuotaExceededError"
        ? "El navegador se quedó sin espacio. Exportá o eliminá imágenes antes de seguir."
        : "No se pudo guardar en este navegador.",
    };
  }
}

export function removeScoped(key, brandId) {
  try { localStorage.removeItem(scopedKey(key, brandId)); } catch { /* blocked */ }
}
