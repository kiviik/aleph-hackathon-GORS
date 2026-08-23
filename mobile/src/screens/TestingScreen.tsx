import { memo, useCallback, useMemo } from "react";
import type { NativeBottomTabScreenProps } from "@bottom-tabs/react-navigation";

import { Card, CardTitle, Muted, SectionLabel } from "../components/Card";
import { ListSeparator } from "../components/ListSeparator";
import { ScreenHeader } from "../components/ScreenHeader";
import { TestingSpotRow } from "../components/TestingSpotRow";
import {
  Button,
  ButtonText,
  type ListRenderItemInfo,
  Pressable,
  ScreenList,
  StyleSheet,
  Text,
  type Theme,
  View,
  useThemedStyles,
} from "../design-system";
import { formatClockTime, formatPercent } from "../lib/format";
import type { RootTabParamList } from "../navigation/RootTabs";
import { spotTitle, type Spot } from "../state/spots";
import { useAppStore } from "../state/store";

const spotKeyExtractor = (spot: Spot) => spot.id;

type Props = NativeBottomTabScreenProps<RootTabParamList, "Testing">;

export function TestingScreen({ navigation }: Props) {
  const { navigate } = navigation;
  const styles = useThemedStyles(testingStyles);

  const spots = useAppStore((s) => s.spots);
  const selectSpot = useAppStore((s) => s.selectSpot);

  const onOpenEvidence = useCallback(
    (spotId: string) => {
      selectSpot(spotId);
      navigate("Evidence");
    },
    [navigate, selectSpot]
  );

  const renderSpot = useCallback(
    ({ item }: ListRenderItemInfo<Spot>) => (
      <TestingSpotRow
        id={item.id}
        title={spotTitle(item)}
        neighborhood={item.neighborhood}
        status={item.status}
        confidence={item.confidence}
        checked={item.checked}
        scanned={Boolean(item.scanned)}
        onOpenEvidence={onOpenEvidence}
      />
    ),
    [onOpenEvidence]
  );

  return (
    <ScreenList
      data={spots}
      renderItem={renderSpot}
      keyExtractor={spotKeyExtractor}
      ItemSeparatorComponent={ListSeparator}
      ListHeaderComponent={testingHeader}
      ListFooterComponent={testingFooter}
      contentContainerStyle={styles.content}
    />
  );
}

/**
 * The stats live in the header, not in the screen, so recording a verdict re-renders the header
 * and the single row that changed — never the whole list.
 */
const TestingHeader = memo(function TestingHeader() {
  const styles = useThemedStyles(testingStyles);
  const spotCount = useAppStore((s) => s.spots.length);
  const checks = useAppStore((s) => s.checks);
  const feedRefreshedAt = useAppStore((s) => s.feedRefreshedAt);
  const refreshFeed = useAppStore((s) => s.refreshFeed);
  const resetChecks = useAppStore((s) => s.resetChecks);

  const stats = useMemo(() => {
    const reviewedIds = new Set<string>();
    let correct = 0;
    for (const check of checks) {
      reviewedIds.add(check.spotId);
      if (check.correct) correct += 1;
    }
    return {
      reviewed: reviewedIds.size,
      total: checks.length,
      correct,
      incorrect: checks.length - correct,
    };
  }, [checks]);

  return (
    <View style={styles.header}>
      <ScreenHeader title="Testing" />

      <Card>
        <View style={styles.cardTop}>
          <View style={styles.cardCopy}>
            <SectionLabel>CURRENT CALGARY FEED</SectionLabel>
            <CardTitle>Street + parking spots</CardTitle>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh testing feed"
            onPress={refreshFeed}
            style={styles.refresh}
          >
            <Text style={styles.refreshIcon}>↻</Text>
          </Pressable>
        </View>
        <Muted>Review the prediction against the real street, one spot at a time.</Muted>
        <View style={styles.feedMeta}>
          <Text style={styles.metaText}>{spotCount} spots · Calgary</Text>
          <Text style={styles.metaText}>Updated {formatClockTime(feedRefreshedAt)}</Text>
        </View>
      </Card>

      <View style={styles.accuracyCard}>
        <View style={styles.cardTop}>
          <View style={styles.cardCopy}>
            <Text style={styles.accuracyEyebrow}>LIVE ACCURACY</Text>
            <Text style={styles.accuracyNumber}>
              {stats.total === 0 ? "—" : formatPercent(stats.correct / stats.total)}
            </Text>
          </View>
          <Text style={styles.accuracyProgress}>
            {stats.reviewed}/{spotCount} spots · {stats.total} checks
          </Text>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, styles.metricCorrect]}>{stats.correct}</Text>
            <Text style={styles.metricLabel}>correct</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, styles.metricIncorrect]}>{stats.incorrect}</Text>
            <Text style={styles.metricLabel}>incorrect</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, styles.metricPending]}>
              {spotCount - stats.reviewed}
            </Text>
            <Text style={styles.metricLabel}>pending</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <SectionLabel>CHECK EACH PREDICTION</SectionLabel>
        <Button variant="ghost" onPress={resetChecks} disabled={stats.total === 0}>
          <ButtonText variant="ghost">Reset</ButtonText>
        </Button>
      </View>
    </View>
  );
});

const TestingFooter = memo(function TestingFooter() {
  const styles = useThemedStyles(testingStyles);
  return (
    <View style={styles.footer}>
      <Text style={styles.footnote}>
        Every check is counted instantly on this device. Use the frame on the Evidence tab and the
        physical spot as the source of truth.
      </Text>
    </View>
  );
});

// Elements, not component types: FlashList silently drops a memo()-wrapped component here.
const testingHeader = <TestingHeader />;
const testingFooter = <TestingFooter />;

const testingStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: theme.space.lg, paddingBottom: theme.space.xl },
    header: { gap: theme.space.md, paddingBottom: theme.space.md },
    cardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.space.md,
    },
    cardCopy: { flex: 1, gap: theme.space.xs },
    refresh: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.sm,
      borderCurve: "continuous",
      backgroundColor: theme.color.surfaceMuted,
    },
    refreshIcon: { color: theme.color.accent, fontSize: theme.fontSize.title, fontWeight: "700" },
    feedMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.space.md,
      paddingTop: theme.space.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    metaText: { color: theme.color.textMuted, fontSize: theme.fontSize.caption, fontWeight: "700" },
    accuracyCard: {
      gap: theme.space.md,
      padding: theme.space.lg,
      borderRadius: theme.radius.lg,
      borderCurve: "continuous",
      backgroundColor: theme.color.accentStrong,
    },
    accuracyEyebrow: {
      color: theme.color.onAccent,
      fontSize: theme.fontSize.caption,
      fontWeight: "800",
      letterSpacing: 1.1,
      opacity: 0.7,
    },
    accuracyNumber: {
      color: theme.color.onAccent,
      fontSize: theme.fontSize.display,
      fontWeight: "800",
    },
    accuracyProgress: {
      color: theme.color.onAccent,
      fontSize: theme.fontSize.caption,
      fontWeight: "700",
      opacity: 0.8,
    },
    metrics: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: theme.space.md,
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.16)",
    },
    metric: { flex: 1, gap: theme.space.xs },
    metricNumber: { fontSize: theme.fontSize.title, fontWeight: "800" },
    metricCorrect: { color: theme.color.free },
    metricIncorrect: { color: theme.color.occupied },
    metricPending: { color: theme.color.onAccent },
    metricLabel: {
      color: theme.color.onAccent,
      fontSize: theme.fontSize.caption,
      opacity: 0.75,
    },
    metricDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.18)" },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.space.md,
    },
    footer: { paddingTop: theme.space.md },
    footnote: {
      color: theme.color.textMuted,
      fontSize: theme.fontSize.caption,
      lineHeight: 20,
    },
  });
