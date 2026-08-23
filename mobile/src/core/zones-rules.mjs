// Calgary parking-zone legality. Ported verbatim from the source repo's src/zones.mjs,
// minus the turf geometry half (zone<->camera placement is precomputed into the fixture).
//
// IMPORTANT: the original relies on Intl.DateTimeFormat with a named time zone. Hermes ships
// without full ICU by default, where that silently yields the wrong local time -- and therefore
// the wrong parking verdict. localNow() below probes for real tz support once and falls back to
// an explicit Mountain Time rule. `tzSupport()` is surfaced so the app can show which path is live.

const TZ = 'America/Edmonton'
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

let _icu = null
let _wallClock = null

/**
 * Intl objects are expensive to build, so the wall-clock formatter is created once and reused.
 * Lazily, not at module load: it is only ever reached after tzSupport() has proved that
 * constructing it with a named time zone actually works on this runtime.
 */
function wallClockFormat () {
  if (_wallClock === null) {
    _wallClock = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  }
  return _wallClock
}

/** Does this runtime actually apply the America/Edmonton zone? Cached. */
export function tzSupport () {
  if (_icu !== null) return _icu
  try {
    // 2026-01-15T12:00Z is 05:00 MST. A runtime without tz data returns 12 (UTC passthrough).
    const probe = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(Date.UTC(2026, 0, 15, 12, 0)))
    const h = Number(probe.find((p) => p.type === 'hour')?.value)
    _icu = h === 5
  } catch {
    _icu = false
  }
  return _icu
}

/**
 * Mountain Time fallback: MST = UTC-7, MDT = UTC-6.
 * DST runs from the 2nd Sunday of March 02:00 local to the 1st Sunday of November 02:00 local.
 */
function mountainOffsetHours (date) {
  const y = date.getUTCFullYear()
  const nthSundayUTC = (month, n, localHour, offset) => {
    const first = new Date(Date.UTC(y, month, 1))
    const day = 1 + ((7 - first.getUTCDay()) % 7) + (n - 1) * 7
    return Date.UTC(y, month, day, localHour + offset)
  }
  const start = nthSundayUTC(2, 2, 2, 7)  // 02:00 MST -> 09:00 UTC
  const end = nthSundayUTC(10, 1, 2, 6)   // 02:00 MDT -> 08:00 UTC
  const t = date.getTime()
  return t >= start && t < end ? -6 : -7
}

/**
 * Local wall-clock in Calgary: {dow:0-6, minutes}
 * @param {Date} date
 * @param {{forceFallback?: boolean}} [opts] forceFallback exercises the no-ICU path (tests).
 */
export function localNow (date = new Date(), opts = {}) {
  if (!opts.forceFallback && tzSupport()) {
    const parts = wallClockFormat().formatToParts(date)
    const get = (t) => parts.find((p) => p.type === t)?.value
    const dow = DAYS.indexOf(get('weekday').toUpperCase().slice(0, 3))
    return { dow, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
  }
  const shifted = new Date(date.getTime() + mountainOffsetHours(date) * 3600 * 1000)
  return { dow: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() }
}

/** "0910-1750 MON-SAT, 0001-2359 SUN" -> [{from, to, days:Set}] ; null if unparseable */
export function parseEnforceable (s) {
  if (!s || typeof s !== 'string') return null
  const out = []
  for (const part of s.split(',')) {
    const m = /^\s*(\d{2})(\d{2})-(\d{2})(\d{2})\s+([A-Z]{3})(?:-([A-Z]{3}))?\s*$/i.exec(part)
    if (!m) return null
    const from = Number(m[1]) * 60 + Number(m[2]), to = Number(m[3]) * 60 + Number(m[4])
    const d0 = DAYS.indexOf(m[5].toUpperCase()), d1 = m[6] ? DAYS.indexOf(m[6].toUpperCase()) : d0
    if (d0 < 0 || d1 < 0) return null
    const days = new Set()
    for (let d = d0; ; d = (d + 1) % 7) { days.add(d); if (d === d1) break }
    out.push({ from, to, days })
  }
  return out
}

/** "07:00 - 08:30 , 15:30 - 18:00" -> [{from,to}] ; [] for 'none'; null if unparseable */
export function parseRestrict (type, s) {
  if (!type || type === 'none') return []
  if (!s || s === 'none') return null
  const out = []
  for (const part of s.split(',')) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(part)
    if (!m) return null
    out.push({ from: Number(m[1]) * 60 + Number(m[2]), to: Number(m[3]) * 60 + Number(m[4]) })
  }
  return out
}

const inWindow = (w, minutes) => minutes >= w.from && minutes < w.to

/**
 * Legality now. Rush-hour restrictions are treated as weekday (Mon-Fri) no-parking windows.
 * Returns {parkable, paid, reason}. Unparseable restriction -> parkable=false (conservative).
 */
export function legality (zone, date = new Date()) {
  const { dow, minutes } = localNow(date)
  const restrict = parseRestrict(zone.restrictType, zone.restrictTime)
  if (restrict === null) return { parkable: false, paid: null, reason: 'unparseable restriction' }
  const weekday = dow >= 1 && dow <= 5
  if (weekday && restrict.some((w) => inWindow(w, minutes))) return { parkable: false, paid: false, reason: `no parking ${zone.restrictTime}` }
  const enf = parseEnforceable(zone.enforceableTime)
  const paid = enf ? enf.some((w) => w.days.has(dow) && inWindow(w, minutes)) : null
  return { parkable: true, paid, reason: paid ? `paid ${zone.enforceableTime}` : 'free (outside paid hours)' }
}
