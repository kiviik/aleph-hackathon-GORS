// The typed generation contract, frontend half (engine reversal, 2026-08-17).
//
// The engine's `generation_intent.py` replaced the loose prompt string with a
// STRUCTURED request — the designer's words verbatim, what the app added,
// structured pickers, references with roles — and its compiler answers with a
// MAPPING: one entry per control, each labelled with how it was actually
// treated by the selected model. The owner's correction that forced this:
// "Atelier sometimes displays a professional control while merely converting
// it into prompt prose. A world-class tool must either map a control to
// provider-native behavior or label it honestly as prompt guidance."
//
// This module is that honesty, kept in ONE testable place:
//   · every user-facing word for a treatment lives here, so a component
//     cannot invent a claim the mapping does not make;
//   · the tier labels live here, hedged — the engine's ranking is availability
//     and documentation, NOT measured quality, until the blind benchmark runs,
//     so nothing here may say "mejor";
//   · a 422 refusal is a SENTENCE THE ENGINE WROTE and is rendered verbatim,
//     never swallowed and never retried against the app's fallback generator.

// ---- routing vocabulary (mirrors api/app/imaging.py, read 2026-08-17) ------

/** The registry's exact model keys. Pinning one is expert mode: that model
 *  answers or the request errors — the engine does not substitute. */
export const MODELS = [
  "gpt-image-2",
  "gpt-image-1",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
];

/** What pinning a model means, said next to the picker. */
export const MODEL_PIN_NOTE =
  "el modelo elegido responde o falla; no hay sustituto silencioso";

/** Speed/quality appetite → the engine's provisional routing. ⚠ The "best"
 *  label is HEDGED on purpose: the registry ranks by documented capability and
 *  availability, not by measured output quality — the blind fashion benchmark
 *  has not run. Until it does, no tier may be called "mejor". */
export const TIERS = [
  { id: "fast", label: "Rápido" },
  { id: "balanced", label: "Equilibrado" },
  { id: "best", label: "Máxima calidad (según el proveedor)" },
];

export const TASKS = ["ideation", "garment_edit", "material_transfer",
  "multi_reference", "campaign", "final_export"];

// ---- treatments → chips ----------------------------------------------------

/** The one Spanish word-set for the compiler's four treatments. Components
 *  render THESE — a screen hardcoding "parámetro del proveedor" beside a
 *  control the mapping calls prompt_guidance is the exact lie this exists to
 *  prevent (a source test enforces it). Tones map to the app's role tokens:
 *  native → verde (--sage), guidance → ámbar (--inferred, the AI-proposed
 *  colour), the two non-applications → gris. */
export const TREATMENT_CHIPS = {
  provider_native: { tone: "native", label: "parámetro del proveedor" },
  prompt_guidance: { tone: "guidance", label: "guía de prompt" },
  unavailable: { tone: "off", label: "no aplicado" },
  refused: { tone: "off", label: "rechazado" },
};

/** The suffix a control that is only prompt prose must wear in the UI. */
export const GUIDANCE_LABEL = "guía de prompt";

/** One mapping entry → one renderable chip. Unknown treatments come back as
 *  gris "sin clasificar" rather than being dropped — an entry the engine sent
 *  and the screen hid would be a hidden layer again. */
export function chipFor(entry) {
  const chip = TREATMENT_CHIPS[entry?.treatment]
    || { tone: "off", label: "sin clasificar" };
  return {
    control: entry?.control || "",
    name: controlName(entry?.control),
    tone: chip.tone,
    label: chip.label,
    detail: entry?.detail || null,
  };
}

/** Spanish display names for the engine's control keys. Unknown keys pass
 *  through untranslated — the engine's word beats a wrong translation. */
export function controlName(control) {
  const NAMES = {
    authored_prompt: "tu texto",
    atelier_context: "contexto de Atelier",
    garment_spec: "ficha de prenda",
    materials: "materiales",
    palette: "paleta",
    presentation: "presentación",
    "references.roles": "roles de referencia",
    "references.strength": "peso de referencias",
    locks: "bloqueos",
    exclusions: "exclusiones",
    "output.size": "tamaño",
    "output.aspect_ratio": "relación de aspecto",
    "output.resolution": "resolución",
    "output.format": "formato",
    "output.transparent_background": "fondo transparente",
    // Regional editing (engine 1c756e7): the one control with no
    // prompt-guidance version — a masked model edits the region or the
    // request is refused, so this chip is always green or absent.
    region: "región enmascarada",
  };
  return NAMES[control] || control || "";
}

// ---- building an intent ----------------------------------------------------

const clean = (dict) => {
  const out = {};
  for (const [k, v] of Object.entries(dict || {})) {
    const s = v == null ? "" : String(v).trim();
    if (s) out[k] = s;
  }
  return out;
};

/**
 * The designer's request as structure. `authored` is HER text, verbatim — the
 * one required part: with nothing typed there is no intent, and the caller
 * stays on the legacy prompt path instead of us signing her name to app prose.
 * Returns the engine-shaped `generation_intent` body, or null.
 */
export function buildIntent({
  authored, context = null, garment = {}, materials = {}, palette = {},
  presentation = {}, references = [], locks = [], exclusions = [],
  output = null,
} = {}) {
  const mine = typeof authored === "string" ? authored.trim() : "";
  if (!mine) return null;
  const ctx = typeof context === "string" ? context.trim() : "";
  const intent = { authored_prompt: mine };
  if (ctx) intent.atelier_context = ctx;
  const groups = { garment_spec: clean(garment), materials: clean(materials),
    palette: clean(palette), presentation: clean(presentation) };
  for (const [key, dict] of Object.entries(groups)) {
    if (Object.keys(dict).length) intent[key] = dict;
  }
  const refs = (references || [])
    .map((r) => {
      if (!r || (!r.url && !r.assetId && !r.asset_id)) return null;
      const ref = {};
      if (r.assetId || r.asset_id) ref.asset_id = r.assetId || r.asset_id;
      else ref.url = r.url;
      if (r.role) ref.role = r.role;
      if (Number.isFinite(r.strength)) ref.strength = r.strength;
      return ref;
    })
    .filter(Boolean);
  if (refs.length) intent.references = refs;
  if (locks?.length) intent.locks = locks;
  if (exclusions?.length) intent.exclusions = exclusions;
  if (output && Object.values(output).some((v) => v != null && v !== false)) {
    intent.output = output;
  }
  return intent;
}

/** The item editor's "alcance" chips say what MAY change; the engine's locks
 *  say what must NOT. Same fact, inverted — so the chips become the locks for
 *  everything they leave out. "detalle" has no lock counterpart (the engine's
 *  vocabulary has none for it), so selecting only "detalle" locks the other
 *  four. Locks are prompt guidance on every configured model and the mapping
 *  says so; this just makes them structured instead of prose. */
export const SCOPE_LOCKS = {
  silueta: "silhouette", tela: "fabric", color: "color", estampa: "print",
};

export function locksFromScopes(scopes = []) {
  return Object.entries(SCOPE_LOCKS)
    .filter(([scope]) => !scopes.includes(scope))
    .map(([, lock]) => lock);
}

// ---- the fallback's local composition --------------------------------------

/**
 * ⚠ FOR THE NO-ENGINE FALLBACK ONLY. The main path sends the intent and the
 * SERVER composes — that is the contract. But `/api/generate` (this Next
 * app's own guarded route, used when no engine is reachable) takes one plain
 * prompt, so the fallback needs a local rendering of the same parts. It is a
 * degradation, not a second composer: no mapping exists on this path and the
 * caller must not imply one.
 */
export function fallbackPrompt(intent) {
  if (!intent?.authored_prompt) return "";
  const parts = [intent.authored_prompt];
  if (intent.atelier_context) parts.push(intent.atelier_context);
  for (const key of ["garment_spec", "materials", "palette", "presentation"]) {
    const dict = intent[key];
    if (dict && Object.keys(dict).length) {
      parts.push(Object.entries(dict).map(([k, v]) => `${k}: ${v}`).join("; ") + ".");
    }
  }
  if (intent.locks?.length) {
    parts.push(`No cambies: ${intent.locks.join(", ")}.`);
  }
  if (intent.exclusions?.length) {
    parts.push(`Evitá: ${intent.exclusions.join(", ")}.`);
  }
  return parts.join(" ");
}

// ---- refusals --------------------------------------------------------------

/**
 * A 422 with one of the engine's two refusal codes is an ANSWER — "no model
 * can honour this without lying to you" — not a transport error. The reason is
 * the engine's own sentence and is rendered VERBATIM; returning null here is
 * what routes everything else to normal error handling.
 */
export function refusalMessage(body) {
  const detail = body?.detail;
  if (!detail || typeof detail !== "object") return null;
  if (detail.error === "capability_unavailable") return detail.reason || null;
  if (detail.error === "intent_refused") {
    return detail.control ? `${detail.control}: ${detail.reason}` : detail.reason;
  }
  return null;
}
