"use client";

// Ask the brand's own data, in words — §23's A23.2 on screen.
//
// ⚠ WHAT MAKES THIS WORTH HAVING IS THE REFUSALS, SO THEY GET THE DESIGN.
// A chat box that answers everything plausibly is already free in another tab.
// This one answers only from rows and SHOWS which rows, and when it will not
// answer it says which kind of "no" it is:
//
//   · TODAVÍA NO SÉ  — not yet, and here is what I can be asked
//   · NO CONTESTO ESO — not ever; verdicts about your product come from the
//     gates against stored evidence, never from a sentence composed here
//
// Collapsing those two into one apology would promise a future where the
// product ranks your suppliers in prose. They are styled differently on
// purpose.

import { useEffect, useRef, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import { STATE_STYLE, ask, supported } from "@/lib/ask.mjs";

const CSS = `
.ab-open{font-family:var(--d);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  padding:7px 13px;border:1px solid var(--hair-2);border-radius:999px;
  background:var(--surface);color:var(--ink-2)}
.ab-open:hover{border-color:var(--action);color:var(--action)}
.ab-scrim{position:fixed;inset:0;background:rgba(26,24,21,.32);z-index:70;
  display:flex;align-items:flex-start;justify-content:center;padding-top:9vh}
.ab{width:min(720px,92vw);background:var(--surface);border:1px solid var(--hair);
  border-radius:14px;box-shadow:0 24px 70px rgba(26,24,21,.22);overflow:hidden}
.ab-bar{display:flex;gap:10px;padding:15px;border-bottom:1px solid var(--hair)}
.ab-in{flex:1;font:inherit;font-size:15px;border:0;outline:0;background:transparent;color:var(--ink)}
.ab-go{font:inherit;font-size:13px;font-weight:600;padding:8px 17px;border-radius:9px;
  background:var(--action);color:#fff}
.ab-go:disabled{opacity:.45}
.ab-body{padding:15px 17px 19px;max-height:56vh;overflow:auto}
.ab-tag{display:inline-flex;align-items:center;gap:7px;font-family:var(--d);font-size:10px;
  letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:9px}
.ab-tag .d{width:7px;height:7px;border-radius:50%}
.ab-sum{font-size:14px;line-height:1.55;margin:0 0 10px;color:var(--ink)}
.ab-lim{font-size:12.5px;line-height:1.55;color:var(--ink-2);background:var(--ochre-wash);
  border-left:2px solid var(--warning);padding:9px 11px;margin:10px 0;border-radius:0 8px 8px 0}
.ab-cite{font-family:var(--d);font-size:11px;color:var(--ink-3);margin-top:10px}
.ab-cite code{background:var(--paper-2);padding:1px 5px;border-radius:3px;color:var(--observed-ink)}
.ab-rows{margin-top:11px;border-top:1px solid var(--hair)}
.ab-row{font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--hair);
  display:flex;gap:12px;flex-wrap:wrap;color:var(--ink-2)}
.ab-row b{font-weight:600;color:var(--ink)}
.ab-sug{margin-top:13px}
.ab-sug h4{font-family:var(--d);font-size:10px;letter-spacing:.12em;color:var(--ink-3);
  margin:0 0 7px;text-transform:uppercase}
.ab-sug button{display:block;font:inherit;font-size:12.5px;text-align:left;
  padding:4px 0;color:var(--action);font-weight:500}
.ab-hint{font-size:12.5px;color:var(--ink-3)}
`;

export default function AskBox() {
  const engine = useEngine();
  const brandId = engine.brandId || null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [examples, setExamples] = useState([]);
  const inputRef = useRef(null);

  // ⌘/ opens it — next to ⌘K for generation, because asking and making are
  // the two things she does from anywhere.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    if (open && brandId && !examples.length) {
      supported(brandId).then(setExamples).catch(() => {});
    }
  }, [open, brandId, examples.length]);

  async function run(q) {
    const question = (q ?? text).trim();
    if (!question || !brandId) return;
    setBusy(true);
    setAnswer(null);
    const a = await ask(brandId, question);
    setAnswer(a);
    setBusy(false);
  }

  if (!open) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <button className="ab-open" onClick={() => setOpen(true)}
          title="Preguntarle a tus datos (⌘/)">Preguntar ⌘/</button>
      </>
    );
  }

  const style = answer ? (STATE_STYLE[answer.status] || STATE_STYLE.unsupported) : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button className="ab-open" onClick={() => setOpen(false)}>Preguntar ⌘/</button>
      <div className="ab-scrim" onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}>
        <div className="ab" role="dialog" aria-label="Preguntarle a tus datos">
          {/* ⚠ A real form, not an onKeyDown. Enter-to-submit is native here,
              which also survives IME composition and is what a screen reader
              expects — and I could not tell from automation whether the
              keydown version was firing, which is reason enough not to keep
              guessing at it. */}
          <form className="ab-bar" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <input ref={inputRef} className="ab-in" value={text}
              placeholder="¿Qué estilos no tienen cotización?"
              onChange={(e) => setText(e.target.value)} />
            <button className="ab-go" type="submit"
              disabled={busy || !text.trim() || !brandId}>
              {busy ? "Leyendo…" : "Preguntar"}
            </button>
          </form>

          <div className="ab-body">
            {!brandId && (
              <p className="ab-hint">No hay una marca activa, así que no hay filas que leer.</p>
            )}

            {answer && (
              <>
                <span className="ab-tag">
                  <span className="d" style={{ background: style.tone }} />
                  {style.label}
                </span>
                <p className="ab-sum">{answer.summary}</p>

                {/* ⚠ Shown, not hidden behind a toggle: an answer that cannot
                    be checked is the thing this product refuses to be. */}
                {!!answer.read_tables?.length && (
                  <p className="ab-cite">
                    Leí {answer.citations?.length || 0} fila(s) de{" "}
                    {answer.read_tables.map((t) => <code key={t}>{t}</code>)
                      .reduce((a, b) => [a, " ", b])}
                  </p>
                )}

                {answer.limitation && (
                  <p className="ab-lim">{answer.limitation}</p>
                )}

                {!!answer.rows?.length && (
                  <div className="ab-rows">
                    {answer.rows.slice(0, 12).map((row, i) => (
                      <div className="ab-row" key={i}>
                        {Object.entries(row)
                          .filter(([k]) => !k.endsWith("_id"))
                          .slice(0, 5)
                          .map(([k, v]) => (
                            <span key={k}><b>{k}</b> {String(v ?? "—")}</span>
                          ))}
                      </div>
                    ))}
                  </div>
                )}

                {!!answer.supported?.length && (
                  <div className="ab-sug">
                    <h4>Esto sí puedo contestarlo</h4>
                    {answer.supported.map((s) => (
                      <button key={s.intent}
                        onClick={() => { setText(s.example); run(s.example); }}>
                        {s.example}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {!answer && !!examples.length && (
              <div className="ab-sug">
                <h4>Preguntas que tus filas pueden contestar</h4>
                {examples.map((s) => (
                  <button key={s.intent}
                    onClick={() => { setText(s.example); run(s.example); }}>
                    {s.example}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
