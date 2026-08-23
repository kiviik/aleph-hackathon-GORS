// A/B the core clip on collected history: how much reported free space lay outside the learned core?
//   node scripts/diag-freeab.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { annotateDwell, isParked } from '../../mobile/src/core/stationary.mjs'
import { coreRange, inBand } from '../../mobile/src/core/band.mjs'
import { computeGaps } from '../../mobile/src/core/gaps.mjs'
import { boxExtent, metresBetween, pxForMetres, pxPerMetre } from '../../mobile/src/core/scale.mjs'
import { createBandState, updateBandState, stableGaps } from '../../mobile/src/core/temporal.mjs'
import { historyFile, listHistories, normalise, readHistory } from '../src/history.mjs'
import { MOBILE_DATA } from '../src/paths.mjs'

const MIN_GAP_M = 5.5, CAR_SLOT_M = 5.5, BUFFER_M = 0.3, MIN_GAP_PX = 24, MIN_PX_PER_M = 3

/** computeGaps as it was BEFORE the core clip: free over the whole band. */
function computeGapsUnclipped (band, scale, vehicles) {
  const occupied = [], unknown = []
  for (const v of vehicles) {
    if (!inBand(band, v.bottomCenter)) continue
    let [lo, hi] = boxExtent(band, v.box)
    const buf = pxForMetres(scale, (lo + hi) / 2, BUFFER_M)
    lo = Math.max(0, lo - buf); hi = Math.min(band.length, hi + buf)
    if (hi <= lo) continue
    ;(isParked(v) ? occupied : unknown).push([lo, hi])
  }
  const merge = (iv) => { const s = [...iv].sort((a, b) => a[0] - b[0]), out = []
    for (const i of s) { const l = out[out.length - 1]; if (l && i[0] <= l[1]) l[1] = Math.max(l[1], i[1]); else out.push([i[0], i[1]]) } return out }
  const blocked = merge([...occupied, ...unknown])
  const free = []
  let cursor = 0
  for (const [lo, hi] of [...blocked, [band.length, band.length]]) {
    if (lo > cursor) {
      const metres = metresBetween(scale, cursor, lo)
      if (metres >= MIN_GAP_M && lo - cursor >= MIN_GAP_PX && pxPerMetre(scale, (cursor + lo) / 2) >= MIN_PX_PER_M) {
        free.push({ t1: cursor, t2: lo, metres: +metres.toFixed(1), carsFit: Math.floor(metres / CAR_SLOT_M), centreT: (cursor + lo) / 2 })
      }
    }
    cursor = Math.max(cursor, hi)
  }
  return { occupied: merge(occupied), unknown: merge(unknown), free }
}

const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
console.log('camera/band  frames | BEFORE free-frames  car-slots | AFTER free-frames  car-slots | free entirely outside core')
let totBefore = 0, totAfter = 0, totOutside = 0
for (const h of await listHistories()) {
  const id = path.basename(h.file).replace(/\.jsonl$/, '')
  const cam = doc.cameras[id]
  if (!cam) continue
  const raw = await readHistory(historyFile(id))
  const obs = normalise(raw, { passes: ['full', 'far'] })
  const tracked = obs.every((o) => o.vehicles.every((v) => Number.isFinite(v.dwell))) ? obs : annotateDwell(obs)
  for (const band of cam.bands) {
    const scale = cam.scales[band.id]
    const core = coreRange(band)
    const sBefore = createBandState(band), sAfter = createBandState(band)
    let fBefore = 0, fAfter = 0, slotsBefore = 0, slotsAfter = 0, outside = 0
    let now = 0
    for (const o of tracked) {
      now += 60000 // history is ~100 s apart; anything under MAX_GAP_MS keeps the EMA alive
      const before = computeGapsUnclipped(band, scale, o.vehicles)
      const after = computeGaps(band, scale, o.vehicles)
      updateBandState(sBefore, before, { now })
      updateBandState(sAfter, after, { now })
      const gb = stableGaps(sBefore, scale), ga = stableGaps(sAfter, scale)
      if (gb.length) { fBefore++; slotsBefore += gb.reduce((s, g) => s + g.carsFit, 0) }
      if (ga.length) { fAfter++; slotsAfter += ga.reduce((s, g) => s + g.carsFit, 0) }
      for (const g of gb) if (g.t2 <= core[0] || g.t1 >= core[1]) outside++
    }
    totBefore += fBefore; totAfter += fAfter; totOutside += outside
    console.log(`${(id + '/' + band.id).padEnd(12)} ${String(tracked.length).padStart(6)} | ${String(fBefore).padStart(12)} ${String(slotsBefore).padStart(10)} | ${String(fAfter).padStart(11)} ${String(slotsAfter).padStart(10)} | ${String(outside).padStart(6)}`)
  }
}
console.log(`\nframes reporting FREE: ${totBefore} -> ${totAfter}; confirmed gaps lying entirely outside the core: ${totOutside}`)
