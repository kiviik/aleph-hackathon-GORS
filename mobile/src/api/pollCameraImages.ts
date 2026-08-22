import { AppState, type AppStateStatus } from "react-native";
import type { NearbyCamera } from "./calgaryCameras";
import { getNearbyCameraImages, resolveLocation, type LocationInput } from "./nearbyCameraImages";

const DEFAULT_INTERVAL_MS = 60_000;

export type PollCameraImagesOptions = {
  radiusMeters?: number;
  intervalMs?: number;
  onUpdate: (results: NearbyCamera[]) => void;
  onError?: (error: unknown) => void;
};

/** Cache-busts every image URL so a tick fetches a fresh frame instead of a cached one. */
function withCacheBust(results: NearbyCamera[]): NearbyCamera[] {
  const bust = Date.now();
  return results.map((entry) => ({
    ...entry,
    camera: {
      ...entry.camera,
      imageUrl: `${entry.camera.imageUrl}${entry.camera.imageUrl.includes("?") ? "&" : "?"}t=${bust}`,
    },
  }));
}

/**
 * Polls Calgary traffic camera images near `input` on a fixed interval, so
 * a caller can feed a downstream analysis with fresh frames. An address
 * input is geocoded once, up front; every tick afterward reuses those
 * coordinates, so Nominatim is never hit more than once per poll session.
 * Pauses while the app is backgrounded and resumes (with an immediate
 * refresh) when it returns to the foreground.
 *
 * Returns a `stop()` function that cancels the interval and subscription.
 */
export function pollCameraImages(input: LocationInput, options: PollCameraImagesOptions): () => void {
  const { radiusMeters, intervalMs = DEFAULT_INTERVAL_MS, onUpdate, onError } = options;

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let resolvedLocation: { latitude: number; longitude: number } | null = null;

  const stopInterval = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const runTick = async (location: { latitude: number; longitude: number }) => {
    try {
      const results = await getNearbyCameraImages(location, radiusMeters);
      if (!stopped) onUpdate(withCacheBust(results));
    } catch (error) {
      if (!stopped) onError?.(error);
    }
  };

  const startInterval = (location: { latitude: number; longitude: number }) => {
    stopInterval();
    timer = setInterval(() => runTick(location), intervalMs);
  };

  const handleAppStateChange = (nextState: AppStateStatus) => {
    if (!resolvedLocation) return;
    if (nextState === "active") {
      void runTick(resolvedLocation);
      startInterval(resolvedLocation);
    } else {
      stopInterval();
    }
  };

  const subscription = AppState.addEventListener("change", handleAppStateChange);

  resolveLocation(input)
    .then((location) => {
      if (stopped) return;
      resolvedLocation = location;
      void runTick(location);
      if (AppState.currentState === "active") startInterval(location);
    })
    .catch((error) => {
      if (!stopped) onError?.(error);
    });

  return () => {
    stopped = true;
    stopInterval();
    subscription.remove();
  };
}
