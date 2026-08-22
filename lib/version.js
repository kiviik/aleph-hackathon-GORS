// A generated Version is a real, auditable object — not just a url. It records
// what prompt made it, which references conditioned it, which provider, the
// quality tier + cost, and who/when. One canonical shape shared by EVERY
// generation path (Studio grid, item editor, explore), persisted through the
// server-owned collection (studio_collections). First slice of the plan's
// "Concept/Version as a real, server-owned object".
//
// Backward-compatible: legacy records were { kind, url, ts, note }; the new
// fields are additive, so old versions keep rendering.

let _seq = 0;
const vid = () => `v-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

export function makeVersion(kind, url, note, meta = {}) {
  return {
    id: meta.id || vid(),
    kind,                         // concepto | modelo | detalle | ...
    url,
    note: note || null,
    ts: new Date().toISOString(),
    // provenance
    prompt: meta.prompt || null,
    references: Array.isArray(meta.references) ? meta.references : [],
    provider: meta.provider || null,
    quality: meta.quality || null,
    cost_cents: meta.costCents ?? null,
    by: meta.byName || null,
    by_id: meta.byId || null,
    // ⚠ WHICH LEDGER ROW THESE PIXELS ARE, when the engine made them (0068).
    // Without it the image is brand-owned, budgeted and durable on the server
    // while the version that DISPLAYS it knows only a url — so "which asset is
    // this version?" has no answer, and nothing can link the asset back to the
    // concept version it became. It was passed in from `DesignStudio` and
    // silently dropped here for a day: this object is built field by field, so
    // a caller adding a key to `meta` changes NOTHING until this list agrees.
    asset_id: meta.assetId || null,
  };
}

// Short human-readable provenance for a version card's alt text / tooltip.
export function versionAlt(v) {
  if (!v) return "";
  const bits = [
    v.kind,
    v.provider && `vía ${v.provider}`,
    v.by && `por ${v.by}`,
    v.ts && new Date(v.ts).toLocaleDateString("es-AR", { day: "numeric", month: "short" }),
  ].filter(Boolean);
  return bits.join(" · ") || "versión generada";
}
