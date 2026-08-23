import { memo } from "react";

import { StyleSheet, Text, type Theme, View, useThemedStyles } from "../design-system";

/** Just the screen title. No eyebrow row, no actions. */
export const ScreenHeader = memo(function ScreenHeader({ title }: { title: string }) {
  const styles = useThemedStyles(headerStyles);

  return (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
});

const headerStyles = (theme: Theme) =>
  StyleSheet.create({
    header: {
      paddingTop: theme.space.md,
      paddingBottom: theme.space.lg,
    },
    title: {
      color: theme.color.text,
      fontSize: theme.fontSize.title,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
  });
