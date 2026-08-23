// Relearn a camera's parking bands from collected detection history.
//
//   npm run learn:bands -- data/history/76.jsonl                    # print to stdout
//   npm run learn:bands -- --all --out data/learned-bands.json      # every collected camera
//   npm run learn:bands -- data/history/76.jsonl --merge --out data/learned-bands.json
//
// The learner fits one narrow curb line, removes only that line's inliers, and keeps looking for
// another supported line. Cars parked on opposite sides therefore stay independent bands instead
// of pulling a single wide fit toward the middle of the road.
//
// It never edits `data/state.json` or the mobile fixture: it writes only the path given with
// `--out`, and only `export:bands` ever touches `mobile/src/data/bands.json`.
import fs from 'node:fs/promises'
import path from 'node:path'
import { annotateDwell } from '../../mobile/src/core/stationary.mjs'
import { learnBands, DEFAULT_LEARNING_OPTIONS } from '../../mobile/src/core/band-learning.mjs'
import { extendBandBounded, fitScale } from '../../mobile/src/core/scale.mjs'
import { frameSize, listHistories, normalise, readHistory } from '../src/history.mjs'
import { rel } from '../src/paths.mjs'

/** The passes the phone actually runs. Learning from more would teach it curb it cannot re-detect. */
const PHONE_PASSES = ['full', 'far']

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const inputs = argv.filter((a) => !a.startsWith('--'))
const outIndex = argv.indexOf('--out')
const outFile = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : null
const positional = inputs.filter((a) => a !== (outIndex >= 0 ? argv[outIndex + 1] : null))
const allPasses = flags.has('--all-passes')

const sources = flags.has('--all')
  ? (await listHistories()).map((h) => h.file)
  : positional.map((p) => path.resolve(p))

if (!sources.length) {
  console.error('Usage: npm run learn:bands -- <history.jsonl | --all> [--out data/learned-bands.json] [--merge]')
  console.error('Collect history first with: npm run collect:history')
  process.exit(2)
}

const learned = {}
for (const file of sources) {
  const raw = await readHistory(file)
  const observations = normalise(raw, { passes: allPasses ? null : PHONE_PASSES })
  const cameraId = raw[0]?.cameraId ?? path.basename(file).replace(/\.jsonl?$/i, '')
  if (observations.length < 5) {
    console.error(`${cameraId}: only ${observations.length} observations. The tracker gives frame 1 dwell 1, so ${DEFAULT_LEARNING_OPTIONS.minFrames} usable frames need at least 5 collected.`)
    continue
  }

  // Dwell is what separates a parked car from traffic. Trust recorded values when the history has
  // them; otherwise reconstruct in timestamp order.
  const tracked = observations.every((o) => o.vehicles.every((v) => Number.isFinite(v.dwell)))
    ? observations
    : annotateDwell(observations)

  const size = frameSize(observations)
  const warnings = []
  const bands = []
  const scales = {}

  for (const candidate of learnBands(tracked)) {
    // A band with fewer than 5 parked cars ever seen inside it has no metre scale, and inventing
    // one would turn a guess into "free metres" and then into PARK. Drop it instead.
    const scale = fitScale(candidate, tracked)
    if (!scale.ok) {
      warnings.push(`${candidate.id}: dropped — scale did not fit (${scale.samples} of 5 samples needed)`)
      continue
    }
    // Parked cars only teach where cars HAVE parked. The band is padded past each end so the gap
    // logic and the texture guard can judge the curb just beyond them -- but bounded by what the
    // band actually observed, because two car lengths onto a 10 m band is mostly invention. The
    // re-parametrisation of the scale is exact, so it must not be re-fitted afterwards.
    const extended = size ? extendBandBounded(candidate, scale, size.width, size.height) : { band: candidate, scale }
    bands.push(extended.band)
    scales[extended.band.id] = extended.scale
  }

  learned[cameraId] = {
    source: {
      file: rel(file),
      frames: observations.length,
      from: isoOrNull(observations[0].capturedAt),
      to: isoOrNull(observations[observations.length - 1].capturedAt),
      passes: allPasses ? 'all' : PHONE_PASSES
    },
    frame: size,
    bands,
    scales,
    warnings
  }
  const detail = bands.map((b) => `${b.id} ${b.length.toFixed(0)}px slots~${b.slots}`).join(', ')
  console.error(`${cameraId}: ${bands.length} band(s) from ${observations.length} frames — ${detail || 'none'}`)
  for (const w of warnings) console.error(`  ${w}`)
}

if (!outFile) {
  const single = Object.values(learned)[0]
  process.stdout.write(`${JSON.stringify(Object.keys(learned).length === 1 ? { bands: single.bands, scales: single.scales } : learned, null, 2)}\n`)
} else {
  let doc = { learnedAt: null, learner: null, cameras: {} }
  if (flags.has('--merge')) {
    try {
      doc = JSON.parse(await fs.readFile(outFile, 'utf8'))
    } catch {
      // No overlay yet: --merge simply starts one.
    }
  }
  doc.learnedAt = new Date().toISOString()
  doc.learner = { module: 'mobile/src/core/band-learning.mjs', options: DEFAULT_LEARNING_OPTIONS, extended: true, extentModel: 'box' }
  doc.cameras = { ...doc.cameras, ...learned }
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, `${JSON.stringify(doc, null, 1)}\n`)
  console.error(`\nwrote ${rel(outFile)} — ${Object.keys(doc.cameras).length} camera(s). Review it, then: npm run export:bands -- --only <id> --dry-run`)
}

function isoOrNull (ts) {
  return Number.isFinite(ts) && ts > 1e12 ? new Date(ts).toISOString() : null
}
