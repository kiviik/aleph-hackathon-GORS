"use client";
// Centro de colección — the executive overview.
//
// The screen a merchandising director opens first: what this collection is
// trying to achieve, what stage it is in, what is blocked, what is over budget,
// which approvals are missing, which styles are at risk, whether it still fits
// its lead times, and the ONE decision that comes next.
//
// THE RULE: this component computes nothing. Every state, total, blocker and
// refusal comes from GET /collections/{id}/command-centre. A second
// implementation in React is a second answer, and when they disagree nobody
// knows which is right — the same rule the Range grid already follows.
//
// AND IT RENDERS THE REFUSALS. An answer the engine could not give arrives as
// `state: "unknown"` with `missing: [...]` naming the data that would give it.
// Those lines are shown as prominently as the answers, because "we don't know"
// is the most useful thing this screen can say when it is true — and a card
// that quietly renders a zero instead will be believed.
import { useCallback, useEffect, useState } from "react";

import { canQueryCollection } from "@/lib/collectionScope";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import {
  ACTION_VIEW, QUESTION_LABEL, STAGE_LABEL, STATE_LABEL, blockerText,
  getCommandCentre,
} from "@/lib/commandCentre";

// The two questions that lead. A director asks "what is this for" and "what do
// I do now" before anything else; the diagnostics answer the follow-up.
const HEADLINE_QUESTIONS = ["intent", "next_decision"];

function StatePill({ state }) {
  return <span className={`cc-pill ${state}`}>{STATE_LABEL[state] || state}</span>;
}

// `missing` is the honest half of every answer. It is styled as content, not as
// a disclaimer footnote, because on this screen it often IS the finding.
function Missing({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="cc-missing">
      {items.map((m, i) => <li key={i}>{m}</li>)}
    </ul>
  );
}

function Detail({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="cc-detail">
      {items.map((d, i) => (
        <li key={i}>
          {d.slot && <code>{d.slot}</code>}
          {/* A styles-at-risk entry carries every reason it was flagged. One
              reason per line: a merchandiser acts on reasons, not on codes. */}
          {Array.isArray(d.reasons)
            ? <span>{d.reasons.join(" · ")}</span>
            : <span>{blockerText(d)}</span>}
        </li>
      ))}
    </ul>
  );
}

function Card({ answer, onAct }) {
  const view = answer.action && ACTION_VIEW[answer.action.do];
  return (
    <section className={`cc-card ${answer.state}`}>
      <header>
        <h3>{QUESTION_LABEL[answer.question] || answer.question}</h3>
        <StatePill state={answer.state} />
      </header>
      <p className="cc-headline">
        {answer.question === "stage"
          ? (STAGE_LABEL[answer.headline] || answer.headline)
          : answer.headline}
      </p>
      <Detail items={answer.detail} />
      <Missing items={answer.missing} />
      {/* What it was computed FROM. Shown on green answers too: "we checked and
          found nothing" and "we had nothing to check" look identical without
          it. */}
      {answer.basis?.length > 0 && (
        <p className="cc-basis">Calculado sobre: {answer.basis.join(" · ")}</p>
      )}
      {view && (
        <button className="cc-act" onClick={() => onAct(view)}>
          {answer.action.label} →
        </button>
      )}
    </section>
  );
}

export default function CommandCentre({ onNavigate }) {
  const engine = useEngine();
  const { activeId, collections, loading: collectionsLoading,
          brandId: collectionsBrandId } = useCollection();
  const brandId = useBrandId();
  const [data, setData] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });

  const load = useCallback(async () => {
    // ⚠ `!brandId || !activeId` PASSED ON THE BRAND-SWITCH RENDER, where both
    // are truthy and belong to different tenants. The 404 that followed threw
    // into the catch below and put a real ERROR on screen for a question we
    // should not have asked. See lib/collectionScope.
    if (!canQueryCollection({ brandId, activeId, collections,
                              collectionsBrandId, loading: collectionsLoading })) {
      setData(null);
      // Loading while the collection list resolves; not an error, and not
      // "this collection has nothing".
      setState({ loading: Boolean(collectionsLoading), error: null });
      return;
    }
    setState({ loading: true, error: null });
    try {
      setData(await getCommandCentre(brandId, activeId));
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId, activeId, collections, collectionsBrandId, collectionsLoading]);

  useEffect(() => { load(); }, [load]);


  if (!brandId) {
    return (
      <p className="cc-empty">
        El centro de colección lo calcula el motor. Sin conexión no hay nada que
        mostrar — y un resumen inventado sería peor que ninguno.
      </p>
    );
  }
  if (collectionsLoading || state.loading) {
    return <p className="cc-empty">Leyendo la colección…</p>;
  }
  if (!collections.length) {
    return <p className="cc-empty">Todavía no hay colecciones. Creá una para empezar.</p>;
  }
  if (state.error) {
    return <p className="cc-empty">No se pudo leer la colección: {state.error}</p>;
  }
  if (!data) return <p className="cc-empty">Elegí una colección.</p>;

  const answers = data.order.map((q) => data.answers[q]);
  const headline = answers.filter((a) => HEADLINE_QUESTIONS.includes(a.question));
  const rest = answers.filter((a) => !HEADLINE_QUESTIONS.includes(a.question));
  const c = data.counts;

  return (
    <div className="cc">
      <div className="cc-top">
        <div>
          <h2>{data.collection_name}</h2>
          <p className="cc-asof">
            Estado al {data.as_of} · el estado de la colección es su PEOR
            respuesta, no un promedio — cinco tarjetas en verde no pueden tapar
            una bloqueada.
          </p>
        </div>
        <StatePill state={data.state} />
      </div>

      <div className="cc-lead">
        {headline.map((a) => <Card key={a.question} answer={a} onAct={onNavigate} />)}
      </div>

      <div className="cc-counts">
        <div><b>{c.slots}</b><span>filas del plan</span></div>
        <div><b>{c.slots_with_concept}</b><span>con concepto</span></div>
        <div><b>{c.concepts_approved}</b><span>conceptos aprobados</span></div>
        <div><b>{c.launches}</b><span>lanzamientos</span></div>
        {data.plan && (
          <div>
            <b>v{data.plan.version_number}</b>
            <span>plan · rev {data.plan.revision} · {data.plan.status}</span>
          </div>
        )}
      </div>

      <div className="cc-grid">
        {rest.map((a) => <Card key={a.question} answer={a} onAct={onNavigate} />)}
      </div>


      {/* The footer states the LIMIT of the panel, so it has to track what the
          engine can actually do. It used to say the critical path was
          untracked; migration 0038 made that false, and a stale caveat is a
          lie in the safe direction — which is still a lie. */}
      <p className="cc-foot">
        Lo que este panel <b>no</b> sabe lo dice en cada tarjeta, con el dato
        que faltaría para saberlo. “¿Llega a tiempo?” usa el calendario crítico
        cuando la colección tiene uno cargado, y si no, cae en la pregunta más
        angosta que las filas del plan sí pueden responder: si la entrega
        todavía entra en el lead time. Ninguna de las dos es un pronóstico.
      </p>
    </div>
  );
}
