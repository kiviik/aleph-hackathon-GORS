// Free curb intervals along a band for one frame, from parked/moving vehicle extents.
import { isParked } from './stationary.mjs'
import { inBand } from './band.mjs'
import { boxExtent, metresBetween, pxForMetres, pxPerMetre } from './scale.mjs'

export const MIN_GAP_M = 5.5
export const CAR_SLOT_M = 5.5
export const BUFFER_M = 0.3
export const MIN_GAP_PX = 24      // a gap this small in the image cannot be judged, whatever the scale says
export const MIN_PX_PER_M = 3     // below ~14 px per car the detector is unreliable: far ends of a band are never "free"

/**
 * @returns {occupied:[[t1,t2]], unknown:[[t1,t2]], free:[{t1,t2,metres,carsFit,centreT}]} all in axis px, clipped to [0, length]
 */
export function computeGaps (band, scale, vehicles) {
  const occupied = [], unknown = []
  for (const v of vehicles) {
    if (!inBand(band, v.bottomCenter)) continue
    let [lo, hi] = boxExtent(band, v.box)
    const buf = pxForMetres(scale, (lo + hi) / 2, BUFFER_M)
    lo = Math.max(0, lo - buf); hi = Math.min(band.length, hi + buf)
    if (hi <= lo) continue
    ;(isParked(v) ? occupied : unknown).push([lo, hi])
  }
  const blocked = merge([...occupied, ...unknown])
  const free = []
  let cursor = 0
  for (const [lo, hi] of [...blocked, [band.length, band.length]]) {
    if (lo > cursor) pushFree(cursor, lo)
    cursor = Math.max(cursor, hi)
  }
  function pushFree (t1, t2) {
    const metres = metresBetween(scale, t1, t2)
    if (metres < MIN_GAP_M || t2 - t1 < MIN_GAP_PX || pxPerMetre(scale, (t1 + t2) / 2) < MIN_PX_PER_M) return
    free.push({ t1: r1(t1), t2: r1(t2), metres: +metres.toFixed(1), carsFit: Math.floor(metres / CAR_SLOT_M), centreT: r1((t1 + t2) / 2) })
  }
  return { occupied: merge(occupied).map((i) => i.map(r1)), unknown: merge(unknown).map((i) => i.map(r1)), free }
}

export function merge (intervals) {
  const s = [...intervals].sort((a, b) => a[0] - b[0])
  const out = []
  for (const iv of s) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

function r1 (v) { return +v.toFixed(1) }
