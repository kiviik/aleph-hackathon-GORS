import { memo, type ReactNode } from "react";

import { type StyleProp, StyleSheet, Text, type Theme, View, type ViewStyle, useThemedStyles } from "../design-system";

export const Card = memo(function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(cardStyles);
  return <View style={[styles.card, style]}>{children}</View>;
});

export const CardTitle = memo(function CardTitle({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(cardStyles);
  return <Text style={styles.title}>{children}</Text>;
});

export const SectionLabel = memo(function SectionLabel({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(cardStyles);
  return <Text style={styles.section}>{children}</Text>;
});

export const Muted = memo(function Muted({
  children,
  numberOfLines,
}: {
  children: ReactNode;
  numberOfLines?: number;
}) {
  const styles = useThemedStyles(cardStyles);
  return (
    <Text style={styles.muted} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
});

const cardStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      gap: theme.space.sm,
      padding: theme.space.lg,
      borderRadius: theme.radius.lg,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      boxShadow: theme.shadow.card,
    },
    title: { color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "800" },
    section: {
      color: theme.color.textMuted,
      fontSize: theme.fontSize.caption,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    muted: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
  });
