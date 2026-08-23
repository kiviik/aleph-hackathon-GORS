// Foreground-only rescan loop.
//
// A band needs MIN_TICKS frames before it can leave "review", and only a genuinely new frame
// counts (see scan.ts). Manual taps never got there: three taps inside a minute all read the same
// JPEG and advance the filter once. Re-scan on the camera's own cadence instead -- foreground
// only, since each pass costs a fetch plus local inference per camera.
//
// The scan itself lives in the store, so this hook only owns the timer. It reads the action off
// `getState()` rather than subscribing: it never needs to re-render on store changes.
import { useEffect } from "react";
import { AppState } from "react-native";

import { CAMERA_REFRESH_MS, MAX_NEARBY } from "../scan/scan";
import { useAppStore } from "./store";

export function useAutoScan(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let kicked = false;

    const tick = () => void useAppStore.getState().scan({ rotate: true });

    const start = () => {
      if (timer) return;
      // Scan once straight away rather than making the user watch an untouched map for a minute,
      // and cast a slightly wider net on that first pass: a first-ever launch has no stored
      // verdicts to fall back on, so the opening burst is the only thing standing between the user
      // and an all-grey map. Later ticks go back to DEFAULT_NEARBY, which is the cost the rotation
      // is budgeted for. Only on the first foreground: re-kicking on every resume would re-fetch on
      // every glance.
      if (!kicked) {
        kicked = true;
        void useAppStore.getState().scan({ rotate: true, count: MAX_NEARBY });
      }
      timer = setInterval(tick, CAMERA_REFRESH_MS);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (next) =>
      next === "active" ? start() : stop()
    );

    return () => {
      stop();
      sub.remove();
    };
  }, [enabled]);
}
