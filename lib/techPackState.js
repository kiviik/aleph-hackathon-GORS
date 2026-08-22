// What a range row says about its tech pack — one function, so the row summary
// and the desk can never drift into describing the same pack differently.
//
// ⚠ Loaded ONCE for the whole grid and mapped by slot_id. A request per row
// would be 21 calls on a 21-row plan to render a label.
//
// The five states the owner specified, and they are not decoration: a row that
// says "Lista para liberar" when the engine would refuse is worse than a row
// that says nothing, because the merchandiser plans around it.

export const NO_PACK = "none";

// A pack's own root: the engine mints v+1 on revise and supersedes the prior
// row, so a slot accumulates versions. The row must describe the CURRENT one.
function currentFor(packs, slotId) {
  const mine = packs.filter((p) => p.slot_id === slotId);
  if (!mine.length) return null;
  const live = mine.filter((p) => p.status !== "superseded");
  const pool = live.length ? live : mine;
  return pool.reduce((a, b) => ((b.version || 0) > (a.version || 0) ? b : a));
}

export function packStateForSlot(packs, slotId) {
  // Three-state discipline, same as everywhere else in this codebase: a failed
  // lookup must not render as "this slot has no pack", which would offer a
  // create button that mints a SECOND root pack.
  if (packs === undefined) return { kind: "loading", label: "…" };
  if (packs === null) return { kind: "unknown", label: "ficha: sin confirmar" };

  const pack = currentFor(packs, slotId);
  if (!pack) return { kind: NO_PACK, label: "Crear ficha técnica" };

  const audit = pack.audit || {};
  const blocking = audit.summary?.by_tier?.blocking;
  const canQuote = audit.summary?.can_be_quoted === true;

  if (pack.status === "released") {
    return { kind: "released", packId: pack.id, tone: "ok",
             label: `Ficha · Liberada v${pack.version}` };
  }
  if (pack.version > 1) {
    return { kind: "revision", packId: pack.id, tone: "warn",
             label: `Ficha · Revisión v${pack.version}` };
  }
  if (canQuote) {
    return { kind: "ready", packId: pack.id, tone: "ok",
             label: "Ficha · Lista para liberar" };
  }
  return {
    kind: "draft", packId: pack.id, tone: "warn",
    // Blocking count, NOT verified count. They are different measures and the
    // desk explains why: verifying a field can move 0→1 verified and leave
    // every blocker standing, because a blocker is a MISSING field.
    label: blocking == null ? "Ficha · Borrador"
      : `Ficha · Borrador · ${blocking} bloqueante${blocking === 1 ? "" : "s"}`,
  };
}
