/**
 * Direct client for the Calgary Open Data "Traffic Cameras" dataset
 * (Socrata, k7p9-kppz). Public and keyless for light use, so it's safe to
 * call straight from the mobile app — no backend in between.
 * https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data
 */
const CALGARY_CAMERAS_URL = "https://data.calgary.ca/resource/k7p9-kppz.json";
const FETCH_LIMIT = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type TrafficCamera = {
  id: string;
  name: string;
  quadrant?: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
};

type CalgaryCameraRecord = {
  camera_url?: { url: string; description?: string };
  quadrant?: string;
  camera_location?: string;
  point?: { type: "Point"; coordinates: [number, number] };
};

function idFromImageUrl(url: string): string {
  const match = url.match(/([^/]+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? match[1] : url;
}

function normalize(record: CalgaryCameraRecord): TrafficCamera | null {
  const url = record.camera_url?.url;
  const point = record.point;
  if (!url || !point) return null;

  const [longitude, latitude] = point.coordinates;
  return {
    id: idFromImageUrl(url),
    name: record.camera_location || record.camera_url?.description || idFromImageUrl(url),
    quadrant: record.quadrant,
    latitude,
    longitude,
    imageUrl: url,
  };
}

let cache: { cameras: TrafficCamera[]; expiresAt: number } = { cameras: [], expiresAt: 0 };

/** Fetches and normalizes the full camera list, cached in memory for CACHE_TTL_MS. */
export async function fetchTrafficCameras(): Promise<TrafficCamera[]> {
  const now = Date.now();
  if (cache.expiresAt > now && cache.cameras.length > 0) return cache.cameras;

  const url = new URL(CALGARY_CAMERAS_URL);
  url.searchParams.set("$limit", String(FETCH_LIMIT));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Calgary Open Data respondió ${response.status}`);
  }

  const payload = (await response.json()) as CalgaryCameraRecord[];
  const cameras = payload.map(normalize).filter((camera): camera is TrafficCamera => camera !== null);

  cache = { cameras, expiresAt: now + CACHE_TTL_MS };
  return cameras;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type NearbyCamera = { camera: TrafficCamera; distanceMeters: number };

/** Every camera within `radiusMeters` of `location`, nearest first. */
export function findCamerasWithinRadius(
  location: { latitude: number; longitude: number },
  cameras: TrafficCamera[],
  radiusMeters = 2000
): NearbyCamera[] {
  return cameras
    .map((camera) => ({ camera, distanceMeters: haversineDistanceMeters(location, camera) }))
    .filter((entry) => entry.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
