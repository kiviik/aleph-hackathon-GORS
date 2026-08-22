"use client";
// One card on the board: an image, or a note anchored to a point.
//
// It renders and it reports; it does not decide. Every pointer gesture is
// handled once, on the surface, by Canvas.jsx — a card that installed its own
// drag handler would be a second implementation of the board's transform, and
// two implementations of one transform is how a click lands in one place and
// the drag that follows it in another.
//
// WHAT THE BADGES SAY, AND WHY THEY ARE NOT DECORATION. A card carries at most
// three facts, and each of them is one the designer would otherwise have to
// remember:
//   · «generado» — these pixels came from a model. Never "foto", never
//     "prueba": the product rule is that a generation is never presented as a
//     photograph or a real try-on, and this badge is where that rule is kept
//     on the canvas.
//   · «solo en este navegador» — dropped bytes with no row in the brand's
//     ledger. It cannot travel as a reference, because `references` takes an
//     asset_id or a url and a `blob:` address is neither.
//   · the ROLE — what this reference is for. Absent when she has not said,
//     because an untagged reference is sent untagged.
import { ROLE_LABELS, strengthWord } from "@/lib/canvas.mjs";

export default function CanvasCard({ card, selected, onImageLoad, onNoteChange }) {
  const style = {
    left: card.x, top: card.y, width: card.w, height: card.h,
    zIndex: (card.z || 0) + 1,
  };

  if (card.kind === "note") {
    return (
      <div className={`lz-card note${selected ? " sel" : ""}`} style={style}
           data-card={card.id}>
        <textarea
          className="lz-note-t" value={card.text} data-nodrag="1"
          placeholder="nota…"
          onChange={(e) => onNoteChange?.(card.id, e.target.value)} />
        {selected && <span className="lz-grip" data-resize={card.id} />}
      </div>
    );
  }

  const word = card.role ? strengthWord(card.strength) : null;

  return (
    <div className={`lz-card${selected ? " sel" : ""}`} style={style}
         data-card={card.id}>
      {card.src ? (
        <img src={card.src} alt={card.name || "referencia"} draggable={false}
             onLoad={(e) => onImageLoad?.(card.id, {
               width: e.currentTarget.naturalWidth,
               height: e.currentTarget.naturalHeight,
             })} />
      ) : (
        // ⚠ NOT A BROKEN CARD — a labelled absence. The board keeps geometry
        // and roles across a reload; the bytes of a dropped file do not fit in
        // localStorage and were never sent anywhere. Saying so beats a grey
        // rectangle that reads as a bug.
        <div className="lz-gone">
          la imagen quedó en la sesión anterior — el lienzo guarda posición,
          rol y notas, no los píxeles. Volvé a soltarla.
        </div>
      )}
      <div className="lz-tags">
        {card.origin === "generated" && <span className="lz-tag made">generado</span>}
        {!card.assetId && card.local && (
          <span className="lz-tag local">solo en este navegador</span>
        )}
        {card.role && (
          <span className="lz-tag role">
            {ROLE_LABELS[card.role] || card.role}{word ? ` · ${word}` : ""}
          </span>
        )}
      </div>
      {selected && <span className="lz-grip" data-resize={card.id} />}
    </div>
  );
}
