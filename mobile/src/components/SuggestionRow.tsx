import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, type Theme, useThemedStyles } from "../design-system";

export const SUGGESTION_ROW_HEIGHT = 44;

export const SuggestionRow = memo(function SuggestionRow({
  suggestion,
  onPress,
}: {
  suggestion: string;
  onPress: (suggestion: string) => void;
}) {
  const styles = useThemedStyles(suggestionStyles);
  const handlePress = useCallback(() => onPress(suggestion), [onPress, suggestion]);

  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={styles.row}>
      <Text style={styles.icon}>⌕</Text>
      <Text numberOfLines={1} style={styles.text}>
        {suggestion}
      </Text>
      <Text style={styles.city}>Calgary</Text>
    </Pressable>
  );
});

const suggestionStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.sm,
      height: SUGGESTION_ROW_HEIGHT,
      paddingHorizontal: theme.space.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    icon: { color: theme.color.textMuted, fontSize: theme.fontSize.body },
    text: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "700" },
    city: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
  });
