// Which parking zone governs which curb.
//
// This matters more than it looks. Opposite curbs of one block are usually two different zones,
// and measured over data/zones.json 47% of opposite-side pairs differ in some rule while 25%
// differ in the restriction window itself. Camera 76 is one of them: the east curb bans
// 07:00-08:30 and 15:30-18:00, the west curb has no restriction at all. Applying one curb's law to
// the other is how the app denies a legal spot -- or authorises a banned one.
//
// `cameras.json` carries no camera pose, so image pixels cannot be projected onto the ground:
// every automatic match here is a heuristic over distance, side and apparent size. It therefore
// proposes with `confidence: 'high'` or refuses with `zoneId: null`, and a human-verified override
// table (data/band-zones.json) always wins. A null is safe -- `buildRules(null)` reports
// UNAVAILABLE and the policy refuses. A confident wrong guess is not.
import { normStreet, zoneLengthM, zonesNear, zoneOnCameraStreet } from './zones.mjs'

/** Both bands must plausibly be one street's two curbs before a pair is proposed at all. */
export const PAIR_RULES = {
  radiusM: 120,
  /** Opposite curbs differ in distance from the camera by at least this much. */
  minDistanceGapM: 4,
  /** ... and in apparent car size by at least this ratio (the near curb looks bigger). */
  minBoxHeightRatio: 1.25,
  /** A band may not claim more curb than its zone plausibly holds. */
  maxLengthRatio: 1.35
}

/** Metres of curb a band can read, and how near it is. `scale` may be missing. */
export function bandMetrics (band, scale) {
  const angleDeg = (Math.atan2(band.dir[1], band.dir[0]) * 180) / Math.PI
  const midPxPerM = scale?.ok ? Math.max(1, scale.a + scale.b * (band.length / 2)) : null
  return { angleDeg, midPxPerM, meanBoxH: band.meanBoxH ?? null }
}

/**
 * Do two bands look like the two curbs of ONE street, rather than two streets meeting?
 * Two curbs converge toward a vanishing point *outside* both bands; two crossing streets intersect
 * somewhere inside them.
 */
export function bandsShareStreet (a, b, { insideFrac = 0.2 } = {}) {
  const det = a.dir[0] * -b.dir[1] - a.dir[1] * -b.dir[0]
  if (Math.abs(det) < 1e-6) return true // exactly parallel: same street, no vanishing point in view
  const dx = b.p0[0] - a.p0[0]
  const dy = b.p0[1] - a.p0[1]
  const tA = (dx * -b.dir[1] - dy * -b.dir[0]) / det
  const tB = (a.dir[0] * dy - a.dir[1] * dx) / det
  const inside = (t, band) => t > -insideFrac * band.length && t < band.length * (1 + insideFrac)
  return !(inside(tA, a) && inside(tB, b))
}

/** Zones near a camera, grouped by street address, with the sides each one covers. */
export function curbPairs (near) {
  const groups = new Map()
  for (const n of near) {
    const street = normStreet((n.zone.address || '').split(',').slice(0, 2).join(','))
    if (!groups.has(street)) groups.set(street, { street, bySide: {}, records: [] })
    const g = groups.get(street)
    const side = n.zone.blockSide || '?'
    ;(g.bySide[side] ||= []).push(n)
    g.records.push(n)
  }
  return [...groups.values()]
}

const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' }

/**
 * Propose a zone per band.
 * @returns {Record<string, {zoneId: string|null, confidence: 'high'|'none', why: string, candidates: any[]}>}
 */
export function proposeBandZones (camera, bands, scales, zones, { radiusM = PAIR_RULES.radiusM } = {}) {
  const near = zonesNear(camera, zones, radiusM)
  const onStreet = near.filter((n) => zoneOnCameraStreet(n.zone, camera))
  const fallback = (onStreet[0] || near[0])?.zone ?? null
  const out = {}
  const candidates = near.slice(0, 6).map((n) => ({
    zoneId: n.zone.id, blockSide: n.zone.blockSide, distanceM: n.distanceM,
    lengthM: +zoneLengthM(n.zone).toFixed(1), onCameraStreet: zoneOnCameraStreet(n.zone, camera)
  }))

  // The highest-support band keeps today's camera-level match, so single-band cameras are unchanged.
  const ranked = [...bands].sort((a, b) => (b.support ?? 0) - (a.support ?? 0))
  for (const band of bands) {
    out[band.id] = {
      zoneId: band.id === ranked[0]?.id ? fallback?.id ?? null : null,
      confidence: 'none',
      why: band.id === ranked[0]?.id ? 'camera-level match (highest support)' : 'no per-band evidence',
      candidates
    }
  }
  if (bands.length !== 2) return out

  const [a, b] = bands
  if (!bandsShareStreet(a, b)) {
    for (const band of bands) out[band.id].why = 'bands cross: they are two streets, not two curbs'
    return out
  }

  const pair = curbPairs(onStreet).find((g) => {
    const sides = Object.keys(g.bySide).filter((s) => OPPOSITE[s])
    return sides.some((s) => sides.includes(OPPOSITE[s]))
  })
  if (!pair) {
    for (const band of bands) out[band.id].why = 'no opposite-side zone pair on a camera street within range'
    return out
  }

  const sideA = Object.keys(pair.bySide).find((s) => OPPOSITE[s] && pair.bySide[OPPOSITE[s]])
  const groups = [pair.bySide[sideA], pair.bySide[OPPOSITE[sideA]]]
    .map((records) => ({
      side: records[0].zone.blockSide,
      nearest: records.reduce((m, r) => (r.distanceM < m.distanceM ? r : m)),
      lengthM: records.reduce((s, r) => s + zoneLengthM(r.zone), 0)
    }))
    .sort((x, y) => x.nearest.distanceM - y.nearest.distanceM)

  const boxA = a.meanBoxH ?? 0
  const boxB = b.meanBoxH ?? 0
  const ratio = Math.max(boxA, boxB) / Math.max(1, Math.min(boxA, boxB))
  const distanceGap = Math.abs(groups[0].nearest.distanceM - groups[1].nearest.distanceM)

  if (ratio < PAIR_RULES.minBoxHeightRatio) {
    for (const band of bands) out[band.id].why = `bands look equally distant (box height ratio ${ratio.toFixed(2)})`
    return out
  }
  if (distanceGap < PAIR_RULES.minDistanceGapM) {
    for (const band of bands) out[band.id].why = `zone pair is only ${distanceGap.toFixed(1)} m apart from the camera — too close to tell apart`
    return out
  }

  // Bigger cars = nearer curb = nearer zone.
  const nearBand = boxA >= boxB ? a : b
  const farBand = nearBand === a ? b : a
  const assign = [[nearBand, groups[0]], [farBand, groups[1]]]
  for (const [band, group] of assign) {
    const metres = band.length && scales?.[band.id]?.ok ? bandMetres(band, scales[band.id]) : null
    if (metres && metres > PAIR_RULES.maxLengthRatio * group.lengthM) {
      for (const x of bands) out[x.id] = { ...out[x.id], confidence: 'none', why: `band ${band.id} reads ${metres.toFixed(1)} m of a ${group.lengthM.toFixed(1)} m zone — the match is not credible` }
      return out
    }
  }
  for (const [band, group] of assign) {
    out[band.id] = {
      zoneId: group.nearest.zone.id,
      confidence: 'high',
      why: `${band === nearBand ? 'near' : 'far'} curb (box height ${band.meanBoxH}), ${group.side} side at ${group.nearest.distanceM} m`,
      sideKey: group.side,
      nearness: band === nearBand ? 'near' : 'far',
      candidates
    }
  }
  return out
}

function bandMetres (band, scale) {
  const { a, b } = scale
  const [t0, t1] = band.coreT ?? [0, band.length]
  if (Math.abs(b) < 1e-9) return (t1 - t0) / Math.max(1, a)
  const f1 = Math.max(1, a + b * t0)
  const f2 = Math.max(1, a + b * t1)
  return Math.log(f2 / f1) / b
}

/**
 * Merge proposals with the human-verified override table. Overrides always win, including an
 * explicit `null`, which is how a reviewer says "this curb's zone is unknown, refuse".
 */
export function applyOverrides (cameraId, proposals, overrides) {
  const table = overrides?.cameras?.[cameraId] ?? {}
  const out = {}
  for (const [bandId, proposal] of Object.entries(proposals)) {
    if (!(bandId in table)) { out[bandId] = { ...proposal, source: proposal.zoneId ? (proposal.confidence === 'high' ? 'proposed' : 'inherited') : 'unknown' }; continue }
    const override = table[bandId] ?? {}
    out[bandId] = {
      ...proposal,
      zoneId: override.zoneId ?? null,
      sideKey: override.sideKey ?? proposal.sideKey ?? null,
      nearness: override.nearness ?? proposal.nearness ?? null,
      confidence: 'high',
      source: 'override',
      why: override.verifiedBy ? `verified: ${override.verifiedBy}` : 'human override'
    }
  }
  return out
}
