// Collected detection history: one JSONL file per camera, one observation per line.
//
// This is the input the band learner never had in this repo. The geometry in `data/state.json`
// was learned in the research repo from history that did not come with it, so a clean clone could
// not re-derive a single band. Everything here exists to make that reproducible: append-only,
// resumable, and honest about gaps -- a failed fetch writes nothing at all, because a line with
// `vehicles: []` would look like an empty curb and reset every dwell that crossed it.
import fs from 'node:fs/promises'
import path from 'node:path'
import { DATA } from './paths.mjs'

export const HISTORY_SCHEMA = 1
export const HISTORY_DIR = path.join(DATA, 'history')

export const historyFile = (cameraId) => path.join(HISTORY_DIR, `${cameraId}.jsonl`)
export const lastFrameFile = (cameraId) => path.join(HISTORY_DIR, `${cameraId}-last.jpg`)
export const manifestFile = () => path.join(HISTORY_DIR, 'manifest.json')

export async function ensureHistoryDir () {
  await fs.mkdir(HISTORY_DIR, { recursive: true })
}

/**
 * Append-only writer over a single file handle. One `write()` per line, so a kill can truncate at
 * most the line in flight -- and `readHistory` refuses to skip that quietly.
 */
export async function openAppender (cameraId) {
  await ensureHistoryDir()
  const handle = await fs.open(historyFile(cameraId), 'a')
  return {
    async append (observation) {
      await handle.write(`${JSON.stringify({ schema: HISTORY_SCHEMA, cameraId, ...observation })}\n`)
    },
    close: () => handle.close()
  }
}

/** The last observation already recorded for a camera, so a re-run resumes instead of restarting. */
export async function tailMeta (cameraId) {
  let raw
  try {
    raw = await fs.readFile(historyFile(cameraId), 'utf8')
  } catch {
    return null
  }
  const lines = raw.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return null
  try {
    const last = JSON.parse(lines[lines.length - 1])
    return { ...last, frames: lines.length }
  } catch {
    // A trailing partial line from a hard kill. Report it rather than pretending it is not there.
    return { partial: true, frames: lines.length - 1 }
  }
}

/**
 * Read a history file. Accepts JSONL (one observation per line), a JSON array, or
 * `{ observations: [...] }` -- the three shapes the learner has been handed in practice.
 * An unparseable line is an error, never a skip: silently dropping it hides corruption.
 */
export async function readHistory (file) {
  const raw = await fs.readFile(file, 'utf8')
  if (path.extname(file).toLowerCase() === '.jsonl') {
    return raw.split(/\r?\n/).filter((line) => line.trim()).map((line, i) => {
      try {
        return JSON.parse(line)
      } catch (e) {
        throw new Error(`${path.basename(file)} line ${i + 1} is not valid JSON: ${e.message}`)
      }
    })
  }
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.observations)) return parsed.observations
  throw new Error('History must be a JSON array, { observations: [] }, or newline-delimited JSON')
}

/**
 * Put a history in the shape the learner expects: oldest first, every vehicle carrying the derived
 * geometry the learner reads. Optionally restrict to the detector passes the phone actually runs.
 */
export function normalise (observations, { passes = null } = {}) {
  return observations
    .map((observation, frame) => ({
      ...observation,
      capturedAt: observation.capturedAt ?? observation.captured_at ?? frame,
      vehicles: (observation.vehicles || [])
        .filter((vehicle) => !passes || !vehicle.passes || vehicle.passes.some((p) => passes.includes(p)))
        .map((vehicle) => {
          if (!Array.isArray(vehicle.box) || vehicle.box.length !== 4) return vehicle
          const [x1, y1, x2, y2] = vehicle.box
          return {
            ...vehicle,
            bottomCenter: vehicle.bottomCenter || [(x1 + x2) / 2, y2],
            w: vehicle.w ?? x2 - x1,
            h: vehicle.h ?? y2 - y1
          }
        })
    }))
    .sort((a, b) => a.capturedAt - b.capturedAt)
}

/** Every camera with collected history, newest run first. */
export async function listHistories () {
  let names = []
  try {
    names = await fs.readdir(HISTORY_DIR)
  } catch {
    return []
  }
  const out = []
  for (const name of names.filter((n) => n.endsWith('.jsonl'))) {
    const file = path.join(HISTORY_DIR, name)
    const observations = await readHistory(file)
    if (!observations.length) continue
    out.push({
      cameraId: observations[0].cameraId ?? path.basename(name, '.jsonl'),
      file,
      frames: observations.length,
      from: observations[0].capturedAt ?? null,
      to: observations[observations.length - 1].capturedAt ?? null
    })
  }
  return out
}

/** The frame size a history was collected at, which extendBand needs to clip to the frame. */
export function frameSize (observations) {
  const sizes = new Set(observations.filter((o) => o.width && o.height).map((o) => `${o.width}x${o.height}`))
  if (sizes.size === 0) return null
  if (sizes.size > 1) throw new Error(`history mixes frame sizes: ${[...sizes].join(', ')}`)
  const [w, h] = [...sizes][0].split('x').map(Number)
  return { width: w, height: h }
}

export async function readManifest () {
  try {
    return JSON.parse(await fs.readFile(manifestFile(), 'utf8'))
  } catch {
    return { cameras: {} }
  }
}

export async function writeManifest (manifest) {
  await ensureHistoryDir()
  await fs.writeFile(manifestFile(), `${JSON.stringify(manifest, null, 1)}\n`)
}
