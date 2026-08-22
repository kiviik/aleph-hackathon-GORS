// What happens when someone decides on a proposal — the whole path, in one
// dependency-free module.
//
// Why it is not in Feed.jsx any more (owner audit 2026-07-24, third pass):
//
//   1. FAIL CLOSED. `mintRecommendation()` returns null on any failure, and the
//      caller carried on and posted the decision without a `recommendation_id`
//      — straight back down the legacy client-evidence path. A migration
//      hiccup or a 500 on one endpoint silently reopened the exact hole the
//      recommendation boundary was built to close. An `accept` against a live
//      engine now REQUIRES a server recommendation; without one the decision is
//      recorded as research (`watch`), never as an operational bet.
//
//   2. It was untestable. This flow is the load-bearing path of the product —
//      local gate, server verdict, outbox, pipeline card — and it lived inside
//      a component in a repo with no component-test harness, so the audit's
//      "the critical changes have no dedicated tests" was structurally true
//      rather than an oversight. Everything here takes its side effects as
//      arguments, so tests/decisionFlow.test.mjs drives the real code with fake
//      transports instead of asserting against source text.
//
// The rule this module exists to hold: THE OPERATIONAL BET IS THE SERVER'S TO
// GRANT. A pipeline card (and the test quantity that implies a commercial
// commitment) appears only when a server that judged its own evidence said
// `accept`. Every other path — offline, mint failure, POST failure, downgrade —
// keeps the taste signal and withholds the commitment.

// Recorded as the reason when the engine could not judge the candidate. Not a
// verdict about the garment: a statement that nothing judged it.
export const NO_SERVER_EVIDENCE = "sin recomendación del motor";

const testQtyFrom = (candidate) =>
  parseInt(String(candidate?.qty?.range || "").match(/\d+/)?.[0], 10) || null;

/** What we will ASK for, given the local gate and whether the engine judged it.
 *
 * Three separate reasons an `accept` gets downgraded, kept distinct because
 * they mean different things to the person reading the card:
 *   · `gates`     — the local trust gates say the evidence is not there;
 *   · `no-server` — the engine never judged it, so nobody can vouch for it;
 *   · (offline)   — not a downgrade at all: the ask stands, it just cannot be
 *                   confirmed yet, so it is queued verbatim and grants nothing.
 */
export function planDecision({ candidate, decision, reason, live, recommendation }) {
  const stance = candidate?.trust?.stance;
  if (decision === "accept" && stance !== "recommend") {
    return { decision: "watch", reason: reason || `research-only: ${stance || "insufficient"}`,
             testQty: null, downgraded: "gates" };
  }
  if (decision === "accept" && live && !recommendation?.id) {
    return { decision: "watch", reason: reason || NO_SERVER_EVIDENCE,
             testQty: null, downgraded: "no-server" };
  }
  // An offline accept keeps its test quantity: it is a proposal travelling with
  // the decision, which the engine is free to drop when it finally judges it.
  return { decision, reason: reason || null,
           testQty: decision === "accept" ? testQtyFrom(candidate) : null,
           downgraded: null };
}

/** The message the person gets. Says what happened, never what was asked for. */
export function noticeFor({ title, recorded, downgraded, queued, error, abstain }) {
  if (error) return `No se pudo registrar "${title}": ${error}`;
  if (queued) return `${title} → en cola · el motor lo confirma cuando haya conexión`;
  if (downgraded === "no-server") {
    return `${title} → investigación · el motor no pudo evaluarlo, así que no entra en producción`;
  }
  if (recorded === "watch") {
    return `${title} → investigación · ${abstain ? "sin datos comerciales propios"
                                                 : "evidencia insuficiente"}`;
  }
  return null;   // accept / reject: the caller has richer copy for these
}

/**
 * Record one decision, end to end.
 *
 * deps (all injected so this is testable and so the module stays framework-free):
 *   live, brandId          — is there an engine to talk to, and whose data
 *   mint(brandId, subject) — POST /recommendations, resolves to a rec or null
 *   post(brandId, payload) — POST /decisions, resolves to the saved row, throws
 *   appendLocal(rec, brandId), patchStatus(id, patch, brandId)  — the outbox
 *   onOptimistic(rec)      — hand the UI its row before the network
 *   promote(record)        — create the operational pipeline card. Called ONLY
 *                            on a server-confirmed accept.
 *   uuid(), now()          — injected so a test can pin them
 *
 * Returns { recorded, record, notice }. `recorded` is the verdict that was
 * actually stored — null when nothing was (a failed or queued decision). The
 * caller must branch on THIS, never on the verdict it asked for.
 */
export async function recordDecision({ candidate, decision, reason, reasonCode }, deps) {
  const {
    live, brandId, mint, post, appendLocal, patchStatus, onOptimistic,
    promote, uuid, now,
  } = deps;
  const connected = Boolean(live && brandId);
  const title = candidate?.item?.title || candidate?.trend?.name || candidate?.trend || "";

  // Ask the engine to judge this candidate on ITS data FIRST, so the decision
  // can cite an id and the server ignores whatever we think we know. A null
  // here is not a soft failure — it decides what may be asked for below.
  const recommendation = connected
    ? await mint(brandId, {
        candidateKey: candidate.key,
        // Both are advisory: for a `prod-<uuid>` key the engine overrides them
        // with the stored item's own title and category (engine 0030 era).
        title: candidate?.item?.title || candidate?.trend?.name || candidate?.trend,
        category: candidate?.item?.product_type || candidate?.suggestion?.cat,
      })
    : null;

  const plan = planDecision({ candidate, decision, reason, live: connected, recommendation });

  // One key per user ACTION: a network retry reuses it (the server returns the
  // original row); a genuine new decision on this candidate mints a new one.
  const id = uuid();
  const record = {
    id,
    candidate_key: candidate.key,
    decision: plan.decision,
    reason: plan.reason,
    candidate: { ...candidate, testQty: plan.testQty },
    created_at: now(),
    recommendation_id: recommendation?.id || null,
    status: connected ? "pending" : "local",
    attempts: 0,
    // Whether an operational object exists for this row. The outbox reads it so
    // a decision confirmed on retry still reaches the pipeline exactly once.
    promoted: false,
  };
  onOptimistic?.(record);
  appendLocal(record, brandId);

  if (!connected) {
    // Offline the ask is preserved and sent later — but it grants nothing now.
    // It used to mint a pipeline card on a verdict no server had ever seen.
    return { recorded: null, record,
             notice: noticeFor({ title, queued: true }) };
  }

  try {
    const saved = await post(brandId, {
      candidateKey: candidate.key, decision: plan.decision, reason: plan.reason,
      // The machine half of the reason (A17.2). Only travels when a HUMAN
      // picked a coded reason — the flow's own synthesized reasons
      // ("research-only: ...") are the engine's business, not a verdict code.
      reasonCode: reasonCode || null,
      candidate: record.candidate, idempotencyKey: id,
      recommendationId: recommendation?.id || null,
    });
    // THE SERVER'S VERDICT IS THE VERDICT. It may downgrade an accept to
    // "watch" when its own gates do not clear.
    const recorded = saved?.decision || plan.decision;
    const patch = { status: "synced", synced_at: now(), last_error: null,
                    decision: recorded, server_decision: recorded };
    if (recorded === "accept") {
      promote?.(record);
      patch.promoted = true;
    }
    patchStatus(id, patch, brandId);
    return {
      recorded, record: { ...record, ...patch },
      notice: recorded !== plan.decision
        ? `El motor registró "${recorded}": la evidencia no alcanza para ${plan.decision}.`
        : noticeFor({ title, recorded, downgraded: plan.downgraded,
                      abstain: candidate?.trust?.abstainReason }),
    };
  } catch (e) {
    const message = String(e?.message || e);
    const patch = { status: staleFrom(e) ? "stale" : "failed",
                    attempts: 1, last_error: message };
    patchStatus(id, patch, brandId);
    // The engine never confirmed this. Treat it as undecided rather than acting
    // on a verdict no server agreed to.
    return { recorded: null, record: { ...record, ...patch },
             notice: noticeFor({ title, error: message }) };
  }
}

/** The Pipeline card for a decided candidate.
 *
 * One shape for all three entry points (decide / design-similar on a product /
 * design-similar on a trend), which used to build three slightly different
 * cards inline — the product path silently dropped `gd`, the trend path
 * dropped the competitor fallback for `trend`. Handles both candidate kinds:
 * a crawled product (`item`) and a trend proposal (`suggestion`/`colorways`).
 */
export function pipelineCardFrom(candidate, at) {
  const c = candidate || {};
  return {
    key: c.key,
    title: c.item?.title || c.trend?.name || c.trend || "",
    cat: c.item?.product_type || c.suggestion?.cat || null,
    gd: c.suggestion?.gd || "women",
    color: c.colorways?.[0]?.hex || c.adapt?.colors?.[0] || "#1B1A14",
    fabric: c.suggestion?.fabric || c.adapt?.materials?.[0] || "",
    qty: c.qty?.range || null,
    trend: c.trend?.name || c.trend || c.item?.competitor || null,
    image: c.item?.image_url || c.image || null,
    at,
  };
}

/** Did the engine refuse because the cited evidence went stale (409)?
 *
 * A stale recommendation is NOT a transport failure: retrying replays a verdict
 * that expired, was revoked, or was minted from a crawl row that has since been
 * replaced. Those rows leave the retry loop and wait for a human to decide
 * again on current evidence.
 */
export function staleFrom(error) {
  return Boolean(error?.stale || error?.status === 409);
}
