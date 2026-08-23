import { memo, useCallback } from "react";

import { Pressable, StyleSheet, Text, type Theme, useThemedStyles } from "../design-system";
import type { Status } from "../state/spots";
import { selectHasEvidence, selectIsSelected, useAppStore } from "../state/store";
import { StatusDot } from "./StatusDot";

/**
 * "Selected" and "has a frame" are read with store selectors rather than passed down, so choosing
 * a different segment re-renders two rows and a finished scan re-renders only the rows whose
 * camera produced a frame.
 */
export const EvidenceSpotRow = memo(function EvidenceSpotRow({
  id,
  title,
  status,
  cameraId,
  onPress,
}: {
  id: string;
  title: string;
  status: Status;
  cameraId: string | undefined;
  onPress: (spotId: string) => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const selected = useAppStore(selectIsSelected(id));
  const hasEvidence = useAppStore(selectHasEvidence(cameraId));
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Show evidence for ${title}`}
      accessibilityState={selected ? selectedState : undefined}
      onPress={handlePress}
      style={[styles.row, selected ? styles.rowSelected : null]}
    >
      <StatusDot status={status} size="sm" />
      <Text
        numberOfLines={1}
        style={[styles.label, selected ? styles.labelSelected : null]}
      >
        {title}
      </Text>
      {hasEvidence ? null : (
        <Text style={[styles.pending, selected ? styles.labelSelected : null]}>no frame</Text>
      )}
    </Pressable>
  );
});

const selectedState = { selected: true } as const;

const rowStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.sm,
      minHeight: 48,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.sm,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    rowSelected: {
      backgroundColor: theme.color.accentStrong,
      borderColor: theme.color.accentStrong,
    },
    label: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.caption, fontWeight: "700" },
    labelSelected: { color: theme.color.onAccent },
    pending: { color: theme.color.textMuted, fontSize: theme.fontSize.caption, fontWeight: "700" },
  });
