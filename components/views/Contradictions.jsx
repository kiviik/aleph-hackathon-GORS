"use client";
// LO QUE NO CIERRA — everything about this collection that does not add up.
//
// 2026-08-07. This screen exists to answer the owner's own test of whether the
// product is worth a brand's Thursday: *can Atelier show a brand something
// wrong in its own data that it did not already know, within an hour?*
//
// It is a COLLECTOR, not an analyst. Every row was already decided somewhere —
// the plan engine's approval issues, the approvals ledger, the brief's own
// evidence links, a launch's SKU match, an import's unmatched codes. This
// screen adds no rule, and it does not even re-sort: the order arrives computed
// from the engine's blocker/warning split, the counted blast radius, and the
// brand's own learned resolution rate. A fourth opinion formed in the browser
// would be the one nobody could trace.
//
// TWO THINGS IT MUST NEVER CONFLATE, and the whole screen is built around them:
//   · "we checked and found nothing" vs "we had nothing to check". Every answer
//     carries `checked` — plan version, slots, concepts, launches, brief — so an
//     empty list on a collection with no plan reads as the second, not the first.
//   · a measured rate vs an assumed one. `resolution_rate` is null unless the
//     brand's own history earned it, and a null is simply not shown. It is never
//     rendered as 0%, and never as "average".
import { useCallback, useEffect, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine } from "@/components/EngineProvider";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import {
  FAMILY_LABEL, WHERE_LABEL, familyOf, getContradictions, rateText,
} from "@/lib/contradictions";

const FAMILY_ORDER = ["plan", "approval", "brief", "launch", "import", "otro"];

function Row({ finding, onNavigate }) {
  const rate = rateText(finding.resolution_rate);
  return (
    <li className={`nc-row${finding.blocking ? " blocking" : ""}`}>
      <span className={`nc-flag ${finding.blocking ? "bad" : "warn"}`}>
        <Icon name={finding.blocking ? "warn" : "clock"} />
        {finding.blocking ? "Bloquea" : "Aviso"}
      </span>

      <div className="nc-main">
        <b>{finding.detail}</b>
        <span className="nc-subject">{finding.subject}</span>

        {/* Where it came from and what could not be seen — the pair that keeps
            "nothing found" and "nothing checked" apart, per row as well as per
            screen. */}
        {finding.basis?.length > 0 && (
          <span className="nc-basis">
            <Icon name="doc" />{finding.basis.join(" · ")}
          </span>
        )}
        {finding.missing?.length > 0 && (
          <span className="nc-missing">
            <Icon name="lock" />falta: {finding.missing.join(" · ")}
          </span>
        )}
        {/* Shown only when the engine earned it. There is no "average" fallback
            and no 0% — an unmeasured kind simply says nothing here. */}
        {rate && <span className="nc-rate"><Icon name="trend" />{rate}</span>}
      </div>

      <div className="nc-side">
        {finding.radius > 1 && (
          <span className="nc-radius" title="cuántos objetos frena">
            {finding.radius} afectados
          </span>
        )}
        {finding.where && onNavigate && (
          <button className="nc-go" onClick={() => onNavigate(finding.where)}>
            {WHERE_LABEL[finding.where] || finding.where} <Icon name="arrow" />
          </button>
        )}
      </div>
    </li>
  );
}

export default function Contradictions({ onNavigate }) {
  const engine = useEngine();
  const { activeId, active } = useCollection();
  const brandId = engine.brandId;

  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    if (!brandId || !activeId) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ loading: false, data: await getContradictions(brandId, activeId), error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: String(e.message || e) });
    }
  }, [brandId, activeId]);

  useEffect(() => {
    load();
  }, [load]);

  const data = state.data;
  const findings = data?.findings || [];
  const checked = data?.checked || {};
  const blocking = data?.blocking || 0;
  const warnings = findings.length - blocking;

  // What was actually looked at. If this is empty there was nothing to check,
  // and the screen says that instead of "todo en orden".
  const looked = [
    checked.plan_version && `plan ${checked.plan_version}`,
    checked.slots ? `${checked.slots} línea(s)` : null,
    checked.concepts ? `${checked.concepts} concepto(s)` : null,
    checked.launches ? `${checked.launches} lanzamiento(s)` : null,
    checked.brief ? "el brief" : null,
  ].filter(Boolean);

  useChrome({
    read: data
      ? {
          interpretation: findings.length
            ? `${blocking} de ${findings.length} hallazgo(s) bloquean una aprobación. El orden no es una opinión: primero lo que el motor marca como bloqueo, después cuántos objetos frena, y al final lo que tu marca suele resolver.`
            : looked.length
              ? `Se revisó ${looked.join(", ")} y no quedó nada sin cerrar. Eso es un resultado, no una pantalla vacía.`
              : "No había nada que revisar todavía en esta colección.",
          signals: [
            { icon: "warn", label: "Bloqueos", text: String(blocking) },
            { icon: "clock", label: "Avisos", text: String(warnings) },
            ...(data.learned_kinds?.length
              ? [{ icon: "trend", label: "Tipos con historial propio", text: String(data.learned_kinds.length) }]
              : []),
          ],
          unknowns: [
            ...(data.learned_kinds?.length
              ? []
              : ["Todavía no hay suficiente historial de esta marca para saber qué tipo de hallazgo suele resolver. Hasta que lo haya, el orden usa sólo lo que el motor ya decidió y lo que se puede contar."]),
            ...(checked.plan_version ? [] : ["Esta colección no tiene una versión de plan: nada del plan pudo revisarse."]),
          ],
          trace: [
            { icon: "doc", label: "Origen", text: "reglas del plan, ledger de aprobaciones, evidencia del brief, SKU de lanzamiento e importaciones" },
            { icon: "shield", label: "Regla", text: "esta pantalla no evalúa nada por su cuenta; junta lo que ya estaba decidido" },
          ],
        }
      : null,
  }, [data?.findings?.length, blocking, data?.learned_kinds?.length, checked.plan_version]);

  const frame = (children) => (
    <section className="nc">
      <div className="ax-crumb">
        <b>{engine.brandName || "Atelier"}</b><span>·</span>Lo que no cierra
      </div>
      {children}
    </section>
  );

  if (state.loading) {
    return frame(<><div className="ax-sk line w45" /><div className="ax-sk title" /><div className="ax-sk block" /></>);
  }
  if (!brandId) {
    return frame(<>
      <h1 className="ax-h1">Esto se calcula en el motor</h1>
      <p className="ax-lede">
        Cada hallazgo sale de una regla que ya existe del lado del motor. Sin
        conexión no hay nada que juntar.
      </p>
    </>);
  }
  if (!activeId) {
    return frame(<>
      <h1 className="ax-h1">Elegí una colección</h1>
      <p className="ax-lede">Lo que no cierra se revisa por colección.</p>
    </>);
  }
  if (state.error) {
    return frame(<>
      <h1 className="ax-h1">No se pudo revisar</h1>
      <p className="ax-lede">{state.error}</p>
    </>);
  }

  const groups = FAMILY_ORDER
    .map((family) => [family, findings.filter((f) => familyOf(f.kind) === family)])
    .filter(([, rows]) => rows.length);

  return frame(
    <>
      <h1 className="ax-h1">Lo que no cierra</h1>
      <p className="ax-lede">
        Todo lo que no cuadra en {active?.name || "esta colección"}, junto, con
        su origen. Ninguna regla nueva: cada línea ya la había decidido el plan,
        el ledger de firmas, el brief, un lanzamiento o una importación.
      </p>

      <div className="nc-band">
        <div className="nc-cell">
          <span className="nc-cell-l">Bloquean una aprobación</span>
          <b className={blocking ? "bad" : "ok"}>{blocking}</b>
        </div>
        <div className="nc-cell">
          <span className="nc-cell-l">Avisos</span>
          <b className={warnings ? "warn" : "ok"}>{warnings}</b>
        </div>
        <div className="nc-cell wide">
          <span className="nc-cell-l">Qué se revisó</span>
          <b className="plain">{looked.length ? looked.join(" · ") : "nada todavía"}</b>
        </div>
      </div>

      {!findings.length ? (
        <div className="nc-clean">
          <Icon name={looked.length ? "check" : "lock"} />
          <div>
            <b>
              {looked.length
                ? "No quedó nada sin cerrar."
                : "Todavía no hay nada que revisar."}
            </b>
            <p>
              {looked.length
                ? `Se revisó ${looked.join(", ")} contra las reglas del motor y ninguna falló. Eso es un resultado, no una pantalla vacía.`
                : "Esta colección todavía no tiene plan, conceptos ni brief con los que contrastar. Una lista vacía acá no significa que esté todo bien: significa que no había nada que mirar."}
            </p>
          </div>
        </div>
      ) : (
        <div className="nc-groups">
          {groups.map(([family, rows]) => (
            <section key={family}>
              <header>
                <span className="ax-label">{FAMILY_LABEL[family]}</span>
                <span>{rows.length}</span>
              </header>
              <ul className="nc-list">
                {rows.map((f, i) => (
                  <Row key={`${f.kind}-${f.subject}-${i}`} finding={f} onNavigate={onNavigate} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>,
  );
}
