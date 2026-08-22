"use client";
// A labelled value — and the one rule that makes a form readable: whether you
// can change it must be visible before you click it.
//
// WHY THIS EXISTS. Owner design audit, 2026-08-12, from actually filling the
// brief and the range plan:
//
//   · *"Editable vs read-only is invisible: the Plan de rango header fields
//     render with tan fills that read as disabled while apparently being the
//     legacy targets editor."*
//   · *"Placeholder-as-value trap: Mercados showed grey 'AR, UY' that looked
//     filled but wasn't — I had to re-type it before saving."*
//
// Those are the same defect twice: the interface used the same visual language
// for "this is a value", "this is an example of a value" and "this cannot be
// changed". A person filling a governing document has to be able to tell.
//
// THE CONVENTION, which is the PLM one and is not negotiable per screen:
//
//   read-only  →  label + plain text. NO box. A box means you can type in it.
//   editable   →  label + white field with a border and a focus ring.
//   empty      →  the words "sin definir", in --ink-3, as TEXT — never a
//                 placeholder that mimics a filled value.
//
// ⚠ `placeholder` IS DELIBERATELY NOT A PROP. It is the trap. If a field needs
// to suggest a format, that is `hint`, which renders BELOW the input where it
// cannot be mistaken for content.
import { useId } from "react";

export default function Field({
  label,
  value,
  onChange,
  readOnly = false,
  hint,
  error,
  source,          // "Brief v1 (aprobado 12 ago)" — where a read-only value came from
  type = "text",
  required = false,
  children,        // for a custom control (TokenInput, select…) in the input slot
}) {
  const id = useId();
  const empty = value == null || value === "";

  if (readOnly) {
    return (
      <div className="ui-field ui-field-ro">
        <span className="ui-field-label">{label}</span>
        <span className={`ui-field-value${empty ? " empty" : ""}`}>
          {empty ? "sin definir" : value}
        </span>
        {/* ⚠ A read-only value owes the reader its origin. Otherwise it reads
            as a locked field somebody is refusing to let you edit, rather than
            as a fact derived from a document you already approved. */}
        {source && <span className="ui-field-source">{source}</span>}
      </div>
    );
  }

  return (
    <div className={`ui-field${error ? " has-error" : ""}`}>
      <label className="ui-field-label" htmlFor={id}>
        {label}{required && <em aria-hidden="true"> ·</em>}
      </label>
      {children || (
        <input
          id={id}
          className="ui-input"
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={hint || error ? `${id}-help` : undefined}
        />
      )}
      {(hint || error) && (
        <span id={`${id}-help`} className={`ui-field-help${error ? " error" : ""}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
