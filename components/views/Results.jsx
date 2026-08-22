"use client";
// Resultados — what we decided and what happened: Decisiones (the outcome
// ledger) and Pipeline (decided → en tienda). Thin wrapper; active tab lives
// in the hash (#/results:pipeline).
import Decisions from "./Decisions";
import Pipeline from "./Pipeline";

const TABS = [
  { id: "decisiones", label: "Decisiones" },
  { id: "pipeline", label: "Pipeline" },
];

export default function Results({ tab, onNavigate }) {
  const active = TABS.some((t) => t.id === tab) ? tab : TABS[0].id;
  return (
    <div className="nv2-sec">
      <nav className="nv2-tabs" aria-label="Resultados">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nv2-tab${active === t.id ? " on" : ""}`}
            onClick={() => onNavigate?.(`results:${t.id}`)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {active === "decisiones" && <Decisions onNavigate={onNavigate} />}
      {active === "pipeline" && <Pipeline onNavigate={onNavigate} />}
    </div>
  );
}
