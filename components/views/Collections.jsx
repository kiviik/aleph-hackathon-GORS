"use client";
// Colecciones — cápsulas con evidencia. Cada estilo propuesto está JUSTIFICADO:
// colorways de la paleta real del ADN, precios dentro de las bandas reales,
// categorías elegidas por huecos reales (tu catálogo vs. los ítems crawleados
// de competidores) y tendencias verificadas por el engine. La cápsula queda
// CONGELADA en el ledger de predicciones — una propuesta auditable, gradeable.
// Si el LLM se queda sin cupo, la cápsula igual se construye determinística y
// lo dice; si el engine está caído, esta vista lo dice — nunca inventa nada.
//
// Renders: POST /collection/render/{brand} genera las imágenes reales (condicionadas
// con fotos reales de producto de la marca) y las sirve desde /static. Sin llave o
// sin cupo, el frame punteado se queda y el error se dice en castellano — nunca se
// inventa una imagen. Cada celda renderizada se puede regenerar individualmente
// (calidad draft: iterar es barato, finalizar es raro).
import { useEffect, useRef, useState } from "react";
import { useEngine } from "@/components/EngineProvider";
import { engineFetch } from "@/lib/auth";

// Same base-url logic as lib/api.js / Observatory.jsx (this view has its own
// contract with the engine's /collection endpoints).
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

const ars = (n) => "AR$ " + Math.round(n).toLocaleString("es-AR");
const fecha = (iso) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

const KIND_LABEL = {
  "sin-cobertura": "sin cobertura propia",
  "sub-construido": "sub-construido",
  "hueco-precio": "hueco de precio",
};

// Estados honestos del pipeline de imágenes — nunca una imagen inventada.
const RENDER_ERROR_MSG = {
  no_key:
    "Falta la API key de imágenes (OpenAI o Google) — el pipeline está listo, solo falta la llave.",
  quota: "Sin cupo de imágenes en la llave actual.",
};
const renderErrText = (code) =>
  RENDER_ERROR_MSG[code] || "El proveedor de imágenes falló — se puede reintentar.";

const isRendered = (s) => s?.render?.status === "ok" && s?.render?.url;

function Swatch({ hex, size = 14 }) {
  return (
    <i
      title={hex}
      style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: hex, border: "1px solid rgba(0,0,0,.18)", verticalAlign: "-2px",
      }}
    />
  );
}

// The Stage-2 render cell: honest placeholder showing the matrix structure
// (motif direction × colorways) without faking an image.
function PendingRender({ style, rendering }) {
  return (
    <div
      style={{
        border: "1.5px dashed var(--ink-3)", borderRadius: 10, padding: "14px 12px",
        background: "var(--paper-2)", display: "flex", flexDirection: "column",
        gap: 8, alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
        motivo: <b>{style.motif_direction}</b>
      </span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {(style.colorway_variants || [style.colorway_hex]).map((h) => (
          <Swatch key={h} hex={h} size={16} />
        ))}
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>colorways reales</span>
      </span>
      <span style={{ fontSize: 11, color: "var(--ink-3)", fontStyle: "italic" }}>
        {rendering ? "renderizando…" : "render pendiente — falta llave de imágenes con cupo"}
      </span>
    </div>
  );
}

// A real render straight from the engine's /static mount, with a cheap
// per-cell regenerate (draft quality — iterar es barato).
function RealRender({ style, onRegenerate, regenerating }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <img
        src={API_BASE + style.render.url}
        alt={`Render — ${style.name}`}
        style={{
          width: "100%", borderRadius: 10, border: "1px solid var(--paper-2)",
          display: "block", opacity: regenerating ? 0.45 : 1,
        }}
      />
      <button
        className="fp2-evtoggle"
        onClick={onRegenerate}
        disabled={regenerating}
        style={{ alignSelf: "flex-start" }}
        title="Regenerar esta celda (calidad draft)"
      >
        {regenerating ? "regenerando…" : "↻ regenerar"}
      </button>
    </div>
  );
}

function Evidence({ ev }) {
  const g = ev.gap;
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 8, fontSize: 12.5, display: "grid", gap: 6 }}>
      <div>
        <b>Hueco</b> · {g.cat} ({KIND_LABEL[g.kind] || g.kind}): tenés <b>{g.yours}</b>,
        el set competidor tiene <b>{g.rivals}</b>
        {g.ars_rivals > 0 && <> ({g.ars_rivals} en ARS)</>}
        {g.brands?.length > 0 && <> · {g.brands.join(", ")}</>}
        {g.band_gaps?.length > 0 && <> · banda descubierta: {g.band_gaps.join(", ")}</>}
        {g.ars_avg && <> · promedio ARS rivales {ars(g.ars_avg)}</>}
      </div>
      {ev.trend ? (
        <div>
          <b>Tendencia</b> · {ev.trend.name} — fit {ev.trend.fit.toFixed(2)}
          {ev.trend.action && <> · acción del engine: {ev.trend.action}</>}
        </div>
      ) : (
        <div><b>Tendencia</b> · sin tendencia mapeada a esta categoría en la corrida</div>
      )}
      <div>
        <b>Banda</b> · {ev.band.name}: {ars(ev.band.low)}–{ars(ev.band.high)} (arquitectura real)
      </div>
    </div>
  );
}

function StyleCard({ s, rendering, onRegenerate, regenerating }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>{s.name}</h3>
        <span className="eyebrow" style={{ whiteSpace: "nowrap" }}>{s.category} · {s.band}</span>
      </div>

      {isRendered(s) ? (
        <RealRender style={s} onRegenerate={onRegenerate} regenerating={regenerating} />
      ) : (
        <PendingRender style={s} rendering={rendering} />
      )}

      <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <div><b style={{ textTransform: "capitalize" }}>{s.garment}</b> · {s.fabric}</div>
        <div>
          <Swatch hex={s.colorway_hex} /> <span className="mono" style={{ fontSize: 12 }}>{s.colorway_hex}</span>
          <span style={{ margin: "0 6px", color: "var(--ink-3)" }}>·</span>
          <b>{ars(s.price_ars)}</b>
          <span style={{ color: "var(--ink-3)" }}> (banda {s.band})</span>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{s.rationale_es}</p>

      <button className="fp2-evtoggle" onClick={() => setOpen((o) => !o)} style={{ alignSelf: "flex-start" }}>
        {open ? "− evidencia" : "+ evidencia"}
      </button>
      {open && <Evidence ev={s.evidence} />}
    </article>
  );
}

export default function Collections({ onNavigate }) {
  const engine = useEngine();
  const connected = Boolean(engine.connected);
  const live = engine.status === "live";
  // undefined = consultando · null = no hay cápsula todavía · objeto = cápsula
  const [capsule, setCapsule] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Render pipeline state
  const [rendering, setRendering] = useState(false);
  const [renderMsg, setRenderMsg] = useState("");
  const [progress, setProgress] = useState(null); // {done, total} mientras renderiza
  const [regenSlot, setRegenSlot] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  useEffect(() => stopPolling, []);

  async function refreshCapsule() {
    if (!live || !engine.brandId) return null;
    try {
      const r = await engineFetch(`${API_BASE}/collection/latest/${engine.brandId}`, { cache: "no-store" });
      if (!r.ok) return null;
      const c = await r.json();
      setCapsule(c);
      return c;
    } catch { return null; }
  }

  useEffect(() => {
    if (!live || !engine.brandId) {
      if (engine.status === "demo") setCapsule(null);
      return;
    }
    let dead = false;
    engineFetch(`${API_BASE}/collection/latest/${engine.brandId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => !dead && setCapsule(c))
      .catch(() => !dead && setCapsule(null));
    return () => { dead = true; };
  }, [live, engine.brandId, engine.status]);

  async function generate() {
    if (!live || !engine.brandId || busy) return;
    setBusy(true);
    setError("");
    setRenderMsg("");
    try {
      const res = await engineFetch(`${API_BASE}/collection/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand_id: engine.brandId, n_styles: 6 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `el engine respondió ${res.status}`);
      }
      setCapsule(await res.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  // Batch render: dispara el pipeline y muestra progreso real (polling del
  // ledger cada 3s — cada PNG que aterriza en /static aparece en latest).
  async function renderCapsule() {
    if (!live || !engine.brandId || rendering || !capsule) return;
    setRendering(true);
    setRenderMsg("");
    const total = capsule.styles?.length || capsule.n_styles || 0;
    const doneNow = (c) => (c?.styles || []).filter(isRendered).length;
    setProgress({ done: doneNow(capsule), total });
    pollRef.current = setInterval(async () => {
      const c = await refreshCapsule();
      if (c) setProgress({ done: doneNow(c), total: c.styles?.length || total });
    }, 3000);
    try {
      const res = await engineFetch(`${API_BASE}/collection/render/${engine.brandId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}), // cápsula más reciente, calidad draft
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `el engine respondió ${res.status}`);
      const errs = body.errors || [];
      if (errs.length) {
        const codes = new Set(errs.map((e) => e.error));
        const code = codes.has("no_key") ? "no_key" : codes.has("quota") ? "quota" : "provider";
        setRenderMsg(
          `${renderErrText(code)} (${body.rendered || 0} renders nuevos, ` +
          `${errs.length} estilos sin render)`
        );
      }
    } catch (e) {
      setRenderMsg(String(e.message || e));
    } finally {
      stopPolling();
      setRendering(false);
      setProgress(null);
      await refreshCapsule();
    }
  }

  // Regenerar UNA celda (draft — iterar es barato). Sobrescribe el PNG; el
  // ?v= del url nuevo rompe el caché del browser.
  async function regenerateStyle(slot) {
    if (!live || !engine.brandId || regenSlot !== null) return;
    setRegenSlot(slot);
    setRenderMsg("");
    try {
      const res = await engineFetch(`${API_BASE}/collection/render-style/${engine.brandId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot, quality: "draft" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `el engine respondió ${res.status}`);
      if (body.error) setRenderMsg(renderErrText(body.error));
    } catch (e) {
      setRenderMsg(String(e.message || e));
    } finally {
      setRegenSlot(null);
      await refreshCapsule();
    }
  }

  const quotaLimited = capsule && capsule.llm && !capsule.llm.used;
  const pendingRenders = (capsule?.styles || []).filter((s) => !isRendered(s)).length;

  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Crear · Colecciones</div>
          <h1>Colecciones — cápsulas con evidencia</h1>
          <p>
            El engine arma una cápsula desde tus datos reales: huecos contra los
            competidores crawleados, tu paleta, tus bandas de precio y las
            tendencias verificadas. La propuesta queda congelada en el ledger —
            auditable, y gradeable cuando haya resultados.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {live && capsule && pendingRenders > 0 && (
            <button className="btn" onClick={renderCapsule} disabled={rendering || busy}>
              {rendering
                ? `Renderizando ${progress?.done ?? 0}/${progress?.total ?? pendingRenders}…`
                : "Renderizar cápsula →"}
            </button>
          )}
          {live && (
            <button className="btn cobalt" onClick={generate} disabled={busy || rendering}>
              {busy ? "Analizando…" : "✦ Generar cápsula"}
            </button>
          )}
        </div>
      </div>

      {!connected && (
        <div className="empty" style={{ marginTop: 30 }}>
          <div className="ic">○</div>
          <h4>Engine desconectado</h4>
          <p>
            No hay corrida del engine disponible ({API_BASE}). Las cápsulas se
            construyen sólo desde datos reales — sin engine no hay nada honesto
            para mostrar.
          </p>
        </div>
      )}

      {connected && !live && (
        <div className="empty" style={{ marginTop: 30 }}>
          <div className="ic">✓</div>
          <h4>Engine conectado · todavía no hay corrida de mercado</h4>
          <p>
            {engine.brandName || "Esta marca"} ya tiene disponible su archivo visual
            en Catálogo y puede trabajar en Dirección y Studio. Esta pantalla de
            cápsulas comparativas necesita además una corrida de inteligencia de
            mercado, Product Master estructurado y evidencia competitiva; las
            capturas visuales no se convierten en SKUs inventados.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
            <button className="btn cobalt" onClick={() => onNavigate?.("direction")}>
              Abrir Dirección →
            </button>
            <button className="btn" onClick={() => onNavigate?.("catalog")}>
              Ver catálogo visual
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div style={{ margin: "26px 0", fontSize: 14, color: "var(--ink-2)" }}>
          Analizando tu ADN y tus huecos…
        </div>
      )}

      {error && !busy && (
        <div style={{ margin: "18px 0", padding: "12px 14px", background: "var(--clay-wash)", color: "var(--clay)", borderRadius: 8, fontSize: 13.5 }}>
          No se pudo generar: {error}
        </div>
      )}

      {renderMsg && !busy && (
        <div style={{ margin: "18px 0", padding: "12px 14px", background: "var(--ochre-wash)", color: "var(--ochre)", borderRadius: 8, fontSize: 13.5 }}>
          {renderMsg}
        </div>
      )}

      {live && capsule === undefined && !busy && (
        <div style={{ margin: "26px 0", fontSize: 14, color: "var(--ink-2)" }}>Consultando el ledger…</div>
      )}

      {live && capsule === null && !busy && (
        <div className="empty" style={{ marginTop: 30 }}>
          <div className="ic">✦</div>
          <h4>Todavía no hay cápsulas</h4>
          <p>Generá la primera: sale de tus huecos reales y queda congelada en el ledger.</p>
        </div>
      )}

      {capsule && !busy && (
        <div style={{ marginTop: 22, display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>{capsule.name}</h2>
              {quotaLimited && (
                <span style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 20, background: "var(--ochre-wash)", color: "var(--ochre)", fontWeight: 600 }}>
                  narrativa limitada — sin cupo LLM
                </span>
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {capsule.narrative_es}
            </p>
            {capsule.mix_check && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
                Mix vs. huecos: {capsule.mix_check.note} ·{" "}
                {(capsule.mix_check.by_category || [])
                  .filter((c) => c.styles > 0)
                  .map((c) => `${c.cat} ${c.styles}`)
                  .join(" · ")}
              </p>
            )}
            {capsule.matrix && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                Matriz prevista: {capsule.matrix.rows.length} direcciones de motivo ×
                {" "}{(capsule.matrix.cols?.palette || []).map((h) => <Swatch key={h} hex={h} size={12} />)}
                {" "}({capsule.matrix.cols?.note})
              </p>
            )}
          </div>

          <div className="grid col-2" style={{ gap: 16 }}>
            {capsule.styles.map((s) => (
              <StyleCard
                key={s.slot}
                s={s}
                rendering={rendering}
                onRegenerate={() => regenerateStyle(s.slot)}
                regenerating={regenSlot === s.slot}
              />
            ))}
          </div>

          <div style={{ fontSize: 12.5, color: "var(--ink-3)", borderTop: "1px solid var(--paper-2)", paddingTop: 12 }}>
            Propuesta congelada en el ledger ·{" "}
            {fecha(capsule.ledger?.frozen_at || capsule.generated_at)} ·{" "}
            {capsule.n_styles} estilos — se puede auditar.
          </div>
        </div>
      )}
    </section>
  );
}
