// Canonical decision ledger — the ONE local source of truth for decisions, plus
// a real outbox so offline decisions actually reach the engine.
//
// Two problems this fixes:
//   1. Split stores. The accept flow historically wrote a product-shaped record
//      to atelier-accepted (read by Pipeline/Review) while the decision record
//      that Proposals/Results read (atelier-decisions) is newer — so legacy
//      accepts lived in one store and were invisible in the other, and the same
//      decision showed in Review but "sin decisiones" in Proposals/Results.
//      migrateLegacyAccepted() backfills atelier-decisions from atelier-accepted
//      once, idempotently, so all three surfaces agree.
//   2. A fake outbox. "Saved locally" was true, but a failed POST was never
//      retried. Now each record carries status/attempts/last_error/synced_at,
//      and syncPending() re-sends everything unsynced on app open and on the
//      browser `online` event, reusing the record id as the idempotency key so
//      retries never duplicate server-side.

//   3. A BRAND-BLIND OUTBOX (2026-07-24). When Feed's writes moved to
//      brand-scoped storage this module kept reading the global keys, so
//      `appendLocalDecision` wrote to one store while `setDecisionStatus`
//      patched another: a failed decision was never found again, and
//      `syncPending()` retried nothing. Every function here now takes the
//      brandId it operates on — there is no ambient "current brand" to get
//      wrong.
import { readScoped, writeScoped } from "@/lib/brandStore";
import { pipelineCardFrom } from "@/lib/decisionFlow.mjs";
import { isPending, runOutbox } from "@/lib/outbox.mjs";

export const DECISIONS_KEY = "atelier-decisions";
export const ACCEPTED_KEY = "atelier-accepted";

const read = (k, brandId) => readScoped(k, brandId, []) || [];
const write = (k, brandId, v) => writeScoped(k, brandId, v.slice(0, 300));

export const loadDecisions = (brandId) => read(DECISIONS_KEY, brandId);

// The ONE writer of a pipeline card. Three views used to build that card
// inline, in three slightly different shapes, each guarded by its own copy of
// "did the server say accept?" — which is how the guard came to be missing from
// the retry path entirely. A decision earns its operational object here or
// nowhere.
export function promoteToPipeline(rec, brandId, at = new Date().toISOString()) {
  const accepted = read(ACCEPTED_KEY, brandId);
  writeScoped(ACCEPTED_KEY, brandId,
              [pipelineCardFrom(rec?.candidate, at), ...accepted].slice(0, 50));
}

// One-time backfill: any atelier-accepted entry without a matching accept in
// atelier-decisions becomes an accept decision. Idempotent — safe to call on
// every mount. Returns how many were migrated.
export function migrateLegacyAccepted(brandId) {
  const decisions = read(DECISIONS_KEY, brandId);
  const accepted = read(ACCEPTED_KEY, brandId);
  const have = new Set(
    decisions.filter((d) => d.decision === "accept" && d.candidate_key).map((d) => d.candidate_key));
  const add = [];
  for (const a of accepted) {
    if (!a?.key || have.has(a.key)) continue;
    add.push({
      id: `migrated-${a.key}`,
      candidate_key: a.key,
      decision: "accept",
      reason: null,
      created_at: a.at || new Date().toISOString(),
      migrated: true,
      status: "local",          // provenance unknown — never claim it synced
      candidate: {
        title: a.title,
        item: { title: a.title, product_type: a.cat, image_url: a.image || null },
        trend: a.trend || null,
        suggestion: { cat: a.cat, gd: a.gd },
        colorways: a.color ? [{ hex: a.color }] : [],
      },
    });
  }
  if (add.length) write(DECISIONS_KEY, brandId, [...add, ...decisions]);
  return add.length;
}

// Patch one record (by id) in place.
export function setDecisionStatus(id, patch, brandId) {
  const rows = read(DECISIONS_KEY, brandId);
  let changed = false;
  const next = rows.map((r) => (r.id === id ? (changed = true, { ...r, ...patch }) : r));
  if (changed) write(DECISIONS_KEY, brandId, next);
}

export const pendingDecisions = (brandId) =>
  read(DECISIONS_KEY, brandId).filter(isPending);

// Retry every unsynced decision. The loop itself is lib/outbox.mjs — this binds
// it to localStorage, brand-scoped. Everything here takes the brandId it
// operates on; there is no ambient "current brand" to get wrong, which is the
// bug this module was rewritten for on 2026-07-24.
//
// `mintFn` closes the half the Feed fix could not reach: an offline `accept`
// has no recommendation id (nothing was reachable to mint one), and sending it
// as-is on reconnect walks it down the legacy client-evidence path that Feed
// now refuses to take. The retry mints first — we are online, that is why we
// are here — and an unjudged accept waits rather than being posted unvouched.
export async function syncPending(brandId, postFn, onStatus,
                                  { mintFn, promote = promoteToPipeline } = {}) {
  const store = {
    pending: pendingDecisions,
    patch: setDecisionStatus,
  };
  return runOutbox(brandId, store,
                   { post: postFn, mint: mintFn, promote, onStatus });
}
