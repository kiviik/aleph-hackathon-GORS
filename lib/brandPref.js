// The active brand selection — ONE source of truth for every module.
//
// 2026-07-24 audit (tenant isolation, ROADMAP §1): the topbar selector wrote its
// choice here (EngineProvider) and `getLatestResult()` honoured it, but
// `getBrandId()` resolved only the build-time NEXT_PUBLIC_ATELIER_BRAND/config
// BRAND and otherwise fell back to `brands[0]`. Result: with the shell showing
// Meridian, Studio / Range Plan / Review Room read and WROTE Complot's
// collections — verified live (Meridian had 0 server collections while the local
// mirror held Complot's four, with their server version numbers).
//
// Every brand-scoped read now resolves through the same order:
//   1. the user's explicit selection (this key)
//   2. the configured pilot brand (env / lib/config BRAND)
//   3. nothing — NEVER `brands[0]`. An unresolved brand is an honest null, so
//      callers degrade to a labelled local scope instead of silently binding to
//      whichever tenant the API happened to list first.
export const PREF_KEY = "atelier-active-brand";

export function readBrandPref() {
  try { return localStorage.getItem(PREF_KEY) || null; } catch { return null; }
}

export function writeBrandPref(name) {
  try { localStorage.setItem(PREF_KEY, name); } catch { /* private mode */ }
}

// Resolve a brand row out of /brands for a wanted name-or-slug. Case-insensitive
// on both fields, because the selector passes a display name and deep links may
// carry a slug.
export function matchBrand(brands, wanted) {
  const want = String(wanted || "").toLowerCase();
  if (!want) return null;
  return (brands || []).find((b) => (b.name || "").toLowerCase() === want
    || (b.slug || "").toLowerCase() === want) || null;
}
