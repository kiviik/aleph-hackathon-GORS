import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, type Theme, View, useThemedStyles } from "../design-system";
import { statusLabel, type Status } from "../state/spots";
import { StatusDot } from "./StatusDot";

export const SavedSpotRow = memo(function SavedSpotRow({
  id,
  title,
  neighborhood,
  status,
  onPress,
}: {
  id: string;
  title: string;
  neighborhood: string;
  status: Status;
  onPress: (spotId: string) => void;
}) {
  const styles = useThemedStyles(savedRowStyles);
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={styles.row}>
      <StatusDot status={status} />
      <View style={styles.copy}>
        <Text style={styles.street}>{title}</Text>
        <Text style={styles.meta}>
          {neighborhood} · {statusLabel[status]}
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  );
});

const savedRowStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.md,
      padding: theme.space.lg,
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    copy: { flex: 1, gap: theme.space.xs },
    street: { color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "800" },
    meta: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    arrow: { color: theme.color.textMuted, fontSize: theme.fontSize.title },
  });
