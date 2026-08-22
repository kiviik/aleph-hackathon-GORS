"use client";

// LA CADENA — inspo → imagen → 3D → ficha, in the approved visual system.
//
// ⚠ THE FIRST VERSION OF THIS FILE IGNORED `design/atelier-redesign/`. It used
// zero design tokens and twelve invented hex values beside a palette the repo
// had measured for contrast; it drew three equal cards, which the reference
// README names as a thing to avoid ("no generic SaaS dashboards"). This is the
// rebuild against 03/04/05/06: eyebrow + editorial title, panels, a rail that
// carries the refusals, and the semantic roles the tokens already define —
// --positive for what exists, --warning for what is absent, --danger for what
// the product will not do.
//
// ⚠ AND THE CHAIN IS A Y, NOT A LINE. The 3D render is built FROM the picture
// and adds nothing the picture lacked — no panels, no seams, no grading. It
// sits in the rail as a BRANCH, off the spine, because the engine returns 422
// if a render is used as a drawing and a screen that drew it mid-line would
// teach the opposite of what the product enforces.

import { useEffect, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import {
  assetUrl, derivations as loadDerivations, listAssets, listDrawings,
  listPacks, measurements as loadMeasurements,
} from "@/lib/chain.mjs";

const CSS = `
.chn-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:14px}
.chn-head h1{font-family:var(--disp);font-weight:700;font-size:30px;line-height:1.15;margin:6px 0 8px;max-width:20ch}
.chn-lede{color:var(--ink-2);font-size:13.5px;line-height:1.55;max-width:62ch;margin:0}
.chn-states{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 22px}
.chn-state{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;
  padding:5px 11px;border-radius:999px;border:1px solid var(--hair-2);background:var(--surface)}
.chn-state .d{width:7px;height:7px;border-radius:50%}
.chn-grid{display:grid;grid-template-columns:1.55fr .95fr;gap:20px;align-items:start}
.chn-stages{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.chn-stage{background:var(--surface);border:1px solid var(--hair);border-radius:14px;
  padding:16px;display:flex;flex-direction:column;min-height:200px}
.chn-stage h3{font-family:var(--disp);font-weight:700;font-size:17px;margin:6px 0 10px}
.chn-fig{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;
  background:var(--paper-2);border:1px solid var(--hair);margin-bottom:10px}
.chn-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.chn-thumbs img{width:42px;height:42px;object-fit:cover;border-radius:7px;border:1px solid var(--hair)}
.chn-body{font-size:12.5px;color:var(--ink-2);line-height:1.55;margin:0}
.chn-next{margin-top:auto;padding-top:10px;font-size:12.5px;color:var(--action);font-weight:600}
.chn-poms{margin-top:10px;border-top:1px solid var(--hair);font-size:12.5px}
.chn-pom{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--hair)}
.chn-pom b{font-weight:600}
.chn-pom .miss{color:var(--warning)}
.chn-pick{display:flex;gap:9px;align-items:center;margin-bottom:18px;flex-wrap:wrap}
.chn-pick select{font:inherit;font-size:13px;padding:7px 11px;border:1px solid var(--hair-2);
  border-radius:9px;background:var(--surface);color:var(--ink)}
.chn-refuse{list-style:none;margin:0;padding:0}
.chn-refuse li{display:flex;gap:9px;font-size:12.5px;color:var(--ink-2);line-height:1.5;padding:5px 0}
.chn-refuse .x{color:var(--danger);font-weight:700;flex:none}
.chn-callout{border:1px dashed var(--hair-2);border-radius:10px;padding:12px;
  font-size:12.5px;color:var(--ink-2);line-height:1.55;background:var(--paper)}
.chn-callout b{color:var(--ink)}
`;

/** The four states, mapped onto the semantic roles the palette already has.
 *  ⚠ No new colour vocabulary: --positive means it exists, --warning means it
 *  is absent, --danger means the product will not do it. */
const STATE = {
  present: { label: "Listo", tone: "var(--positive)" },
  absent: { label: "Todavía no", tone: "var(--warning)" },
  unconfigured: { label: "Sin proveedor", tone: "var(--ink-3)" },
  branch: { label: "No es especificación", tone: "var(--danger)" },
};

function State({ k }) {
  const s = STATE[k];
  return (
    <span className="chn-state">
      <span className="d" style={{ background: s.tone }} />{s.label}
    </span>
  );
}

export default function Chain() {
  const engine = useEngine();
  const brandId = engine.brandId || null;

  const [assets, setAssets] = useState([]);
  const [packs, setPacks] = useState([]);
  const [derivs, setDerivs] = useState([]);
  const [packId, setPackId] = useState("");
  const [poms, setPoms] = useState(null);
  const [drawingCount, setDrawingCount] = useState(0);

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    (async () => {
      const [a, p, d] = await Promise.all([
        listAssets(brandId), listPacks(brandId), loadDerivations(brandId),
      ]);
      if (!alive) return;
      const rows = Array.isArray(a) ? a : (a?.assets || []);
      const packRows = Array.isArray(p) ? p : (p?.tech_packs || []);
      setAssets(rows);
      setPacks(packRows);
      setDerivs(d?.kinds || []);
      setPackId(packRows[0]?.id || "");
    })();
    return () => { alive = false; };
  }, [brandId]);

  const pack = packs.find((p) => p.id === packId) || null;
  const styleId = pack?.style_id || null;

  useEffect(() => {
    if (!brandId || !styleId) { setPoms(null); setDrawingCount(0); return; }
    let alive = true;
    (async () => {
      const d = await listDrawings(brandId, styleId);
      if (!alive) return;
      const rows = Array.isArray(d) ? d : (d?.drawings || []);
      setDrawingCount(rows.length);
      if (rows[0]?.id) {
        const m = await loadMeasurements(brandId, rows[0].id);
        if (alive) setPoms(m);
      } else setPoms(null);
    })();
    return () => { alive = false; };
  }, [brandId, styleId]);

  // ⚠ THE IMAGE MUST BELONG TO THIS GARMENT. The first cut showed the brand's
  // newest asset beside whatever ficha was selected, so an unrelated photo sat
  // under "Imagen de marca" implying a link that does not exist — the same
  // defect as serving demo garments as a brand's own catalogue.
  const image = styleId
    ? assets.find((a) => a.style_id === styleId && a.operation !== "render_3d") || null
    : null;
  const refs = image?.reference_assets || [];
  const render3d = derivs.find((k) => k.kind === "render_3d");

  if (!brandId) {
    return (
      <div>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <p className="eyebrow">Cadena del producto</p>
        <h1 className="chn-head">Sin marca activa.</h1>
      </div>
    );
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="chn-head">
        <div>
          <p className="eyebrow">Cadena del producto</p>
          <h1>De la inspiración a la ficha.</h1>
          <p className="chn-lede">
            Cada paso dice en qué estado está y de dónde salió. El render 3D no
            está en esta línea: se construye DESDE la imagen, así que no agrega
            nada que la imagen no tuviera.
          </p>
        </div>
      </div>

      <div className="chn-states">
        <State k="present" /><State k="absent" />
        <State k="unconfigured" /><State k="branch" />
      </div>

      <div className="chn-pick">
        <span className="eyebrow">Ficha</span>
        <select value={packId} onChange={(e) => setPackId(e.target.value)}>
          <option value="">— elegí una ficha —</option>
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.style_number} · v{p.version} · {p.status}
            </option>
          ))}
        </select>
      </div>

      <div className="chn-grid">
        <div className="chn-stages">
          <div className="chn-stage">
            <p className="eyebrow">Paso 1 · Inspiración</p>
            <h3>De dónde salió</h3>
            {refs.length > 0 && (
              <div className="chn-thumbs">
                {refs.slice(0, 6).map((r, i) => (
                  <img key={i} alt="" src={assetUrl(brandId, r.asset_id || r)} />
                ))}
              </div>
            )}
            <p className="chn-body">
              {refs.length
                ? `${refs.length} referencia(s) citadas por la imagen, guardadas en su fila.`
                : "La imagen no cita referencias. Si salió de un tablero, esa procedencia todavía no viaja."}
            </p>
            {!refs.length && <p className="chn-next">Añadir referencias →</p>}
          </div>

          <div className="chn-stage">
            <p className="eyebrow">Paso 2 · Imagen</p>
            <h3>La prenda, vista</h3>
            {image
              ? <img className="chn-fig" alt="" src={assetUrl(brandId, image.id)} />
              : <div className="chn-fig" />}
            <p className="chn-body">
              {image
                ? `${image.operation} · ${image.model || "modelo no declarado"}`
                : styleId
                  ? "Ninguna imagen de esta marca está atada a este Style todavía."
                  : "Elegí una ficha para ver su imagen."}
            </p>
          </div>

          <div className="chn-stage">
            <p className="eyebrow">Paso 3 · Ficha</p>
            <h3>Lo que la fábrica cotiza</h3>
            <p className="chn-body">
              {pack
                ? `${pack.style_number} · v${pack.version} · ${pack.status} · ${drawingCount} dibujo(s)`
                : "Elegí una ficha arriba."}
            </p>
            {poms?.measurements?.length > 0 && (
              <div className="chn-poms">
                {poms.measurements.slice(0, 5).map((m) => (
                  <div className="chn-pom" key={m.callout_id}>
                    <b>{m.pom_name}</b>
                    {m.state === "resolved"
                      ? <span>{m.value} {m.unit}{m.tolerance ? ` ±${m.tolerance}` : ""}</span>
                      : <span className="miss">{m.state}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="rail">
          <div className="rcard">
            <h4><span className="d" style={{ background: "var(--danger)" }} />
              Rama · Render 3D</h4>
            <p>
              {render3d?.provider_available
                ? `Proveedor: ${render3d.provider}.`
                : "No hay proveedor configurado. Elegirlo es una compra y un benchmark, no un import."}
            </p>
            <p>{render3d?.why_not_spec}</p>
          </div>

          <div className="rcard">
            <h4>Atelier no inventa</h4>
            <ul className="chn-refuse">
              <li><span className="x">✕</span> Una medida deducida de un render.</li>
              <li><span className="x">✕</span> Un dibujo técnico hecho desde una malla 3D.</li>
              <li><span className="x">✕</span> Una tolerancia que la tabla de medidas no declara.</li>
              <li><span className="x">✕</span> Una procedencia que la imagen no registró.</li>
            </ul>
          </div>

          <div className="rcard">
            <h4>Lo que la fábrica igual va a preguntar</h4>
            <div className="chn-callout">
              Un paquete liberado nombra lo que este motor no modela — <b>grading,
              artwork, etiquetas, packing, HS code</b> — como frases, nunca como
              puntaje. Un número acá se compararía entre estilos y empezaría a
              significar algo que no puede significar.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
