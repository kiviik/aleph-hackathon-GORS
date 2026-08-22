"use client";
// The active collection — ONE answer, shared by every stage that works on it.
//
// 2026-07-24 audit: Studio, Range Plan and Review each called loadCollections()
// on mount and then picked their own active collection — LinePlan took
// `colls[0]`, Review took the first item with a cover. So three screens could
// sit on three different collections at once, and the user had no way to tell.
// The collection was never a thing you selected; it was a thing each screen
// guessed. (ROADMAP §2 — the schema half is engine migration 0028.)
//
// Selection order: the URL (so a collection is linkable), then this brand's
// last choice, then the newest collection. Persisted PER BRAND, because a
// selection is meaningless under a different tenant.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useEngine, useBrandId } from "@/components/EngineProvider";
import { readScoped, writeScoped } from "@/lib/brandStore";
import { splitCollection, withCollection } from "@/lib/nav";
import { loadCollections } from "@/lib/studioStore";

const ACTIVE_KEY = "atelier-active-collection";

const CollectionCtx = createContext({
  collections: [], active: null, activeId: null, brandId: null, scope: "local",
  loading: true, setActive: () => {}, selectCollection: () => {},
  reload: async () => {},
});

const collectionFromHash = () => {
  if (typeof window === "undefined") return null;
  return splitCollection(window.location.hash.replace(/^#\/?/, "")).collectionId;
};

export function CollectionProvider({ children }) {
  // This provider is ABOVE the Shell's brand remount key, so unlike the views it
  // is never remounted on a brand switch — it has to watch the brand itself, or
  // the collection list stays the previous tenant's (owner audit, 2026-07-24).
  const engine = useEngine();
  const engineBrandId = useBrandId();
  const [state, setState] = useState({
    collections: [], brandId: null, scope: "local", loading: true,
    // `reachable: null` while loading. Once false, an empty `collections` means
    // "we could not ask", NOT "there are none" — and screens must say so.
    reachable: null, error: null,
  });
  const [activeId, setActiveId] = useState(null);

  // ⚠ THE LATE RESPONSE HAS TO LOSE (owner bug hunt, 2026-08-13). `reload` had
  // no cancellation, and this provider sits ABOVE the Shell's brand remount key
  // — that is deliberate (see the header) and it means nothing else protects
  // it. So: open on Brand A with a cold engine, switch to Brand B, B's list
  // arrives, then A's resolves last and calls `setState` and `setActiveId` with
  // A's data. The switcher, CollectionHeader, StageRail, CommandCentre and
  // Walkthrough all read this context and would then show BRAND A's collection
  // names under Brand B — and the mirror effect below persists that id, so it
  // survives a reload.
  //
  // It is invisible precisely because it is self-consistent: `loaded.brandId`
  // is A too, so every field agrees with every other field. Nothing looks
  // wrong; it is simply the wrong tenant.
  //
  // A monotonic counter rather than a bool: brand switches can overlap, and the
  // rule we need is "only the newest request may write", not "the one I
  // cancelled may not".
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    // This provider needs names and ids for the switcher; it does not own the
    // board, so it must not overwrite the offline mirror DesignStudio writes.
    const loaded = await loadCollections({ mirror: false });
    if (mine !== generation.current) return;   // a newer brand won; stay quiet
    const colls = loaded.colls || [];
    setState({ collections: colls, brandId: loaded.brandId, scope: loaded.scope,
                loading: false, reachable: loaded.reachable ?? null,
                error: loaded.error ?? null });

    const wanted = collectionFromHash()
      || readScoped(ACTIVE_KEY, loaded.brandId, null);
    const exists = colls.find((c) => c.id === wanted);
    setActiveId(exists ? exists.id : colls[0]?.id || null);
  }, [engineBrandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear first: a switch must never show the previous brand's collections,
  // and must never let a stale activeId be written into the new brand's bucket.
  useEffect(() => {
    setActiveId(null);
    setState((s) => ({ ...s, collections: [], loading: true }));
    reload();
  }, [reload]);

  // Follow the hash: a pasted link to a collection selects it.
  useEffect(() => {
    const sync = () => {
      const fromUrl = collectionFromHash();
      if (fromUrl) setActiveId((current) => (fromUrl === current ? current : fromUrl));
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // THE ONE WAY A PERSON CHANGES THE COLLECTION.
  //
  // ⚠ WHY THIS EXISTS (owner review, 2026-08-13, third instance of one defect).
  // Selecting a collection wrote to TWO places — this state and the URL — and
  // every caller decided for itself whether to write both. Portfolio wrote the
  // URL from a stale closure; the top-bar switcher wrote state and not the URL;
  // Studio's own collection tabs wrote state and not the URL. The last one
  // survived two rounds of fixing the first two, because each was patched where
  // it was found instead of at the fact they share.
  //
  // The URL is canonical. This writes the URL and nothing else — `activeId` is
  // then DERIVED from it by the hashchange listener above, so there is exactly
  // one writer of the selection and no way for the two to disagree. Callers
  // that also change the VIEW go through `navigate(view, { collectionId })`,
  // which composes the same hash in one assignment.
  // ⚠ IT WRITES BOTH, AND THAT IS THE POINT — one OPERATION, not one location.
  // An earlier draft wrote only the URL and let the `hashchange` listener derive
  // the state, which is cleaner on paper and wrong in practice: `hashchange` is
  // asynchronous, so between the click and the event the URL said one collection
  // and the screen still showed the other. That is the same disagreement this
  // whole exercise is about, just narrower.
  //
  // Writing both here is not "two writers": two writers is two call sites that
  // can each decide to skip one. This is a single function that cannot write one
  // without the other, and every screen goes through it. The listener below
  // still handles the changes that do NOT come through here — a pasted link, the
  // back button — which is what makes a collection linkable.
  const selectCollection = useCallback((id) => {
    if (typeof window === "undefined") return;
    setActiveId(id);
    const next = withCollection(window.location.hash, id);
    if (window.location.hash !== next) window.location.hash = next;
  }, []);

  // ⚠ NOT FOR USER SELECTION — use `selectCollection`. This sets the state
  // without touching the URL, and exists only for resolution during load, where
  // there is no user action to record and the URL is what we are reading FROM.
  const setActive = useCallback((id) => {
    setActiveId(id);
    writeScoped(ACTIVE_KEY, state.brandId, id);
  }, [state.brandId]);

  const active = useMemo(
    () => state.collections.find((c) => c.id === activeId) || null,
    [state.collections, activeId],
  );

  // Keep the mirror in step so a reload lands on the same collection.
  useEffect(() => {
    if (!state.loading && activeId) writeScoped(ACTIVE_KEY, state.brandId, activeId);
  }, [activeId, state.brandId, state.loading]);

  return (
    <CollectionCtx.Provider value={{ ...state, active, activeId, setActive, selectCollection, reload }}>
      {children}
    </CollectionCtx.Provider>
  );
}

export function useCollection() {
  return useContext(CollectionCtx);
}
