"use client";
// The engine is unreachable — say so once, loudly, with the way out.
//
// The old behaviour was the worst of both worlds: the sidebar, the chrome and
// most screens rendered normally while nothing behind them worked, so the app
// looked healthy until somebody clicked. In a demo that failure arrives at the
// worst possible moment and looks like a broken product rather than a stopped
// process.
//
// This is deliberately NOT a toast. A toast is dismissible and transient, and
// the condition it describes is neither.
import { useEffect, useRef, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import { isPresenting } from "@/lib/presentation";

const CMD = "cd work/atelier/atelier-engine && "
          + ".venv/bin/uvicorn api.app.main:app --port 8000 --reload";

// Backoff for the automatic retry, in seconds. Starts fast because the common
// case is a process that is already coming back up — a reload, a migration, a
// laptop waking — and settles slowly so an engine that is genuinely off does
// not spend the afternoon being polled.
const BACKOFF = [2, 3, 5, 8, 13, 20];

export default function EngineDown() {
  const engine = useEngine();
  const [retrying, setRetrying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const presenting = isPresenting();
  const down = engine.status === "demo" && engine.reason === "unreachable";

  // RECOVERY MUST NOT DEPEND ON SOMEONE NOTICING A BUTTON (2026-07-25). The
  // banner was honest and the way back was a click nobody in a meeting is
  // looking for — so a three-second blip read as a broken product for as long
  // as it took a presenter to see the notice. Retrying on a backoff means the
  // usual causes (a reload, a restart, a woken laptop) heal themselves before
  // anyone has finished the sentence they were saying.
  const refresh = useRef(engine.refresh);
  refresh.current = engine.refresh;
  useEffect(() => {
    if (!down) { setAttempts(0); return; }
    const wait = BACKOFF[Math.min(attempts, BACKOFF.length - 1)] * 1000;
    const t = setTimeout(async () => {
      setRetrying(true);
      try { await refresh.current(); } finally {
        setRetrying(false);
        setAttempts((n) => n + 1);
      }
    }, wait);
    return () => clearTimeout(t);
  }, [down, attempts]);

  // "Ahora" has to mean now: reconnect on this click, and reset the backoff so
  // the automatic loop starts over rather than continuing from a long wait.
  async function retryNow() {
    setRetrying(true);
    try { await refresh.current(); } finally { setRetrying(false); setAttempts(0); }
  }

  // `no-run` is a different, milder state: the engine answers, it just has no
  // completed run for this brand. That is not a failure and must not be
  // dressed as one.
  if (!down) return null;

  return (
    <div className="eng-down" role="status">
      <b>El motor no responde.</b>
      <p>
        Todo lo que ves ahora es de muestra. Ninguna colección, plan, aprobación
        ni resultado de esta pantalla viene del motor, y nada que hagas se va a
        guardar — por eso lo decimos acá arriba y no cuando falle un click.
      </p>
      {/* The shell command is an instruction for whoever runs this, and reads
          to a client as the product being held together by hand. The MESSAGE
          above stays in presentation mode — per lib/presentation.js, the
          honesty labels are the argument, not a blemish to hide before guests
          arrive. What gets hidden is only what a guest cannot act on. */}
      {!presenting && <p>Para levantarlo: <code>{CMD}</code></p>}
      <p className="eng-down-auto">
        {retrying ? "Reintentando…"
          : `Se reintenta solo${attempts ? ` · ${attempts} ${attempts === 1 ? "intento" : "intentos"}` : ""}.`}
      </p>
      <button onClick={retryNow} disabled={retrying}>
        Reintentar ahora
      </button>
    </div>
  );
}
