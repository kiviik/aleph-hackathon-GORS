"use client";
// Dirección de la colección — what a designer picks, and what generation is
// conditioned on (engine migration 0046, ROADMAP §3b).
//
// The owner's requirement: *for every collection the designers can pick styles,
// colours, upload inspiration, prices, silhouettes, fabrics and everything, so
// the generative AI can generate the collection based on that as well.*
//
// THE RULE THIS SCREEN HOLDS: a pick is a REFERENCE to a record. Fabrics come
// from the brand's OWN material sheet (`brand_materials`, imported through the
// Import Centre) and never from a text field, which is why each one arrives
// carrying its supplier, MOQ, price and lead time — and why this screen can say
// "you cannot buy this for this range" while the designer is still choosing
// rather than in production.
//
// Like CollectionBrief, and for the same reason: NO local draft. A direction is
// one of the objects §12 says may never be authoritative in a browser. Every
// affordance is derived from the SERVER's status; the screen never decides that
// an approval happened, it asks. And it computes nothing the engine answered —
// sourceability, reconciliation and rule violations all arrive decided.
//
// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-13 — THE WORKING WALL (owner design critique).
//
//   *"Creative Direction looks like CRUD administration. The screen is asking a
//    designer to build a visual direction through text inputs, native
//    dropdowns, a tiny HTML colour picker, percentage number controls,
//    rectangular database rows and an 'Add color' button. That is database
//    administration, not creative direction."*
//
// This screen is EARLY and REVERSIBLE, so under the governing rule — the more
// consequential and irreversible the decision, the more exact and operational
// the interface — it is allowed to be spatial and generous. What changed:
//
//   · the palette leads with a PROPORTIONAL strip: a colour declared at 40 %
//     occupies 40 % of the wall. Hierarchy is horizontal, not a stack of rows.
//   · every add-form moved into a drawer. Five native controls in a row was the
//     interface telling a designer they were filling in a table.
//   · no `<select>` and no number stepper survives on this screen. Both are
//     browser chrome, and browser chrome is what made this read unfinished.
//   · fabrics are swatch cards, and a fabric that cannot be bought states the
//     conflict as two measured bars plus the buttons that could resolve it.
//
// ⚠ WHAT IT DELIBERATELY DOES NOT DO, because the engine has no record for it:
// drag-to-reorder and drag-to-resize a band. `direction_colours` has no
// ordering column (the engine sorts by `created_at`) and the item endpoints are
// POST/DELETE only — there is no PATCH. A handle that appeared to move a colour
// and then silently did not persist would be worse than no handle. Same for
// "which styles and materials use this colour": nothing joins a direction
// colour to a fabric or a plan row, so the screen says it cannot answer instead
// of counting something plausible.
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useBrandId } from "@/components/EngineProvider";
import { useIdentity } from "@/components/IdentityProvider";
import * as dir from "@/lib/direction";

const STATUS_LABEL = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobada",
  superseded: "Reemplazada",
  revising: "Aprobada · con una revisión en curso",
  empty: "Sin dirección",
};

const VERDICT_CLASS = { ok: "ok", blocked: "bad", unknown: "warn" };

function Empty({ children }) {
  return <p className="cc-empty">{children}</p>;
}

// --------------------------------------------------------------------------- //
// formatting — es-AR, and never through a float
// --------------------------------------------------------------------------- //

const NBSP = " ";

/**
 * A share as the engine sent it: an exact decimal string, because the column is
 * NUMERIC and `_num()` refuses to make it a float in transit.
 *
 * ⚠ "40.00%" shipped. Two defects in six characters: two decimal places is
 * precision nobody measured (a palette is not a lab result), and the number was
 * glued to the sign in a screen that is otherwise es-AR. The trailing zeros go,
 * the digits do NOT — 12,5 stays 12,5 — and this never calls `parseFloat`,
 * which is the whole reason the value arrives as a string.
 */
function pctText(value) {
  if (value === null || value === undefined || value === "") return null;
  let s = String(value).trim();
  if (!s) return null;
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return `${s.replace(".", ",")}${NBSP}%`;
}

/** Integers a merchandiser reads: units, MOQ, days. */
function intText(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toLocaleString("es-AR") : null;
}

/** Money, grouped for reading and otherwise untouched. Same reason as `pctText`:
 *  the engine sends an exact decimal string and rounding it here would quietly
 *  disagree with the costing screen. */
function moneyText(value, currency) {
  if (value === null || value === undefined || value === "") return null;
  const [whole, frac] = String(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const amount = frac ? `${grouped},${frac}` : grouped;
  return currency ? `${currency}${NBSP}${amount}` : amount;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The colour's name, or `null` when it does not have one.
 *
 * ⚠ THE DEFECT THIS EXISTS TO FIX. The engine lowercases every hex on write
 * (`body.hex_value.lower()`), and the add form required a name — so a designer
 * who had a value and no name yet typed the hex into the name box. The card
 * then rendered "#C4582B" as the heading and "#c4582b" as the value, side by
 * side, as if they were two separate facts about the colour. They are one fact
 * printed twice in two cases, and the actual state is that the NAME IS MISSING.
 * A `#RRGGBB` literal is not a colour name in any brand's vocabulary, so it is
 * reported as absent rather than dressed up as content.
 */
function colourName(colour) {
  const raw = String(colour?.name ?? "").trim();
  if (!raw) return null;
  return HEX.test(raw) ? null : raw;
}

/** The stored value, shown ONCE and in one case. Upper case because a hex reads
 *  as a spec code, and a spec code that changes case between two screens is how
 *  people start believing they are different codes. */
function hexText(colour) {
  const raw = String(colour?.hex_value ?? "").trim();
  return HEX.test(raw) ? raw.toUpperCase() : null;
}

// --------------------------------------------------------------------------- //
// controls — the browser's chrome, replaced
// --------------------------------------------------------------------------- //

/** A `<select>` for a short, known vocabulary is a dropdown hiding four words.
 *  The options are shown, because seeing the whole vocabulary is part of
 *  choosing from it. */
function Choice({ label, value, options, onChange, allowNone, noneLabel }) {
  return (
    <div className="dw-field">
      {label && <span className="dw-field-label">{label}</span>}
      <div className="dw-choice" role="radiogroup" aria-label={label || undefined}>
        {allowNone && (
          <button type="button" role="radio" aria-checked={!value}
                  className={`dw-opt${!value ? " on" : ""}`}
                  onClick={() => onChange("")}>
            {noneLabel || "sin definir"}
          </button>
        )}
        {options.map((o) => (
          <button key={o.value} type="button" role="radio"
                  aria-checked={value === o.value}
                  className={`dw-opt${value === o.value ? " on" : ""}`}
                  onClick={() => onChange(o.value)}>
            {o.label}
            {o.hint && <span className="dw-opt-hint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A number without the stepper. The spinner arrows are 14px of browser chrome
 *  that invite a designer to nudge a share by 1 % forty times; typing the number
 *  is the actual interaction. Digits and one separator are all that is accepted,
 *  so nothing unparseable reaches the engine. */
function NumField({ label, value, onChange, unit, hint, wide }) {
  return (
    <div className={`dw-field${wide ? " wide" : ""}`}>
      {label && <span className="dw-field-label">{label}</span>}
      <div className="dw-num">
        <input inputMode="decimal" value={value} aria-label={label}
               onChange={(e) => {
                 const next = e.target.value.replace(/[^0-9.,]/g, "");
                 onChange(next);
               }} />
        {unit && <span className="dw-num-unit">{unit}</span>}
      </div>
      {hint && <span className="dw-field-hint">{hint}</span>}
    </div>
  );
}

function TextField({ label, value, onChange, hint, wide, type = "text" }) {
  return (
    <div className={`dw-field${wide ? " wide" : ""}`}>
      {label && <span className="dw-field-label">{label}</span>}
      <input className="dw-input" type={type} value={value} aria-label={label}
             onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="dw-field-hint">{hint}</span>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <div className="dw-field">
      <button type="button" role="switch" aria-checked={checked}
              className={`dw-toggle${checked ? " on" : ""}`}
              onClick={() => onChange(!checked)}>
        <span className="dw-toggle-box" aria-hidden="true" />
        {label}
      </button>
      {hint && <span className="dw-field-hint">{hint}</span>}
    </div>
  );
}

/**
 * A drawer, not a row of controls.
 *
 * The owner's point exactly: *"adding a colour should happen in a compact
 * drawer or modal — NOT an exposed row of five native controls."* An always-on
 * form row is the screen saying "this is a table and you are filling it in".
 */
function Drawer({ open, title, note, onClose, onSubmit, submitLabel,
                 canSubmit = true, busy, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dw-scrim" onClick={onClose}>
      <div className="dw-drawer" role="dialog" aria-modal="true"
           aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="dw-drawer-head">
          <h4>{title}</h4>
          <button type="button" className="dw-close" onClick={onClose}
                  aria-label="Cerrar">×</button>
        </header>
        {note && <p className="dw-drawer-note">{note}</p>}
        <div className="dw-drawer-body">{children}</div>
        <footer className="dw-drawer-foot">
          <button type="button" className="cc-act" disabled={busy || !canSubmit}
                  onClick={onSubmit}>
            {busy ? "Guardando…" : submitLabel}
          </button>
          <button type="button" className="dw-ghost" onClick={onClose}>
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
}

function AddTrigger({ children, onClick }) {
  return (
    <button type="button" className="dw-add-trigger" onClick={onClick}>
      <span aria-hidden="true">+</span> {children}
    </button>
  );
}

/** Missing, said as missing. Never a placeholder that looks like a value. */
function Unknown({ children }) {
  return <span className="dw-unknown">{children}</span>;
}

// --------------------------------------------------------------------------- //
// palette — the strip is the point
// --------------------------------------------------------------------------- //

/**
 * The palette as one artifact: shares spent as horizontal space.
 *
 * The widths are LAYOUT, not a new fact — the shares are the engine's and this
 * only spends the wall in their proportion. Two honesty rules hold it up:
 *
 *   · proportional ONLY when every colour declares a share. A strip where three
 *     colours are measured and two are guessed at equal width is a picture of a
 *     palette nobody agreed to.
 *   · the shortfall is DRAWN. A palette declaring 88 % leaves 12 % of the strip
 *     hatched and labelled, rather than stretching five colours to fill it.
 */
function PaletteStrip({ p }) {
  const ordered = p.byRole.flatMap((g) => g.colours);
  const allDeclared = p.total > 0 && p.shareDeclared === p.total;

  if (!allDeclared) {
    return (
      <div className="dw-strip-wrap">
        <div className="dw-strip even">
          {ordered.map((c) => (
            <div key={c.id} className="dw-band" style={{ flex: "1 1 0" }}>
              <span className="dw-band-fill" style={{ background: c.hex_value }} />
              <span className="dw-band-name">
                {colourName(c) || <Unknown>sin nombre</Unknown>}
              </span>
              <span className="dw-band-share">
                {pctText(c.share_pct) || <Unknown>sin %</Unknown>}
              </span>
            </div>
          ))}
        </div>
        <p className="dw-strip-cap">
          Anchos iguales, no proporcionales:{" "}
          {p.total - p.shareDeclared} de {p.total} colores no declaran
          porcentaje. Repartir el resto sería inventarlo.
        </p>
      </div>
    );
  }

  // Over 100 the strip is drawn against the declared total, so the bands stay
  // in proportion to EACH OTHER; the banner above says the total is wrong. The
  // alternative — clipping at 100 — would hide a colour.
  const basis = Math.max(100, p.shareTotal);
  const rest = basis > p.shareTotal ? basis - p.shareTotal : 0;

  return (
    <div className="dw-strip-wrap">
      <div className="dw-strip">
        {ordered.map((c) => {
          const width = (Number(c.share_pct) / basis) * 100;
          return (
            <div key={c.id} className="dw-band" style={{ flex: `0 0 ${width}%` }}
                 title={`${colourName(c) || "sin nombre"} · ${pctText(c.share_pct)}`}>
              <span className="dw-band-fill" style={{ background: c.hex_value }} />
              <span className="dw-band-name">
                {colourName(c) || <Unknown>sin nombre</Unknown>}
              </span>
              <span className="dw-band-share">{pctText(c.share_pct)}</span>
            </div>
          );
        })}
        {rest > 0 && (
          <div className="dw-band rest" style={{ flex: `0 0 ${(rest / basis) * 100}%` }}>
            <span className="dw-band-fill hatch" aria-hidden="true" />
            <span className="dw-band-name">sin repartir</span>
            <span className="dw-band-share">{pctText(rest.toFixed(2))}</span>
          </div>
        )}
      </div>
      <p className="dw-strip-cap">
        Ancho proporcional al porcentaje declarado. Total {pctText(p.shareTotal)}.
      </p>
    </div>
  );
}

function ColourCard({ colour, reference, editable, onRemove }) {
  const name = colourName(colour);
  const hex = hexText(colour);
  return (
    <li className="dw-colour">
      <span className="dw-colour-swatch" style={{ background: colour.hex_value }}
            aria-hidden="true" />
      <div className="dw-colour-body">
        <div className="dw-colour-top">
          <b className="dw-colour-name">
            {name || <Unknown>sin nombre — sólo el valor</Unknown>}
          </b>
          <span className="dw-tag">{dir.COLOUR_ROLE_LABEL[colour.role] || colour.role}</span>
          {colour.carryover && <span className="dw-tag quiet">continuidad</span>}
        </div>
        <dl className="dw-facts">
          <div>
            <dt>Valor</dt>
            <dd className="mono">{hex || <Unknown>sin valor</Unknown>}</dd>
          </div>
          <div>
            <dt>Participación</dt>
            <dd>{pctText(colour.share_pct) || <Unknown>sin declarar</Unknown>}</dd>
          </div>
          <div>
            <dt>Pantone</dt>
            {/* The engine HAS this column (`direction_colours.pantone`); an
                empty one means nobody has matched a chip yet, and printing the
                hex here instead would be a colour standard we made up. */}
            <dd className="mono">
              {colour.pantone || <Unknown>sin referencia</Unknown>}
            </dd>
          </div>
        </dl>
        {colour.note && <p className="dw-note-line">{colour.note}</p>}
      </div>
      {reference && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="dw-colour-ref" src={reference.image_url}
             alt={reference.title || "referencia del color"} />
      )}
      {editable && (
        <button className="dir-x" onClick={() => onRemove("colours", colour.id)}
                aria-label={`Quitar ${name || hex || "el color"}`}>×</button>
      )}
    </li>
  );
}

function Palette({ colours, editable, onAdd, onRemove, refs, roles }) {
  const p = dir.palette(colours);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blank = { name: "", hex_value: "#000000", role: "hero", share_pct: "",
                  pantone: "", carryover: false, reference_id: "" };
  const [draft, setDraft] = useState(blank);
  const byId = useMemo(
    () => new Map((refs || []).map((r) => [r.id, r])), [refs]);

  const roleOptions = (roles && roles.length ? roles : Object.keys(dir.COLOUR_ROLE_LABEL))
    .map((v) => ({ value: v, label: dir.COLOUR_ROLE_LABEL[v] || v }));

  return (
    <section className="dir-block">
      <header>
        <h3>Paleta</h3>
        <p>
          Un color es un VALOR con un rol, no la palabra “burdeos” — es lo que
          hace que una generación y un swatch puedan usar el mismo dato. El ancho
          de cada franja es el porcentaje que el equipo le asignó del rango.
        </p>
      </header>

      {p.total === 0 ? (
        <Empty>Todavía no hay ningún color elegido.</Empty>
      ) : (
        <>
          {/* The share total is REPORTED, never normalised: a palette summing to
              140% is a mistake worth seeing, and rescaling it would invent
              intent nobody expressed. */}
          {p.shareState === "over" && (
            <div className="dir-warn">
              Los porcentajes suman <b>{pctText(p.shareTotal)}</b>. No los
              ajustamos solos — decidilo vos.
            </div>
          )}
          {p.shareState === "under" && (
            <div className="dir-note">
              Los porcentajes suman {pctText(p.shareTotal)}; falta repartir el
              resto.
            </div>
          )}
          {p.shareState === "partial" && (
            <div className="dir-note">
              {p.shareDeclared} de {p.total} colores tienen porcentaje. Un total
              sobre parte de la paleta no querría decir nada, así que no lo
              mostramos.
            </div>
          )}
          {p.shareState === "complete" && (
            <p className="dw-ok-line">Los porcentajes suman {pctText(100)}.</p>
          )}

          <PaletteStrip p={p} />

          {p.byRole.map((group) => (
            <div key={group.role} className="dw-role">
              <h4>
                {group.label}
                <span className="dw-role-count">{group.colours.length}</span>
              </h4>
              <ul className="dw-colours">
                {group.colours.map((c) => (
                  <ColourCard key={c.id} colour={c} editable={editable}
                              reference={c.reference_id ? byId.get(c.reference_id) : null}
                              onRemove={onRemove} />
                ))}
              </ul>
            </div>
          ))}

          {/* ⚠ Asked for and refused. Nothing in the schema joins a direction
              colour to a fabric pick or a plan row, so "3 estilos usan este
              color" would be a number this screen made up. */}
          <p className="dir-meta">
            Todavía no podemos decir qué estilos o telas usan cada color: no hay
            un registro que los vincule. Un conteo acá sería inventado.
          </p>
        </>
      )}

      {editable && (
        <>
          <AddTrigger onClick={() => setOpen(true)}>Agregar un color</AddTrigger>
          <Drawer open={open} title="Agregar un color"
                  note="El valor y el rol son lo que condiciona una generación. El
                        nombre es para el equipo — si todavía no tiene, dejalo vacío."
                  onClose={() => { setOpen(false); setDraft(blank); }}
                  submitLabel="Agregar a la paleta"
                  canSubmit={HEX.test(draft.hex_value)}
                  busy={busy}
                  onSubmit={async () => {
                    setBusy(true);
                    try {
                      await onAdd({
                        // ⚠ The engine requires a name. A designer with a value
                        // and no name used to type the hex into the name box,
                        // which is how "#C4582B" and "#c4582b" ended up on the
                        // same card. The value goes in once, and `colourName`
                        // reads that back as "no name yet".
                        name: draft.name.trim() || draft.hex_value,
                        hex_value: draft.hex_value,
                        role: draft.role,
                        share_pct: draft.share_pct.trim() === ""
                          ? null : Number(draft.share_pct.replace(",", ".")),
                        pantone: draft.pantone.trim() || null,
                        carryover: draft.carryover,
                        reference_id: draft.reference_id || null,
                      });
                      setOpen(false);
                      setDraft(blank);
                    } finally {
                      setBusy(false);
                    }
                  }}>
            <div className="dw-picker">
              <label className="dw-picker-swatch"
                     style={{ background: draft.hex_value }}>
                <span className="dw-visually-hidden">Elegir el valor</span>
                <input type="color" value={draft.hex_value}
                       onChange={(e) => setDraft({ ...draft, hex_value: e.target.value })} />
              </label>
              <TextField label="Valor" value={draft.hex_value}
                         hint="#RRGGBB — pegá el valor exacto si lo tenés"
                         onChange={(v) => setDraft({ ...draft, hex_value: v })} />
            </div>

            <TextField label="Nombre" value={draft.name} wide
                       hint="Cómo lo llama el equipo. Vacío es una respuesta válida."
                       onChange={(v) => setDraft({ ...draft, name: v })} />

            <Choice label="Rol" value={draft.role} options={roleOptions}
                    onChange={(v) => setDraft({ ...draft, role: v })} />

            <NumField label="Participación del rango" unit="%"
                      value={draft.share_pct}
                      hint="Cuánto del rango va en este color. Vacío queda como faltante."
                      onChange={(v) => setDraft({ ...draft, share_pct: v })} />

            <TextField label="Pantone" value={draft.pantone} wide
                       hint="El código de la carta, si ya hay uno. No lo derivamos del hex."
                       onChange={(v) => setDraft({ ...draft, pantone: v })} />

            <Toggle label="Viene de la temporada anterior"
                    checked={draft.carryover}
                    onChange={(v) => setDraft({ ...draft, carryover: v })} />

            <Choice label="Referencia" allowNone noneLabel="sin referencia"
                    value={draft.reference_id}
                    options={(refs || []).map((r) => ({
                      value: r.id, label: r.title || dir.PURPOSE_LABEL[r.purpose] || r.purpose,
                    }))}
                    onChange={(v) => setDraft({ ...draft, reference_id: v })} />
          </Drawer>
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- //
// fabrics — the load-bearing block
// --------------------------------------------------------------------------- //

/**
 * The conflict, drawn.
 *
 * The owner: *"If a fabric cannot satisfy the plan, show the conflict VISUALLY
 * — 'Planned: 90 units / Supplier MOQ: 600'. Those should be ACTIONABLE
 * BUTTONS, not merely prose."*
 *
 * Both numbers are the engine's (`reason.have` and `reason.need`), and the bars
 * are those two numbers against the larger of them. Nothing is derived here.
 */
const CONFLICT_SHAPE = {
  below_moq: {
    haveLabel: "El plan pide", needLabel: "Mínimo del proveedor", unit: "u",
  },
  lead_time_exceeds_window: {
    haveLabel: "Días hasta la entrega", needLabel: "La tela tarda", unit: "días",
  },
  delivery_window_passed: {
    haveLabel: "Días hasta la entrega", needLabel: "La tela tarda", unit: "días",
  },
};

function ConflictBars({ reason }) {
  const shape = CONFLICT_SHAPE[reason?.code];
  const need = Number(reason?.need);
  const have = Number(reason?.have);
  if (!shape || !Number.isFinite(need) || !Number.isFinite(have)) return null;
  const top = Math.max(need, have, 1);
  const row = (label, value, kind) => (
    <div className={`dw-bar ${kind}`}>
      <span className="dw-bar-label">{label}</span>
      <span className="dw-bar-track">
        <span className="dw-bar-fill"
              style={{ width: `${Math.max((value / top) * 100, 1.5)}%` }} />
      </span>
      <span className="dw-bar-value">
        {intText(value)}{NBSP}{shape.unit}
      </span>
    </div>
  );
  return (
    <div className="dw-bars">
      {row(shape.haveLabel, have, "have")}
      {row(shape.needLabel, need, "need")}
    </div>
  );
}

/**
 * What a person could actually do about it — each one a real destination or a
 * real mutation, never a button that only looks like an answer.
 *
 * ⚠ "Negociar con el proveedor" is NOT here. There is no supplier conversation
 * in this system, so a button would be a promise the product cannot keep; it is
 * named in prose as the decision that lives outside Atelier.
 */
function conflictActions(reason, unknownFields) {
  const out = [];
  const code = reason?.code;
  if (code === "below_moq") {
    out.push({ key: "plan", label: "Ajustar las unidades en el plan", view: "lineplan" });
  }
  if (code === "lead_time_exceeds_window" || code === "delivery_window_passed") {
    out.push({ key: "brief", label: "Corregir la fecha de entrega", view: "collectionbrief" });
  }
  for (const f of unknownFields || []) {
    if (f === "moq_units" || f === "lead_time_days" || f === "currency") {
      out.push({ key: `sheet-${f}`, label: "Completar el material sheet", view: "materials" });
    }
    if (f === "planned_units") {
      out.push({ key: "slots", label: "Cargar filas del plan de rango", view: "lineplan" });
    }
    if (f === "delivery_start") {
      out.push({ key: "date", label: "Fijar la fecha de entrega", view: "collectionbrief" });
    }
  }
  return out.filter(
    (a, i, all) => all.findIndex((b) => b.view === a.view) === i);
}

function FabricCard({ fabric, editable, onRemove, onReplace, onNavigate }) {
  const s = fabric.sourceability;
  const verdict = s?.verdict || "unknown";
  const m = fabric.material;
  const reasons = s?.reasons || [];
  const unknownFields = verdict === "unknown" ? (s?.unknown_fields || []) : [];
  const actions = conflictActions(reasons[0], unknownFields);

  return (
    <li className={`dw-mat ${VERDICT_CLASS[verdict]}`}>
      <div className="dw-mat-head">
        {/* ⚠ No photograph, and no invented one. `brand_materials` has no image
            column — a sheet is a spreadsheet, not a swatch library — so the tile
            says what is missing instead of showing a stock texture that would
            imply somebody had seen this fabric. */}
        <span className="dw-photo" aria-hidden="true">sin foto</span>
        <div className="dw-mat-title">
          <b>{m?.name || "tela sin resolver"}</b>
          <span className="dw-mat-code mono">
            {m ? (
              m.code_derived_from_name ? (
                // Travels with the code everywhere, so nobody quotes a code we
                // invented to a supplier.
                <span title="El archivo no traía código; lo derivamos del nombre.">
                  {m.material_code} <span className="dir-prov">derivado</span>
                </span>
              ) : m.material_code
            ) : <Unknown>no pudimos leer la fila del material</Unknown>}
          </span>
        </div>
        <span className={`dir-verdict ${VERDICT_CLASS[verdict]}`}>
          {dir.SOURCEABILITY_LABEL[verdict]}
        </span>
        {editable && (
          <button className="dir-x" onClick={() => onRemove("fabrics", fabric.id)}
                  aria-label="Quitar tela">×</button>
        )}
      </div>

      {m && (
        <dl className="dw-facts wide">
          <div>
            <dt>Composición</dt>
            <dd>{m.composition || <Unknown>sin dato</Unknown>}</dd>
          </div>
          <div>
            <dt>Construcción</dt>
            <dd>
              {[m.construction, m.finish].filter(Boolean).join(" · ")
                || <Unknown>sin dato</Unknown>}
            </dd>
          </div>
          <div>
            <dt>Proveedor</dt>
            <dd>
              {m.supplier_name || <Unknown>sin proveedor</Unknown>}
              {m.country ? ` · ${m.country}` : ""}
            </dd>
          </div>
          <div>
            <dt>Precio</dt>
            <dd className="mono">
              {moneyText(m.price, m.currency) || <Unknown>sin precio</Unknown>}
            </dd>
          </div>
          <div>
            <dt>MOQ</dt>
            <dd className="mono">
              {m.moq_units != null
                ? `${intText(m.moq_units)}${NBSP}u`
                : <Unknown>sin dato</Unknown>}
            </dd>
          </div>
          <div>
            <dt>Producción</dt>
            <dd className="mono">
              {m.lead_time_days != null
                ? `${intText(m.lead_time_days)}${NBSP}días`
                : <Unknown>sin dato</Unknown>}
            </dd>
          </div>
          <div>
            <dt>Ancho</dt>
            <dd className="mono">
              {m.width_cm ? `${moneyText(m.width_cm)}${NBSP}cm` : <Unknown>sin dato</Unknown>}
            </dd>
          </div>
          <div>
            <dt>Gramaje</dt>
            <dd className="mono">
              {m.weight_gsm ? `${moneyText(m.weight_gsm)}${NBSP}g/m²` : <Unknown>sin dato</Unknown>}
            </dd>
          </div>
        </dl>
      )}

      {fabric.intended_categories?.length > 0 && (
        <div className="dw-chips">
          {fabric.intended_categories.map((c) => (
            <span key={c} className="dw-chip">{c}</span>
          ))}
        </div>
      )}

      {(reasons.length > 0 || unknownFields.length > 0) && (
        <div className={`dw-conflict ${VERDICT_CLASS[verdict]}`}>
          {reasons.map((r, i) => (
            <div key={i} className="dw-conflict-case">
              <p className="dir-reason">{dir.reasonText(r)}</p>
              <ConflictBars reason={r} />
            </div>
          ))}
          {unknownFields.length > 0 && (
            <p className="dir-reason">
              No lo podemos afirmar: {dir.unknownFieldsText(unknownFields)}.
            </p>
          )}
          {(actions.length > 0 || editable) && (
            <div className="dw-acts">
              {actions.map((a) => (
                <button key={a.key} type="button" className="dw-act"
                        disabled={!onNavigate}
                        onClick={() => onNavigate && onNavigate(a.view)}>
                  {a.label} →
                </button>
              ))}
              {editable && (
                <button type="button" className="dw-act"
                        onClick={() => onReplace(fabric)}>
                  Reemplazar por otra tela
                </button>
              )}
            </div>
          )}
          {verdict === "blocked" && (
            <p className="dir-meta">
              Combinar colorways o negociar el mínimo con el proveedor también lo
              resuelven — pero eso se decide fuera de Atelier, así que no hay acá
              un botón que diga que ya pasó.
            </p>
          )}
        </div>
      )}

      {/* Never presented as making a blocked fabric fine — it changes what the
          team can DO, not what is true. */}
      {verdict === "blocked" && fabric.substitution_allowed && (
        <p className="dir-note">
          Se permite reemplazarla
          {fabric.substitution_note ? `: ${fabric.substitution_note}` : ""}. Sigue
          sin poder comprarse tal cual.
        </p>
      )}
    </li>
  );
}

function Fabrics({ fabrics, materials, materialsError, editable, onAdd, onRemove,
                  basis, onNavigate }) {
  const groups = dir.fabricGroups(fabrics);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState({ materialId: "", categories: "", query: "" });

  const picked = new Set((fabrics || []).map((f) => f.material_id));
  const available = (materials || []).filter((m) => !picked.has(m.id));
  const shown = useMemo(() => {
    const q = pick.query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((m) =>
      [m.name, m.material_code, m.supplier_name, m.composition]
        .filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [available, pick.query]);

  const openPicker = useCallback(() => {
    setPick({ materialId: "", categories: "", query: "" });
    setOpen(true);
  }, []);

  return (
    <section className="dir-block">
      <header>
        <h3>Telas</h3>
        <p>
          Salen del material sheet de la marca — no de un campo de texto. Por eso
          cada una llega con su proveedor, su mínimo de compra y su tiempo de
          producción, y por eso podemos decirte acá si no se puede comprar para
          este rango.
        </p>
      </header>

      {groups.total > 0 && (
        <div className="dw-tally">
          <span className="dw-tally-item ok">
            <b>{groups.ok.length}</b> se pueden comprar
          </span>
          <span className="dw-tally-item warn">
            <b>{groups.unknown.length}</b> sin poder saberlo
          </span>
          <span className="dw-tally-item bad">
            <b>{groups.blocked.length}</b> no se pueden
          </span>
          {groups.unresolved.length > 0 && (
            <span className="dw-tally-item bad">
              <b>{groups.unresolved.length}</b> sin fila de material
            </span>
          )}
        </div>
      )}

      {/* Stated, not assumed. A sourceability check with no plan and no delivery
          date has not passed — it could not run. */}
      {(basis?.plan_slots === 0 || !basis?.lead_time_checkable) && (
        <div className="dir-note">
          {basis?.plan_slots === 0 && (
            <>Todavía no hay filas en el plan de rango, así que el mínimo de
              compra no se puede verificar. </>
          )}
          {!basis?.lead_time_checkable && (
            <>Ningún brief fija fecha de entrega, así que el tiempo de producción
              tampoco.</>
          )}
        </div>
      )}

      {materialsError && (
        <div className="dir-warn">
          No pudimos leer el material sheet ({materialsError}). Puede que haya
          telas y no las estemos viendo — esto <b>no</b> quiere decir que no
          existan.
        </div>
      )}

      {groups.total === 0 ? (
        <Empty>
          Todavía no hay telas elegidas.
          {(materials || []).length === 0 && !materialsError && (
            <> El material sheet de esta marca está vacío — se carga desde el
              Centro de importación.</>
          )}
        </Empty>
      ) : (
        <ul className="dw-mats">
          {(fabrics || []).map((f) => (
            <FabricCard key={f.id} fabric={f} editable={editable}
                        onRemove={onRemove} onNavigate={onNavigate}
                        onReplace={async (old) => {
                          await onRemove("fabrics", old.id);
                          openPicker();
                        }} />
          ))}
        </ul>
      )}

      {editable && available.length > 0 && (
        <>
          <AddTrigger onClick={openPicker}>Elegir una tela del sheet</AddTrigger>
          <Drawer open={open} title="Elegir una tela"
                  note="Sólo del material sheet de la marca. Cada fila trae lo que
                        hace falta para saber si se puede comprar para este rango."
                  onClose={() => setOpen(false)}
                  submitLabel="Elegir esta tela"
                  canSubmit={Boolean(pick.materialId)} busy={busy}
                  onSubmit={async () => {
                    setBusy(true);
                    try {
                      await onAdd({
                        materialId: pick.materialId,
                        intendedCategories: pick.categories
                          .split(",").map((s) => s.trim()).filter(Boolean),
                      });
                      setOpen(false);
                      setPick({ materialId: "", categories: "", query: "" });
                    } finally {
                      setBusy(false);
                    }
                  }}>
            <TextField label="Buscar" value={pick.query} wide
                       onChange={(v) => setPick({ ...pick, query: v })} />
            <ul className="dw-pick-list">
              {shown.map((m) => (
                <li key={m.id}>
                  <button type="button"
                          className={`dw-pick${pick.materialId === m.id ? " on" : ""}`}
                          onClick={() => setPick({ ...pick, materialId: m.id })}>
                    <span className="dw-photo sm" aria-hidden="true">—</span>
                    <span className="dw-pick-body">
                      <b>{m.name}</b>
                      <span className="dir-meta">
                        {m.supplier_name || "sin proveedor"}
                        {" · MOQ "}
                        {m.moq_units != null ? intText(m.moq_units) : "sin dato"}
                        {" · "}
                        {m.lead_time_days != null
                          ? `${intText(m.lead_time_days)} días`
                          : "sin tiempo de producción"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="dir-meta">Ninguna tela del sheet coincide.</li>
              )}
            </ul>
            <TextField label="Categorías previstas" value={pick.categories} wide
                       hint="Separadas por coma. Vacío es válido."
                       onChange={(v) => setPick({ ...pick, categories: v })} />
          </Drawer>
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- //
// silhouettes
// --------------------------------------------------------------------------- //

function Silhouettes({ silhouettes, editable, onAdd, onRemove, refs }) {
  const blank = { category: "", name: "", fit: "", length: "", volume: "",
                  proportion_notes: "", reference_id: "" };
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const byId = useMemo(
    () => new Map((refs || []).map((r) => [r.id, r])), [refs]);

  return (
    <section className="dir-block">
      <header>
        <h3>Siluetas</h3>
        <p>La intención de forma por categoría. El diseño se le asigna después.</p>
      </header>

      {(silhouettes || []).length === 0 ? (
        <Empty>Todavía no hay siluetas.</Empty>
      ) : (
        <ul className="dw-sils">
          {silhouettes.map((s) => {
            const ref = s.reference_id ? byId.get(s.reference_id) : null;
            return (
              <li key={s.id} className="dw-sil">
                {ref ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="dw-sil-ref" src={ref.image_url}
                       alt={ref.title || s.category} />
                ) : (
                  <span className="dw-photo" aria-hidden="true">sin referencia</span>
                )}
                <div className="dw-sil-body">
                  <div className="dw-colour-top">
                    <b>{s.category}</b>
                    {s.name && <span className="dw-tag quiet">{s.name}</span>}
                  </div>
                  <dl className="dw-facts">
                    <div>
                      <dt>Calce</dt>
                      <dd>{s.fit || <Unknown>sin dato</Unknown>}</dd>
                    </div>
                    <div>
                      <dt>Largo</dt>
                      <dd>{s.length || <Unknown>sin dato</Unknown>}</dd>
                    </div>
                    <div>
                      <dt>Volumen</dt>
                      <dd>{s.volume || <Unknown>sin dato</Unknown>}</dd>
                    </div>
                  </dl>
                  {s.proportion_notes && (
                    <p className="dw-note-line">
                      {s.proportion_notes}{" "}
                      {/* The one field with no record behind it, labelled as
                          such per §10's field-level provenance rule. */}
                      <span className="dir-prov">dato del equipo</span>
                    </p>
                  )}
                </div>
                {editable && (
                  <button className="dir-x" onClick={() => onRemove("silhouettes", s.id)}
                          aria-label="Quitar silueta">×</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <>
          <AddTrigger onClick={() => setOpen(true)}>Agregar una silueta</AddTrigger>
          <Drawer open={open} title="Agregar una silueta"
                  note="Forma, no diseño. La categoría es lo único obligatorio."
                  onClose={() => { setOpen(false); setD(blank); }}
                  submitLabel="Agregar la silueta"
                  canSubmit={Boolean(d.category.trim())} busy={busy}
                  onSubmit={async () => {
                    setBusy(true);
                    try {
                      await onAdd({
                        category: d.category.trim(),
                        name: d.name.trim() || null,
                        fit: d.fit.trim() || null,
                        length: d.length.trim() || null,
                        volume: d.volume.trim() || null,
                        proportion_notes: d.proportion_notes.trim() || null,
                        reference_id: d.reference_id || null,
                      });
                      setOpen(false);
                      setD(blank);
                    } finally {
                      setBusy(false);
                    }
                  }}>
            <TextField label="Categoría" value={d.category} wide
                       onChange={(v) => setD({ ...d, category: v })} />
            <TextField label="Nombre" value={d.name} wide
                       onChange={(v) => setD({ ...d, name: v })} />
            <TextField label="Calce" value={d.fit}
                       onChange={(v) => setD({ ...d, fit: v })} />
            <TextField label="Largo" value={d.length}
                       onChange={(v) => setD({ ...d, length: v })} />
            <TextField label="Volumen" value={d.volume}
                       onChange={(v) => setD({ ...d, volume: v })} />
            <TextField label="Nota de proporción" value={d.proportion_notes} wide
                       hint="Queda marcada como dato del equipo: no hay un registro detrás."
                       onChange={(v) => setD({ ...d, proportion_notes: v })} />
            <Choice label="Referencia" allowNone noneLabel="sin referencia"
                    value={d.reference_id}
                    options={(refs || []).map((r) => ({
                      value: r.id,
                      label: r.title || dir.PURPOSE_LABEL[r.purpose] || r.purpose,
                    }))}
                    onChange={(v) => setD({ ...d, reference_id: v })} />
          </Drawer>
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- //
// price bands
// --------------------------------------------------------------------------- //

function PriceBands({ bands, reconciliation, editable, onAdd, onRemove }) {
  const rec = dir.reconciliation(reconciliation);
  const blank = { category: "", floor_price: "", core_price: "",
                  ceiling_price: "", currency: "ARS", target_margin_pct: "" };
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className="dir-block">
      <header>
        <h3>Bandas de precio</h3>
        <p>
          La intención de la dirección. El compromiso comercial son las filas del
          plan de rango — y cuando no coinciden lo mostramos, sin resolverlo por
          ninguno de los dos lados.
        </p>
      </header>

      {rec.disagreeing.length > 0 && (
        <div className="dir-warn">
          <b>{rec.disagreeing.length} categoría(s) no coinciden con el plan.</b>{" "}
          Ni la banda ni el plan se cambian solos: son dos opiniones y decidir es
          de una persona.
          <ul>
            {rec.disagreeing.map((c) => (
              <li key={c.category}>
                <b>{c.category}</b> — {dir.reconcileText(c)}
                {(c.slots || []).length > 0 && (
                  <span className="dir-meta">
                    {" "}
                    ({c.slots.map((s) =>
                      `${s.slot_code}: ${moneyText(s.retail_price, s.currency)}`)
                      .join(" · ")})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rec.informational.length > 0 && (
        <div className="dir-note">
          {rec.informational.map((c) => (
            <div key={`${c.category}-${c.state}`}>{dir.reconcileText(c)}</div>
          ))}
        </div>
      )}

      {(bands || []).length === 0 ? (
        <Empty>Todavía no hay bandas por categoría.</Empty>
      ) : (
        <table className="dir-bands">
          <thead>
            <tr>
              <th>Categoría</th><th>Piso</th><th>Núcleo</th><th>Techo</th>
              <th>Margen</th><th>Plan</th><th />
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => {
              const entry = rec.categories.find((c) => c.category === b.category);
              return (
                <tr key={b.id}>
                  <td>{b.category}</td>
                  <td>{moneyText(b.floor_price, b.currency) || "—"}</td>
                  <td>{moneyText(b.core_price, b.currency) || "—"}</td>
                  <td>{moneyText(b.ceiling_price, b.currency) || "—"}</td>
                  <td>{pctText(b.target_margin_pct) || "—"}</td>
                  <td>
                    {entry ? dir.RECONCILE_LABEL[entry.state] : "—"}
                    {/* "Coincide" over zero priced rows is not agreement, and the
                        count is the only way to tell them apart. */}
                    {entry?.state === "agrees" && (
                      <span className="dir-meta"> ({entry.compared} fila/s)</span>
                    )}
                  </td>
                  <td>
                    {editable && (
                      <button className="dir-x"
                              onClick={() => onRemove("price-bands", b.id)}
                              aria-label="Quitar banda">×</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editable && (
        <>
          <AddTrigger onClick={() => setOpen(true)}>Agregar una banda</AddTrigger>
          <Drawer open={open} title="Agregar una banda de precio"
                  note="Un precio sin moneda no se puede comparar con el plan, así
                        que el motor lo rechaza."
                  onClose={() => { setOpen(false); setD(blank); }}
                  submitLabel="Agregar la banda"
                  canSubmit={Boolean(d.category.trim())} busy={busy}
                  onSubmit={async () => {
                    setBusy(true);
                    try {
                      const num = (v) => (v.trim() === ""
                        ? null : Number(v.replace(",", ".")));
                      await onAdd({
                        category: d.category.trim(),
                        floor_price: num(d.floor_price),
                        core_price: num(d.core_price),
                        ceiling_price: num(d.ceiling_price),
                        currency: d.currency.trim() || null,
                        target_margin_pct: num(d.target_margin_pct),
                      });
                      setOpen(false);
                      setD(blank);
                    } finally {
                      setBusy(false);
                    }
                  }}>
            <TextField label="Categoría" value={d.category} wide
                       onChange={(v) => setD({ ...d, category: v })} />
            <NumField label="Piso" value={d.floor_price}
                      onChange={(v) => setD({ ...d, floor_price: v })} />
            <NumField label="Núcleo" value={d.core_price}
                      onChange={(v) => setD({ ...d, core_price: v })} />
            <NumField label="Techo" value={d.ceiling_price}
                      onChange={(v) => setD({ ...d, ceiling_price: v })} />
            <TextField label="Moneda" value={d.currency}
                       onChange={(v) => setD({ ...d, currency: v })} />
            <NumField label="Margen objetivo" unit="%" value={d.target_margin_pct}
                      onChange={(v) => setD({ ...d, target_margin_pct: v })} />
          </Drawer>
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- //
// references — the hero imagery, at the top of the wall
// --------------------------------------------------------------------------- //

function References({ refs, vocab, editable, onAdd, onRemove }) {
  const r = dir.references(refs);
  // No defaults on purpose: a default purpose would guess what the designer
  // meant and a default rights value would be a claim about provenance nobody
  // made. The engine refuses both, so pre-filling would only produce a 422.
  const blank = { purpose: "", rights: "", title: "", source: "",
                  credit: "", file: null, image_url: "" };
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className="dir-block">
      <header>
        <h3>Inspiración</h3>
        <p>
          Cada referencia dice PARA QUÉ es y DE DÓNDE viene. Una imagen sin
          etiqueta no le enseña nada específico a un modelo, así que el motor la
          rechaza — y una foto de pasarela ajena no es lo mismo que el archivo
          propio.
        </p>
      </header>

      {r.rightsUnclear > 0 && (
        <div className="dir-note">
          {r.rightsUnclear} referencia(s) con origen sin confirmar o público.
          Conviene saberlo antes de generar algo que se le muestre a un cliente.
        </div>
      )}

      {r.total === 0 ? (
        <Empty>Todavía no hay referencias cargadas.</Empty>
      ) : (
        r.byPurpose.map((group) => (
          <div key={group.purpose} className="dw-role">
            <h4>
              {group.label}
              <span className="dw-role-count">{group.refs.length}</span>
            </h4>
            <ul className="dw-board">
              {group.refs.map((ref) => (
                <li key={ref.id} className="dw-plate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ref.image_url} alt={ref.title || group.label} />
                  <div className="dw-plate-cap">
                    <b>{ref.title || <Unknown>sin título</Unknown>}</b>
                    <span className="dir-meta">
                      {dir.RIGHTS_LABEL[ref.rights]}
                      {ref.source ? ` · ${ref.source}` : ""}
                      {ref.credit ? ` · ${ref.credit}` : ""}
                    </span>
                    <span className="dir-meta">
                      {ref.uploaded_by || "sin identificar"}
                      {ref.uploaded_by_verified ? " · verificado" : " · sin verificar"}
                    </span>
                  </div>
                  {editable && (
                    <button className="dir-x" onClick={() => onRemove("references", ref.id)}
                            aria-label="Quitar referencia">×</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {r.missingPurposes.length > 0 && r.total > 0 && (
        <p className="dir-meta">
          Sin referencias de:{" "}
          {r.missingPurposes.map((p) => dir.PURPOSE_LABEL[p] || p).join(" · ")}.
        </p>
      )}

      {editable && (
        <>
          <AddTrigger onClick={() => setOpen(true)}>Cargar una referencia</AddTrigger>
          <Drawer open={open} title="Cargar una referencia"
                  note="Para qué es y de dónde viene son obligatorios: sin eso la
                        imagen no le enseña nada específico a un modelo."
                  onClose={() => { setOpen(false); setD(blank); }}
                  submitLabel="Cargar la referencia"
                  canSubmit={Boolean(d.purpose && d.rights && (d.file || d.image_url))}
                  busy={busy}
                  onSubmit={async () => {
                    setBusy(true);
                    try {
                      const body = {
                        purpose: d.purpose, rights: d.rights,
                        title: d.title || null, source: d.source || null,
                        credit: d.credit || null,
                      };
                      if (d.file) {
                        body.image_data_uri = await dir.fileToDataUri(d.file);
                        body.filename = d.file.name;
                      } else {
                        body.image_url = d.image_url;
                      }
                      await onAdd(body);
                      setOpen(false);
                      setD(blank);
                    } finally {
                      setBusy(false);
                    }
                  }}>
            <Choice label="¿Para qué es?" value={d.purpose}
                    options={(vocab?.reference_purposes || []).map((p) => ({
                      value: p, label: dir.PURPOSE_LABEL[p] || p,
                    }))}
                    onChange={(v) => setD({ ...d, purpose: v })} />
            <Choice label="¿De dónde viene?" value={d.rights}
                    options={(vocab?.reference_rights || []).map((p) => ({
                      value: p, label: dir.RIGHTS_LABEL[p] || p,
                    }))}
                    onChange={(v) => setD({ ...d, rights: v })} />
            <TextField label="Título" value={d.title} wide
                       onChange={(v) => setD({ ...d, title: v })} />
            <TextField label="Fuente" value={d.source} wide
                       onChange={(v) => setD({ ...d, source: v })} />
            <div className="dw-field wide">
              <span className="dw-field-label">Imagen</span>
              <label className="dw-file">
                {d.file ? d.file.name : "Elegir un archivo (PNG, JPEG o WebP)"}
                <input type="file" accept="image/png,image/jpeg,image/webp"
                       onChange={(e) => setD({ ...d, file: e.target.files?.[0] || null })} />
              </label>
            </div>
          </Drawer>
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- //
// rules
// --------------------------------------------------------------------------- //

function Rules({ all, vocab, editable, onAdd, onRemove }) {
  const r = dir.rules(all);
  const blank = { kind: "must_avoid", scope: "any", value: "", reason: "" };
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className="dir-block">
      <header>
        <h3>Reglas</h3>
        <p>
          Estructuradas, no una frase en un párrafo — para que una generación se
          pueda <b>verificar</b> contra ellas y citar cuál incumplió.
        </p>
      </header>

      {r.withoutReason > 0 && (
        <div className="dir-note">
          {r.withoutReason} regla(s) sin motivo escrito. Una regla que nadie puede
          explicar la pasa por encima el primero que tenga apuro.
        </div>
      )}

      {r.total === 0 ? (
        <Empty>Todavía no hay reglas.</Empty>
      ) : (
        <div className="dw-rules">
          {[["Tiene que tener", r.mustInclude, "in"],
            ["No puede tener", r.mustAvoid, "out"]]
            .filter(([, rows]) => rows.length > 0)
            .map(([label, rows, kind]) => (
              <div key={label} className={`dw-rule-col ${kind}`}>
                <h4>
                  {label}
                  <span className="dw-role-count">{rows.length}</span>
                </h4>
                <ul>
                  {rows.map((rule) => (
                    <li key={rule.id} className="dw-rule">
                      <div className="dw-rule-top">
                        <b>{rule.value}</b>
                        <span className="dw-tag quiet">
                          {dir.RULE_SCOPE_LABEL[rule.scope] || rule.scope}
                        </span>
                        {editable && (
                          <button className="dir-x"
                                  onClick={() => onRemove("rules", rule.id)}
                                  aria-label="Quitar regla">×</button>
                        )}
                      </div>
                      {rule.reason
                        ? <p className="dw-note-line">{rule.reason}</p>
                        : <p className="dw-note-line">
                            <Unknown>sin motivo escrito</Unknown>
                          </p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {editable && (
        <>
          <AddTrigger onClick={() => setOpen(true)}>Agregar una regla</AddTrigger>
          <Drawer open={open} title="Agregar una regla"
                  onClose={() => { setOpen(false); setD(blank); }}
                  submitLabel="Agregar la regla"
                  canSubmit={Boolean(d.value.trim())} busy={busy}
                  onSubmit={async () => {
                    setBusy(true);
                    try {
                      await onAdd({
                        kind: d.kind, scope: d.scope, value: d.value.trim(),
                        reason: d.reason.trim() || null,
                      });
                      setOpen(false);
                      setD(blank);
                    } finally {
                      setBusy(false);
                    }
                  }}>
            <Choice label="Tipo" value={d.kind}
                    options={[{ value: "must_avoid", label: "No puede tener" },
                              { value: "must_include", label: "Tiene que tener" }]}
                    onChange={(v) => setD({ ...d, kind: v })} />
            <Choice label="Alcance" value={d.scope}
                    options={(vocab?.rule_scopes || []).map((s) => ({
                      value: s, label: dir.RULE_SCOPE_LABEL[s] || s,
                    }))}
                    onChange={(v) => setD({ ...d, scope: v })} />
            <TextField label="Valor" value={d.value} wide
                       onChange={(v) => setD({ ...d, value: v })} />
            <TextField label="Motivo" value={d.reason} wide
                       hint="Una regla que nadie puede explicar la pasa por encima
                             el primero que tenga apuro."
                       onChange={(v) => setD({ ...d, reason: v })} />
          </Drawer>
        </>
      )}
    </section>
  );
}


// --------------------------------------------------------------------------- //
// quantities + sizes — plan first, observed evidence second
// --------------------------------------------------------------------------- //

function CommercialGuidance({ guidance }) {
  if (!guidance) return null;
  const quantity = guidance.quantity_plan || {};
  const sizes = guidance.size_evidence || {};
  const observed = sizes.overall?.sizes || [];
  const allocated = (sizes.by_slot || []).filter(
    (row) => row.planned_units != null && row.curve?.state === "observed");

  return (
    <section className="dir-block">
      <header>
        <h3>Cantidades y talles</h3>
        <p>
          La creatividad se condiciona con Dirección; la compra se condiciona
          con el plan y con evidencia propia. Atelier no usa una curva genérica
          disfrazada de inteligencia.
        </p>
      </header>

      <div className="dir-note">
        <b>Plan de rango:</b>{" "}
        {quantity.plan_slots || 0} producto(s)
        {quantity.total_planned_units != null
          ? ` · ${intText(quantity.total_planned_units)} unidades confirmadas`
          : " · sin un total de unidades confirmado"}
        {quantity.slots_missing_planned_units > 0
          ? ` · ${quantity.slots_missing_planned_units} sin unidades`
          : ""}
        {quantity.slots_with_planning_ranges > 0
          ? ` · ${quantity.slots_with_planning_ranges} con escenario bajo/base/alto`
          : ""}
        . El plan manda; Atelier no lo reemplaza por la cantidad de imágenes
        generadas.
      </div>

      {sizes.state !== "observed" ? (
        <div className="dir-warn">
          <b>No hay una curva de talles defendible todavía.</b>{" "}
          Hay {sizes.product_master_skus || 0} SKU(s) en el maestro y{" "}
          {sizes.matched_sales_units || 0} unidades de venta vinculadas. Importá
          SKUs con talle y ventas usando esos mismos códigos; hasta entonces los
          talles quedan como dato faltante.
        </div>
      ) : (
        <>
          <p className="dir-meta">
            Histórico observado · {intText(sizes.overall.sample_units)} unidades
            usadas ·{" "}
            {sizes.returns_feed_connected
              ? "ventas netas de devoluciones conectadas"
              : "ventas brutas; no hay feed de devoluciones conectado"}
            . No es un pronóstico.
          </p>
          <table className="dir-bands">
            <thead>
              <tr><th>Talle</th><th>Unidades observadas</th><th>Participación</th></tr>
            </thead>
            <tbody>
              {observed.map((row) => (
                <tr key={row.size}>
                  <td>{row.size}</td>
                  <td>{intText(row.observed_units)}</td>
                  <td>{pctText(row.share_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(sizes.unmatched_sales_units > 0 ||
            (sizes.unmatched_return_units || 0) > 0) && (
            <div className="dir-warn">
              Quedaron fuera {sizes.unmatched_sales_units || 0} unidades de venta
              y {sizes.unmatched_return_units || 0} devoluciones porque su código
              no coincide con un SKU del maestro. No se repartieron a ojo.
            </div>
          )}

          {allocated.length > 0 && (
            <>
              <h4>Reparto sugerido del total que eligió el equipo</h4>
              <table className="dir-bands">
                <thead>
                  <tr><th>Producto</th><th>Total elegido</th><th>Reparto por talle</th><th>Base</th></tr>
                </thead>
                <tbody>
                  {allocated.map((row) => (
                    <tr key={row.slot_id}>
                      <td>{row.slot_code}{row.category ? ` · ${row.category}` : ""}</td>
                      <td>{intText(row.planned_units)}</td>
                      <td>
                        {row.curve.sizes
                          .map((size) => `${size.size} ${size.suggested_units}`)
                          .join(" · ")}
                      </td>
                      <td>
                        {row.curve.fallback === "overall_brand"
                          ? "histórico total de la marca"
                          : "histórico de la categoría"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- //
// the stylesheet — committed WITH the markup, in the component, like every
// other screen (`tb-`, `xp-`, `vx-`). tests/stylesheetCoverage.test.mjs exists
// because these two halves once landed apart.
// --------------------------------------------------------------------------- //

const DW_CSS = `
/* The screen root also matches the unrelated .dir gallery-card rule higher in
   globals.css; neutralise that here, and number the sections like an editorial
   document. */
.dir.dirw{cursor:default;border:0;border-radius:0;background:transparent;
  overflow:visible;text-align:left;gap:var(--s5);counter-reset:dwsec}

/* -- sections: numbered editorial cards ---------------------------------- */
.dirw .dir-block{background:var(--card);border:1px solid var(--line);
  border-radius:var(--r);padding:var(--s5);box-shadow:var(--shadow);gap:12px}
.dirw .dir-block>header h3{font-family:var(--disp);font-size:17px;
  font-weight:700;letter-spacing:-.01em;margin:0 0 3px}
.dirw .dir-block>header h3::before{counter-increment:dwsec;
  content:counter(dwsec,decimal-leading-zero);display:block;
  font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.1em;
  color:var(--ink-3);margin-bottom:6px}
.dirw .dir-block>h4{font-family:var(--d);font-size:12px;font-weight:600;
  text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);margin:6px 0 0}

/* -- masthead ------------------------------------------------------------- */
.dirw .dw-masthead{background:var(--card);border:1px solid var(--line);
  border-radius:var(--r);padding:var(--s5);box-shadow:var(--shadow)}
.dirw .dw-masthead .eyebrow{display:block;font-size:11px;letter-spacing:.1em;
  margin-bottom:8px}
.dirw .dw-masthead h2{font-family:var(--disp);font-size:24px;font-weight:700;
  letter-spacing:-.015em;margin:0 0 6px}

/* -- palette: the proportional strip -------------------------------------- */
.dw-strip-wrap{display:flex;flex-direction:column;gap:7px}
.dw-strip{display:flex;height:76px;border-radius:var(--r-sm);overflow:hidden;
  border:1px solid var(--line)}
.dw-strip.even .dw-band{flex:1 1 0}
.dw-band{position:relative;display:flex;flex-direction:column;
  justify-content:flex-end;padding:8px 10px;min-width:0;overflow:hidden}
.dw-band::before{content:"";position:absolute;left:0;right:0;bottom:0;
  height:42px;pointer-events:none;
  background:linear-gradient(rgba(23,24,28,0),rgba(23,24,28,.42))}
.dw-band-fill{position:absolute;inset:0}
.dw-band-name{position:relative;font-size:12px;font-weight:600;color:#fff;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw-band-share{position:relative;font-family:var(--d);font-size:11px;
  font-variant-numeric:tabular-nums;color:#fff;opacity:.85}
.dw-band .dw-unknown{color:#fff;opacity:.8}
.dw-band.rest::before{content:none}
.dw-band-fill.hatch{background:repeating-linear-gradient(45deg,
  var(--paper-2) 0 6px,var(--hair-2) 6px 12px)}
.dw-band.rest .dw-band-name,.dw-band.rest .dw-band-share{color:var(--ink-2);
  opacity:1}
.dw-strip-cap{margin:0;font-size:11.5px;color:var(--ink-3);line-height:1.5}
.dw-ok-line{margin:0;font-size:12px;color:var(--positive)}

/* -- role groups ----------------------------------------------------------- */
.dw-role{margin-top:4px}
.dw-role h4,.dw-rule-col h4{display:flex;align-items:center;gap:8px;
  font-family:var(--d);font-size:12px;font-weight:600;text-transform:uppercase;
  letter-spacing:.08em;color:var(--ink-3);margin:0 0 9px}
.dw-role-count{font-family:var(--d);font-size:11px;font-weight:500;
  background:var(--paper-2);color:var(--ink-2);border-radius:99px;padding:2px 8px}

/* -- colour cards ----------------------------------------------------------- */
.dw-colours{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.dw-colour{position:relative;display:flex;gap:12px;background:var(--card);
  border:1px solid var(--line);border-radius:var(--r-sm);padding:12px}
.dw-colour>.dir-x{align-self:flex-start}
.dw-colour-swatch{flex:none;width:52px;height:52px;border-radius:var(--r-xs);
  box-shadow:inset 0 0 0 1px rgba(23,24,28,.08)}
.dw-colour-body{flex:1;min-width:0}
.dw-colour-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dw-colour-top>b{font-size:13.5px;font-weight:600}
.dw-colour-name{font-size:13.5px;font-weight:600}
.dw-colour-ref{flex:none;width:52px;height:52px;object-fit:cover;
  border-radius:var(--r-xs);border:1px solid var(--line);background:var(--paper-2)}
.dw-tag{font-family:var(--d);font-size:11px;font-weight:500;
  text-transform:uppercase;letter-spacing:.05em;background:var(--paper-2);
  color:var(--ink-2);padding:2px 7px;border-radius:5px}
.dw-tag.quiet{background:transparent;border:1px solid var(--line);
  color:var(--ink-3)}

/* -- fact lists: label over value ------------------------------------------ */
.dw-facts{margin:8px 0 0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:7px 14px}
.dw-facts.wide{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
.dw-facts>div{min-width:0}
.dw-facts dt{font-family:var(--d);font-size:11px;font-weight:500;
  text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin:0 0 2px}
.dw-facts dd{margin:0;font-size:12px;color:var(--ink);line-height:1.4}
.dw-facts dd.mono{font-family:var(--d);font-variant-numeric:tabular-nums}
.dw-note-line{margin:8px 0 0;font-size:12.5px;color:var(--ink-2);line-height:1.5}
.dw-unknown{font-family:var(--d);font-size:11px;color:var(--ink-3)}

/* -- silhouettes ------------------------------------------------------------ */
.dw-sils{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.dw-sil{position:relative;display:flex;flex-direction:column;
  background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-sm);overflow:hidden}
.dw-sil-ref{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;
  background:var(--paper-2)}
.dw-sil-body{padding:10px 12px 12px}
.dw-sil>.dir-x,.dw-plate>.dir-x{position:absolute;top:6px;right:6px;width:24px;
  height:24px;display:flex;align-items:center;justify-content:center;padding:0;
  background:var(--surface);border-radius:99px;box-shadow:var(--shadow)}

/* -- the photo-less placeholder, honest by design --------------------------- */
.dw-photo{display:flex;align-items:center;justify-content:center;flex:none;
  background:var(--paper-2);color:var(--ink-3);font-family:var(--d);
  font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.dw-sil>.dw-photo{width:100%;aspect-ratio:4/5}
.dw-mat-head .dw-photo{width:56px;height:56px;border-radius:var(--r-xs)}
.dw-photo.sm{width:44px;height:44px;border-radius:var(--r-xs)}

/* -- fabrics ---------------------------------------------------------------- */
.dw-mats{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.dw-mat{display:flex;flex-direction:column;gap:10px;min-width:0;
  background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:var(--s4)}
.dw-mat.warn{border-left:3px solid var(--warning)}
.dw-mat.bad{border-left:3px solid var(--danger)}
/* ⚠ THE BADGE STARVED THE NAME. flex:1 with min-width:0 lets the title shrink
   to NOTHING, and SOURCEABILITY_LABEL.blocked is 35 characters — so in a
   three-across grid the title box measured 4px wide (0px on the third card)
   and its text painted straight across the badge. Measured in the browser,
   not guessed: getBoundingClientRect gave 330..334 for a 264px badge.
   The floor is the fix — the badge wraps to its own line before the fabric's
   name gives up any more width, because the name is the thing being read.
   ⚠ NO BACKTICKS IN THIS BLOCK: it is a JS template literal, and one closed
   the string and took the whole app down to a black screen. */
.dw-mat-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.dw-mat-title{flex:1 1 150px;min-width:150px;display:flex;flex-direction:column;gap:2px}
.dw-mat-title b{overflow-wrap:anywhere}
.dw-mat-title>b{font-size:14px;font-weight:700}
.dw-mat-code{font-family:var(--d);font-size:11px;color:var(--ink-3)}
.dw-chips{display:flex;flex-wrap:wrap;gap:6px}
.dw-chip{font-family:var(--d);font-size:11px;text-transform:uppercase;
  letter-spacing:.04em;background:var(--paper-2);color:var(--ink-2);
  padding:3px 8px;border-radius:5px}

/* -- the conflict, drawn as two measured bars ------------------------------- */
.dw-conflict{display:flex;flex-direction:column;gap:8px;margin-top:2px;
  border-top:1px dashed var(--hair-2);padding-top:10px}
.dw-conflict-case{display:flex;flex-direction:column;gap:6px}
.dw-bars{display:flex;flex-direction:column;gap:6px;max-width:520px}
.dw-bar{display:grid;grid-template-columns:minmax(110px,150px) 1fr auto;
  align-items:center;gap:10px}
.dw-bar-label{font-size:12px;color:var(--ink-2);line-height:1.3}
.dw-bar-track{display:block;height:8px;background:var(--paper-2);
  border-radius:99px;overflow:hidden}
.dw-bar-fill{display:block;height:100%;border-radius:99px;background:var(--ink-2)}
.dw-bar.need .dw-bar-fill{background:var(--warning)}
.dw-conflict.bad .dw-bar.need .dw-bar-fill{background:var(--danger)}
.dw-bar-value{font-family:var(--d);font-size:11.5px;
  font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
.dw-acts{display:flex;flex-wrap:wrap;gap:8px}
.dw-act{font-family:var(--ui);font-size:12.5px;font-weight:600;color:var(--ink);
  background:var(--surface);border:1px solid var(--hair-2);
  border-radius:var(--r-sm);padding:7px 12px;cursor:pointer}
.dw-act:hover{border-color:var(--ink-3)}
.dw-act:disabled{opacity:.45;cursor:not-allowed}

/* -- tallies ---------------------------------------------------------------- */
.dw-tally{display:flex;flex-wrap:wrap;gap:16px;font-size:12.5px}
.dw-tally-item{display:inline-flex;align-items:baseline;gap:6px;
  color:var(--ink-2)}
.dw-tally-item b{font-family:var(--d);font-size:15px;
  font-variant-numeric:tabular-nums}
.dw-tally-item.ok b{color:var(--positive)}
.dw-tally-item.warn b{color:var(--warning)}
.dw-tally-item.bad b{color:var(--danger)}

/* -- reference plates -------------------------------------------------------- */
.dw-board{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.dw-plate{position:relative;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-sm);overflow:hidden}
.dw-plate img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;
  background:var(--paper-2)}
.dw-plate-cap{display:flex;flex-direction:column;gap:3px;padding:9px 11px 11px}
.dw-plate-cap b{font-size:12.5px;font-weight:600;line-height:1.35}

/* -- rules ------------------------------------------------------------------- */
.dw-rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
  gap:18px}
.dw-rule-col{min-width:0}
.dw-rule-col ul{list-style:none;margin:0;padding:0;display:flex;
  flex-direction:column;gap:8px}
.dw-rule{background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:10px 12px}
.dw-rule-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dw-rule-top b{font-size:13px}
.dw-rule .dw-note-line{margin-top:4px}

/* -- add triggers: quiet, dashed, never blue --------------------------------- */
.dw-add-trigger{align-self:flex-start;display:inline-flex;align-items:center;
  gap:7px;font-family:var(--ui);font-size:13px;color:var(--ink-2);
  background:transparent;border:1px dashed var(--hair-2);
  border-radius:var(--r-sm);padding:9px 14px;cursor:pointer}
.dw-add-trigger:hover{border-color:var(--ink-3);color:var(--ink)}
.dw-add-trigger span{font-size:14px;line-height:1;color:var(--ink-3)}

/* -- drawer ------------------------------------------------------------------ */
.dw-scrim{position:fixed;inset:0;z-index:80;background:rgba(23,24,28,.28);
  display:flex;justify-content:flex-end}
.dw-drawer{width:min(420px,100%);height:100%;display:flex;flex-direction:column;
  gap:var(--s4);background:var(--surface);border-left:1px solid var(--line);
  box-shadow:var(--shadow-lg);padding:var(--s5);overflow-y:auto}
.dw-drawer-head{display:flex;align-items:center;justify-content:space-between;
  gap:10px}
.dw-drawer-head h4{margin:0;font-family:var(--disp);font-size:17px;
  font-weight:700}
.dw-close{background:transparent;border:0;padding:2px 6px;font-size:20px;
  line-height:1;color:var(--ink-3);cursor:pointer}
.dw-close:hover{color:var(--ink)}
.dw-drawer-note{margin:0;font-size:12.5px;color:var(--ink-2);line-height:1.5}
.dw-drawer-body{flex:1;display:flex;flex-wrap:wrap;gap:14px;
  align-content:flex-start}
.dw-drawer-foot{display:flex;align-items:center;gap:10px;
  border-top:1px solid var(--line);padding-top:var(--s4)}
.dw-ghost{background:transparent;border:0;padding:8px 10px;font-size:13px;
  color:var(--ink-2);cursor:pointer}
.dw-ghost:hover{color:var(--ink)}

/* -- fields ------------------------------------------------------------------ */
.dw-field{display:flex;flex-direction:column;gap:5px;flex:1 1 150px;min-width:0}
.dw-field.wide{flex-basis:100%}
.dw-field:has(.dw-choice){flex-basis:100%}
.dw-field-label{font-family:var(--d);font-size:11px;font-weight:500;
  text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)}
.dw-field-hint{font-size:11px;color:var(--ink-3);line-height:1.45}
.dw-input,.dw-num input{width:100%;font-family:var(--ui);font-size:14px;
  color:var(--ink);background:var(--paper-2);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:10px 12px}
.dw-input:focus,.dw-num input:focus{outline:none;border-color:var(--cobalt)}
.dw-num{position:relative;display:flex;align-items:center}
.dw-num input{padding-right:36px}
.dw-num-unit{position:absolute;right:12px;font-family:var(--d);font-size:12px;
  color:var(--ink-3);pointer-events:none}

/* -- choice chips: the whole vocabulary, visible ----------------------------- */
.dw-choice{display:flex;flex-wrap:wrap;gap:7px}
.dw-opt{display:inline-flex;align-items:center;gap:6px;font-family:var(--ui);
  font-size:12.5px;color:var(--ink-2);background:var(--surface);
  border:1px solid var(--line);border-radius:99px;padding:7px 14px;
  cursor:pointer}
.dw-opt:hover{border-color:var(--ink-3);color:var(--ink)}
.dw-opt.on{background:var(--ink);border-color:var(--ink);color:#fff}
.dw-opt-hint{font-size:11px;color:var(--ink-3)}
.dw-opt.on .dw-opt-hint{color:#fff;opacity:.75}

/* -- toggle ------------------------------------------------------------------ */
.dw-toggle{display:inline-flex;align-items:center;gap:9px;padding:0;border:0;
  background:transparent;font-family:var(--ui);font-size:13px;color:var(--ink);
  cursor:pointer;text-align:left}
.dw-toggle-box{position:relative;flex:none;width:34px;height:20px;
  border-radius:99px;background:var(--hair-2);transition:background .15s}
.dw-toggle-box::after{content:"";position:absolute;top:2px;left:2px;width:16px;
  height:16px;border-radius:50%;background:#fff;transition:left .15s;
  box-shadow:0 1px 2px rgba(23,24,28,.2)}
.dw-toggle.on .dw-toggle-box{background:var(--ink)}
.dw-toggle.on .dw-toggle-box::after{left:16px}

/* -- colour picker ----------------------------------------------------------- */
.dw-picker{display:flex;align-items:flex-end;gap:12px;flex:1 1 100%}
.dw-picker-swatch{position:relative;flex:none;width:52px;height:52px;
  border-radius:var(--r-xs);border:1px solid var(--line);cursor:pointer;
  overflow:hidden}
.dw-picker-swatch input{position:absolute;inset:0;opacity:0;cursor:pointer}
.dw-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;
  padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* -- file input -------------------------------------------------------------- */
.dw-file{display:block;font-size:13px;color:var(--ink-2);text-align:center;
  background:var(--paper-2);border:1px dashed var(--hair-2);
  border-radius:var(--r-sm);padding:12px;cursor:pointer}
.dw-file:hover{border-color:var(--ink-3);color:var(--ink)}
.dw-file input{display:none}

/* -- material picker list ----------------------------------------------------- */
.dw-pick-list{list-style:none;margin:0;padding:0;flex:1 1 100%;display:flex;
  flex-direction:column;gap:8px;max-height:320px;overflow-y:auto}
.dw-pick{width:100%;display:flex;align-items:center;gap:10px;text-align:left;
  font-family:var(--ui);background:var(--surface);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:9px 11px;cursor:pointer}
.dw-pick:hover{border-color:var(--ink-3)}
.dw-pick.on{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.dw-pick-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.dw-pick-body b{font-size:13px}
`;

// --------------------------------------------------------------------------- //
// the screen
// --------------------------------------------------------------------------- //

export default function Direction({ onNavigate }) {
  const brandId = useBrandId();
  const { activeId, loading: collLoading, reachable, error: collError } = useCollection();
  const { authenticated } = useIdentity();

  const [data, setData] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [materialsError, setMaterialsError] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!brandId || !activeId) { setState({ loading: false, error: null }); return; }
    setState({ loading: true, error: null });
    try {
      const payload = await dir.getDirection(brandId, activeId);
      setData(payload);
      try {
        const m = await dir.listMaterials(brandId);
        setMaterials(Array.isArray(m?.materials) ? m.materials : []);
        setMaterialsError(null);
      } catch (e) {
        // A failure to read the material sheet is NOT "the brand has no
        // fabrics". Reported separately so the screen can say which it is.
        setMaterials([]);
        setMaterialsError(String(e.message || e));
      }
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId, activeId]);

  useEffect(() => { load(); }, [load]);

  const a = useMemo(() => dir.affordances(data), [data]);
  const version = data?.working_version || null;
  const items = data?.items || null;

  // Every mutation re-reads. The engine recomputes sourceability and
  // reconciliation on each read, and a locally patched item would be the first
  // step back towards a browser that disagrees with the server.
  const act = useCallback(async (fn) => {
    setNotice(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice(String(e.message || e));
    }
  }, [load]);

  if (!brandId) {
    return <Empty>
      La dirección de una colección la guarda el motor. Sin conexión no hay nada
      que mostrar — y un borrador local sería exactamente el problema que esto
      viene a resolver.
    </Empty>;
  }
  if (collLoading || state.loading) return <Empty>Leyendo la colección…</Empty>;
  if (!activeId) {
    return reachable === false
      ? <Empty>
          No pudimos leer las colecciones de esta marca ({collError}). Puede que
          haya colecciones y no las estemos viendo.
        </Empty>
      : <Empty>Elegí una colección.</Empty>;
  }
  if (state.error) return <Empty>No se pudo leer: {state.error}</Empty>;

  if (!data?.exists) {
    return (
      <div className="dir dirw">
        <style dangerouslySetInnerHTML={{ __html: DW_CSS }} />
        <Empty>Esta colección todavía no tiene una dirección creada.</Empty>
        <button className="cc-act"
                onClick={() => act(() => dir.openDirection(brandId, activeId, {}))}>
          Crear la dirección →
        </button>
        {notice && <p className="dir-warn">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="dir dirw">
      <style dangerouslySetInnerHTML={{ __html: DW_CSS }} />
      <div className="dir-head dw-masthead">
        <span className="eyebrow">Dirección de la colección</span>
        <h2>{version?.headline || <Unknown>sin título</Unknown>}</h2>
        <p>
          <b>{STATUS_LABEL[data.status] || data.status}</b>
          {version && <> · versión {version.version_number}</>}
          {version?.approved_by && (
            <>
              {" "}· aprobó {version.approved_by}
              {version.approved_by_verified
                ? " · identidad verificada"
                : " · sin verificar"}
            </>
          )}
        </p>

        {a.frozen && (
          <div className="dir-note">
            Esta versión está aprobada y congelada — es la que gobierna y contra
            la que se condiciona una generación. Para cambiar algo se abre la
            versión siguiente, que copia todo lo elegido; esta no se toca.
          </div>
        )}

        {(data.readiness?.gaps || []).length > 0 && (
          <div className="dir-gaps">
            <b>Decisiones sin resolver</b>
            <ul>
              {data.readiness.gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        )}

        <div className="dir-actions">
          {items && onNavigate && (
            <button className="cc-act"
                    onClick={() => onNavigate("studio")}
                    title="Studio usará esta versión, sus reglas y sólo las referencias con derechos compatibles">
              Generar conceptos con esta dirección →
            </button>
          )}
          {a.submittable && (
            <button className="cc-act"
                    onClick={() => act(() => dir.submitVersion(brandId, version.id))}>
              Mandar a revisión →
            </button>
          )}
          {a.approvable && (
            <button className="cc-act" disabled={!authenticated}
                    title={authenticated ? undefined
                      : "Aprobar necesita una identidad verificada"}
                    onClick={() => act(() => dir.approveVersion(brandId, version.id))}>
              Aprobar la dirección →
            </button>
          )}
          {a.approvable && (
            <button className="cc-act ghost"
                    onClick={() => act(() => dir.requestChanges(brandId, version.id))}>
              Pedir cambios
            </button>
          )}
          {a.canOpenNextVersion && (
            <button className="cc-act"
                    onClick={() => act(() => dir.nextVersion(brandId, data.id, {}))}>
              Abrir la versión siguiente →
            </button>
          )}
        </div>

        {notice && <p className="dir-warn">{notice}</p>}
      </div>

      {items && (
        <div className="dir-note">
          <b>Handoff al Director de colección.</b>{" "}
          Studio toma esta versión como espacio inicial: siluetas × telas ×
          colores, suma el clima y las reglas al prompt, y usa sólo referencias
          propias, licenciadas o provistas por el proveedor. Si el plan de rango
          tiene filas, propone esa cantidad inicial de conceptos. Eso no es una
          predicción de compra: las unidades siguen siendo las que el equipo
          confirma en Rango. Si las ventas se pueden vincular a SKUs con talle,
          Atelier muestra la curva observada y reparte ese total; si no, deja el
          faltante visible.
        </div>
      )}

      {/* The wall reads the way the work does: what it looks like, then what it
          is made of, then what it costs. Imagery first, tables last. */}
      {items && (
        <>
          <References refs={items.references} vocab={data.vocabularies}
                      editable={a.editable}
                      onAdd={(r) => act(() => dir.addReference(brandId, version.id, r))}
                      onRemove={(g, id) => act(() => dir.removeItem(brandId, version.id, g, id))} />

          <Palette colours={items.colours} editable={a.editable}
                   refs={items.references}
                   roles={data.vocabularies?.colour_roles}
                   onAdd={(c) => act(() => dir.addColour(brandId, version.id, c))}
                   onRemove={(g, id) => act(() => dir.removeItem(brandId, version.id, g, id))} />

          <Silhouettes silhouettes={items.silhouettes} editable={a.editable}
                       refs={items.references}
                       onAdd={(s) => act(() => dir.addSilhouette(brandId, version.id, s))}
                       onRemove={(g, id) => act(() => dir.removeItem(brandId, version.id, g, id))} />

          <Fabrics fabrics={items.fabrics} materials={materials}
                   materialsError={materialsError} editable={a.editable}
                   basis={data.basis} onNavigate={onNavigate}
                   onAdd={(f) => act(() => dir.addFabric(brandId, version.id, f))}
                   onRemove={(g, id) => act(() => dir.removeItem(brandId, version.id, g, id))} />

          <Rules all={items.rules} vocab={data.vocabularies} editable={a.editable}
                 onAdd={(r) => act(() => dir.addRule(brandId, version.id, r))}
                 onRemove={(g, id) => act(() => dir.removeItem(brandId, version.id, g, id))} />

          <PriceBands bands={items.price_bands} reconciliation={data.reconciliation}
                      editable={a.editable}
                      onAdd={(b) => act(() => dir.addPriceBand(brandId, version.id, b))}
                      onRemove={(g, id) => act(() => dir.removeItem(brandId, version.id, g, id))} />

          <CommercialGuidance guidance={data.commercial_guidance} />
        </>
      )}

      <p className="cc-foot">
        Nada de esta pantalla vive en este navegador: cada elección la guarda el
        motor y la puede leer cualquiera del equipo. Los veredictos de compra y la
        comparación con el plan los calcula el motor — acá sólo se ordenan, porque
        dos pantallas que calculan lo mismo terminan diciendo cosas distintas.
      </p>
    </div>
  );
}
