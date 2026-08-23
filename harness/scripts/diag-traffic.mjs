// Per-metre traffic profile along a band, from collected history.
//   node scripts/diag-traffic.mjs <cameraId> [--learned]
//
// The learner's travel-lane test is band-WIDE: a band that is half curb and half intersection
// averages out and passes. This prints the same measurement cell by cell, so the stretch that is
// actually a travel lane is visible.
import fs from 'node:fs/promises'
import path from 'node:path'
import { annotateDwell, isParked } from '../../mobile/src/core/stationary.mjs'
import { projectToAxis } from '../../mobile/src/core/geom.mjs'
import { metresBetween, pxForMetres } from '../../mobile/src/core/scale.mjs'
import { historyFile, normalise, readHistory } from '../src/history.mjs'
import { dataFile, MOBILE_DATA } from '../src/paths.mjs'

const CAM = process.argv[2]
const LEARNED = process.argv.includes('--learned')
const doc = JSON.parse(await fs.readFile(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))
let cam = doc.cameras[CAM]
if (LEARNED) {
  const l = JSON.parse(await fs.readFile(dataFile('learned-bands.json'), 'utf8'))
  cam = { ...cam, bands: l.cameras[CAM].bands, scales: l.cameras[CAM].scales }
}
const raw = await readHistory(historyFile(CAM))
const obs = normalise(raw, { passes: ['full', 'far'] })
const tracked = obs.every((o) => o.vehicles.every((v) => Number.isFinite(v.dwell))) ? obs : annotateDwell(obs)
console.log(`camera ${CAM}: ${tracked.length} frames`)

for (const band of cam.bands) {
  const scale = cam.scales[band.id]
  const probe = Math.max(band.halfWidth, band.meanBoxH * 0.35)
  // 1 m cells along the axis.
  const edges = [0]
  while (edges[edges.length - 1] < band.length) edges.push(Math.min(band.length, edges[edges.length - 1] + Math.max(2, pxForMetres(scale, edges[edges.length - 1], 1))))
  const moving = new Array(edges.length - 1).fill(0)
  const parked = new Array(edges.length - 1).fill(0)
  for (const o of tracked) {
    for (const v of o.vehicles) {
      const { t, n } = projectToAxis(band, v.bottomCenter)
      if (Math.abs(n) > probe || t < 0 || t > band.length) continue
      let i = edges.findIndex((e, k) => k < edges.length - 1 && t >= e && t < edges[k + 1])
      if (i < 0) i = moving.length - 1
      if (isParked(v)) parked[i]++; else moving[i]++
    }
  }
  const [c0, c1] = band.coreT
  console.log(`\n${band.id}  length ${band.length.toFixed(0)}px  core ${c0.toFixed(0)}-${c1.toFixed(0)}  probe ${probe.toFixed(1)}px`)
  console.log('   t(px)   metres  moving/frame  parked/frame  ratio   core?')
  for (let i = 0; i < moving.length; i++) {
    const mid = (edges[i] + edges[i + 1]) / 2
    const mv = moving[i] / tracked.length, pk = parked[i] / tracked.length
    const ratio = moving[i] / Math.max(1, moving[i] + parked[i])
    const bar = '#'.repeat(Math.min(40, Math.round(mv * 20)))
    console.log(`  ${edges[i].toFixed(0).padStart(5)} ${metresBetween(scale, 0, mid).toFixed(1).padStart(7)} ${mv.toFixed(3).padStart(12)} ${pk.toFixed(3).padStart(13)} ${ratio.toFixed(2).padStart(7)}  ${mid >= c0 && mid <= c1 ? 'core' : '    '}  ${bar}`)
  }
}
