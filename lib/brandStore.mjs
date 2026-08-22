// Brand-scoped browser storage.
//
// 2026-07-24 audit: the app used 21 distinct localStorage keys and exactly ONE
// was scoped to a brand. Everything else — the decision ledger mirror, accepted
// proposals, the pipeline board, the fabric library, fit personas, Brand Genome
// edits, range-plan targets — was global, so switching tenants in the topbar
// showed one brand's operational state under another brand's name. That is the
// same cross-tenant bug already fixed in studioStore, twenty more times.
//
// The rule (ROADMAP §12's localStorage authority policy):
//
//   SCOPED + authoritative-elsewhere — anything describing a brand's work.
//     It is mirrored here for offline use, never owned here. Scoped so it can
//     never surface under the wrong brand.
//
//   GLOBAL — genuinely user-level preferences that mean the same thing whoever
//     is signed in and whatever brand is active: which brand is selected, the
//     bearer token, a view mode, a lead-time slider. Scoping these would be
//     noise, and none of them assert anything about a brand.
//
// Nothing here decides WHERE the truth lives; it decides that a browser copy of
// brand A's work cannot be read while brand B is on screen.

// Keys that stay global, with the reason. Anything not listed must be scoped.
export const GLOBAL_KEYS = new Set([
  "atelier-active-brand",   // which brand is selected — cannot itself be per-brand
  "atelier-token",          // the bearer token; it names a user, and the engine binds it to a brand
  "atelier-studio-mode",    // a view preference
  "atelier-lead-weeks",     // a planning-horizon preference
  // ⚠ GLOBAL, BUT NOT UNSCOPED — see `lib/handoff.mjs` (owner review
  // 2026-08-11). The old note here read "a one-shot handoff between two screens
  // in one session", which describes its LIFETIME and says nothing about its
  // TENANT: pick an opportunity under Brand A, switch to Brand B, open Studio,
  // and Brand A's brief was designed against Brand B's DNA and palette. Nothing
  // expired in between, so being transient never prevented it.
  //
  // The key stays global ON PURPOSE. Scoping it would make Brand B read an
  // EMPTY handoff — safe, but silent: the designer clicks "Diseñar", lands in
  // Studio and finds nothing, with no explanation. The PAYLOAD carries its
  // origin brand and an expiry instead, and the reader refuses it out loud.
  "atelier-design-brief",
]);

// `brand:<id>` prefix, or `brand:none` when nothing is resolved. An unresolved
// brand gets its own bucket rather than silently sharing the last brand's.
export function scopedKey(key, brandId) {
  if (GLOBAL_KEYS.has(key)) return key;
  return `${key}::brand:${brandId || "none"}`;
}
