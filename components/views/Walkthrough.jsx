"use client";
// Recorrido de la colección — the arc, in order.
//
// Atelier is made of screens. Each is correct on its own and none takes you
// anywhere: the Range screen does not know the brief is unapproved, the Review
// Room does not know nothing has been costed. A team new to the product
// experiences that as eight places to visit with no order, and the command
// centre — which knows the order — spends its answer on the single next
// decision and stops.
//
// This is that answer extended to the whole arc, and it computes nothing. Every
// status is an engine answer arranged, never a second opinion about whether a
// collection is ready. `lib/walkthrough.mjs` holds the arranging and is tested
// on its own.
import { useCallback, useEffect, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useBrandId } from "@/components/EngineProvider";
import { getCommandCentre } from "@/lib/commandCentre";
import { listImports } from "@/lib/imports";
import { CURRENT, DONE, SKIPPED, progress, walkthrough } from "@/lib/walkthrough.mjs";

const MARK = { done: "✓", current: "→", skipped: "!", waiting: "·" };

export default function Walkthrough({ onNavigate }) {
  const brandId = useBrandId();
  const { activeId, collections, loading, reachable, error: collError } = useCollection();
  const [data, setData] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });

  const load = useCallback(async () => {
    if (!brandId || !activeId) { setState({ loading: false, error: null }); return; }
    setState({ loading: true, error: null });
    try {
      // Both reads are the engine's own answers. Nothing is derived here that
      // another screen could disagree with.
      const [cc, imports] = await Promise.all([
        getCommandCentre(brandId, activeId),
        listImports(brandId).catch(() => null),
      ]);
      // `GET /brands/{id}/imports` answers `{imports, awaiting_confirmation,
      // kinds_incorporated}`. Reading the wrong key used to fall through to the
      // envelope itself, and an object with no `.filter` crashed the whole view
      // to a blank screen. An unrecognised shape degrades to "no imports" — the
      // step reads `waiting`, which is honest, instead of taking the screen down.
      setData({ cc, imports: Array.isArray(imports?.imports) ? imports.imports : [] });
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId, activeId]);

  useEffect(() => { load(); }, [load]);

  if (!brandId) {
    return <p className="cc-empty">
      El recorrido lo arma el motor a partir de lo que la colección tiene.
      Sin conexión no hay nada que ordenar.
    </p>;
  }
  if (loading || state.loading) return <p className="cc-empty">Leyendo la colección…</p>;
  if (!collections.length) {
    // "There are none" and "we could not ask" are different answers, and only
    // one of them is the brand's fault. Printing the first for the second is
    // the confident zero this product refuses everywhere else.
    return reachable === false ? (
      <p className="cc-empty">
        No pudimos leer las colecciones de esta marca ({collError}). Puede que
        haya colecciones y no las estemos viendo — esto <b>no</b> quiere decir
        que no existan.
      </p>
    ) : (
      <p className="cc-empty">Esta marca todavía no tiene colecciones.</p>
    );
  }
  if (state.error) return <p className="cc-empty">No se pudo leer: {state.error}</p>;
  if (!data) return <p className="cc-empty">Elegí una colección.</p>;

  const steps = walkthrough(data);
  const p = progress(steps);

  return (
    <div className="wt">
      <div className="wt-head">
        <h2>Recorrido · {data.cc.collection_name}</h2>
        <p>
          {p.done} de {p.total} pasos con su objeto ya creado.
          {p.current && <> Lo que sigue: <b>{p.current.title.toLowerCase()}</b>.</>}
        </p>
        {/* Bypassed steps are called out ABOVE the list, never folded into the
            count. Eight of eight with three skipped is not the same collection
            as eight of eight, and one number would make them look identical. */}
        {p.skipped.length > 0 && (
          <div className="wt-skipped">
            <b>{p.skipped.length} paso(s) quedaron atrás sin completarse</b> —
            algo posterior ya está hecho:{" "}
            {p.skipped.map((s) => s.title.toLowerCase()).join(" · ")}. No es un
            error del sistema; es lo que efectivamente pasó, y conviene saberlo
            antes de que lo pregunte otro.
          </div>
        )}
      </div>

      <ol className="wt-steps">
        {steps.map((step) => (
          <li key={step.key} className={`wt-step ${step.state}`}>
            <span className="wt-mark">{MARK[step.state]}</span>
            <div className="wt-body">
              <h3>{step.title}</h3>
              {/* WHY, not just what. A checklist that only lists actions
                  teaches nobody why the order is the order. */}
              <p className="wt-why">{step.why}</p>
              {step.evidence && <p className="wt-ev">{step.evidence}</p>}
              {(step.state === CURRENT || step.state === SKIPPED) && (
                <button className="cc-act" onClick={() => onNavigate?.(step.view)}>
                  {step.action} →
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="cc-foot">
        Ningún estado de esta lista se calcula acá: cada uno lee una respuesta
        que el motor ya dio sobre esta colección. Por eso un paso está hecho
        cuando el objeto existe — no cuando alguien tildó algo.
      </p>
    </div>
  );
}
