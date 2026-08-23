// The selected curb, as the sheet's always-visible header.
//
// This is the block that decides the sheet's peek height: whatever it measures is what the user
// sees without dragging anything, so it carries the whole answer -- which curb, what the verdict
// is, how much room, how old the frame is -- and the actions on it. Everything below it in the
// sheet is browsing.
import { memo } from "react";

import {
  Button,
  ButtonText,
  Pressable,
  StyleSheet,
  Text,
  View,
  useThemedStyles,
  type Theme,
} from "../design-system";
import { checkedPhrase, spotExtent, spotTitle, type Spot } from "../state/spots";
import { StatusDot, StatusText } from "./StatusDot";

export const SpotSummary = memo(function SpotSummary({
  spot,
  saved,
  onToggleSave,
  onOpenEvidence,
}: {
  spot: Spot;
  saved: boolean;
  onToggleSave: () => void;
  onOpenEvidence: () => void;
}) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.block}>
      <View style={styles.top}>
        <View style={styles.copy}>
          <View style={styles.statusRow}>
            <StatusDot status={spot.status} />
            <StatusText status={spot.status} />
            <Text style={styles.dimInline} numberOfLines={1}>
              · {spot.scanned ? `${spot.confidence} · ${checkedPhrase(spot.checked, true)}` : "not scanned yet"}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {spotTitle(spot)}
          </Text>
          <Text style={styles.dim} numberOfLines={1}>
            {spot.neighborhood} · {spotExtent(spot, spot.sideLabel ? spot.number : null)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove from saved" : "Save this curb"}
          onPress={onToggleSave}
          style={styles.star}
        >
          <Text style={styles.starIcon}>{saved ? "★" : "☆"}</Text>
        </Pressable>
      </View>

      {spot.scanned ? (
        <Text style={styles.verdict} numberOfLines={2}>
          {spot.status === "free"
            ? `${spot.freeMetres} m free · room for about ${spot.carsFit} car${spot.carsFit === 1 ? "" : "s"}`
            : spot.reason}
        </Text>
      ) : null}

      <Button onPress={onOpenEvidence} variant="secondary">
        <ButtonText variant="secondary">See the frame this came from</ButtonText>
      </Button>
    </View>
  );
});

const summaryStyles = (theme: Theme) =>
  StyleSheet.create({
    block: {
      gap: theme.space.sm,
      paddingHorizontal: theme.space.lg,
      paddingBottom: theme.space.md,
    },
    top: { flexDirection: "row", alignItems: "flex-start", gap: theme.space.sm },
    copy: { flex: 1, gap: 2 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: theme.space.xs },
    title: { color: theme.color.text, fontSize: theme.fontSize.title, fontWeight: "800", letterSpacing: -0.4 },
    dim: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    // Same look, but `flex: 1` only makes sense next to siblings in a row -- in the column below it
    // would give the line zero height and silently drop the neighbourhood and the extent.
    dimInline: { flex: 1, color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    verdict: { color: theme.color.text, fontSize: theme.fontSize.caption, lineHeight: 18 },
    star: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    starIcon: { color: theme.color.accent, fontSize: theme.fontSize.title },
  });
