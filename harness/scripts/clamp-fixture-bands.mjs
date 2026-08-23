// One-off: enforce the extension bound on the geometry already shipped in mobile/src/data/bands.json.
//
// The bands were padded in the research repo by a flat two car lengths per end, with no relation
// to how much curb each one observed; all fourteen are over the bound `extendBandBounded` applies
// to anything learned here. Re-exporting is not the way to fix that -- `export:bands` also re-runs
// zone matching, which would change per-band rules at the same time. This touches geometry only.
//
//   node scripts/clamp-fixture-bands.mjs [--dry-run]
import fs from 'node:fs/promises'
import path from 'node:path'
import { clampBandExtension, metresBetween } from '../../mobile/src/core/scale.mjs'
import { MOBILE_DATA, rel } from '../src/paths.mjs'

const DRY = process.argv.includes('--dry-run')
const file = path.join(MOBILE_DATA, 'bands.json')
const doc = JSON.parse(await fs.readFile(file, 'utf8'))
let changed = 0

for (const [id, cam] of Object.entries(doc.cameras)) {
  cam.bands = cam.bands.map((b) => {
    const before = cam.scales[b.id]
    const { band, scale } = clampBandExtension(b, before)
    if (band.length >= b.length - 0.05) return b
    changed++
    const preM = metresBetween(scale, 0, band.coreT[0])
    const postM = metresBetween(scale, band.coreT[1], band.length)
    const wasPre = metresBetween(before, 0, b.coreT[0])
    const wasPost = metresBetween(before, b.coreT[1], b.length)
    console.log(`${id}/${b.id}: ${b.length.toFixed(0)} -> ${band.length.toFixed(0)} px · guessed curb ${wasPre.toFixed(1)}+${wasPost.toFixed(1)} -> ${preM.toFixed(1)}+${postM.toFixed(1)} m`)
    cam.scales[b.id] = scale
    return band
  })
}

if (!changed) { console.log('every band already inside the bound'); process.exit(0) }
// Geometry moved, so every band's persisted history now describes a different stretch of curb.
// The phone keys its stored state on exportedAt: bumping it is what discards that history.
doc.exportedAt = new Date().toISOString()
if (DRY) { console.log(`\ndry run: ${changed} band(s) would change`); process.exit(0) }
await fs.writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
console.log(`\nwrote ${rel(file)} — ${changed} band(s) clamped, exportedAt bumped`)
