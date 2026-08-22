// The retry loop, with the store handed in.
//
// Extracted from lib/ledger.js for the same reason lib/decisionFlow.mjs was
// extracted from Feed.jsx: this is where the P0 of the 2026-07-24 audit lived
// (the outbox read the GLOBAL storage keys while the writes were brand-scoped,
// so a failed decision was never found again), and it could not be tested
// because ledger.js reaches for localStorage through the `@/` alias. With the
// store injected, tests drive the real loop against two brands at once and the
// scoping is a behaviour instead of a promise.
//
// The rule it holds, matching lib/decisionFlow.mjs: a queued accept is JUDGED
// before it is sent, and it earns its pipeline card only if the engine confirms
// it. Offline is not an exemption from the evidence boundary — it is a delay.

export const UNJUDGED = "el motor no pudo evaluar el candidato todavía";
export const STALE = "la evidencia citada venció — volvé a decidir sobre datos actuales";

/** Is this row waiting to reach the server?
 *
 * `stale` is deliberately excluded: a decision whose cited evidence expired,
 * was revoked, or was minted from a crawl row that has since been replaced
 * cannot be retried — only re-made by a person on current evidence.
 */
export const isPending = (r) => r?.status === "pending" || r?.status === "failed";

export const subjectOf = (row) => ({
  candidateKey: row.candidate_key,
  title: row.candidate?.item?.title || row.candidate?.trend?.name || row.candidate?.trend,
  category: row.candidate?.item?.product_type || row.candidate?.suggestion?.cat,
});

/**
 * store: { pending(brandId) -> rows, patch(id, patch, brandId) }
 * post(brandId, payload) resolves to the saved row, throws on failure.
 * mint(brandId, subject) resolves to a recommendation or null. Optional; without
 *   it a queued accept with no recommendation id simply waits.
 * promote(row, brandId) creates the operational pipeline card. Optional.
 */
export async function runOutbox(brandId, store, { post, mint, promote, onStatus, now } = {}) {
  if (!brandId || typeof post !== "function") return { synced: 0, failed: 0, stale: 0 };
  const stamp = now || (() => new Date().toISOString());
  let synced = 0, failed = 0, stale = 0;

  for (const r of store.pending(brandId)) {
    const patch = (p) => { store.patch(r.id, p, brandId); onStatus?.(r.id, p); };
    patch({ status: "syncing" });

    // Carry the recommendation id through the retry: a queued decision must
    // reach the server on the SAME evidence boundary it was made on. An offline
    // accept never had one — so mint it NOW, while we are online, rather than
    // posting it on client evidence.
    let recommendationId = r.recommendation_id || null;
    if (!recommendationId && r.decision === "accept" && typeof mint === "function") {
      const minted = await mint(brandId, subjectOf(r));
      if (!minted?.id) {
        // Fail closed on the retry too. An unjudged accept waits; it is never
        // posted as an accept nobody vouched for.
        patch({ status: "pending", attempts: (r.attempts || 0) + 1, last_error: UNJUDGED });
        failed++;
        continue;
      }
      recommendationId = minted.id;
      store.patch(r.id, { recommendation_id: recommendationId }, brandId);
    }

    try {
      const saved = await post(brandId, {
        candidateKey: r.candidate_key, decision: r.decision, reason: r.reason,
        candidate: r.candidate, idempotencyKey: r.id, recommendationId,
      });
      const serverDecision = saved?.decision || null;
      const done = {
        status: "synced", synced_at: stamp(), last_error: null,
        recommendation_id: recommendationId,
        // The server's verdict is the real one; a retry can still downgrade.
        ...(serverDecision ? { decision: serverDecision, server_decision: serverDecision } : {}),
      };
      if (serverDecision === "accept" && !r.promoted && typeof promote === "function") {
        // An offline accept has no other moment to earn its pipeline card;
        // `promoted` on the row keeps it exactly-once across retries.
        promote({ ...r, recommendation_id: recommendationId }, brandId);
        done.promoted = true;
      }
      patch(done);
      synced++;
    } catch (e) {
      const isStale = Boolean(e?.stale || e?.status === 409);
      patch({ status: isStale ? "stale" : "failed",
              attempts: (r.attempts || 0) + 1,
              last_error: isStale ? STALE : String(e?.message || e) });
      if (isStale) stale++; else failed++;
    }
  }
  return { synced, failed, stale };
}
