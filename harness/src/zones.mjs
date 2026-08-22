// Parking-zone rules (legality), camera ↔ zone matching, and map placement of gaps.
import * as turf from '@turf/turf'

const TZ = 'America/Edmonton'
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Local wall-clock in Calgary: {dow:0-6, minutes} */
export function localNow (date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  const dow = DAYS.indexOf(get('weekday').toUpperCase().slice(0, 3))
  return { dow, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/** "0910-1750 MON-SAT, 0001-2359 SUN" → [{from, to, days:Set}] ; null if unparseable */
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

/** "07:00 - 08:30 , 15:30 - 18:00" → [{from,to}] ; [] for 'none'; null if unparseable */
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
 * Legality now. Rush-hour restrictions are treated as weekday (Mon–Fri) no-parking windows.
 * Returns {parkable, paid, reason}. Unparseable restriction → parkable=false (conservative).
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

// ---------- geometry ----------

export function zoneFeature (zone) { return turf.multiLineString(zone.line) }

export function zoneLengthM (zone) { return turf.length(zoneFeature(zone), { units: 'kilometers' }) * 1000 }

/** Zones whose line comes within `radiusM` of the camera, nearest first. */
export function zonesNear (camera, zones, radiusM = 120) {
  const pt = turf.point([camera.lng, camera.lat])
  const out = []
  for (const z of zones) {
    let best = Infinity
    for (const part of z.line) {
      if (part.length < 2) continue
      const d = turf.pointToLineDistance(pt, turf.lineString(part), { units: 'meters' })
      if (d < best) best = d
    }
    if (best <= radiusM) out.push({ zone: z, distanceM: +best.toFixed(1) })
  }
  return out.sort((a, b) => a.distanceM - b.distanceM)
}

/** Street tokens of a camera location like "5 Avenue / 7 Street SW" → ["5 AV", "7 ST"] */
export function cameraStreets (location) {
  return (location || '').split('/').map((s) => normStreet(s)).filter(Boolean)
}
export function normStreet (s) {
  return s.toUpperCase().replace(/\b(AVENUE|AVE)\b/g, 'AV').replace(/\b(STREET)\b/g, 'ST').replace(/\b(TRAIL|TR)\b/g, 'TR')
    .replace(/\b(NW|NE|SW|SE)\b/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
/** True if the zone's address street matches one of the camera's streets. */
export function zoneOnCameraStreet (zone, camera) {
  const street = normStreet((zone.address || '').split(',')[0])
  return cameraStreets(camera.location).some((s) => s && street.startsWith(s))
}

/** Point on the zone line at `fraction` (0..1) of its length → [lng, lat] */
export function pointAlongZone (zone, fraction) {
  const f = zoneFeature(zone)
  const total = turf.length(f, { units: 'kilometers' })
  // walk the multiline parts
  let remaining = Math.max(0, Math.min(1, fraction)) * total
  for (const part of zone.line) {
    const ls = turf.lineString(part)
    const len = turf.length(ls, { units: 'kilometers' })
    if (remaining <= len || part === zone.line[zone.line.length - 1]) return turf.along(ls, Math.min(remaining, len), { units: 'kilometers' }).geometry.coordinates
    remaining -= len
  }
  return zone.line[0][0]
}
