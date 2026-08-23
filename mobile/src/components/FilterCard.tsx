import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, type Theme, View, useThemedStyles } from "../design-system";
import type { Status } from "../state/spots";

export type FilterKey = Status | "all";

/** Receives primitives only; the press handler is a single hoisted callback from the list root. */
export const FilterCard = memo(function FilterCard({
  filterKey,
  label,
  count,
  active,
  onPress,
}: {
  filterKey: FilterKey;
  label: string;
  count: number;
  active: boolean;
  onPress: (filterKey: FilterKey) => void;
}) {
  const styles = useThemedStyles(filterStyles);
  const handlePress = useCallback(() => onPress(filterKey), [filterKey, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={filterKey === "all" ? "Show all detected spots" : `Filter ${label}`}
      accessibilityState={active ? selectedState : undefined}
      onPress={handlePress}
      style={[styles.card, active ? styles.cardActive : null]}
    >
      <View style={[styles.dot, styles[filterKey]]} />
      <Text style={styles.count}>{count}</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
});

const selectedState = { selected: true } as const;

const filterStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      minWidth: 118,
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.xs + 2,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.sm,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    cardActive: { borderColor: theme.color.accent, backgroundColor: theme.color.surfaceMuted },
    dot: { width: 8, height: 8, borderRadius: 4, borderCurve: "continuous" },
    all: { backgroundColor: theme.color.textMuted },
    free: { backgroundColor: theme.color.free },
    occupied: { backgroundColor: theme.color.occupied },
    review: { backgroundColor: theme.color.review },
    unscanned: { backgroundColor: theme.color.unscanned },
    count: { color: theme.color.accent, fontSize: theme.fontSize.body, fontWeight: "800" },
    label: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
  });
