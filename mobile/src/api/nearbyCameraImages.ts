import { fetchTrafficCameras, findCamerasWithinRadius, type NearbyCamera } from "./calgaryCameras";
import { geocodeAddress } from "./geocode";

export type LocationInput = { latitude: number; longitude: number } | { address: string };

/** Resolves a LocationInput to coordinates, geocoding only when given an address. */
export async function resolveLocation(input: LocationInput): Promise<{ latitude: number; longitude: number }> {
  if (!("address" in input)) return input;

  const geocoded = await geocodeAddress(input.address);
  if (!geocoded) {
    throw new Error(`No se encontró la dirección "${input.address}"`);
  }
  return { latitude: geocoded.latitude, longitude: geocoded.longitude };
}

/**
 * Resolves a location — coordinates or a free-text address — and returns
 * every Calgary traffic camera within `radiusMeters`, nearest first. Each
 * result's `camera.imageUrl` is that camera's current live image.
 */
export async function getNearbyCameraImages(input: LocationInput, radiusMeters = 2000): Promise<NearbyCamera[]> {
  const location = await resolveLocation(input);
  const cameras = await fetchTrafficCameras();
  return findCamerasWithinRadius(location, cameras, radiusMeters);
}
