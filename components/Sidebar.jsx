"use client";
// FIVE destinations, and — inside Colecciones — the collection's own work areas.
//
// The areas are here rather than inside a screen because this is where people
// look for navigation. Two earlier placements failed for the same reason: on
// the collection overview the index sat below the fold, and on the portfolio it
// interrupted the list of collections with an index for just one of them.
//
// GROUPED, NOT FLAT. The version this replaces listed eleven tools as peers of
// "Hoy", which made a coherent collection graph read as a toolbox. Five groups
// you can scan beats twenty-one names you have to read — and only the group you
// are standing in is open, so the sidebar stays about as tall as it was.
import { useEffect, useState } from "react";

import { CONTEXT_NAV, GLOBAL_NAV, sectionForView } from "@/lib/nav";
import { COLLECTION_AREAS, areaForView } from "@/lib/collectionAreas";
import { useCollection } from "@/components/CollectionProvider";
import Icon from "@/components/ui/Icon";

function CollectionAreas({ active, onNavigate }) {
  const { collections, activeId } = useCollection();
  const current = collections?.find((c) => c.id === activeId);
  // Open the group holding the current screen. Falls back to the first one, so
  // the tree is never entirely shut — a collapsed accordion reads as "nothing
  // here", which is the failure mode this whole thing exists to avoid.
  const [open, setOpen] = useState(() => areaForView(active) || COLLECTION_AREAS[0].key);

  useEffect(() => {
    const g = areaForView(active);
    if (g) setOpen(g);
  }, [active]);

  return (
    <div className="ax-sub">
      {current && <div className="ax-sub-coll" title={current.name}>{current.name}</div>}

      {COLLECTION_AREAS.map((g) => {
        const isOpen = open === g.key;
        return (
          <div className="ax-area" key={g.key}>
            <button
              className={`ax-area-head${isOpen ? " open" : ""}`}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.key)}
              title={g.note}
            >
              <span>{g.label}</span>
              <Icon name="chevron" />
            </button>
            {isOpen && (
              <div className="ax-area-items">
                {g.items.map((it) => (
                  <button
                    key={it.view}
                    className={active === it.view ? "on" : ""}
                    aria-current={active === it.view ? "page" : undefined}
                    onClick={() => onNavigate(it.view)}
                    title={it.note}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The tools of the section you are standing in — the same idea as
// CollectionAreas, flat because these are peers rather than a graph.
//
// ⚠ WHY THIS HAD TO EXIST (owner review 2026-08-11, finding #8). `CONTEXT_NAV`
// has named `{ view: "world", label: "Inteligencia mundial" }` since the world
// screen shipped, with a comment arguing it goes FIRST because it is the only
// view that is not about this brand. Nothing rendered it. The sidebar showed
// five destinations and the market tools were documented in a constant nobody
// displayed, so the shared market layer — the thing that is identical for every
// tenant and the reason the ledger exists — was reachable only by typing a URL.
//
// A menu entry that exists in a data structure and not on screen is the
// navigation version of this codebase's recurring defect: a rule that reads
// correctly and never fires.
function SectionTools({ tools, active, onNavigate }) {
  if (!tools?.items?.length) return null;
  return (
    <div className="ax-sub">
      <div className="ax-area-items">
        {tools.items.map((it) => (
          <button
            key={it.view}
            className={active === it.view ? "on" : ""}
            aria-current={active === it.view ? "page" : undefined}
            onClick={() => onNavigate(it.view)}
            title={it.note}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Which CONTEXT_NAV list belongs to which global. The keys differ because the
// globals were renamed ("Mercado" -> "Inteligencia") without renaming the
// constant, and quietly renaming it would break the deep-link ids it documents.
const SECTION_TOOLS = {
  intelligence: CONTEXT_NAV.market,
  results: CONTEXT_NAV.results,
  library: CONTEXT_NAV.data,
};

export default function Sidebar({ active, onNavigate, open, onClose, brand }) {
  const section = sectionForView(active);

  return (
    <aside className={`ax-side${open ? " open" : ""}`} id="sidebar">
      <button className="ax-side-close" onClick={onClose} aria-label="Cerrar menú">
        <Icon name="close" />
      </button>

      <div className="ax-wm">
        Atelier
        {brand && <small>by {brand}</small>}
      </div>

      <nav className="ax-nav" aria-label="Secciones">
        {GLOBAL_NAV.map((item) => (
          <div key={item.key}>
            <button
              className={section === item.key ? "on" : ""}
              data-view={item.view}
              aria-current={section === item.key ? "page" : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <Icon name={item.icon} />
              <span>
                {item.label}
                {item.note && <small>{item.note}</small>}
              </span>
            </button>
            {item.key === "collection" && section === "collection" && (
              <CollectionAreas active={active} onNavigate={onNavigate} />
            )}
            {item.key !== "collection" && section === item.key && (
              <SectionTools tools={SECTION_TOOLS[item.key]} active={active}
                            onNavigate={onNavigate} />
            )}
          </div>
        ))}
      </nav>

      <div className="ax-side-foot">
        La evidencia informa. Una persona aprueba. El resultado enseña.
      </div>
    </aside>
  );
}
