"use client";
// Conceptos — from evidence to designed concept: Propuestas (the decision
// feed), Studio (design workspace), Cápsulas (evidence-grounded capsules).
// Thin wrapper; active tab lives in the hash (#/concepts:studio).
import Feed from "./Feed";
import DesignStudio from "./DesignStudio";
import Collections from "./Collections";

const TABS = [
  { id: "propuestas", label: "Propuestas" },
  { id: "studio", label: "Studio" },
  { id: "capsulas", label: "Cápsulas" },
];

export default function Concepts({ tab, onNavigate }) {
  const active = TABS.some((t) => t.id === tab) ? tab : TABS[0].id;
  return (
    <div className="nv2-sec">
      <nav className="nv2-tabs" aria-label="Conceptos">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nv2-tab${active === t.id ? " on" : ""}`}
            onClick={() => onNavigate?.(`concepts:${t.id}`)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {active === "propuestas" && <Feed onNavigate={onNavigate} />}
      {active === "studio" && <DesignStudio onNavigate={onNavigate} />}
      {active === "capsulas" && <Collections onNavigate={onNavigate} />}
    </div>
  );
}
