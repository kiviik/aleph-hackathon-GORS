import { memo } from "react";

import { StyleSheet, Text, type Theme, View, useThemedStyles } from "../design-system";

export type Tone = "neutral" | "ok" | "warn" | "bad";

/** label ......... value — the diagnostic line used all over the Scan tab. */
export const DetailRow = memo(function DetailRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const styles = useThemedStyles(detailStyles);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, styles[tone]]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
});

const detailStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: theme.space.md,
    },
    label: { color: theme.color.textMuted, fontSize: theme.fontSize.caption, flexShrink: 0 },
    value: {
      flex: 1,
      textAlign: "right",
      fontSize: theme.fontSize.caption,
      fontWeight: "600",
      color: theme.color.text,
    },
    neutral: { color: theme.color.text },
    ok: { color: theme.color.free },
    warn: { color: theme.color.review },
    bad: { color: theme.color.occupied },
  });
