"use client";
// Who is signed in, and who is really on this brand's team.
//
// 2026-07-24 audit: `lib/team.js` shipped six fictional people ("Diseñadora 01",
// "Dirección de diseño"…) and the approve button read "Aprobar como {persona}"
// where the persona was SELECTED BY THE PERSON APPROVING. That is not an
// approval. The engine has had users, hashed bearer tokens and a tenancy gate
// since 2026-07-21; nothing called it.
//
// Both states are first-class and neither is faked:
//   authenticated  — /me named this user; the server also attributes their
//                    writes, so the UI may show who acted.
//   pilot mode     — no token. The UI must NOT name an actor. Work still
//                    happens (the keyless flow is a deliberate posture), and is
//                    recorded as unverified.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { useEngine, useBrandId } from "@/components/EngineProvider";
import { getBrandUsers, getMe } from "@/lib/api";
import { setToken } from "@/lib/auth";

const EMPTY = {
  me: null, brand: null, authenticated: false, invalidToken: false,
  members: [], loading: true,
};

const IdentityCtx = createContext({
  ...EMPTY, signIn: async () => {}, signOut: () => {}, refresh: async () => {},
});

export function IdentityProvider({ children }) {
  const engine = useEngine();
  const brandId = useBrandId();
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const me = await getMe();
    // The team list is brand-scoped and tenancy-gated, so it needs the brand.
    const members = brandId ? await getBrandUsers(brandId) : [];
    setState({
      me: me?.user || null,
      // ⚠ GET /me answers {user, brand} and only `user` was kept, so nothing
      // in the UI could name WHICH tenant you are signed in to — the first
      // question a multi-tenant tool has to answer on sight, and the identity
      // menu rendered "Marca —" because of it.
      brand: me?.brand || null,
      authenticated: !!me?.authenticated,
      invalidToken: !!me?.invalidToken,
      members,
      loading: false,
    });
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  // ⚠ SIGNING IN RELOADED IDENTITY AND NOTHING ELSE, AND IN PRODUCTION THAT
  // IS THE FIRST THING EVERY NEW USER SEES (found 2026-08-21, rehearsing a
  // hosted deploy against `ATELIER_API_MODE=production`). `EngineProvider`
  // loads once on mount with an empty dependency array, so the screen kept
  // whatever it resolved to BEFORE anyone was signed in — "El motor no
  // responde" — until the person thought to reload the page by hand.
  //
  // It was invisible locally because the engine runs in DEMO mode here, where
  // the anonymous load already succeeds and signing in changes nothing on
  // screen. In production the anonymous load 401s, so the stale failure is
  // exactly what you are left staring at.
  //
  // `engine.refresh` is stable (`useCallback(…, [])` in EngineProvider), so
  // depending on it does not re-make these on every render. Engine wraps
  // Identity, which is why the call goes in this direction and not the other.
  const engineRefresh = engine?.refresh;

  const signIn = useCallback(async (token) => {
    setToken(token || null);
    await load();
    if (engineRefresh) await engineRefresh();
  }, [load, engineRefresh]);

  // ⚠ And the same in reverse: without this the brand's DNA, trends and
  // collection stayed on screen after signing out, until a reload. Clearing
  // identity while leaving the tenant's data rendered is the wrong half.
  const signOut = useCallback(() => {
    setToken(null);
    setState({ ...EMPTY, loading: false });
    if (engineRefresh) engineRefresh();
  }, [engineRefresh]);

  return (
    <IdentityCtx.Provider value={{ ...state, signIn, signOut, refresh: load }}>
      {children}
    </IdentityCtx.Provider>
  );
}

export function useIdentity() {
  return useContext(IdentityCtx);
}

// Convenience selectors. They return [] rather than a stand-in roster: with no
// team configured the UI says so and blocks assignment, instead of offering
// invented people to be responsible for real work.
export function useTeam() {
  const { members, me, authenticated, loading } = useIdentity();
  return {
    members,
    approvers: members.filter((m) => m.can_approve),
    designers: members.filter((m) => !m.can_approve || members.length === 1),
    byId: (id) => members.find((m) => m.id === id) || null,
    me, authenticated, loading,
  };
}
