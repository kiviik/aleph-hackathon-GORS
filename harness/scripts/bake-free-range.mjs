// Bake `freeT` — the stretch of each band FREE may be claimed on — from collected history.
//
//   npm run bake:freerange            # every camera with history
//   npm run bake:freerange -- --dry-run
//
// A band is padded past its last parked car so the gap logic and the texture guard can look just
// beyond it. Looking is fine; claiming it is not. Camera 219's band runs off its curb and across
// the 6 Ave SW / 10 St SW intersection, and replaying its 302 collected frames, 144 of the 230
// frames that reported free space put that free space ENTIRELY in the intersection. No metre bound
// fixes it: at 31 px/m the near end swallows a junction in seven metres.
//
// What does fix it is the thing the padding threw away — whether a car has ever been there. This
// walks the history, marks every pixel of the axis a parked car's ground contact has covered, and
// keeps the outermost run supported by at least `--min-support` observations (1% of frames, floor
// 2), so one mis-tracked car cannot re-open a junction.
//
// The fitted `coreT` is NOT good enough for this: it is anchor-based and inlier-filtered, so it is
// systematically tighter than the curb. Cameras 27 and 76's near curb are parkable end to end and
// clipping them to their cores threw away most of their real free space.
import fs from 'node:fs/promises'
import path from 'node:path'
import { annotateDwell, isParked } from '../../mobile/src/core/stationary.mjs'
import { coreRange } from '../../mobile/src/core/band.mjs'
import { projectToAxis } from '../../mobile/src/core/geom.mjs'
import { groundExtent, metresBetween } from '../../mobile/src/core/scale.mjs'
import { historyFile, listHistories, normalise, readHistory } from '../src/history.mjs'
import { MOBILE_DATA, rel } from '../src/paths.mjs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const supportArg = argv.indexOf('--min-support')
const MIN_SUPPORT = supportArg >= 0 ? Number(argv[supportArg + 1]) : null
const PHONE_PASSES = ['full', 'far']

const file = path.join(MOBILE_DATA, 'bands.json')
const doc = JSON.parse(await fs.readFile(file, 'utf8'))
let changed = 0

for (const h of await listHistories()) {
  const id = path.basename(h.file).replace(/\.jsonl$/, '')
  const cam = doc.cameras[id]
  if (!cam) { console.log(`${id}: history but not in the fixture — skipped`); continue }
  const raw = await readHistory(historyFile(id))
  const observations = normalise(raw, { passes: PHONE_PASSES })
  const tracked = observations.every((o) => o.vehicles.every((v) => Number.isFinite(v.dwell))) ? observations : annotateDwell(observations)
  const need = MIN_SUPPORT ?? Math.max(2, Math.round(0.01 * tracked.length))

  for (const band of cam.bands) {
    const scale = cam.scales[band.id]
    // Probe at a car's width, not the shipped halfWidth: that one is a tight percentile of parked
    // residuals, and measuring through a strip narrower than a car undercounts the ends.
    const probe = Math.max(band.halfWidth, band.meanBoxH * 0.35)
    const cover = new Uint16Array(Math.ceil(band.length) + 1)
    let obs = 0
    for (const o of tracked) {
      for (const v of o.vehicles) {
        if (!isParked(v)) continue
        if (Math.abs(projectToAxis(band, v.bottomCenter).n) > probe) continue
        // Ground contact only. boxExtent projects all four corners and leaks box height into
        // length, which on a steep band would push the envelope metres past the real car.
        const [a, b] = groundExtent(band, v.box)
        if (b < 0 || a > band.length) continue
        for (let t = Math.max(0, Math.floor(a)); t <= Math.min(band.length, Math.ceil(b)); t++) cover[t]++
        obs++
      }
    }
    let lo = -1, hi = -1
    for (let t = 0; t < cover.length; t++) if (cover[t] >= need) { if (lo < 0) lo = t; hi = t }
    if (lo < 0) {
      console.log(`${id}/${band.id}: no stretch reached ${need} parked observations in ${tracked.length} frames — leaving the core as the bound`)
      continue
    }
    const before = coreRange(band)
    const freeT = [lo, hi]
    const same = Array.isArray(band.freeT) && band.freeT[0] === lo && band.freeT[1] === hi
    band.freeT = freeT
    band.freeSupport = { frames: tracked.length, observations: obs, minSupport: need }
    if (!same) changed++
    console.log(`${(id + '/' + band.id).padEnd(9)} freeT [${String(lo).padStart(3)},${String(hi).padStart(3)}] of ${band.length.toFixed(0)}  (core [${before.map((v) => v.toFixed(0)).join(',')}])  ` +
      `unclaimable ends: ${metresBetween(scale, 0, lo).toFixed(1)} m / ${metresBetween(scale, hi, band.length).toFixed(1)} m  · ${obs} parked obs in ${tracked.length} frames`)
  }
}

if (!changed) { console.log('\nno band changed'); process.exit(0) }
doc.exportedAt = new Date().toISOString()
if (DRY) { console.log(`\ndry run: ${changed} band(s) would change`); process.exit(0) }
await fs.writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
console.log(`\nwrote ${rel(file)} — freeT baked on ${changed} band(s), exportedAt bumped`)
