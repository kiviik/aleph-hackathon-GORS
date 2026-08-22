/**
 * Turns a free-text address into coordinates using OpenStreetMap's public
 * Nominatim geocoder. Free and keyless, but rate-limited to ~1 request/sec
 * per their usage policy — fine for one user typing one address at a time.
 * https://nominatim.org/release-docs/latest/api/Search/
 */
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

export type GeocodedAddress = {
  latitude: number;
  longitude: number;
  displayName: string;
};

type NominatimResult = { lat: string; lon: string; display_name: string };

/** Resolves `address` to coordinates, biased to Calgary/Alberta. Null if nothing matched. */
export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", `${address}, Calgary, Alberta, Canada`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ca");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "ba-estaciona-mobile/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Nominatim respondió ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first) return null;

  return { latitude: Number(first.lat), longitude: Number(first.lon), displayName: first.display_name };
}
