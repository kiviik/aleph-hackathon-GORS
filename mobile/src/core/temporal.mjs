// Temporal filter: EMA of "free" per cell along a band. Conservative — unknown and stale never count as free.
import { metresBetween } from './scale.mjs'
import { CAR_SLOT_M, MIN_GAP_M } from './gaps.mjs'

export const ALPHA = 0.4
export const FREE_THRESHOLD = 0.75
export const MIN_TICKS = 3
export const CELLS = 160

export function createBandState (band) {
  return { bandId: band.id, length: band.length, ema: new Array(CELLS).fill(0), ticks: 0, lastUpdate: null, stale: true }
}

/**
 * Update with one frame's gap result (from computeGaps). If stale, reset confidence (ticks → 0) and mark stale.
 */
export function updateBandState (state, gapResult, { stale = false, now = Date.now() } = {}) {
  if (stale || !gapResult) { state.stale = true; state.ticks = 0; return state }
  const cell = state.length / CELLS
  for (let i = 0; i < CELLS; i++) {
    const c = (i + 0.5) * cell
    const d = gapResult.free.some((g) => c >= g.t1 && c <= g.t2) ? 1 : 0
    state.ema[i] = ALPHA * d + (1 - ALPHA) * state.ema[i]
  }
  state.ticks++
  state.lastUpdate = now
  state.stale = false
  return state
}

/** Stable free runs: contiguous cells with ema > FREE_THRESHOLD, once enough ticks were seen. */
export function stableGaps (state, scale) {
  if (state.stale || state.ticks < MIN_TICKS) return []
  const cell = state.length / CELLS
  const runs = []
  let start = null
  for (let i = 0; i <= CELLS; i++) {
    const on = i < CELLS && state.ema[i] > FREE_THRESHOLD
    if (on && start == null) start = i
    if (!on && start != null) {
      const t1 = Math.max(0, (start - 0.5) * cell), t2 = Math.min(state.length, (i + 0.5) * cell)
      const metres = metresBetween(scale, t1, t2)
      const conf = avg(state.ema.slice(start, i))
      if (metres >= MIN_GAP_M) runs.push({ t1: +t1.toFixed(1), t2: +t2.toFixed(1), metres: +metres.toFixed(1), carsFit: Math.floor(metres / CAR_SLOT_M), centreT: +((t1 + t2) / 2).toFixed(1), confidence: +conf.toFixed(2) })
      start = null
    }
  }
  return runs
}

function avg (a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0 }
