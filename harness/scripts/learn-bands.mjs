// Relearn one camera's parking bands from its local tracked detection history.
//
// Usage:
//   npm run learn:bands -- path/to/76.jsonl
//
// Output is written to stdout for review. It never edits state.json or bands.json implicitly.
import fs from 'node:fs/promises'
import path from 'node:path'
import { annotateDwell } from '../../mobile/src/core/stationary.mjs'
import { learnBands } from '../../mobile/src/core/band-learning.mjs'
import { fitScale } from '../../mobile/src/core/scale.mjs'

const input = process.argv[2]
if (!input) {
  console.error('Usage: npm run learn:bands -- path/to/camera-history.jsonl')
  process.exitCode = 2
} else {
  const observations = normalise(await readHistory(path.resolve(input)))
  if (observations.length < 4) throw new Error(`Need at least 4 observations; found ${observations.length}`)

  const tracked = observations.every((observation) =>
    observation.vehicles.every((vehicle) => Number.isFinite(vehicle.dwell)))
    ? observations
    : annotateDwell(observations)
  const bands = learnBands(tracked)
  const scales = Object.fromEntries(bands.map((band) => [band.id, fitScale(band, tracked)]))

  process.stdout.write(`${JSON.stringify({ bands, scales }, null, 2)}\n`)
}

async function readHistory (file) {
  const raw = await fs.readFile(file, 'utf8')
  if (path.extname(file).toLowerCase() === '.jsonl') {
    return raw.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line))
  }
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.observations)) return parsed.observations
  throw new Error('History must be a JSON array, { observations: [] }, or newline-delimited JSON')
}

function normalise (observations) {
  return observations.map((observation, frame) => ({
    ...observation,
    capturedAt: observation.capturedAt ?? observation.captured_at ?? frame,
    vehicles: (observation.vehicles || []).map((vehicle) => {
      if (!Array.isArray(vehicle.box) || vehicle.box.length !== 4) return vehicle
      const [x1, y1, x2, y2] = vehicle.box
      return {
        ...vehicle,
        bottomCenter: vehicle.bottomCenter || [(x1 + x2) / 2, y2],
        w: vehicle.w ?? x2 - x1,
        h: vehicle.h ?? y2 - y1
      }
    })
  })).sort((a, b) => a.capturedAt - b.capturedAt)
}
