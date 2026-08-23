// One curb in the sheet's list. Flat, not a card: the sheet is already a surface, and stacking a
// bordered card on it at every row is the boxed-in look the full-screen map is meant to get rid of.
import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, View, useThemedStyles, type Theme } from "../design-system";
import type { Status } from "../state/spots";
import { StatusDot } from "./StatusDot";

export const NEARBY_ROW_HEIGHT = 62;

export const NearbySpotRow = memo(function NearbySpotRow({
  id,
  title,
  detail,
  status,
  selected,
  onPress,
}: {
  id: string;
  title: string;
  detail: string;
  status: Status;
  selected: boolean;
  onPress: (spotId: string) => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? selectedState : undefined}
      onPress={handlePress}
      style={[styles.row, selected ? styles.rowSelected : null]}
    >
      <StatusDot status={status} />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
});

const selectedState = { selected: true } as const;

const rowStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      height: NEARBY_ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.md,
      paddingHorizontal: theme.space.lg,
    },
    rowSelected: { backgroundColor: theme.color.surfaceMuted },
    copy: { flex: 1, gap: 2 },
    title: { color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "700" },
    detail: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    arrow: { color: theme.color.textMuted, fontSize: theme.fontSize.title },
  });
