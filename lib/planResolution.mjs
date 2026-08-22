// Which plan belongs to this (collection, season) — the policy, with the
// transport handed in.
//
// Extracted for the same reason as lib/outbox.mjs: the bug the 2026-07-24 audit
// found here is a RACE, and a race is only demonstrable if a test can control
// what the second caller sees. lib/collectionPlans.js reaches the engine
// through `@/lib/auth`, so nothing in it was reachable from `node --test`.
//
// The rule: a conflict means SOMEONE ELSE GOT THERE FIRST. It never means "load
// whatever they took". Returning the winner's plan handed one collection
// another collection's season numbers — with an edit path attached.

const findMine = (items, season, collectionId) => (collectionId
  ? items.find((p) => p.collection_id === collectionId && p.season === season)
  : items.find((p) => p.season === season));

const isConflict = (e) => e?.status === 409;

/**
 * api: { list(brandId), get(brandId, planId), create(brandId, body),
 *        attach(brandId, planId, collectionId) }
 */
export async function resolvePlan({ brandId, season, targets = {}, collectionId = null }, api) {
  if (!brandId || !season) return null;

  // Re-read and take OUR plan; make one if we still have none. Called after any
  // conflict, so the loser of a race converges on its own plan rather than
  // adopting the winner's.
  const afterConflict = async () => {
    const { items = [] } = await api.list(brandId);
    const mine = findMine(items, season, collectionId);
    return mine ? await api.get(brandId, mine.id)
                : await api.create(brandId, { season, targets, collectionId });
  };

  const { items = [] } = await api.list(brandId);
  const mine = findMine(items, season, collectionId);
  if (mine) return await api.get(brandId, mine.id);

  // A plan written before the collection FK existed (engine migration 0028):
  // adopt AND link it, so it stops floating free instead of being adopted
  // invisibly on every load.
  const orphan = collectionId && items.find((p) => !p.collection_id && p.season === season);
  if (orphan) {
    try {
      return await api.attach(brandId, orphan.id, collectionId);
    } catch (e) {
      if (!isConflict(e)) throw e;
      return await afterConflict();
    }
  }
  try {
    return await api.create(brandId, { season, targets, collectionId });
  } catch (e) {
    if (!isConflict(e)) throw e;
    return await afterConflict();
  }
}
