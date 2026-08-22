"use client";
// El equipo de criterio — the panel, rendered as a panel.
//
// THE DESIGN RULE: this never produces a headline. No score, no verdict, no
// "recommended" badge. Every role speaks for itself, with its name on what it
// said and with the evidence it was allowed to see stated underneath — and the
// roles that had nothing to go on are shown just as prominently as the ones
// that did.
//
// That last part is the whole argument. A panel where three roles abstained is
// telling you something true about how much you actually know, and a UI that
// quietly dropped the silent ones would turn "we are deciding on very little"
// into "everyone who spoke was in favour".
import { useCallback, useEffect, useState } from "react";

import { useEngine, useBrandId } from "@/components/EngineProvider";
import { ACTION_LABEL, POSITION_LABEL, getTasteTeam } from "@/lib/tasteTeam";

// Objections first. The order is the argument: a panel sorted by agreement
// would bury the one role that found the problem.
const ORDER = { object: 0, concern: 1, support: 2, abstain: 3 };

function Position({ p }) {
  return (
    <article className={`tt-role ${p.position}`}>
      <header>
        <b>{p.label}</b>
        <span className={`tt-pos ${p.position}`}>
          {POSITION_LABEL[p.position] || p.position}
        </span>
      </header>
      <p className="tt-said">{p.headline}</p>
      {p.reasons?.length > 0 && (
        <ul className="tt-reasons">
          {p.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      {p.citations?.length > 0 && (
        <p className="tt-cite">{p.citations.join(" · ")}</p>
      )}
      {/* An abstention that does not say what it lacked is indistinguishable
          from a role that failed to run. */}
      {p.lacked?.length > 0 && (
        <ul className="tt-lacked">
          {p.lacked.map((l, i) => <li key={i}>le faltó: {l}</li>)}
        </ul>
      )}
      {/* Stated on every card, always: what this role was allowed to look at.
          It is what makes the panel legible as a panel rather than as one
          model talking to itself in eight voices. */}
      <p className="tt-boundary">habla sólo desde: {p.evidence_boundary}</p>
    </article>
  );
}

export default function TasteTeam({ slotId }) {
  const engine = useEngine();
  const brandId = useBrandId();
  const [data, setData] = useState(null);
  const [state, setState] = useState({ loading: false, error: null });

  const load = useCallback(async () => {
    if (!brandId || !slotId) { setData(null); return; }
    setState({ loading: true, error: null });
    try {
      setData(await getTasteTeam(brandId, slotId));
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId, slotId]);

  useEffect(() => { load(); }, [load]);

  if (!brandId || !slotId) return null;
  if (state.loading) return <p className="cc-empty">Convocando al equipo…</p>;
  if (state.error) return <p className="cc-empty">No se pudo convocar: {state.error}</p>;
  if (!data) return null;

  const s = data.synthesis;
  const positions = [...data.positions].sort(
    (a, b) => ORDER[a.position] - ORDER[b.position]);

  return (
    <section className="tt">
      <div className="tt-head">
        <h3>Equipo de criterio · {data.subject?.slot_code}</h3>
        <p>
          {/* The honest headline: not a verdict, but how much of the panel had
              standing to speak at all. */}
          {s.roles_with_evidence} de {s.roles_total} roles tuvieron evidencia
          para opinar.
        </p>
      </div>

      <div className={`tt-decision ${s.required_action}`}>
        <b>{ACTION_LABEL[s.required_action] || s.required_action}</b>
        <p>{s.decision_required}</p>
        <p className="tt-note">{s.note}</p>
      </div>

      <div className="tt-grid">
        {positions.map((p) => <Position key={p.role} p={p} />)}
      </div>
    </section>
  );
}
