// Observed parking envelope vs the fitted core, per band, from collected history.
import fs from 'node:fs/promises'
import path from 'node:path'
import { annotateDwell, isParked } from '../../mobile/src/core/stationary.mjs'
import { coreRange } from '../../mobile/src/core/band.mjs'
import { projectToAxis } from '../../mobile/src/core/geom.mjs'
import { groundExtent, metresBetween } from '../../mobile/src/core/scale.mjs'
import { historyFile, listHistories, normalise, readHistory } from '../src/history.mjs'
import { MOBILE_DATA } from '../src/paths.mjs'

const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
for (const h of await listHistories()) {
  const id = path.basename(h.file).replace(/\.jsonl$/, '')
  const cam = doc.cameras[id]
  if (!cam) continue
  const raw = await readHistory(historyFile(id))
  const obs = normalise(raw, { passes: ['full', 'far'] })
  const tracked = obs.every((o) => o.vehicles.every((v) => Number.isFinite(v.dwell))) ? obs : annotateDwell(obs)
  for (const band of cam.bands) {
    const scale = cam.scales[band.id]
    const probe = Math.max(band.halfWidth, band.meanBoxH * 0.35)
    // Coverage per pixel, so the envelope can be taken at a support threshold instead of at the
    // single most extreme observation -- one mis-tracked car should not open a whole junction.
    const cover = new Float64Array(Math.ceil(band.length) + 1)
    let n = 0
    for (const o of tracked) for (const v of o.vehicles) {
      if (!isParked(v)) continue
      const { n: off } = projectToAxis(band, v.bottomCenter)
      if (Math.abs(off) > probe) continue
      const [a, b] = groundExtent(band, v.box)       // ground contact only: boxExtent leaks box height into length
      if (b < 0 || a > band.length) continue
      for (let t = Math.max(0, Math.floor(a)); t <= Math.min(band.length, Math.ceil(b)); t++) cover[t]++
      n++
    }
    const need = Math.max(2, Math.round(0.01 * tracked.length))
    let lo = Infinity, hi = -Infinity
    for (let t = 0; t < cover.length; t++) if (cover[t] >= need) { lo = Math.min(lo, t); hi = Math.max(hi, t) }
    process.stdout.write(`${(id + '/' + band.id).padEnd(9)} coverage@${need}: `)
    for (let t = 0; t < cover.length; t += Math.max(1, Math.round(band.length / 40))) process.stdout.write(cover[t] >= need ? '#' : (cover[t] > 0 ? '.' : ' '))
    process.stdout.write('\n')
    const [c0, c1] = coreRange(band)
    if (!n) { console.log(`${id}/${band.id}: no parked observation at all`); continue }
    console.log(`${(id + '/' + band.id).padEnd(9)} len ${band.length.toFixed(0).padStart(4)}  core [${c0.toFixed(0).padStart(4)},${c1.toFixed(0).padStart(4)}]  envelope [${lo.toFixed(0).padStart(4)},${hi.toFixed(0).padStart(4)}]  ` +
      `env-core: ${(c0 - lo >= 0 ? '+' : '')}${(c0 - lo).toFixed(0)}px before / ${(hi - c1 >= 0 ? '+' : '')}${(hi - c1).toFixed(0)}px after  ` +
      `dead ends: ${metresBetween(scale, 0, lo).toFixed(1)}m / ${metresBetween(scale, hi, band.length).toFixed(1)}m  (${n} obs)`)
  }
}
