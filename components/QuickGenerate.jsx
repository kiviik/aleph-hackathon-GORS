"use client";
// The prompt box that opens anywhere. ⌘K / Ctrl-K, or the button in the topbar.
//
// ⚠ WHAT THIS IS COMPETING WITH. A designer with ChatGPT open types a sentence
// and gets a picture. Atelier's studio cost three or four navigation clicks and
// an active brand AND collection first — and none of that was protecting
// anything, because the engine requires only `authored_prompt`. Every click
// was a reason to use the other tab.
//
// What it adds, and each is something a chat window structurally cannot:
//   * the image is KEPT, as a ledger row with prompt, model and parentage;
//   * a follow-up EDITS that image instead of re-rolling a longer prompt;
//   * the brand's real fabrics travel as context — visible, and switchable off.
//
// ⚠ CSS via dangerouslySetInnerHTML: a `<style>` with a string child made React
// rebuild the tree on every load across 17 files (owner review 2026-08-14).
import { useCallback, useEffect, useRef, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import AssetImage from "@/components/ui/AssetImage";
import { generateAssets } from "@/lib/assets";
import { listMaterials } from "@/lib/direction";
import {
  brandContext, looksLikeFollowUp, quickIntent, statusText,
} from "@/lib/quickGenerate.mjs";

const CSS = `
.qg-scrim{position:fixed;inset:0;background:rgba(23,24,28,.42);z-index:60;
  display:grid;place-items:start center;padding:9vh 16px 16px}
.qg{width:min(720px,100%);background:var(--paper);border:1px solid var(--line);
  border-radius:12px;box-shadow:var(--shadow-lg);overflow:hidden}
.qg-bar{display:flex;gap:10px;align-items:center;padding:14px 16px;
  border-bottom:1px solid var(--hair)}
.qg-in{flex:1;font:inherit;font-size:16px;border:0;background:none;color:var(--ink);
  outline:none}
.qg-go{appearance:none;font-family:inherit;font-size:var(--fs-body);padding:8px 16px;
  border-radius:8px;border:1px solid var(--action);background:var(--action);color:#fff;
  cursor:pointer}
.qg-go:disabled{opacity:.45;cursor:not-allowed}
.qg-body{padding:14px 16px;display:grid;gap:12px}
.qg-ctx{display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  font-size:var(--fs-caption);color:var(--ink-2)}
.qg-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;
  border:1px solid var(--line);background:var(--surface)}
.qg-chip.on{border-color:var(--observed);color:var(--observed-ink)}
.qg-toggle{appearance:none;border:0;background:none;font:inherit;
  font-size:var(--fs-caption);color:var(--action);cursor:pointer;padding:0}
.qg-out{display:flex;gap:12px;align-items:flex-start}
.qg-out .shot{width:180px;border:1px solid var(--line);border-radius:8px;overflow:hidden;
  background:var(--paper-2)}
.qg-out .shot img{width:100%;display:block;aspect-ratio:3/4;object-fit:cover}
.qg-meta{flex:1;font-size:var(--fs-caption);color:var(--ink-2);line-height:1.5}
.qg-meta b{color:var(--ink)}
.qg-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.qg-act{appearance:none;font-family:inherit;font-size:var(--fs-caption);padding:5px 11px;
  border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--ink);
  cursor:pointer}
.qg-act:hover{border-color:var(--action)}
.qg-err{font-size:var(--fs-caption);color:var(--clay);line-height:1.5}
.qg-hint{font-size:var(--fs-caption);color:var(--ink-3)}
.qg-open{appearance:none;font-family:inherit;font-size:var(--fs-caption);
  padding:6px 12px;border-radius:99px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink-2);cursor:pointer;white-space:nowrap}
.qg-open:hover{border-color:var(--action);color:var(--ink)}
`;

export default function QuickGenerate({ onNavigate }) {
  const engine = useEngine();
  const brandId = engine.brandId || null;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [last, setLast] = useState(null);      // the newest asset
  const [useContext, setUseContext] = useState(true);
  const [materials, setMaterials] = useState([]);
  const inputRef = useRef(null);

  // ⌘K from anywhere. Escape closes.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!brandId || !open) return;
    listMaterials(brandId)
      .then((m) => setMaterials(Array.isArray(m) ? m
        : Array.isArray(m?.items) ? m.items
        : Array.isArray(m?.materials) ? m.materials : []))
      .catch(() => setMaterials([]));   // no sheet contributes nothing, not a guess
  }, [brandId, open]);

  const ctx = brandContext({
    materials, brandName: engine.brand?.name || null,
  });

  const run = useCallback(async () => {
    const authored = text.trim();
    if (!authored || !brandId) return;
    const followUp = looksLikeFollowUp(authored, !!last);
    setBusy(true); setErr(null);
    try {
      const body = quickIntent({
        authored,
        context: useContext ? ctx.text : null,
        previousAssetId: last?.id || null,
        followUp,
      });
      const env = await generateAssets(brandId, body,
        { idempotencyKey: `qg:${Date.now()}` });
      // ⚠ The engine's refusal IS the message. A partial batch returns the
      // images that arrived WITH the error that stopped the rest.
      if (env?.error && !(env.assets || []).length) {
        setErr(typeof env.error === "string" ? env.error : "no se pudo generar");
      } else {
        const asset = (env.assets || [])[0];
        if (asset) {
          setLast({ ...asset, followUp, model: env.model || asset.model });
          setText("");
        } else {
          setErr("el motor no devolvió una imagen");
        }
      }
    } catch (e) {
      const p = e?.payload;
      setErr(typeof p === "string" ? p
        : p?.reason || p?.detail || e?.message || "no se pudo generar");
    }
    setBusy(false);
  }, [text, brandId, last, useContext, ctx.text]);

  if (!open) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <button className="qg-open" onClick={() => setOpen(true)}
          title="Generar una imagen desde cualquier pantalla (⌘K)">
          Generar ⌘K
        </button>
      </>
    );
  }

  const followUpNow = looksLikeFollowUp(text, !!last);
  const status = statusText({ busy, followUp: followUpNow, error: err });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button className="qg-open" onClick={() => setOpen(false)}>Generar ⌘K</button>
      <div className="qg-scrim" onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}>
        <div className="qg" role="dialog" aria-label="Generar una imagen">
          <div className="qg-bar">
            <input ref={inputRef} className="qg-in" value={text}
              placeholder={last ? "Cambiá algo: «más ancha», «en lino», «de espalda»…"
                : "Describí la prenda…"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) run(); }} />
            <button className="qg-go" onClick={run}
              disabled={busy || !text.trim() || !brandId}>
              {followUpNow ? "Cambiar" : "Generar"}
            </button>
          </div>

          <div className="qg-body">
            {!brandId && (
              <p className="qg-err">
                No hay una marca activa, así que no hay dónde guardar la imagen.
              </p>
            )}

            {/* The help she cannot get from a chat window — and can switch off. */}
            {ctx.text && (
              <div className="qg-ctx">
                <span>Atelier suma:</span>
                {ctx.used.map((u) => (
                  <span key={u.key} className={`qg-chip${useContext ? " on" : ""}`}>
                    {u.label}
                  </span>
                ))}
                <button className="qg-toggle"
                  onClick={() => setUseContext((v) => !v)}>
                  {useContext ? "usar sólo mi texto" : "volver a sumar el contexto"}
                </button>
              </div>
            )}

            {status && <p className={err ? "qg-err" : "qg-hint"}>{status}</p>}

            {last && (
              <div className="qg-out">
                <div className="shot">
                  <AssetImage href={last.url} alt="" />
                </div>
                <div className="qg-meta">
                  <div>
                    {last.followUp
                      ? <>Cambio sobre la imagen anterior — <b>la anterior sigue guardada</b>.</>
                      : <>Guardada en la biblioteca de la marca.</>}
                  </div>
                  <div>
                    Modelo <b>{last.model || "sin registrar"}</b>
                    {last.intent === "exploratory" ? " · exploración" : ""}
                  </div>
                  <div className="qg-acts">
                    <button className="qg-act"
                      onClick={() => { setOpen(false); onNavigate?.("canvas"); }}>
                      Abrir en el Lienzo
                    </button>
                    <button className="qg-act"
                      onClick={() => { setLast(null); setText(""); inputRef.current?.focus(); }}>
                      Empezar de nuevo
                    </button>
                  </div>
                  <div style={{ marginTop: 8, color: "var(--ink-3)" }}>
                    {/* The escalation, named rather than hidden: everything the
                        fast box does not offer lives one click away. */}
                    Referencias, bloqueos y edición por región están en el Lienzo.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
