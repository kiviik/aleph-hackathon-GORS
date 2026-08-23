import { memo, useCallback } from "react";

import {
  Button,
  ButtonText,
  Pressable,
  StyleSheet,
  Text,
  type Theme,
  View,
  useThemedStyles,
} from "../design-system";
import { checkedPhrase, type Status } from "../state/spots";
import { selectVerdict, useAppStore } from "../state/store";
import { StatusDot, StatusText } from "./StatusDot";

/**
 * The reviewer's verdict comes from a store selector, so marking one spot re-renders one row.
 * Everything else arrives as a primitive.
 */
export const TestingSpotRow = memo(function TestingSpotRow({
  id,
  title,
  neighborhood,
  status,
  confidence,
  checked,
  scanned,
  onOpenEvidence,
}: {
  id: string;
  title: string;
  neighborhood: string;
  status: Status;
  confidence: string;
  checked: string;
  scanned: boolean;
  onOpenEvidence: (spotId: string) => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const verdict = useAppStore(selectVerdict(id));
  const reviewSpot = useAppStore((s) => s.reviewSpot);

  const openEvidence = useCallback(() => onOpenEvidence(id), [id, onOpenEvidence]);
  const markCorrect = useCallback(() => reviewSpot(id, true), [id, reviewSpot]);
  const markIncorrect = useCallback(() => reviewSpot(id, false), [id, reviewSpot]);

  return (
    <View style={styles.card}>
      <StatusDot status={status} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.street}>{title}</Text>
          <StatusText status={status} />
        </View>
        <Text style={styles.meta}>
          {neighborhood} · confidence {confidence} · {checkedPhrase(checked, scanned)}
        </Text>
        <Pressable accessibilityRole="link" onPress={openEvidence}>
          <Text style={styles.link}>See the frame ›</Text>
        </Pressable>
      </View>
      <View style={styles.verdicts}>
        <Button
          variant="secondary"
          accessibilityLabel={`Mark ${title} correct`}
          onPress={markCorrect}
          style={[styles.verdict, verdict === true ? styles.verdictCorrect : null]}
        >
          <ButtonText variant="secondary">✓</ButtonText>
        </Button>
        <Button
          variant="secondary"
          accessibilityLabel={`Mark ${title} incorrect`}
          onPress={markIncorrect}
          style={[styles.verdict, verdict === false ? styles.verdictIncorrect : null]}
        >
          <ButtonText variant="secondary">×</ButtonText>
        </Button>
      </View>
    </View>
  );
});

const rowStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.md,
      padding: theme.space.md,
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    copy: { flex: 1, gap: theme.space.xs },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.space.sm,
    },
    street: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "800" },
    meta: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    link: { color: theme.color.accent, fontSize: theme.fontSize.caption, fontWeight: "800" },
    verdicts: { flexDirection: "row", gap: theme.space.xs + 2 },
    verdict: { minWidth: 44, paddingHorizontal: theme.space.sm },
    verdictCorrect: { backgroundColor: theme.color.surfaceMuted, borderColor: theme.color.free },
    verdictIncorrect: { backgroundColor: theme.color.surfaceMuted, borderColor: theme.color.occupied },
  });
