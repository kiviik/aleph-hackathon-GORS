// Drop every camera listed in data/disabled-cameras.json from the shipped fixture, in place.
//
//   npm run prune:disabled [-- --dry-run]
//
// `export:bands` already honours that file, but a full export also re-runs zone matching, which
// moves rules and side wording at the same time. When the only decision made is "this camera must
// not ship", this applies just that.
import fs from 'node:fs/promises'
import path from 'node:path'
import { dataFile, MOBILE_DATA, rel } from '../src/paths.mjs'

const DRY = process.argv.includes('--dry-run')
const file = path.join(MOBILE_DATA, 'bands.json')
const doc = JSON.parse(await fs.readFile(file, 'utf8'))
const disabled = JSON.parse(await fs.readFile(dataFile('disabled-cameras.json'), 'utf8'))

const drop = Object.keys(disabled.cameras ?? {}).filter((id) => doc.cameras[id])
for (const id of drop) {
  console.log(`${id}: ${doc.cameras[id].bands.length} band(s) dropped — ${disabled.cameras[id].why}`)
  delete doc.cameras[id]
}
const stillListed = Object.keys(disabled.cameras ?? {}).filter((id) => !drop.includes(id))
if (stillListed.length) console.log(`already absent: ${stillListed.join(', ')}`)
if (!drop.length) { console.log('nothing to prune'); process.exit(0) }

// The phone keys stored band history on exportedAt. A camera that has gone away must take its
// saved verdicts with it rather than lingering on the map as a stale pin.
doc.exportedAt = new Date().toISOString()
const bands = Object.values(doc.cameras).reduce((n, c) => n + c.bands.length, 0)
if (DRY) { console.log(`\ndry run: would leave ${Object.keys(doc.cameras).length} cameras, ${bands} bands`); process.exit(0) }
await fs.writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
console.log(`\nwrote ${rel(file)} — ${Object.keys(doc.cameras).length} cameras, ${bands} bands`)
