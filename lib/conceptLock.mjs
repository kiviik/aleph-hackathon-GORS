// The rules that decide WHAT was approved and WHEN an approval stops applying.
//
// Kept dependency-free (and .mjs) so they are unit-testable the same way the
// decision ledger and trust matching are — these are the two rules that make an
// approval mean something, so they should not only be verifiable by clicking.

// Fields whose change makes an approved concept a DIFFERENT garment. Editing
// any of them after approval must produce a new version and return the concept
// to review (ROADMAP A9.2) rather than riding on the old approval.
export const DESIGN_FIELDS = [
  "cover", "images", "colorway", "fabricId", "fabricName", "precio",
  "silhouette", "name", "modelShot",
];

export const touchesDesign = (patch) =>
  Object.keys(patch || {}).some((k) => DESIGN_FIELDS.includes(k));

// Which stored version IS the thing on screen? The cover is a url; versions
// carry theirs. Fall back to the newest version, then to nothing — we never
// guess an identity for something we cannot point at.
export function coverVersion(item) {
  const versions = item?.images || [];
  if (!versions.length) return null;
  return versions.find((v) => v.url && v.url === item.cover) || versions[0] || null;
}


/** Which version images belong in the engine's asset ledger.
 *
 *  ⚠ ONLY data: URIs. They are the orphaned case — pixels that exist NOWHERE
 *  but this browser (the /api/generate fallback returns base64 straight to
 *  the client), so a cleared profile or a second device loses the image while
 *  the version row pointing at it survives. An http(s) URL already names
 *  bytes living somewhere else; re-uploading it here would duplicate them
 *  under a second identity, and a claim of "persisted" for a URL we never
 *  dereferenced would be a lie with extra steps.
 */
export function shouldIngestImage(url) {
  return typeof url === "string" && /^data:image\//.test(url);
}
