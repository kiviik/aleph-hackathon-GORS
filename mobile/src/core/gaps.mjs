// Free curb intervals along a band for one frame, from parked/moving vehicle extents.
import { isParked } from './stationary.mjs'
import { freeRange, inBand } from './band.mjs'
import { boxExtent, metresBetween, pxForMetres, pxPerMetre } from './scale.mjs'

export const MIN_GAP_M = 5.5
export const CAR_SLOT_M = 5.5
export const BUFFER_M = 0.3
export const MIN_GAP_PX = 24      // a gap this small in the image cannot be judged, whatever the scale says
export const MIN_PX_PER_M = 3     // below ~14 px per car the detector is unreliable: far ends of a band are never "free"

/**
 * FREE is claimed only inside the learned core -- the stretch cars were actually seen parked on.
 *
 * `extendBand` pads each end past the last parked car so the gap logic and the texture guard can
 * look just beyond it. Looking is fine; *claiming* it is not. That padding is where the app's worst
 * readings came from: camera 219's band runs out of its curb and across the 6 Ave SW / 10 St SW
 * intersection, and over 302 collected frames no vehicle ever parked in that stretch -- yet it
 * is flat asphalt, so the texture guard passes it and the app offered 10.3 m of parking in an
 * intersection. No metre bound fixes that; at 31 px/m the near end swallows a whole junction in
 * seven metres. The only thing that separates parkable curb from open roadway here is that somebody
 * parked on it, which is exactly what `freeRange` records: `freeT` where history has been baked
 * in, the learned core otherwise.
 *
 * OCCUPIED and UNKNOWN are deliberately NOT clipped: a car straddling the core boundary still
 * blocks the curb, and the texture guard still reads the whole band.
 *
 * The cost is real and one-sided: on a camera with no baked history the fallback is the tighter
 * core, so a genuinely free stretch just past it -- camera 157's 7 m below its parked cars -- reads
 * UNCERTAIN rather than FREE until that camera's history is collected. That is the direction this
 * system errs in everywhere else.
 *
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
  const core = freeRange(band)
  const blocked = merge([...occupied, ...unknown])
  const free = []
  let cursor = 0
  for (const [lo, hi] of [...blocked, [band.length, band.length]]) {
    if (lo > cursor) pushFree(cursor, lo)
    cursor = Math.max(cursor, hi)
  }
  function pushFree (rawT1, rawT2) {
    const t1 = Math.max(rawT1, core[0]), t2 = Math.min(rawT2, core[1])
    if (t2 <= t1) return
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
