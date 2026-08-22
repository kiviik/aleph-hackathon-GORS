"use client";
// The collection's own header and stage tabs (owner references 1–5, 2026-08-06).
//
// Every reference that shows a collection shows the same three things above the
// work, and none of them were in the product:
//
//   · WHO THIS IS — a cover thumbnail, the season, the name in the serif, and
//     the state. You always know which collection you are inside.
//   · THE STAGES AS TABS — Resumen · Brief · Rango · Conceptos · Desarrollo ·
//     Revisión · Lanzamiento · Resultados, horizontal, always visible. The
//     sidebar answers "which area of work"; this answers "which step", and
//     conflating the two is what made the old navigation feel like a map.
//   · WHEN IT SHIPS — the launch date, at the right, because every date on the
//     stages is measured against it.
//
// NOTHING IS REMOVED BY THIS. The sidebar areas stay, StageRail stays below it
// with its own detail. This is added navigation, not replacement navigation.
//
// The per-tab state line is the engine's own `workspace.stages[].detail` — the
// same string the rail uses — so the tabs and the rail cannot disagree about
// what is done. A tab whose stage the engine reports nothing for shows no
// state rather than a guess.
import { useCallback, useEffect, useRef, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useBrandId } from "@/components/EngineProvider";
import Icon from "@/components/ui/Icon";
import { getWorkspace } from "@/lib/workspace";
import { getConceptCovers } from "@/lib/api";
import { canQueryCollection } from "@/lib/collectionScope";

// The eight tabs the references draw, in their order. `stage` links a tab to
// the engine's stage so it can carry that stage's state; Resumen and Conceptos
// are screens, not stages, and carry none.
const TABS = [
  { view: "command", label: "Resumen" },
  { view: "collectionbrief", label: "Brief", stage: "brief" },
  { view: "lineplan", label: "Rango", stage: "range" },
  { view: "studio", label: "Conceptos" },
  { view: "boards", label: "Desarrollo", stage: "develop" },
  { view: "review", label: "Revisión", stage: "review" },
  { view: "launch", label: "Lanzamiento", stage: "launch" },
  { view: "launchresults", label: "Resultados", stage: "results" },
];

const TAB_VIEWS = new Set(TABS.map((t) => t.view));

export default function CollectionHeader({ view, onNavigate }) {
  const brandId = useBrandId();
  const { collections, activeId, loading, brandId: collectionsBrandId } = useCollection();
  const [ws, setWs] = useState(null);
  const [cover, setCover] = useState(null);

  // ⚠ THE LAST STAGES WERE SIMPLY GONE (owner review, 2026-08-14): 882px of
  // tabs in 666px of space, with "Resultados" entirely off-screen and the
  // scrollbar hidden by `.ch-tabs { scrollbar-width: none }`. A stage rail is a
  // map of the work; a map whose right-hand end is invisible, with nothing
  // indicating it continues, is a map that lies about how much there is.
  //
  // Two fixes, because they answer different questions. The fade says "there is
  // more this way". Scrolling the current stage into view answers "where am I"
  // — without it, deep-linking to Resultados lands you on a rail that appears
  // to start at Resumen with nothing selected.
  const tabsRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // ⚠ OBSERVE THE CONTENT, NOT THE SCROLLER. Watching `el` alone missed the
    // case that matters: the rail's WIDTH never changes, its CONTENT grows when
    // the stage counts arrive ("1 esperando revisión"), and that is what makes
    // it overflow. So the fade was absent on exactly the load where it was
    // needed. Observing the children catches the moment the tabs get longer.
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    for (const child of el.children) ro?.observe(child);
    return () => { el.removeEventListener("scroll", measure); ro?.disconnect(); };
  }, [measure, ws]);

  useEffect(() => {
    const el = tabsRef.current;
    const current = el?.querySelector("button.on");
    // `nearest` so a tab already visible does not jolt the rail sideways.
    // Feature-checked: jsdom has no `scrollIntoView`, and a header that throws
    // during render would take every collection-scoped screen down with it.
    if (typeof current?.scrollIntoView === "function") {
      current.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
    measure();
  }, [view, measure]);

  const collection = collections?.find((c) => c.id === activeId);

  useEffect(() => {
    // ⚠ NOT `if (!brandId || !activeId)`. That was the check, and it passed on
    // the one render where the NEW brand id sits beside the PREVIOUS brand's
    // collection id — `brandId` changes immediately on a switch while
    // `CollectionProvider` clears `activeId` an effect later. Both halves are
    // truthy and they belong to different tenants, so the request went out and
    // the engine answered 404. Ask only about a collection this brand's loaded
    // list actually contains.
    if (!canQueryCollection({ brandId, activeId, collections,
                                  collectionsBrandId, loading })) {
      setWs(null); setCover(null); return;
    }
    let live = true;
    getWorkspace(brandId, activeId).then((w) => live && setWs(w)).catch(() => live && setWs(null));
    // The collection's own approved render, same rule as everywhere else: its
    // garment or nothing, never a borrowed one.
    getConceptCovers(brandId, activeId, 1)
      .then((r) => live && setCover(r?.covers?.[0] || null))
      .catch(() => live && setCover(null));
    return () => { live = false; };
  }, [brandId, activeId, collections, collectionsBrandId, loading]);

  if (!activeId || !collection) return null;

  const stages = ws?.stages || {};
  const current = ws?.stage_order?.find((s) => stages[s]?.in_progress)
    || ws?.stage_order?.find((s) => !stages[s]?.done);

  return (
    <header className="ch">
      <div className="ch-top">
        <div className="ch-id">
          {cover?.image_data_uri ? (
            <img className="ch-cover" src={cover.image_data_uri} alt="" loading="lazy" />
          ) : (
            <span className="ch-cover empty"><Icon name="spark" /></span>
          )}
          <div className="ch-name">
            <span className="ch-line">
              {ws?.brief?.active_version?.season && (
                <span className="ax-season">{ws.brief.active_version.season}</span>
              )}
              {current && (
                <span className="ch-state">
                  <i /> En {(TABS.find((t) => t.stage === current)?.label || current).toLowerCase()}
                </span>
              )}
            </span>
            <h2>{collection.name}</h2>
          </div>
        </div>

        {ws?.plan?.approved_version?.delivery_window_end && (
          <div className="ch-when">
            <span className="ax-label mute">Entrega</span>
            <b>{ws.plan.approved_version.delivery_window_end}</b>
          </div>
        )}
      </div>

      <div className={`ch-tabwrap${edges.start ? " more-l" : ""}${edges.end ? " more-r" : ""}`}>
      <nav className="ch-tabs" ref={tabsRef} aria-label="Etapas de la colección">
        {TABS.map((t) => {
          const st = t.stage ? stages[t.stage] : null;
          return (
            <button
              key={t.view}
              className={view === t.view ? "on" : ""}
              aria-current={view === t.view ? "page" : undefined}
              onClick={() => onNavigate(t.view)}
            >
              <span>{t.label}</span>
              {/* The engine's own words. No state at all beats an invented one. */}
              {st?.detail && <small>{st.detail}</small>}
            </button>
          );
        })}
      </nav>
      </div>
    </header>
  );
}

export { TAB_VIEWS };
