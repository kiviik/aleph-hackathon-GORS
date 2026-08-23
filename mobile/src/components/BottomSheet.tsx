// The draggable sheet that the map lives behind.
//
// This is the half of a Google Maps / Uber layout that does the work: the map owns the whole
// screen, and everything that used to be stacked *below* it now floats *over* it in a sheet the
// user drags between a peek, a half and a near-full height. Nothing is ever pushed off-screen by a
// list growing; the user decides how much map and how much detail they want.
//
// Movement is a single `translateY` on the native driver. The sheet's own height is fixed at the
// tallest snap point and never animates -- animating height would relayout the FlashList inside it
// on every frame of every drag.
//
// The pan handlers are returned separately from the sheet so the caller can attach them to the
// header only. That is what lets the list inside the sheet scroll: the sheet claims the gesture on
// the grabber and the summary, the virtualiser keeps it everywhere else.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useThemedStyles,
  type GestureResponderHandlers,
  type Theme,
} from "../design-system";

/** How far a fling is projected past the finger when choosing the snap point to land on. */
const FLING_PROJECTION_MS = 120;

/** Below this the gesture is a tap on something inside the header, not a drag of the sheet. */
const DRAG_SLOP_PX = 4;

export type BottomSheetController = {
  /** 0 at the tallest snap point, growing as the sheet slides down. Drive chrome off this. */
  translateY: Animated.Value;
  /** The sheet's fixed height: the tallest snap point. */
  maxHeight: number;
  /** Index into the snap points the sheet last settled on. */
  index: number;
  snapTo: (index: number) => void;
  panHandlers: GestureResponderHandlers;
};

/**
 * @param snapPoints visible heights in px, ascending. Must be a stable reference (useMemo it).
 */
export function useBottomSheet(
  snapPoints: readonly number[],
  initialIndex = 0
): BottomSheetController {
  const maxHeight = snapPoints[snapPoints.length - 1];
  const translateY = useRef(new Animated.Value(maxHeight - snapPoints[initialIndex])).current;
  // The settled snap point is held in a ref as well as in state: the pan responder reads it during
  // a gesture, where a state value captured at render time would already be stale.
  const indexRef = useRef(initialIndex);
  const [index, setIndex] = useState(initialIndex);
  const offsetAtGrant = useRef(0);

  const snapTo = useCallback(
    (next: number, velocity = 0) => {
      const clamped = Math.max(0, Math.min(snapPoints.length - 1, next));
      indexRef.current = clamped;
      setIndex(clamped);
      Animated.spring(translateY, {
        toValue: maxHeight - snapPoints[clamped],
        velocity: velocity * 1000, // gesture velocity is px/ms; Animated wants px/s
        stiffness: 240,
        damping: 26,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    },
    [maxHeight, snapPoints, translateY]
  );

  // A rotation of the device, or the header measuring itself for the first time, moves the snap
  // points under the sheet. Re-seat it on the point it is already on rather than animate to it.
  useEffect(() => {
    translateY.setValue(maxHeight - snapPoints[indexRef.current]);
  }, [maxHeight, snapPoints, translateY]);

  const panHandlers = useMemo(() => {
    const lowest = maxHeight - snapPoints[0];
    const clamp = (v: number) => Math.max(0, Math.min(lowest, v));

    return PanResponder.create({
      // Claimed on movement, not on touch-down, so the star and the Evidence button in the header
      // still receive their taps.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dy) > DRAG_SLOP_PX && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        offsetAtGrant.current = maxHeight - snapPoints[indexRef.current];
      },
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(clamp(offsetAtGrant.current + gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        const landing = clamp(offsetAtGrant.current + gesture.dy) + gesture.vy * FLING_PROJECTION_MS;
        let best = 0;
        let bestDistance = Infinity;
        snapPoints.forEach((height, i) => {
          const distance = Math.abs(maxHeight - height - landing);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        });
        snapTo(best, gesture.vy);
      },
      onPanResponderTerminate: () => snapTo(indexRef.current),
    }).panHandlers;
  }, [maxHeight, snapPoints, snapTo, translateY]);

  return { translateY, maxHeight, index, snapTo, panHandlers };
}

export const BottomSheet = memo(function BottomSheet({
  height,
  translateY,
  children,
}: {
  height: number;
  translateY: Animated.Value;
  children: ReactNode;
}) {
  const styles = useThemedStyles(sheetStyles);
  const style = useMemo(
    () => [styles.sheet, { height, transform: [{ translateY }] }],
    [height, styles.sheet, translateY]
  );

  return <Animated.View style={style}>{children}</Animated.View>;
});

/** The drag affordance. Tappable as well as draggable — a grabber nobody can grab is decoration. */
export const SheetGrabber = memo(function SheetGrabber({
  expanded,
  onPress,
}: {
  expanded: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(sheetStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={expanded ? "Collapse the panel" : "Expand the panel"}
      onPress={onPress}
      style={styles.grabberHit}
    >
      <View style={styles.grabber} />
    </Pressable>
  );
});

const sheetStyles = (theme: Theme) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderTopWidth: 1,
      borderColor: theme.color.border,
      boxShadow: theme.shadow.raised,
      overflow: "hidden",
    },
    grabberHit: { alignItems: "center", paddingTop: theme.space.sm, paddingBottom: theme.space.xs },
    grabber: {
      width: 38,
      height: 4,
      borderRadius: theme.radius.pill,
      borderCurve: "continuous",
      backgroundColor: theme.color.border,
    },
  });
