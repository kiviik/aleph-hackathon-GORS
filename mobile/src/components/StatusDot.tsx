import { memo } from "react";

import { StyleSheet, Text, type Theme, View, useThemedStyles } from "../design-system";
import { statusLabel, type Status } from "../state/spots";

/**
 * Status colours live in a per-theme StyleSheet keyed by status rather than in an inline
 * `{ backgroundColor }` object, so a row's style props keep stable references across renders.
 */
export const StatusDot = memo(function StatusDot({
  status,
  size = "md",
}: {
  status: Status;
  size?: "sm" | "md";
}) {
  const styles = useThemedStyles(statusStyles);
  return <View style={[size === "sm" ? styles.dotSm : styles.dotMd, styles[status]]} />;
});

/** The word "Free" / "Occupied" / "Review", tinted to match the dot. */
export const StatusText = memo(function StatusText({ status }: { status: Status }) {
  const styles = useThemedStyles(statusStyles);
  return <Text style={[styles.label, styles[`${status}Text`]]}>{statusLabel[status]}</Text>;
});

const statusStyles = (theme: Theme) =>
  StyleSheet.create({
    dotSm: { width: 8, height: 8, borderRadius: 4, borderCurve: "continuous" },
    dotMd: { width: 11, height: 11, borderRadius: 6, borderCurve: "continuous" },
    free: { backgroundColor: theme.color.free },
    occupied: { backgroundColor: theme.color.occupied },
    review: { backgroundColor: theme.color.review },
    unscanned: { backgroundColor: theme.color.unscanned },
    label: { fontSize: theme.fontSize.caption, fontWeight: "800" },
    freeText: { color: theme.color.free },
    occupiedText: { color: theme.color.occupied },
    reviewText: { color: theme.color.review },
    unscannedText: { color: theme.color.unscanned },
  });
