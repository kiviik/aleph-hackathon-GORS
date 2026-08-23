// The floating search pill. On a full-bleed map this is the only permanent chrome at the top, so
// it is a raised surface rather than a bar: it has to read over whatever tiles are behind it.
import { memo } from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useTheme,
  useThemedStyles,
  type Theme,
} from "../design-system";

export const SEARCH_BAR_HEIGHT = 50;

export const MapSearchBar = memo(function MapSearchBar({
  value,
  onChangeText,
  onSubmit,
  onClear,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  const styles = useThemedStyles(searchStyles);
  const theme = useTheme();

  return (
    <View style={styles.bar}>
      <Text style={styles.icon}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Search a street or neighbourhood"
        placeholderTextColor={theme.color.textMuted}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
      />
      {/* No falsy && around JSX: a "" query would render a stray string node. */}
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear the search"
          onPress={onClear}
          hitSlop={hitSlop}
          style={styles.clear}
        >
          <Text style={styles.clearIcon}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

const searchStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.sm,
      height: SEARCH_BAR_HEIGHT,
      paddingHorizontal: theme.space.lg,
      borderRadius: theme.radius.pill,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      boxShadow: theme.shadow.raised,
    },
    icon: { color: theme.color.textMuted, fontSize: theme.fontSize.title },
    input: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.body },
    clear: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      borderCurve: "continuous",
      backgroundColor: theme.color.surfaceMuted,
    },
    clearIcon: { color: theme.color.textMuted, fontSize: theme.fontSize.body, lineHeight: 18 },
  });
