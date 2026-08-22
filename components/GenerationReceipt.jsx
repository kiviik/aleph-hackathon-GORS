"use client";
// "Qué se envió" — the four voices of a generation, kept apart on screen the
// same way the engine keeps them apart in the compiled prompt (2026-08-17
// reversal): (1) what the designer wrote, verbatim; (2) what she selected in
// the structured pickers; (3) what Atelier added from brand/collection state;
// (4) the engine's control mapping — which controls became real provider
// parameters and which are prompt guidance the model may or may not honour.
//
// ⚠ THE CHIPS RENDER THE ENGINE'S MAPPING, NEVER A LOCAL CLAIM. Every label
// comes from lib/generationIntent.mjs#chipFor, so a control the compiler
// called prompt_guidance cannot be dressed up as native here — that dressing
// is the exact defect the owner named. When a generation ran without the
// typed path (legacy prompt, or the local fallback) there IS no mapping, and
// the panel says so instead of inventing one.
import { chipFor } from "@/lib/generationIntent.mjs";

const GROUP_TITLES = {
  garment_spec: "Ficha de prenda",
  materials: "Materiales",
  palette: "Paleta",
  presentation: "Presentación",
};

export default function GenerationReceipt({ sent }) {
  if (!sent) return null;
  const groups = Object.entries(GROUP_TITLES)
    .map(([key, title]) => ({ key, title, dict: sent.intent?.[key] || null }))
    .filter((g) => g.dict && Object.keys(g.dict).length);
  const chips = (sent.controlMapping || []).map(chipFor);

  return (
    <details className="grx">
      <style dangerouslySetInnerHTML={{ __html: `
        .grx{margin-top:10px;border:1px solid var(--line);border-radius:10px;background:var(--paper-2)}
        .grx summary{font-size:11px;font-weight:700;color:var(--ink-2);padding:8px 11px;cursor:pointer;list-style:none}
        .grx summary::-webkit-details-marker{display:none}
        .grx summary:before{content:"▸ ";color:var(--ink-3)}
        .grx[open] summary:before{content:"▾ "}
        .grx-b{padding:0 11px 10px}
        .grx-k{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);margin:9px 0 3px}
        .grx-t{font-size:11.5px;color:var(--ink);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
        .grx-t.quiet{color:var(--ink-3)}
        .grx-kv{font-size:11.5px;color:var(--ink);line-height:1.5}
        .grx-kv b{font-weight:700;color:var(--ink-2)}
        .grx-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
        .grx-chip{display:inline-flex;align-items:baseline;gap:5px;font-size:11px;border-radius:999px;padding:3px 9px;border:1px solid var(--line);background:var(--card);color:var(--ink-2)}
        .grx-chip b{font-weight:700;color:var(--ink)}
        .grx-chip.native{border-color:var(--sage);color:var(--sage)}
        .grx-chip.native b{color:var(--sage)}
        .grx-chip.guidance{border-color:var(--inferred);background:var(--inferred-wash);color:#8a6410}
        .grx-chip.guidance b{color:#8a6410}
        .grx-chip.off{color:var(--ink-3);background:var(--paper-2)}
        .grx-chip.off b{color:var(--ink-3)}
        .grx-model{font-size:11px;color:var(--ink-3);margin-top:8px;line-height:1.45}
        .grx-detail{font-size:10.5px;color:inherit;opacity:.8}
      ` }} />
      <summary>Qué se envió</summary>
      <div className="grx-b">
        <div className="grx-k">Lo que escribiste</div>
        <div className={`grx-t${sent.authored ? "" : " quiet"}`}>
          {sent.authored || "nada — esta generación salió sin texto tuyo"}
        </div>

        <div className="grx-k">Lo que seleccionaste</div>
        {groups.length ? groups.map((g) => (
          <div className="grx-kv" key={g.key}>
            <b>{g.title}:</b>{" "}
            {Object.entries(g.dict).map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </div>
        )) : <div className="grx-t quiet">sin selecciones estructuradas</div>}

        <div className="grx-k">Lo que Atelier agregó</div>
        <div className={`grx-t${sent.context ? "" : " quiet"}`}>
          {sent.context || "nada"}
        </div>

        <div className="grx-k">Cómo se trató cada control</div>
        {chips.length ? (
          <div className="grx-chips">
            {chips.map((c, i) => (
              <span key={c.control + i} className={`grx-chip ${c.tone}`}
                title={c.control}>
                <b>{c.name}</b> {c.label}
                {c.detail && <span className="grx-detail">· {c.detail}</span>}
              </span>
            ))}
          </div>
        ) : (
          <div className="grx-t quiet">
            sin mapa de controles: esta generación no viajó por el contrato
            tipado (prompt suelto o generador de respaldo), así que no hay
            registro de qué fue parámetro real y qué fue solo texto
          </div>
        )}

        {(sent.model || sent.requestedModel) && (
          <div className="grx-model">
            {sent.requestedModel && sent.model && sent.requestedModel !== sent.model
              ? `modelo pedido ${sent.requestedModel} · respondió ${sent.model}`
              : `modelo: ${sent.model || sent.requestedModel}`}
          </div>
        )}
      </div>
    </details>
  );
}
