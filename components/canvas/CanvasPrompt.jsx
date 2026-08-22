"use client";
// The prompt bar: the one place on the canvas where the designer's words
// become a request.
//
// ⚠ WHAT SHE TYPES IS `authored_prompt`, VERBATIM AND ALONE. Nothing in this
// component concatenates the board's locks, the roles, the collection or a
// house style into that box. Those travel as STRUCTURE — that is the entire
// reason `generation_intent` replaced the loose prompt string — and the engine
// composes, keeping the four voices apart under their own headings. A screen
// that "helpfully" prepended "fashion editorial photograph of" would be
// signing her name to the app's prose, and the receipt would then report it
// back to her as hers.
//
// ⚠ AND A REFUSAL IS AN ANSWER. When the engine declines — the model has no
// alpha mask, the operation is unknown, the intent asks for something no
// configured model can honour — its own sentence is rendered here VERBATIM, in
// mono, under a heading that says who wrote it. It is never softened into
// "algo salió mal", and it is never retried as a whole-image generation: on a
// regional edit that retry is the exact failure the mask exists to prevent.
import GenerationReceipt from "@/components/GenerationReceipt";
import { TIERS } from "@/lib/generationIntent.mjs";

export default function CanvasPrompt({
  authored, onAuthored, mode, tier, onTier, onSend, busy,
  refusal, error, lastSent, skipped = [], overflow = [], disabledReason,
}) {
  const editing = mode.kind === "edit";
  const ready = !!authored.trim() && !busy && !disabledReason
    && (!editing || mode.ready);

  return (
    <div className="lz-prompt">
      <div className="lz-mode">
        {editing ? (
          <>
            <span className="pill">edición regional</span>
            <span>
              sobre <b>{mode.card?.name || "la tarjeta seleccionada"}</b>
              {mode.coverage != null && (
                <> · la máscara abre el <b>{Math.round(mode.coverage * 100)} %</b> de
                   la imagen</>
              )}
              {mode.pixels && (
                <> · {mode.pixels.width}×{mode.pixels.height} px de {mode.natural?.width}×{mode.natural?.height}</>
              )}
            </span>
          </>
        ) : (
          <span>
            <b>{mode.referenceCount}</b> referencia{mode.referenceCount === 1 ? "" : "s"} del
            tablero viaja{mode.referenceCount === 1 ? "" : "n"} con el pedido
            {mode.lockCount > 0 && <> · <b>{mode.lockCount}</b> bloqueo{mode.lockCount === 1 ? "" : "s"}</>}
          </span>
        )}
      </div>

      {skipped.length > 0 && (
        <p className="lz-note">
          {skipped.length} imagen{skipped.length === 1 ? "" : "es"} del lienzo
          no viaja{skipped.length === 1 ? "" : "n"}: sus píxeles solo existen en
          este navegador y el motor no puede leerlos. Subilas a la biblioteca
          para que cuenten como referencia.
        </p>
      )}
      {overflow.length > 0 && (
        <p className="lz-note">
          {overflow.length} referencia{overflow.length === 1 ? "" : "s"} por
          encima del máximo del motor (14) queda{overflow.length === 1 ? "" : "n"} fuera
          de este pedido. Quitá o alejá las que no correspondan en vez de
          confiar en el recorte.
        </p>
      )}

      <div className="lz-row">
        <textarea
          className="lz-ta" value={authored} disabled={!!disabledReason}
          placeholder={editing
            ? "qué cambia en la región marcada — «hacé la manga más ancha»"
            : "qué querés ver — tus palabras van tal cual, primero y sin agregados"}
          onChange={(e) => onAuthored(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) onSend();
          }} />
        <div className="lz-side">
          <select className="lz-sel" value={tier} onChange={(e) => onTier(e.target.value)}
                  disabled={!!disabledReason}>
            {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button type="button" className="lz-btn primary" disabled={!ready}
                  onClick={onSend}>
            {busy ? "Enviando…" : editing ? "Editar la región" : "Generar"}
          </button>
          <span className="lz-note">⌘⏎</span>
        </div>
      </div>

      {disabledReason && <p className="lz-note">{disabledReason}</p>}
      {editing && !mode.ready && mode.blockedReason && (
        <p className="lz-note">{mode.blockedReason}</p>
      )}

      {refusal && (
        <div className="lz-refuse">
          <p className="lz-k">El motor rechazó el pedido — su respuesta, textual</p>
          <p className="lz-verbatim">{refusal}</p>
          <p className="lz-note" style={{ marginTop: 6 }}>
            No se reintentó como generación de imagen completa. Hacerlo
            reescribiría todo lo que la máscara protegía, y nada en el
            resultado lo diría.
          </p>
        </div>
      )}
      {error && !refusal && <div className="lz-err">{error}</div>}

      {lastSent && <GenerationReceipt sent={lastSent} />}
    </div>
  );
}
