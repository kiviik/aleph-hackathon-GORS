"use client";
// Mercado — one section for everything the market is doing: the observatory
// (the sensor network), verified signals, and the competitive set. Thin
// wrapper: the three existing views render untouched as tabs; the active tab
// lives in the URL hash (#/market:signals) so deep links survive reload.
import Observatory from "./Observatory";
import Signals from "./Signals";
import Competitors from "./Competitors";

const TABS = [
  { id: "observatory", label: "Observatory" },
  { id: "signals", label: "Signals" },
  { id: "competitors", label: "Competitors" },
];

export default function Market({ tab, onNavigate }) {
  const active = TABS.some((t) => t.id === tab) ? tab : TABS[0].id;
  return (
    <div className="nv2-sec">
      <nav className="nv2-tabs" aria-label="Mercado">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nv2-tab${active === t.id ? " on" : ""}`}
            onClick={() => onNavigate?.(`market:${t.id}`)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {active === "observatory" && <Observatory onNavigate={onNavigate} />}
      {active === "signals" && <Signals onNavigate={onNavigate} />}
      {active === "competitors" && <Competitors onNavigate={onNavigate} />}
    </div>
  );
}
