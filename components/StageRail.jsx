"use client";
// The collection stage rail — Brief → Range → Develop → Review → Launch →
// Results as one workspace instead of six destinations in a sidebar.
//
// 2026-07-24 review: "the application still has ~21 destinations… users do not
// yet experience the stages as one persistent collection workspace. Until this
// changes, users will not understand how much stronger the underlying
// architecture has become."
//
// Every state on this rail is DERIVED by the engine
// (GET /collections/{id}/workspace) from the same rows the stages themselves
// read. Nothing here is a cached marker: approving a brief changes what the
// rail says about Range without anything being written, because the rail asks
// rather than remembers.
//
// SCOPE, stated honestly: this delivers the workspace EXPERIENCE on the
// existing hash router. The audit also asks for real route segments
// (/brands/:id/collections/:id/:stage). That is a separate migration of all 21
// views and every deep link, and it is not done here — the collection travels
// as ?collection=<id> exactly as before.
import { useCallback, useEffect, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import { getWorkspace } from "@/lib/workspace";
import { canQueryCollection } from "@/lib/collectionScope";

// Each stage and the view it opens. The view ids are unchanged, so every
// existing deep link and onNavigate call keeps working.
const STAGES = [
  { key: "brief", view: "collectionbrief", views: ["collectionbrief", "dashboard", "whitespace", "feed"], label: "Brief" },
  { key: "range", view: "lineplan", views: ["lineplan"], label: "Range" },
  { key: "develop", view: "studio", views: ["studio", "inspiration", "materials", "boards", "collections"], label: "Desarrollo" },
  { key: "review", view: "review", views: ["review"], label: "Revisión" },
  { key: "launch", view: "launch", views: ["launch"], label: "Lanzamiento" },
  { key: "results", view: "launchresults", views: ["launchresults"], label: "Resultados" },
];

export default function StageRail({ view, onNavigate }) {
  const engine = useEngine();
  const { activeId, collections, loading: collectionsLoading,
          brandId: collectionsBrandId } = useCollection();
  const brandId = useBrandId();
  const [ws, setWs] = useState(null);

  const load = useCallback(async () => {
    // The mismatched pair a brand switch produces for one render: a new
    // brandId beside the previous brand's activeId. The rail swallows the 404
    // so nothing looked broken, which is exactly why it went unnoticed.
    if (!canQueryCollection({ brandId, activeId, collections,
                              collectionsBrandId, loading: collectionsLoading })) {
      setWs(null); return;
    }
    try { setWs(await getWorkspace(brandId, activeId)); }
    catch { setWs(null); }   // never blocks the rail from rendering
  }, [brandId, activeId, collections, collectionsBrandId, collectionsLoading]);

  // Re-read on every stage change: moving between stages is exactly when
  // something upstream may have been approved.
  useEffect(() => { load(); }, [load, view]);

  if (!activeId) return null;
  const current = STAGES.find((s) => s.views.includes(view));
  if (!current) return null;

  return (
    <nav className="sr" aria-label="Etapas de la colección">
      {STAGES.map((s) => {
        const state = ws?.stages?.[s.key];
        const isNow = s.key === current.key;
        const cls = [
          "sr-stage",
          isNow ? "now" : "",
          state?.done ? "done" : "",
          state?.in_progress && !state?.done ? "wip" : "",
          state?.blocked_by ? "blocked" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={s.key} className={cls}
                  aria-current={isNow ? "step" : undefined}
                  // The blocker is the reason, not a disabled control: the team
                  // must still be able to LOOK at a stage they cannot finish.
                  title={state?.blocked_by || state?.detail || ""}
                  onClick={() => onNavigate?.(s.view)}>
            <span className="sr-label">{s.label}</span>
            <span className="sr-detail">
              {state?.blocked_by
                ? state.blocked_by
                : state?.detail || (ws ? "—" : "…")}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
