// Carrying scan verdicts across app restarts.
//
// The band state (the 160-cell EMA and its tick count) was already persisted, but the *verdicts*
// were not: `spots` was re-seeded from the fixture on every mount, so re-opening the app showed an
// all-grey "unscanned" map for the ~5 minutes the camera rotation needs to look at all 13 cameras
// again -- even though the answers from a minute ago were still sitting on disk.
//
// Two things a restored verdict must never do: outlive its evidence, or survive geometry it no
// longer describes. Hence the age limit and the fixture check below.

/**
 * How long a stored verdict may still be shown. Matched to temporal.mjs's MAX_GAP_MS: past that,
 * the band state it came from is wiped as too old to build on, so the verdict has no business
 * still being on the map either.
 */
export const RESTORE_MAX_AGE_MS = 30 * 60 * 1000

/**
 * The half of a spot that a scan produced. Geometry, labels and placement are re-seeded from the
 * fixture on every mount, so storing them would only create a way for the two to disagree.
 */
export const VERDICT_KEYS = [
  'status', 'confidence', 'checked', 'capturedAt', 'carsFit', 'freeMetres',
  'decision', 'reason', 'rule', 'ticks', 'gaps', 'scanned'
]

export function verdictOf (spot) {
  const out = {}
  for (const key of VERDICT_KEYS) if (spot[key] !== undefined) out[key] = spot[key]
  return out
}

/** What to write to storage: only scanned spots, tagged with the fixture they were judged against. */
export function packVerdicts (spots, exportedAt) {
  return {
    exportedAt,
    spots: Object.fromEntries(spots.filter((s) => s.scanned).map((s) => [s.id, verdictOf(s)]))
  }
}

/**
 * What may be shown again, from a stored blob.
 *
 * A verdict is dropped when the fixture changed (band ids are positional, so the same id can mean a
 * different curb after a re-export), when it has no frame time, or when that frame is older than
 * RESTORE_MAX_AGE_MS -- stale evidence must read as unscanned, not as a current answer.
 *
 * @returns {Record<string, object>} verdicts by spot id, empty when nothing may be restored
 */
export function restoreVerdicts (blob, exportedAt, now = Date.now()) {
  if (!blob || blob.exportedAt !== exportedAt || !blob.spots) return {}
  const out = {}
  for (const [id, verdict] of Object.entries(blob.spots)) {
    if (!verdict || !Number.isFinite(verdict.capturedAt)) continue
    if (now - verdict.capturedAt > RESTORE_MAX_AGE_MS) continue
    out[id] = verdict
  }
  return out
}
