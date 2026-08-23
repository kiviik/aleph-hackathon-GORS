// The status filters, as pills floating over the map.
//
// This replaces the boxed `FilterCard` row. On a full-bleed map the filters are chrome sitting on
// tiles, so they are as small as they can be while still legible, and they carry the colour key
// themselves: with a coloured dot on every chip there is nothing left for a separate legend to say.
import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, View, useThemedStyles, type Theme } from "../design-system";
import type { Status } from "../state/spots";

export type FilterKey = Status | "all";

export const FILTER_CHIP_HEIGHT = 36;

/** Receives primitives only; the press handler is a single hoisted callback from the list root. */
export const FilterChip = memo(function FilterChip({
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
  const styles = useThemedStyles(chipStyles);
  const handlePress = useCallback(() => onPress(filterKey), [filterKey, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        filterKey === "all" ? `Show all ${count} curbs` : `Show ${count} ${label} curbs`
      }
      accessibilityState={active ? selectedState : undefined}
      onPress={handlePress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <View style={[styles.dot, styles[filterKey]]} />
      <Text style={[styles.label, active ? styles.labelActive : null]}>
        {count} {label}
      </Text>
    </Pressable>
  );
});

const selectedState = { selected: true } as const;

const chipStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      height: FILTER_CHIP_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.xs + 2,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.pill,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      boxShadow: theme.shadow.card,
    },
    chipActive: { borderColor: theme.color.accent, backgroundColor: theme.color.surfaceMuted },
    dot: { width: 8, height: 8, borderRadius: 4, borderCurve: "continuous" },
    all: { backgroundColor: theme.color.textMuted },
    free: { backgroundColor: theme.color.free },
    occupied: { backgroundColor: theme.color.occupied },
    review: { backgroundColor: theme.color.review },
    unscanned: { backgroundColor: theme.color.unscanned },
    label: { color: theme.color.textMuted, fontSize: theme.fontSize.caption, fontWeight: "700" },
    labelActive: { color: theme.color.text },
  });
