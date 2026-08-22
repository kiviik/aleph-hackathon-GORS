"use client";
// "Lectura de Atelier" — the right rail that appears on every reference design.
//
// THIS COMPONENT INVENTS NOTHING. It renders exactly the sections it is handed
// and omits the rest, so a screen with thin evidence produces a short rail
// rather than a padded one. That is deliberate: the rail is where the product
// says what it believes AND what it does not know, and a confident-looking
// rail over missing evidence would be the one failure mode this product cannot
// afford.
//
// Section order is fixed on purpose, because it is an argument:
//   interpretation → what Atelier reads
//   signals        → what supports it, each with its own source
//   against        → what contradicts it            (never optional-by-omission)
//   unknowns       → what would change the answer
//   traceability   → where all of it came from, and when
import Icon from "./Icon";

function Row({ icon = "target", label, text, tone }) {
  return (
    <div className={`ax-rrow${tone === "warn" ? " warn" : ""}`}>
      <Icon name={icon} />
      <span>{label && <b>{label}</b>}{label && text ? " · " : ""}{text}</span>
    </div>
  );
}

export default function AtelierRead({
  interpretation,
  signals = [],
  against = [],
  unknowns = [],
  trace = [],
  owner,
  footer,
  title = "Lectura de Atelier",
}) {
  const empty =
    !interpretation && !signals.length && !against.length && !unknowns.length && !trace.length;

  return (
    <aside className="ax-read" aria-label={title}>
      <h2>{title}</h2>

      {empty && (
        // An empty rail says so. It does not fill itself with the screen's own
        // numbers restated, which is how a "reading" becomes decoration.
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Todavía no hay una lectura para esta pantalla. Aparece cuando hay evidencia
          conectada que interpretar — no se construye con los mismos números de arriba.
        </p>
      )}

      {interpretation && (
        <section>
          <span className="ax-label">Interpretación de Atelier</span>
          <div className="ax-interp">
            <Icon name="spark" />
            <span>{interpretation}</span>
          </div>
        </section>
      )}

      {signals.length > 0 && (
        <section>
          {signals.map((s, i) => (
            <Row key={i} icon={s.icon} label={s.label} text={s.text} />
          ))}
        </section>
      )}

      {against.length > 0 && (
        <section className="warn">
          <span className="ax-label">Qué contradice</span>
          {against.map((a, i) => (
            <Row key={i} icon="warn" text={typeof a === "string" ? a : a.text} tone="warn" />
          ))}
        </section>
      )}

      {unknowns.length > 0 && (
        <section>
          <span className="ax-label">Qué falta saber</span>
          <ul>
            {unknowns.map((u, i) => (
              <li key={i}>{typeof u === "string" ? u : u.text}</li>
            ))}
          </ul>
        </section>
      )}

      {trace.length > 0 && (
        <section>
          <span className="ax-label">Trazabilidad</span>
          {trace.map((t, i) => (
            <Row key={i} icon={t.icon || "doc"} label={t.label} text={t.text} />
          ))}
        </section>
      )}

      {owner && (
        <section>
          <span className="ax-label">Responsable</span>
          <Row icon="user" label={owner.name} text={owner.role} />
        </section>
      )}

      {footer}
    </aside>
  );
}
