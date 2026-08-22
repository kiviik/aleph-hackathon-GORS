"use client";
// Send board cards into the collection's DIRECTION, server-side (ROADMAP §3b).
//
// The Inspiration Room is a scratch canvas and stays one: pan, zoom, drop forty
// images, throw most of them away. That is the right shape for the activity, and
// it is why its boards live in `localStorage` — a working surface nobody else
// needs to read.
//
// What was missing is the OTHER end. Once a designer decides an image is part of
// the collection's direction, it has to leave the browser: the Dirección screen,
// their colleagues and any generation all need it, and until now the only exit
// was `atelier-design-brief` — a localStorage handoff into the Studio that
// recorded nothing about where the image came from.
//
// THE PART THAT IS NOT A CONVENIENCE: purpose and rights are REQUIRED per card,
// with no defaults offered. The engine refuses an untagged reference twice over
// (payload pattern + CHECK constraint in 0046), and a default here would be a
// guess about what the designer meant and a claim about provenance nobody made.
// A card that has not been tagged is simply not filed, and the panel says how
// many were skipped rather than quietly filing them as "mood / unknown".
import { useMemo, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useBrandId } from "@/components/EngineProvider";
import * as dir from "@/lib/direction";

// The engine's vocabularies, wording from `lib/direction.mjs`. Read from the
// direction payload at runtime where possible; these are the fallback labels.
const PURPOSES = ["colour", "silhouette", "styling", "mood", "detail", "fabric"];
const RIGHTS = ["own_archive", "licensed", "supplier_provided",
                "public_reference", "unknown"];

const COLOUR_ROLES = ["hero", "support", "neutral", "accent"];

export default function FileIntoDirection({ cards = [], boardName, onDone }) {
  const brandId = useBrandId();
  const { activeId } = useCollection();
  const [tags, setTags] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Only cards that could BECOME something server-side. A note has no home in
  // the direction's schema — the version's `mood_note` is one field, not a pile —
  // so notes are excluded here rather than silently concatenated.
  const fileable = useMemo(() => cards.filter(
    (c) => ((c.kind === "image" || c.kind === "reference") && (c.src || c.url))
      || (c.kind === "swatch" && c.color)), [cards]);

  const noteCount = cards.filter((c) => c.kind === "note" && c.text).length;

  const set = (id, patch) => setTags((t) => ({ ...t, [id]: { ...t[id], ...patch } }));

  const ready = (card) => {
    const t = tags[card.id] || {};
    if (card.kind === "swatch") return Boolean(t.role);
    return Boolean(t.purpose && t.rights);
  };
  const readyCount = fileable.filter(ready).length;

  async function file() {
    setBusy(true);
    setError(null);
    try {
      const payload = await dir.getDirection(brandId, activeId);
      if (!payload?.exists) {
        setError("Esta colección todavía no tiene una dirección creada — abrila "
                 + "primero en Dirección.");
        return;
      }
      const version = payload.working_version;
      if (!version?.editable) {
        // The approved version is frozen on purpose. Saying so beats a 409.
        setError("La dirección vigente está aprobada y congelada. Abrí la versión "
                 + "siguiente en Dirección para poder agregar referencias.");
        return;
      }

      let filed = 0;
      for (const card of fileable) {
        const t = tags[card.id] || {};
        if (!ready(card)) continue;

        if (card.kind === "swatch") {
          await dir.addColour(brandId, version.id, {
            name: card.label || card.color,
            hex_value: String(card.color).toLowerCase(),
            role: t.role,
          });
        } else {
          const body = {
            purpose: t.purpose,
            rights: t.rights,
            title: card.title || null,
            // Where the designer said it came from, carried through rather than
            // re-derived. An empty source stays empty instead of becoming
            // "Inspiration Room", which would be provenance we invented.
            source: card.source || null,
            note: card.text || null,
          };
          if (card.src && String(card.src).startsWith("data:")) {
            body.image_data_uri = card.src;
          } else {
            body.image_url = card.url || card.src;
          }
          await dir.addReference(brandId, version.id, body);
        }
        filed += 1;
      }

      setResult({ filed, skipped: fileable.length - filed, notes: noteCount });
      onDone?.(filed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!brandId || !activeId) {
    return (
      <div className="dir-note">
        Para archivar una referencia en la dirección hace falta una colección
        elegida y conexión con el motor. El tablero sigue funcionando igual — vive
        en este navegador.
      </div>
    );
  }

  if (fileable.length === 0) {
    return (
      <div className="dir-note">
        Este tablero no tiene imágenes ni colores para archivar.
        {noteCount > 0 && (
          <> Las {noteCount} nota(s) no viajan: la dirección tiene un solo campo
            de clima, no una pila de notas.</>
        )}
      </div>
    );
  }

  return (
    <div className="fid">
      <p className="dir-meta">
        Archivar en la dirección de la colección deja estas referencias del lado
        del motor: las ve el equipo y las puede usar una generación. Cada una tiene
        que decir <b>para qué es</b> y <b>de dónde viene</b> — sin eso el motor la
        rechaza, y con razón: una imagen sin etiqueta no le enseña nada específico.
      </p>

      <ul className="fid-list">
        {fileable.map((card) => (
          <li key={card.id} className={ready(card) ? "ready" : ""}>
            {card.kind === "swatch" ? (
              <span className="dir-chip" style={{ background: card.color }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.src || card.url} alt={card.title || "referencia"} />
            )}
            <div>
              <b>{card.title || card.label || card.color || "sin título"}</b>
              {card.source && <span className="dir-meta">{card.source}</span>}
            </div>

            {card.kind === "swatch" ? (
              <select value={tags[card.id]?.role || ""}
                      onChange={(e) => set(card.id, { role: e.target.value })}>
                <option value="">¿Qué rol? (obligatorio)</option>
                {COLOUR_ROLES.map((r) => (
                  <option key={r} value={r}>{dir.COLOUR_ROLE_LABEL[r]}</option>
                ))}
              </select>
            ) : (
              <>
                <select value={tags[card.id]?.purpose || ""}
                        onChange={(e) => set(card.id, { purpose: e.target.value })}>
                  <option value="">¿Para qué es?</option>
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>{dir.PURPOSE_LABEL[p] || p}</option>
                  ))}
                </select>
                <select value={tags[card.id]?.rights || ""}
                        onChange={(e) => set(card.id, { rights: e.target.value })}>
                  <option value="">¿De dónde viene?</option>
                  {RIGHTS.map((r) => (
                    <option key={r} value={r}>{dir.RIGHTS_LABEL[r] || r}</option>
                  ))}
                </select>
              </>
            )}
          </li>
        ))}
      </ul>

      {error && <div className="dir-warn">{error}</div>}

      {result && (
        <div className="dir-note">
          {result.filed} archivada(s) en la dirección.
          {/* Counted out loud. Silently dropping the untagged ones would read as
              "everything was filed". */}
          {result.skipped > 0 && (
            <> {result.skipped} quedaron sin archivar porque les falta una
              etiqueta.</>
          )}
          {result.notes > 0 && <> Las {result.notes} nota(s) no viajan.</>}
        </div>
      )}

      <button className="cc-act" disabled={busy || readyCount === 0} onClick={file}>
        {busy ? "Archivando…"
          : `Archivar ${readyCount} de ${fileable.length} en la dirección →`}
      </button>
    </div>
  );
}
