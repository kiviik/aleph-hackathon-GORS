import { memo, useCallback, useMemo } from "react";
import type { NativeBottomTabScreenProps } from "@bottom-tabs/react-navigation";

import { ASKED_CHIP_HEIGHT, AskedChip } from "../components/AskedChip";
import { Muted, SectionLabel } from "../components/Card";
import { ListSeparator } from "../components/ListSeparator";
import { SavedSpotRow } from "../components/SavedSpotRow";
import { ScreenHeader } from "../components/ScreenHeader";
import {
  Button,
  ButtonText,
  List,
  type ListRenderItemInfo,
  ScreenList,
  StyleSheet,
  Text,
  type Theme,
  View,
  useThemedStyles,
} from "../design-system";
import type { RootTabParamList } from "../navigation/RootTabs";
import { spotTitle, type Spot } from "../state/spots";
import { useAppStore } from "../state/store";

const spotKeyExtractor = (spot: Spot) => spot.id;
const chipKeyExtractor = (place: string) => place;

type Props = NativeBottomTabScreenProps<RootTabParamList, "Saved">;

export function SavedScreen({ navigation }: Props) {
  const { navigate } = navigation;
  const styles = useThemedStyles(savedStyles);

  const spots = useAppStore((s) => s.spots);
  const favoriteIds = useAppStore((s) => s.favoriteIds);
  const selectSpot = useAppStore((s) => s.selectSpot);

  const favorites = useMemo(
    () => spots.filter((spot) => favoriteIds.has(spot.id)),
    [favoriteIds, spots]
  );

  const onOpenSpot = useCallback(
    (spotId: string) => {
      selectSpot(spotId);
      navigate("Map");
    },
    [navigate, selectSpot]
  );

  const renderSpot = useCallback(
    ({ item }: ListRenderItemInfo<Spot>) => (
      <SavedSpotRow
        id={item.id}
        title={spotTitle(item)}
        neighborhood={item.neighborhood}
        status={item.status}
        onPress={onOpenSpot}
      />
    ),
    [onOpenSpot]
  );

  const setQuery = useAppStore((s) => s.setQuery);
  const onPickQuery = useCallback(
    (place: string) => {
      setQuery(place);
      navigate("Map");
    },
    [navigate, setQuery]
  );

  const footer = useMemo(() => <SavedFooter onPickQuery={onPickQuery} />, [onPickQuery]);

  return (
    <ScreenList
      data={favorites}
      renderItem={renderSpot}
      keyExtractor={spotKeyExtractor}
      ItemSeparatorComponent={ListSeparator}
      ListHeaderComponent={savedHeader}
      ListEmptyComponent={savedEmpty}
      ListFooterComponent={footer}
      contentContainerStyle={styles.content}
    />
  );
}

const SavedHeader = memo(function SavedHeader() {
  const styles = useThemedStyles(savedStyles);

  return (
    <View style={styles.headerBlock}>
      <ScreenHeader title="Saved places" />
      <SectionLabel>FAVORITES</SectionLabel>
    </View>
  );
});

const SavedEmpty = memo(function SavedEmpty() {
  const styles = useThemedStyles(savedStyles);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>☆</Text>
      <Text style={styles.emptyTitle}>You have no saved places yet</Text>
      <Muted>Tap ☆ on any map point to save it here.</Muted>
    </View>
  );
});

const SavedFooter = memo(function SavedFooter({
  onPickQuery,
}: {
  onPickQuery: (place: string) => void;
}) {
  const styles = useThemedStyles(savedStyles);
  const askedQueries = useAppStore((s) => s.askedQueries);
  const clearMemory = useAppStore((s) => s.clearMemory);

  const renderChip = useCallback(
    ({ item }: ListRenderItemInfo<string>) => <AskedChip place={item} onPress={onPickQuery} />,
    [onPickQuery]
  );

  return (
    <View style={styles.footer}>
      <SectionLabel>MOST SEARCHED ON THIS PHONE</SectionLabel>
      {askedQueries.length > 0 ? (
        <View style={styles.chipRow}>
          <List
            data={askedQueries}
            renderItem={renderChip}
            keyExtractor={chipKeyExtractor}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={ListSeparator}
          />
        </View>
      ) : (
        <Muted>Your frequent searches will appear here.</Muted>
      )}
      <Button variant="ghost" onPress={clearMemory} style={styles.clearButton}>
        <ButtonText variant="ghost">Clear local memory</ButtonText>
      </Button>
    </View>
  );
});

// Elements, not component types: FlashList silently drops a memo()-wrapped component here.
const savedHeader = <SavedHeader />;
const savedEmpty = <SavedEmpty />;

const savedStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: theme.space.lg, paddingBottom: theme.space.xl },
    headerBlock: { gap: theme.space.sm, paddingBottom: theme.space.md },
    empty: { alignItems: "center", gap: theme.space.sm, paddingVertical: theme.space.xl * 2 },
    emptyIcon: { color: theme.color.accent, fontSize: theme.fontSize.display },
    emptyTitle: { color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "800" },
    footer: { gap: theme.space.md, paddingTop: theme.space.xl },
    chipRow: { height: ASKED_CHIP_HEIGHT },
    clearButton: { alignSelf: "flex-start" },
  });
