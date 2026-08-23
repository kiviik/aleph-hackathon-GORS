// Where on the map a band actually is.
//
// A band is geometry in image pixels; the City's parking zone is a surveyed lat/lng segment along
// one curb. Nothing in the fixture relates the two: `cameras.json` carries no camera pose, so pixel
// space cannot be projected to the ground. What *is* knowable is scalar and local:
//   - how many metres of curb the band can actually read      (its own px/m model)
//   - which end of it is nearer the camera                    (the sign of the perspective slope)
//   - where the camera sits along the zone line               (a foot of perpendicular in metres)
// Anchoring at that foot and walking away from it by the band's own metres is the strongest claim
// the data supports. Everything is clamped to the zone segment, so a placement can never assert
// curb the City never surveyed, and `accuracyM` states the residual honestly.
//
// The previous mapping (`meanGapCentre / band.length` as a fraction of the zone) resolved metres
// inside an error of 10-90 m -- a band whose readable core is 17.6 m was smeared over a 111 m zone
// -- and moved the pin on every scan as the gap set changed.
import { metresBetween, pxPerMetre } from './scale.mjs'
import { MIN_PX_PER_M } from './gaps.mjs'
import { coreRange } from './band.mjs'

export { coreRange }

/** Median perpendicular distance between opposite-side zones of one block (Calgary zones.json, n=239). */
export const STREET_WIDTH_M = 12.4
/** No placement claims better than this, however short the band. */
export const MIN_ACCURACY_M = 10
/** Below this the perspective fit is flat and near/far is not decidable. */
export const FLAT_SLOPE = 1e-4

const R = 6371000

/**
 * East/north metre frame anchored at a [lng, lat] origin. Flat-earth: under 0.1 % over a city block,
 * and it keeps every downstream step plain vector maths.
 */
export function localFrame (origin) {
  const [lng0, lat0] = origin
  const mPerLat = (Math.PI / 180) * R
  const mPerLng = mPerLat * Math.cos((lat0 * Math.PI) / 180)
  return {
    toLocal: ([lng, lat]) => [(lng - lng0) * mPerLng, (lat - lat0) * mPerLat],
    toGeo: ([e, n]) => [lng0 + e / mPerLng, lat0 + n / mPerLat]
  }
}

/** The zone segment as an origin, a unit direction, a right-hand normal and a length in metres. */
export function zoneAxis (zone) {
  const origin = [zone.p0[0], zone.p0[1]]
  const frame = localFrame(origin)
  const [e, n] = frame.toLocal([zone.p1[0], zone.p1[1]])
  const lengthM = Math.hypot(e, n)
  const u = lengthM > 0 ? [e / lengthM, n / lengthM] : [0, 1]
  return { origin, frame, u, normal: [u[1], -u[0]], lengthM }
}

/**
 * Which end of the band is nearer the camera. px/m grows toward the camera, so the sign of the
 * fitted slope decides it; a flat fit decides nothing.
 * @returns {'t0'|'t1'|null}
 */
export function nearEnd (band, scale) {
  if (!scale?.ok || !Number.isFinite(scale.b) || Math.abs(scale.b) < FLAT_SLOPE) return null
  return scale.b > 0 ? 't1' : 't0'
}

/**
 * The stretch of the band that can actually be judged, in band parameters.
 *
 * Not the learned core: gaps are computed over the whole band, including the ends `extendBand`
 * padded on. Not the whole band either: `gaps.mjs` refuses any gap where the local scale drops
 * below MIN_PX_PER_M, so the far end of a steep band can never be called free. Reporting the core
 * instead used to state "8.9 m of curb" next to "23.9 m free" on the same band.
 */
export function judgeableRange (band, scale) {
  const [lo, hi] = [0, band.length]
  if (!scale?.ok || Math.abs(scale.b) < 1e-9) return [lo, hi]
  // a + b·t = MIN_PX_PER_M
  const cut = (MIN_PX_PER_M - scale.a) / scale.b
  if (scale.b > 0) return [Math.max(lo, Math.min(hi, cut)), hi]
  return [lo, Math.max(lo, Math.min(hi, cut))]
}

/** Metres of real curb between the band's near end and band parameter `t`. Always >= 0. */
export function metresFromNearEnd (band, scale, t) {
  const end = nearEnd(band, scale)
  const [c0, c1] = judgeableRange(band, scale)
  const clamped = Math.max(c0, Math.min(c1, t))
  if (end === 't1') return metresBetween(scale, clamped, c1)
  return metresBetween(scale, c0, clamped)
}

/** Judgeable extent of the band, in metres. */
export function bandSpanM (band, scale) {
  if (!scale?.ok) return 0
  const [c0, c1] = judgeableRange(band, scale)
  return metresBetween(scale, c0, c1)
}

/**
 * The zone that governs this band. Bands only carry their own zone once the offline exporter has
 * matched one per curb; until then every band of a camera shares the camera's zone.
 */
export function zoneForBand (camera, band) {
  if (band?.zone) return band.zone
  if (band?.zoneId && camera?.zones?.[band.zoneId]) return camera.zones[band.zoneId]
  return camera?.zone ?? null
}

/**
 * Side descriptor for the UI. Compass sides are only ever repeated from matched zone data; near/far
 * is derived from perspective, which is always available with two bands.
 * @returns {{key: string|null, nearness: string|null, label: string|null, source: string}}
 */
export function bandSide (camera, band, scale, bands = []) {
  const zone = zoneForBand(camera, band)
  const nearness = band.nearness ?? rankNearness(band, bands)
  const ownZone = band?.zone || (band?.zoneId && camera?.zones?.[band.zoneId])
  const key = band.sideKey ?? (ownZone ? zone?.blockSide ?? null : null)
  if (key) return { key, nearness, label: `${key} curb`, source: ownZone ? 'zone' : 'fixture' }
  if (nearness) return { key: null, nearness, label: `${nearness} curb`, source: 'nearness' }
  return { key: null, nearness: null, label: null, source: 'none' }
}

/**
 * Near/far rank of a band among its siblings, from apparent car size. Two independent signals must
 * agree (box height and px/m at mid-band), because either alone flips on a single odd band.
 */
function rankNearness (band, bands) {
  if (!Array.isArray(bands) || bands.length !== 2) return null
  const other = bands.find((b) => b.id !== band.id)
  if (!other || !Number.isFinite(band.meanBoxH) || !Number.isFinite(other.meanBoxH)) return null
  if (band.meanBoxH === other.meanBoxH) return null
  return band.meanBoxH > other.meanBoxH ? 'near' : 'far'
}

/**
 * Perpendicular offset in metres, signed against zoneAxis(zone).normal. Zero unless the compass
 * side is known AND differs from the zone's own side: the zone line already sits on its own curb,
 * and guessing a direction would be a 12 m lie -- camera 76's published coordinate sits *between*
 * its two curbs, so "away from the camera" is not a usable rule.
 */
export function offsetForSide (zone, sideKey, widthM = STREET_WIDTH_M) {
  if (!zone?.blockSide || !sideKey || sideKey === zone.blockSide) return 0
  const axis = zoneAxis(zone)
  // Which way along the normal does `sideKey` lie? Compare the normal's bearing with the compass
  // direction the side names; the zone's own blockSide fixes the opposite sense.
  const [ne, nn] = axis.normal
  const towards = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] }[sideKey]
  if (!towards) return 0
  const dot = ne * towards[0] + nn * towards[1]
  if (Math.abs(dot) < 0.2) return 0 // the normal is nearly along the named axis: sign is not decidable
  return dot > 0 ? widthM : -widthM
}

/**
 * Map a band to the stretch of curb it describes.
 *
 * `t` is optional and only shifts the reported point within the band; callers should leave it
 * unset so the pin is a stable anchor rather than a per-scan estimate.
 *
 * @returns {{lng:number, lat:number, accuracyM:number, placement:string, offsetM:number,
 *            spanM:number, zoneId:string|null, endpoints:[number,number][]|null}}
 */
export function placeBand (camera, band, scale, { t = null } = {}) {
  const zone = zoneForBand(camera, band)
  if (!zone?.p0 || !zone?.p1) {
    return { lng: camera?.lng ?? 0, lat: camera?.lat ?? 0, accuracyM: 60, placement: 'camera', offsetM: 0, spanM: 0, zoneId: null, endpoints: null }
  }

  const axis = zoneAxis(zone)
  // A band with its own matched zone is already on its own curb; only a band still sharing the
  // camera's zone needs to be pushed across the street, and only when its side is known.
  const ownZone = Boolean(band?.zone || (band?.zoneId && camera?.zones?.[band.zoneId]))
  const offsetM = ownZone ? 0 : offsetForSide(zone, band.sideKey ?? null)
  const spanM = bandSpanM(band, scale)
  const at = (s) => {
    const clamped = Math.max(0, Math.min(axis.lengthM, s))
    const e = axis.u[0] * clamped + axis.normal[0] * offsetM
    const n = axis.u[1] * clamped + axis.normal[1] * offsetM
    const [lng, lat] = axis.frame.toGeo([e, n])
    return [+lng.toFixed(6), +lat.toFixed(6)]
  }

  // No usable perspective fit: fall back to the zone midpoint, and say so.
  if (!nearEnd(band, scale)) {
    const [lng, lat] = at(axis.lengthM / 2)
    return { lng, lat, accuracyM: Math.round(Math.max(MIN_ACCURACY_M, axis.lengthM / 2)), placement: 'zone-midpoint', offsetM, spanM, zoneId: zone.id ?? null, endpoints: null }
  }

  // Foot of the camera on the zone line, then walk away from it: a fixed camera looks *down* the
  // street, so the readable curb extends toward whichever end has more zone left.
  const [ce, cn] = axis.frame.toLocal([camera.lng, camera.lat])
  const s0 = Math.max(0, Math.min(axis.lengthM, ce * axis.u[0] + cn * axis.u[1]))
  const sigma = axis.lengthM - s0 >= s0 ? 1 : -1

  const [c0, c1] = judgeableRange(band, scale)
  const anchorT = t == null ? (c0 + c1) / 2 : t
  const [lng, lat] = at(s0 + sigma * metresFromNearEnd(band, scale, anchorT))
  const endpoints = [at(s0), at(s0 + sigma * spanM)]

  return {
    lng,
    lat,
    accuracyM: Math.round(Math.max(MIN_ACCURACY_M, spanM / 2)),
    placement: 'anchored',
    offsetM,
    spanM: +spanM.toFixed(1),
    zoneId: zone.id ?? null,
    endpoints
  }
}

/** px/m at a band parameter, re-exported so callers need one import for band geometry maths. */
export { pxPerMetre }
