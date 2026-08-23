// One store for everything the three tabs share.
//
// A store rather than React Context because list rows subscribe with selectors: toggling one
// favourite re-renders one row, not the list parent. Every writer uses the `set(prev => ...)`
// updater form so nothing reads a stale snapshot out of a closure.
//
// The scan pipeline lives here too, so a scan that starts on the Evidence tab keeps running when
// the user switches to the Map — it is no longer tied to one screen's lifetime.
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

import {
  cameras,
  camerasByDistance,
  ensureDetector,
  scanCamera,
  DEFAULT_NEARBY,
  MAX_NEARBY,
  type Camera,
  type FrameEvidence,
} from "../scan/scan";
import {
  applyRestored,
  loadVerdicts,
  saveVerdicts,
  seedSpots,
  toSpot,
  type Spot,
  type Status,
} from "./spots";

const memoryStorageKey = "ba-estaciona-mobile-memory";

type PersistedMemory = { favoriteIds: string[]; asked: string[] };

export type LocateResult = "ok" | "denied" | "failed";

export type Coordinate = { latitude: number; longitude: number };

export type ScanOptions = { cameraIds?: string[]; count?: number; rotate?: boolean };

type AppState = {
  // --- on-device memory --------------------------------------------------
  favoriteIds: ReadonlySet<string>;
  askedQueries: readonly string[];
  toggleFavorite: (spotId: string) => void;
  rememberQuery: (raw: string) => void;
  clearMemory: () => void;

  // --- browsing ----------------------------------------------------------
  query: string;
  statusFilter: Status | "all";
  selectedSpotId: string;
  setQuery: (query: string) => void;
  setStatusFilter: (statusFilter: Status | "all") => void;
  selectSpot: (spotId: string) => void;

  // --- location ----------------------------------------------------------
  userLocation: Coordinate | null;
  locating: boolean;
  locate: () => Promise<LocateResult>;

  // --- detector bootstrap ------------------------------------------------
  /** 0..1 while the first-run model download is in flight, null at every other time. */
  modelProgress: number | null;
  /** Why the detector could not come up. Non-null means every scan will refuse.  */
  detectorError: string | null;
  prepareDetector: () => Promise<void>;

  // --- scan pipeline -----------------------------------------------------
  spots: readonly Spot[];
  scanning: boolean;
  /** Newest frame per camera, so the evidence view can show what the detector actually saw. */
  evidence: Readonly<Record<string, FrameEvidence>>;
  scan: (opts?: ScanOptions) => Promise<void>;

  // --- bootstrap ---------------------------------------------------------
  hydrate: () => Promise<void>;
};

const initialSpots = seedSpots();

/**
 * Re-entrancy guard. It cannot be the `scanning` flag: a store write is applied synchronously but
 * two callers in the same tick (a tap landing on an auto-scan tick) would both have read the old
 * value before either wrote, and run two concurrent scans over the same band state.
 */
let scanInFlight = false;

/** Where the round-robin has got to. A fixed nearest-N never touched the other cameras at all. */
let rotation = 0;

export const useAppStore = create<AppState>((set, get) => ({
  favoriteIds: new Set<string>(),
  askedQueries: [],
  toggleFavorite: (spotId) => {
    set((prev) => {
      const favoriteIds = new Set(prev.favoriteIds);
      if (favoriteIds.has(spotId)) favoriteIds.delete(spotId);
      else favoriteIds.add(spotId);
      return { favoriteIds };
    });
    void persistMemory(get());
  },
  rememberQuery: (raw) => {
    const normalized = raw.trim();
    if (!normalized) return;
    set((prev) => {
      const lowered = normalized.toLocaleLowerCase();
      const askedQueries = [
        normalized,
        ...prev.askedQueries.filter((place) => place.toLocaleLowerCase() !== lowered),
      ].slice(0, 6);
      return { askedQueries };
    });
    void persistMemory(get());
  },
  clearMemory: () => {
    set({ favoriteIds: new Set<string>(), askedQueries: [] });
    void persistMemory(get());
  },

  query: "",
  statusFilter: "all",
  selectedSpotId: initialSpots[0]?.id ?? "",
  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  selectSpot: (selectedSpotId) => set({ selectedSpotId }),

  userLocation: null,
  locating: false,
  locate: async () => {
    set({ locating: true });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return "denied";
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      set({
        userLocation: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      });
      return "ok";
    } catch {
      return "failed";
    } finally {
      set({ locating: false });
    }
  },

  modelProgress: null,
  detectorError: null,
  prepareDetector: async () => {
    // ensureDetector caches its promise, so this is a cheap no-op on every call after the first.
    // The point of routing it through the store is that the first-run download -- 38 MB, a minute
    // or two on a phone -- gets a fraction the map can show, instead of looking like a hung app.
    try {
      await ensureDetector((fraction) => set({ modelProgress: fraction }));
      set({ detectorError: null });
    } catch (e: any) {
      // ensureDetector drops its cache on failure, so the next scan genuinely retries and this
      // line is re-evaluated rather than left stale.
      set({ detectorError: String(e?.message || e) });
    } finally {
      set({ modelProgress: null });
    }
  },

  spots: initialSpots,
  scanning: false,
  evidence: {},
  scan: async (opts = {}) => {
    if (scanInFlight) return;
    scanInFlight = true;
    set({ scanning: true });

    const { cameraIds, count = DEFAULT_NEARBY, rotate } = opts;
    const { userLocation } = get();
    const ordered = userLocation
      ? camerasByDistance(userLocation.latitude, userLocation.longitude)
      : (cameras as Camera[]);

    let targets: Camera[];
    if (cameraIds) {
      targets = (cameras as Camera[]).filter((c) => cameraIds.includes(c.id));
    } else if (rotate) {
      // Round-robin over the WHOLE fixture, nearest first. Scanning a fixed nearest-N meant the
      // remaining cameras were never looked at even once, so their segments kept their seeded
      // value for the life of the app. The cursor only advances on a scan that actually ran, so
      // a skipped tick cannot silently step over a camera.
      targets = Array.from(
        { length: Math.min(count, ordered.length) },
        (_, i) => ordered[(rotation + i) % ordered.length]
      );
      rotation = (rotation + targets.length) % ordered.length;
    } else {
      targets = ordered.slice(0, Math.min(count, MAX_NEARBY));
    }

    try {
      // Before spending a camera fetch: bring the detector up (and download the model on a first
      // run) where the progress is visible. scanCamera does this itself too, but silently.
      await get().prepareDetector();

      for (const camera of targets) {
        const { results, evidence: frame } = await scanCamera(camera);
        set((prev) => {
          const spots = prev.spots.map((spot) => {
            const result = results.find((x) => `${x.cameraId}-${x.bandId}` === spot.id);
            return result ? toSpot(spot, result) : spot;
          });
          saveVerdicts(spots);
          return {
            evidence: frame ? { ...prev.evidence, [frame.cameraId]: frame } : prev.evidence,
            spots,
          };
        });
      }
    } catch (e: any) {
      // Nothing on screen reads this: a detector that will not come up is already reported by
      // detectorError, and everything else here is unexpected. `adb logcat -s ReactNativeJS`, the
      // same channel a blocked pipeline stage uses.
      console.warn(`[scan] aborted: ${e?.message || e}`);
    } finally {
      scanInFlight = false;
      set({ scanning: false });
    }
  },

  hydrate: async () => {
    // Paint last session's verdicts before the first scan can land, so a returning user is not
    // shown an all-grey map for the five minutes the rotation needs to revisit every camera. A
    // restored verdict keeps the age of the frame it came from, and anything too old is dropped by
    // core/verdicts.mjs rather than presented as current.
    const [memoryRaw, stored] = await Promise.all([
      AsyncStorage.getItem(memoryStorageKey).catch(() => null),
      loadVerdicts(),
    ]);

    if (Object.keys(stored).length > 0) {
      set((prev) => ({ spots: prev.spots.map((spot) => applyRestored(spot, stored)) }));
    }

    if (!memoryRaw) return;
    try {
      const parsed = JSON.parse(memoryRaw) as PersistedMemory;
      set({
        favoriteIds: new Set(parsed.favoriteIds ?? []),
        askedQueries: parsed.asked ?? [],
      });
    } catch {
      // Corrupt payload: keep the empty defaults rather than crashing the launch.
    }
  },
}));

function persistMemory(state: AppState): Promise<void> {
  const payload: PersistedMemory = {
    favoriteIds: [...state.favoriteIds],
    asked: [...state.askedQueries],
  };
  return AsyncStorage.setItem(memoryStorageKey, JSON.stringify(payload)).catch(() => undefined);
}

// --- selectors ------------------------------------------------------------
// Kept next to the store so rows can subscribe to exactly one primitive each.

export const selectIsSelected = (spotId: string) => (s: AppState) => s.selectedSpotId === spotId;

export const selectHasEvidence = (cameraId: string | undefined) => (s: AppState) =>
  cameraId ? Boolean(s.evidence[cameraId]) : false;
