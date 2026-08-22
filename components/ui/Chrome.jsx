"use client";
// How a screen fills the two persistent chrome slots (the reading rail and the
// decision bar) without either of them being re-implemented per screen.
//
// A screen declares what it wants; the shell renders it. Declaring nothing is
// the correct default and produces no rail and no bar — an empty bar with a
// disabled button would be an invitation to an action that does not exist.
//
// The payload is CLEARED on unmount, so a rail can never outlive the screen
// that produced it and end up describing the previous page's evidence.
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const Ctx = createContext(null);

export function ChromeProvider({ children }) {
  const [read, setRead] = useState(null);
  const [decision, setDecision] = useState(null);
  const value = useMemo(() => ({ read, setRead, decision, setDecision }), [read, decision]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChromeSlots() {
  return useContext(Ctx) || { read: null, decision: null };
}

// `deps` follows the usual rule: list what the payload is built from. The
// payload itself is deliberately NOT a dependency — it is a fresh object
// literal on every render and would loop.
export function useChrome({ read = null, decision = null }, deps = []) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.setRead(read);
    ctx.setDecision(decision);
    return () => { ctx.setRead(null); ctx.setDecision(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
