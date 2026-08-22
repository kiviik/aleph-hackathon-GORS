// One rule: is this (brand, collection) pair safe to ask the engine about?
//
// THE BUG THIS FIXES. `brandId` and `activeId` come from two different
// providers and do not change in the same render. On a brand switch the new
// `brandId` lands immediately, while `CollectionProvider` clears `activeId` in
// an effect — which runs AFTER the render that already paired them. So every
// component doing
//
//     useEffect(() => { fetch(brandId, activeId) }, [brandId, activeId])
//
// fires exactly once with the NEW brand and the PREVIOUS brand's collection,
// and the engine answers 404. The engine is right: that is the tenancy check
// working, and it is the only reason this was visible at all. The defect is
// that we asked a question whose two halves came from different tenants.
//
// The fix is not "handle the 404" — it is to not ask. A component may query a
// collection only once that collection is KNOWN to be one of this brand's, and
// the loaded list is the only thing that knows.
//
// ⚠ THIS IS NOT THE SAME AS "there are no collections". The codebase keeps a
// deliberate three-state distinction — `undefined` not asked yet, `null` could
// not ask, `[]` asked and there are none (see `components/views/TechPack.jsx`).
// This function answers a NARROWER question: may I send this request. A false
// here means "not yet, or not coherent" and callers keep their own empty and
// error copy. A cleared collection is not a failed request.

/**
 * @param {object} scope
 * @param {string|null} scope.brandId   the tenant now in context
 * @param {string|null} scope.activeId  the collection the UI thinks is active
 * @param {Array|null}  scope.collections        the loaded collection list
 * @param {string|null} scope.collectionsBrandId the brand that list was loaded
 *   FOR — `CollectionProvider`'s own `brandId`, which is NOT the same value as
 *   the engine's current brand during a switch
 * @param {boolean}     scope.loading   the list is still in flight
 * @returns {boolean} true only when all three provably belong together
 */
export function canQueryCollection(
  { brandId, activeId, collections, collectionsBrandId, loading } = {},
) {
  if (!brandId || !activeId) return false;
  // Mid-load the list is the PREVIOUS brand's or empty, so it cannot vouch for
  // anything. Waiting one tick is the entire cost of this fix.
  if (loading) return false;
  if (!Array.isArray(collections)) return false;

  // ⚠ THE CHECK A FIRST ATTEMPT AT THIS MISSED, FOUND BY WATCHING THE NETWORK
  // TAB RATHER THAN THE TESTS. Membership alone is not enough, because on a
  // brand switch the LIST is stale too: there is a render where brandId is the
  // new tenant, activeId is the old collection, AND `collections` is still the
  // old brand's list — which cheerfully contains that id. Three values from
  // three different update timings, and checking two of them still let the
  // request through. The list must say which brand it belongs to, and it must
  // be this one.
  if (!collectionsBrandId || collectionsBrandId !== brandId) return false;

  // Membership, not a count: a non-empty list belonging to the right brand
  // still does not make an outside id valid.
  return collections.some((c) => c && c.id === activeId);
}
