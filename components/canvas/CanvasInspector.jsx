"use client";
// The rail: what the selected reference is FOR, and what the whole board
// refuses to let the model change.
//
// ⚠ ROLES AND LOCKS ARE THE ENGINE'S WORDS, NOT THIS SCREEN'S. Both lists come
// from `lib/canvas.mjs`, which mirrors `api/app/generation_intent.py` and is
// held to it by a test that reads the Python. This matters more than it looks:
// `_validate_vocab` RAISES on an unknown role or lock, so a friendlier synonym
// invented here would not be quietly ignored — it would fail the designer's
// generation with a 422 naming a word she never typed.
//
// ⚠ AND THEY ARE PROMPT GUIDANCE, WHICH THIS RAIL SAYS OUT LOUD. The engine's
// compiler labels `locks`, `references.roles` and `references.strength` as
// prompt_guidance on every configured model — they become sentences in the
// prompt, and the model may or may not honour them. A rail that presented them
// as switches with no such note would be exactly the defect the typed contract
// was built to end: a professional-looking control that is really prose.
import { useState } from "react";

import {
  LOCKS, REFERENCE_ROLES, lockLabel, roleLabel, strengthWord,
} from "@/lib/canvas.mjs";
import { GUIDANCE_LABEL } from "@/lib/generationIntent.mjs";

export default function CanvasInspector({
  card, board, library, brandId, busy,
  onRole, onStrength, onToggleLock, onExclusions, onAddFromLibrary,
  onExportPng, onExportJson,
}) {
  const [draft, setDraft] = useState("");
  const exclusions = board.exclusions || [];

  const addExclusion = () => {
    const value = draft.trim();
    if (!value || exclusions.includes(value)) { setDraft(""); return; }
    onExclusions([...exclusions, value]);
    setDraft("");
  };

  return (
    <aside className="lz-rail">
      {/* ---- the selected reference ---------------------------------- */}
      <section className="lz-sec">
        <p className="lz-k">Referencia seleccionada</p>
        {!card || card.kind !== "image" ? (
          <p className="lz-p quiet">
            Ninguna. Elegí una imagen del lienzo para decir para qué sirve.
          </p>
        ) : (
          <>
            <p className="lz-p">
              {card.name || "sin nombre"}
              {card.natural ? ` · ${card.natural.width}×${card.natural.height} px`
                            : " · tamaño real todavía no leído"}
            </p>
            <div className="lz-chips">
              {REFERENCE_ROLES.map((r) => (
                <button key={r} type="button"
                        className={`lz-chip${card.role === r ? " on observed" : ""}`}
                        onClick={() => onRole(card.id, card.role === r ? null : r)}>
                  {roleLabel(r)}
                </button>
              ))}
            </div>
            <p className="lz-p quiet" style={{ marginTop: 7 }}>
              {card.role
                ? `Se envía como «use only for ${card.role}» — ${GUIDANCE_LABEL}.`
                : "Sin rol: la referencia viaja sin instrucción y el motor aplica "
                  + "la suya. No inventamos «prenda» por vos."}
            </p>
            {card.role && (
              <>
                <input type="range" className="lz-range" min="0" max="1" step="0.05"
                       value={card.strength}
                       onChange={(e) => onStrength(card.id, Number(e.target.value))} />
                <p className="lz-p quiet">
                  Peso <b>{strengthWord(card.strength)}</b> — el compilador
                  agrupa en tres tramos y escribe esa palabra en el prompt.
                  Ningún proveedor configurado tiene un peso nativo.
                </p>
              </>
            )}
          </>
        )}
      </section>

      {/* ---- locks ---------------------------------------------------- */}
      <section className="lz-sec">
        <p className="lz-k">Bloqueos del tablero</p>
        <div className="lz-chips">
          {LOCKS.map((l) => (
            <button key={l} type="button"
                    className={`lz-chip${(board.locks || []).includes(l) ? " on" : ""}`}
                    onClick={() => onToggleLock(l)}>
              {lockLabel(l)}
            </button>
          ))}
        </div>
        <p className="lz-p quiet" style={{ marginTop: 7 }}>
          Viajan como <b>locks</b> en el intent. El motor los compila bajo
          «Keep unchanged» y los marca como {GUIDANCE_LABEL}: son una
          instrucción al modelo, no un candado del proveedor.
        </p>
      </section>

      {/* ---- exclusions ----------------------------------------------- */}
      <section className="lz-sec">
        <p className="lz-k">Exclusiones</p>
        <input className="lz-in" value={draft} placeholder="qué no debe aparecer"
               onChange={(e) => setDraft(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExclusion(); } }} />
        {exclusions.length > 0 && (
          <div className="lz-excl">
            {exclusions.map((e) => (
              <span className="lz-x" key={e}>
                {e}
                <button type="button" aria-label={`quitar ${e}`}
                        onClick={() => onExclusions(exclusions.filter((v) => v !== e))}>×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ---- the brand's library -------------------------------------- */}
      <section className="lz-sec">
        <p className="lz-k">Biblioteca de la marca</p>
        {/* THREE STATES, KEPT APART. undefined = todavía no preguntamos;
            null = no se pudo preguntar; [] = preguntamos y no hay nada. */}
        {!brandId ? (
          <p className="lz-p quiet">
            Sin marca resuelta: no hay biblioteca que pedir.
          </p>
        ) : library === undefined ? (
          <p className="lz-p quiet">Cargando…</p>
        ) : library === null ? (
          <p className="lz-p quiet">
            El motor no respondió la biblioteca. No es «está vacía»: no lo sabemos.
          </p>
        ) : library.length === 0 ? (
          <p className="lz-p quiet">
            Esta marca todavía no tiene activos en el ledger.
          </p>
        ) : (
          <div className="lz-lib">
            {library.slice(0, 24).map((a) => (
              <button key={a.id} type="button" title={a.prompt || a.operation || ""}
                      onClick={() => onAddFromLibrary(a)}>
                <img src={a.href} alt="" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---- export ---------------------------------------------------- */}
      <section className="lz-sec">
        <p className="lz-k">Exportar</p>
        <div className="lz-chips">
          <button type="button" className="lz-btn" disabled={!card || card.kind !== "image" || busy}
                  onClick={() => onExportPng(card)}>
            PNG de la tarjeta
          </button>
          <button type="button" className="lz-btn" onClick={onExportJson}>
            JSON del tablero
          </button>
        </div>
        <p className="lz-p quiet" style={{ marginTop: 7 }}>
          El PNG sale a resolución completa, tal como está guardado — no se
          reescala a lo que se ve en pantalla. El JSON lleva posiciones, roles,
          bloqueos, notas y linaje; las imágenes van nombradas por su id en el
          ledger, no incrustadas.
        </p>
      </section>
    </aside>
  );
}
