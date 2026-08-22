"use client";
// Two cards, side by side, at the size the screen can give them.
//
// The comparison a designer actually makes is "what did this edit change",
// and the honest version of it names the RELATIONSHIP as well as the images:
// when one card is the other's child, the panel says so, because "before and
// after" and "two unrelated attempts" are different questions and the
// difference is invisible once both are just pictures on a dark background.
//
// Nothing is replaced, ever. Comparing is reading; the board keeps both.
export default function CanvasCompare({ cards, onClose }) {
  const [a, b] = cards;
  const related = a.parentId === b.id ? "izquierda deriva de la derecha"
    : b.parentId === a.id ? "derecha deriva de la izquierda"
    : a.parentId && a.parentId === b.parentId ? "las dos derivan de la misma tarjeta"
    : null;

  return (
    <div className="lz-compare">
      <div className="lz-compare-h">
        <b>Comparar</b>
        <span className="lz-compare-m">
          {related || "sin linaje en común — son dos tarjetas independientes"}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="lz-btn" onClick={onClose}>Cerrar</button>
      </div>
      <div className="lz-compare-g">
        {[a, b].map((c) => (
          <div className="lz-compare-c" key={c.id}>
            {c.src
              ? <img src={c.src} alt={c.name || ""} />
              : <div className="lz-gone">sin píxeles en esta sesión</div>}
            <div className="lz-compare-m">
              {c.name || "sin nombre"}
              {c.natural ? ` · ${c.natural.width}×${c.natural.height} px` : ""}
              {c.origin === "generated" ? " · generado" : ""}
              {!c.assetId ? " · solo en este navegador" : ""}
            </div>
            {c.promptSent && (
              <div className="lz-compare-m" title="el prompt compuesto por el motor">
                {c.promptSent.slice(0, 220)}{c.promptSent.length > 220 ? "…" : ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
