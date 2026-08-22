// The seam between the collection Direction (§3b) and image generation.
//
// Direction owns the designer's intent. Studio owns exploration and pixels.
// This module turns the server-owned Direction payload into Studio axes,
// prompt constraints, reference policy and lineage without inventing a second
// direction in the browser.

const rows = (value) => (Array.isArray(value) ? value : []);

const clean = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const itemLabel = (silhouette) => {
  const explicit = clean(silhouette?.name);
  if (explicit) return explicit;
  return [
    clean(silhouette?.category),
    clean(silhouette?.fit),
    clean(silhouette?.length),
    clean(silhouette?.volume),
  ].filter(Boolean).join(" · ");
};

export function directionVersionKey(payload) {
  return clean(payload?.working_version?.id);
}

/**
 * Studio axes from the active collection's exact Direction version.
 *
 * A blocked fabric stays visible (the designer must be able to understand the
 * conflict) but `directionSelection` will not select it automatically. Unknown
 * stays selectable and visibly unknown; absence of MOQ is not a refusal.
 */
export function directionAxes(payload) {
  const items = payload?.items || {};
  const siluetas = rows(items.silhouettes).map((s) => ({
    name: itemLabel(s),
    source: "dirección",
    directionItemId: s.id,
    category: s.category || null,
    fit: s.fit || null,
    length: s.length || null,
    volume: s.volume || null,
    evidence: s.proportion_notes || null,
  })).filter((s) => s.name);

  const tejidos = rows(items.fabrics).map((f) => {
    const material = f.material || {};
    return {
      id: f.material_id,
      name: clean(material.name) || clean(material.material_code),
      comp: material.composition || "",
      supplier: material.supplier_name || null,
      source: "dirección",
      directionItemId: f.id,
      materialId: f.material_id,
      sourceability: f.sourceability?.verdict || "unknown",
      sourceabilityReasons: rows(f.sourceability?.reasons),
      substitutionAllowed: f.substitution_allowed === true,
    };
  }).filter((f) => f.id && f.name);

  const colores = rows(items.colours).map((c) => ({
    hex: c.hex_value,
    name: clean(c.name) || c.hex_value,
    source: "dirección",
    directionItemId: c.id,
    role: c.role || null,
    sharePct: c.share_pct ?? null,
  })).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex || ""));

  return { siluetas, tejidos, colores };
}

export function directionSelection(payload) {
  const axes = directionAxes(payload);
  return {
    siluetas: axes.siluetas,
    // A hard sourcing conflict must be chosen consciously, not become the
    // default fabric in a twenty-image run.
    tejidos: axes.tejidos.filter((f) => f.sourceability !== "blocked"),
    colores: axes.colores,
    detalles: [],
    fits: [],
  };
}

export function directionPrompt(payload) {
  const version = payload?.working_version || {};
  const items = payload?.items || {};
  const bits = [];
  if (clean(version.headline)) bits.push(`Dirección de colección: ${clean(version.headline)}.`);
  if (clean(version.mood_note)) bits.push(`Clima definido por el equipo: ${clean(version.mood_note)}.`);

  const includes = rows(items.rules).filter((r) => r.kind === "must_include");
  const avoids = rows(items.rules).filter((r) => r.kind === "must_avoid");
  if (includes.length) {
    bits.push(`Debe incluir: ${includes.map((r) => `${r.scope}: ${r.value}`).join("; ")}.`);
  }
  if (avoids.length) {
    bits.push(`Debe evitar: ${avoids.map((r) => `${r.scope}: ${r.value}`).join("; ")}.`);
  }
  bits.push(
    "Usá las referencias sólo como dirección, no las copies. "
    + "El resultado es una visualización de concepto, no una ficha lista para producir.",
  );
  return bits.join(" ");
}

const GENERATION_SAFE_RIGHTS = new Set([
  "own_archive", "licensed", "supplier_provided",
]);

/**
 * Rights-aware image conditioning. Public/unknown references remain valuable
 * on the board but do not silently enter a generated client-facing image.
 */
export function directionReferences(payload) {
  const refs = rows(payload?.items?.references).filter((r) => clean(r.image_url));
  const eligible = refs.filter((r) => GENERATION_SAFE_RIGHTS.has(r.rights));
  const excluded = refs.filter((r) => !GENERATION_SAFE_RIGHTS.has(r.rights));
  return { eligible, excluded };
}

export function directionLineage(payload, combo, referenceIds = []) {
  const version = payload?.working_version || {};
  const rules = rows(payload?.items?.rules);
  return {
    direction_id: payload?.id || null,
    direction_version_id: version.id || null,
    direction_version_number: version.version_number ?? null,
    direction_status: version.status || null,
    silhouette_id: combo?.silueta?.directionItemId || null,
    fabric_pick_id: combo?.tejido?.directionItemId || null,
    material_id: combo?.tejido?.materialId || combo?.tejido?.id || null,
    colour_id: combo?.color?.directionItemId || null,
    reference_ids: rows(referenceIds).filter(Boolean),
    // These rules conditioned the prompt. They are NOT called "checked":
    // without a validated visual attribute model Atelier cannot honestly
    // assert that pixels comply with a must-avoid rule.
    constraint_rule_ids: rules.map((r) => r.id).filter(Boolean),
  };
}

export function directionRunCount(payload, matrixSize = 0) {
  const planned = Number(payload?.basis?.plan_slots);
  const target = Number.isFinite(planned) && planned > 0 ? planned : 12;
  return Math.max(1, Math.min(30, matrixSize || target, target));
}

export function directionSummary(payload) {
  const axes = directionAxes(payload);
  const refs = directionReferences(payload);
  return {
    version: payload?.working_version?.version_number ?? null,
    status: payload?.working_version?.status || null,
    silhouettes: axes.siluetas.length,
    fabrics: axes.tejidos.length,
    blockedFabrics: axes.tejidos.filter((f) => f.sourceability === "blocked").length,
    colours: axes.colores.length,
    references: refs.eligible.length,
    referencesExcluded: refs.excluded.length,
    rules: rows(payload?.items?.rules).length,
    planSlots: Number(payload?.basis?.plan_slots) || 0,
    ready: Boolean(axes.siluetas.length && axes.tejidos.some(
      (f) => f.sourceability !== "blocked") && axes.colores.length),
  };
}
