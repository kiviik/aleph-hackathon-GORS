// Small 2-D helpers shared by the learning modules.
export function iou (a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const inter = ix * iy
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return ua > 0 ? inter / ua : 0
}

/** Parameterise point p along the band axis: t = distance along unit dir from p0, n = signed perpendicular distance. */
export function projectToAxis (band, p) {
  const [x0, y0] = band.p0
  const [dx, dy] = band.dir
  const vx = p[0] - x0, vy = p[1] - y0
  return { t: vx * dx + vy * dy, n: -vx * dy + vy * dx }
}

export function median (arr) {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function percentile (arr, q) {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))
  return s[i]
}

/** Theil–Sen robust line fit y = a + b x. */
export function theilSen (xs, ys) {
  const n = xs.length
  if (n < 2) return { a: n ? ys[0] : 0, b: 0 }
  const slopes = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]))
  const b = slopes.length ? median(slopes) : 0
  const a = median(ys.map((y, i) => y - b * xs[i]))
  return { a, b }
}
