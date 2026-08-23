// A round floating action button over the map, in the Google Maps position: bottom-right, riding
// above the sheet. It is a surface, not a bare glyph, because it sits on live tiles whose colour
// nobody controls -- an unbacked icon disappears over a park or a parking lot.
import { memo } from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useTheme,
  useThemedStyles,
  type Theme,
} from "../design-system";

export const FAB_SIZE = 48;

export const MapFab = memo(function MapFab({
  icon,
  label,
  busy = false,
  onPress,
}: {
  icon: string;
  /** Screen-reader label. The glyph alone says nothing to anyone not looking at it. */
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(fabStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={busy ? busyState : undefined}
      onPress={onPress}
      disabled={busy}
      style={styles.fab}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.color.accent} />
      ) : (
        <Text style={styles.icon}>{icon}</Text>
      )}
    </Pressable>
  );
});

const busyState = { disabled: true } as const;

const fabStyles = (theme: Theme) =>
  StyleSheet.create({
    fab: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: FAB_SIZE / 2,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      boxShadow: theme.shadow.raised,
    },
    icon: { color: theme.color.accent, fontSize: theme.fontSize.title },
  });
