import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, type Theme, useThemedStyles } from "../design-system";

export const ASKED_CHIP_HEIGHT = 40;

export const AskedChip = memo(function AskedChip({
  place,
  onPress,
}: {
  place: string;
  onPress: (place: string) => void;
}) {
  const styles = useThemedStyles(chipStyles);
  const handlePress = useCallback(() => onPress(place), [onPress, place]);

  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={styles.chip}>
      <Text style={styles.text}>⌕ {place}</Text>
    </Pressable>
  );
});

const chipStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      height: ASKED_CHIP_HEIGHT,
      justifyContent: "center",
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.pill,
      borderCurve: "continuous",
      backgroundColor: theme.color.surfaceMuted,
    },
    text: { color: theme.color.text, fontSize: theme.fontSize.caption, fontWeight: "700" },
  });
