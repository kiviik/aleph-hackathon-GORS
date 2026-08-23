import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import type { NativeBottomTabScreenProps } from "@bottom-tabs/react-navigation";

import { Card, Muted } from "../components/Card";
import { FilterCard, type FilterKey } from "../components/FilterCard";
import OsmMap, { type OsmMarker } from "../components/OsmMap";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusDot } from "../components/StatusDot";
import { SUGGESTION_ROW_HEIGHT, SuggestionRow } from "../components/SuggestionRow";
import {
  Button,
  ButtonText,
  List,
  Pressable,
  Screen,
  StyleSheet,
  Text,
  TextInput,
  View,
  useTheme,
  useThemedStyles,
  type ListRenderItemInfo,
  type Theme,
} from "../design-system";
import type { RootTabParamList } from "../navigation/RootTabs";
import { checkedPhrase, spotExtent, spotTitle, statusLabel, type Spot } from "../state/spots";
import { useAppStore } from "../state/store";

const mapCenter = { latitude: 51.0447, longitude: -114.0719 };
const mapZoom = 12;

type FilterDefinition = { key: FilterKey; label: string };

/** Static: the data array handed to a list must keep a stable reference. */
const FILTERS: readonly FilterDefinition[] = [
  { key: "all", label: "detected" },
  { key: "free", label: "free nearby" },
  { key: "occupied", label: "occupied" },
  { key: "review", label: "review" },
  { key: "unscanned", label: "not scanned" },
];

const filterKeyExtractor = (filter: FilterDefinition) => filter.key;
const suggestionKeyExtractor = (suggestion: string) => suggestion;

const EMPTY_SUGGESTIONS: readonly string[] = [];

type Props = NativeBottomTabScreenProps<RootTabParamList, "Map">;

export function MapScreen({ navigation }: Props) {
  const { navigate } = navigation;
  const theme = useTheme();
  const styles = useThemedStyles(mapStyles);

  const spots = useAppStore((s) => s.spots);
  const query = useAppStore((s) => s.query);
  const statusFilter = useAppStore((s) => s.statusFilter);
  const selectedSpotId = useAppStore((s) => s.selectedSpotId);
  const userLocation = useAppStore((s) => s.userLocation);
  const locating = useAppStore((s) => s.locating);
  const favoriteIds = useAppStore((s) => s.favoriteIds);

  const setQuery = useAppStore((s) => s.setQuery);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const selectSpot = useAppStore((s) => s.selectSpot);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const rememberQuery = useAppStore((s) => s.rememberQuery);
  const locate = useAppStore((s) => s.locate);

  // Everything below is derived during render — no second copy of it in state.
  const searchedSpots = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return spots;
    return spots.filter((spot) =>
      `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase().includes(normalized)
    );
  }, [query, spots]);

  const visibleSpots = useMemo(
    () =>
      statusFilter === "all"
        ? searchedSpots
        : searchedSpots.filter((spot) => spot.status === statusFilter),
    [searchedSpots, statusFilter]
  );

  const counts = useMemo(
    () => ({
      all: searchedSpots.length,
      free: searchedSpots.filter((spot) => spot.status === "free").length,
      occupied: searchedSpots.filter((spot) => spot.status === "occupied").length,
      review: searchedSpots.filter((spot) => spot.status === "review").length,
      unscanned: searchedSpots.filter((spot) => spot.status === "unscanned").length,
    }),
    [searchedSpots]
  );

  const markers = useMemo<OsmMarker[]>(
    () =>
      visibleSpots.map((spot) => ({
        id: spot.id,
        latitude: spot.latitude,
        longitude: spot.longitude,
        color: theme.color[spot.status],
        title: spotTitle(spot),
        status: `${statusLabel[spot.status]} · ${spot.confidence}`,
        // Extent and accuracy belong on the pin: a band reads a stretch of curb, not a point.
        meta: spotExtent(spot, spot.number),
        curb: spot.curb ?? null,
        pairKey: spot.cameraId,
        hint: "Tap to see the frame",
      })),
    [theme, visibleSpots]
  );

  const suggestionPool = useMemo(
    () => Array.from(new Set(spots.flatMap((s) => [s.street, s.neighborhood]).filter(Boolean))),
    [spots]
  );

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return EMPTY_SUGGESTIONS;
    return suggestionPool
      .filter((suggestion) => suggestion.toLocaleLowerCase().includes(normalized))
      .slice(0, 5);
  }, [query, suggestionPool]);

  const selected: Spot | undefined = useMemo(
    () => visibleSpots.find((spot) => spot.id === selectedSpotId) ?? visibleSpots[0] ?? spots[0],
    [selectedSpotId, spots, visibleSpots]
  );

  const isSelectedFavorite = selected ? favoriteIds.has(selected.id) : false;

  const onLocate = useCallback(async () => {
    const result = await locate();
    if (result === "denied") {
      Alert.alert("Location disabled", "Enable location access in Settings to see nearby spots.");
    } else if (result === "failed") {
      Alert.alert("Could not locate you", "Keep using the Calgary map or try again.");
    }
  }, [locate]);

  const onSubmitQuery = useCallback(() => rememberQuery(query), [query, rememberQuery]);

  const onPickSuggestion = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      setStatusFilter("all");
    },
    [setQuery, setStatusFilter]
  );

  const onOpenEvidence = useCallback(
    (spotId: string) => {
      selectSpot(spotId);
      navigate("Evidence");
    },
    [navigate, selectSpot]
  );

  const onToggleFavorite = useCallback(() => {
    if (selected) toggleFavorite(selected.id);
  }, [selected, toggleFavorite]);

  const onOpenSelectedEvidence = useCallback(() => navigate("Evidence"), [navigate]);

  const renderFilter = useCallback(
    ({ item }: ListRenderItemInfo<FilterDefinition>) => (
      <FilterCard
        filterKey={item.key}
        label={item.label}
        count={counts[item.key]}
        active={statusFilter === item.key}
        onPress={setStatusFilter}
      />
    ),
    [counts, setStatusFilter, statusFilter]
  );

  const renderSuggestion = useCallback(
    ({ item }: ListRenderItemInfo<string>) => (
      <SuggestionRow suggestion={item} onPress={onPickSuggestion} />
    ),
    [onPickSuggestion]
  );

  const suggestionPanelStyle = useMemo(
    () => [
      styles.suggestionPanel,
      { height: Math.min(suggestions.length, 5) * SUGGESTION_ROW_HEIGHT },
    ],
    [styles.suggestionPanel, suggestions.length]
  );

  if (!selected) {
    return (
      <Screen style={styles.screen}>
        <ScreenHeader title="Calgary Parking" />
        <Muted>No curb segments are bundled with this build.</Muted>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScreenHeader title="Calgary Parking" />

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSubmitQuery}
          placeholder="Destination, street or neighborhood"
          placeholderTextColor={theme.color.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use my location"
          onPress={onLocate}
          style={styles.locateButton}
          disabled={locating}
        >
          <Text style={styles.locateIcon}>{locating ? "…" : "⌖"}</Text>
        </Pressable>
      </View>

      {suggestions.length > 0 ? (
        <View style={suggestionPanelStyle}>
          <List
            data={suggestions}
            renderItem={renderSuggestion}
            keyExtractor={suggestionKeyExtractor}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      ) : null}

      <View style={styles.filterRow}>
        <List
          data={FILTERS}
          renderItem={renderFilter}
          keyExtractor={filterKeyExtractor}
          extraData={counts}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        />
      </View>

      <OsmMap
        style={styles.map}
        markers={markers}
        center={mapCenter}
        zoom={mapZoom}
        userLocation={userLocation}
        onSelect={selectSpot}
        onOpen={onOpenEvidence}
      />

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <StatusDot status="free" size="sm" />
          <Text style={styles.legendText}>Free</Text>
        </View>
        <View style={styles.legendItem}>
          <StatusDot status="occupied" size="sm" />
          <Text style={styles.legendText}>Occupied</Text>
        </View>
        <View style={styles.legendItem}>
          <StatusDot status="review" size="sm" />
          <Text style={styles.legendText}>Review</Text>
        </View>
        <View style={styles.legendItem}>
          <StatusDot status="unscanned" size="sm" />
          <Text style={styles.legendText}>Not scanned</Text>
        </View>
      </View>

      <Card>
        <View style={styles.selectedTop}>
          <StatusDot status={selected.status} />
          <View style={styles.selectedCopy}>
            <Text style={styles.selectedStreet}>{spotTitle(selected)}</Text>
            <Muted>{spotExtent(selected, selected.sideLabel ? selected.number : null)}</Muted>
            <Muted>
              {selected.scanned
                ? `${selected.neighborhood} · ${checkedPhrase(selected.checked, true)} · ${selected.confidence}`
                : selected.neighborhood}
            </Muted>
            {selected.scanned ? (
              <Muted numberOfLines={2}>
                {selected.status === "free"
                  ? `${selected.freeMetres} m free · ≈${selected.carsFit} car${selected.carsFit === 1 ? "" : "s"}`
                  : selected.reason}
              </Muted>
            ) : null}
            {selected.scanned && selected.rule ? (
              <Muted numberOfLines={2}>{selected.rule}</Muted>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSelectedFavorite ? "Remove from saved" : "Save this spot"}
            onPress={onToggleFavorite}
            style={styles.starButton}
          >
            <Text style={styles.star}>{isSelectedFavorite ? "★" : "☆"}</Text>
          </Pressable>
        </View>
        <Button onPress={onOpenSelectedEvidence}>
          <ButtonText>Evidence</ButtonText>
        </Button>
      </Card>
    </Screen>
  );
}

const mapStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { paddingHorizontal: theme.space.lg, gap: theme.space.sm },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.sm,
      height: 48,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      boxShadow: theme.shadow.card,
    },
    searchIcon: { color: theme.color.textMuted, fontSize: theme.fontSize.title },
    searchInput: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.body },
    locateButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.sm,
      borderCurve: "continuous",
      backgroundColor: theme.color.surfaceMuted,
    },
    locateIcon: { color: theme.color.accent, fontSize: theme.fontSize.title },
    suggestionPanel: {
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      overflow: "hidden",
    },
    filterRow: { height: 52 },
    filterContent: { paddingVertical: theme.space.xs },
    map: {
      flex: 1,
      alignSelf: "stretch",
      minHeight: 260,
      borderRadius: theme.radius.lg,
      borderCurve: "continuous",
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.space.md,
      paddingVertical: theme.space.xs,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: theme.space.xs },
    legendText: { color: theme.color.textMuted, fontSize: theme.fontSize.caption },
    selectedTop: { flexDirection: "row", alignItems: "center", gap: theme.space.md },
    selectedCopy: { flex: 1, gap: theme.space.xs },
    selectedStreet: { color: theme.color.text, fontSize: theme.fontSize.body, fontWeight: "800" },
    starButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    star: { color: theme.color.accent, fontSize: theme.fontSize.title },
  });
