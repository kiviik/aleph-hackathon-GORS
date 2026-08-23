// The map, full screen.
//
// The old layout stacked a title, a search box, a filter row, a fixed-height map, a legend and a
// detail card down the screen. The map got whatever vertical space the rest did not want -- on a
// phone, less than half of it -- which is backwards for an app whose entire answer is "where".
//
// This is the Google Maps / Uber shape instead: tiles edge to edge under everything, a floating
// search pill and filter chips at the top, a locate button that rides the sheet, and a draggable
// bottom sheet carrying the selected curb and the browsable list. Every overlay is `position:
// absolute` over the map, so the map never resizes -- a WebView relayout would reload tiles and
// throw away the user's pan on every keystroke in the search box.
//
// Two things follow from covering the map with chrome:
//   * OSM's tile policy requires the attribution stay visible, so the sheet's peek height is handed
//     to `OsmMap` as `bottomInset` and Leaflet lifts its controls clear of it.
//   * A pin selected from the list can be underneath the sheet, so selecting from the list also
//     asks the map to pan, with an upward offset of the same peek height.
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import type { NativeBottomTabScreenProps } from "@bottom-tabs/react-navigation";

import { BottomSheet, SheetGrabber, useBottomSheet } from "../components/BottomSheet";
import { Muted, SectionLabel } from "../components/Card";
import { DetectorBanner } from "../components/DetectorBanner";
import { FILTER_CHIP_HEIGHT, FilterChip, type FilterKey } from "../components/FilterChip";
import { MapFab } from "../components/MapFab";
import { MapSearchBar } from "../components/MapSearchBar";
import { NearbySpotRow } from "../components/NearbySpotRow";
import OsmMap, { type MapFocus, type OsmMarker } from "../components/OsmMap";
import { ScreenHeader } from "../components/ScreenHeader";
import { SpotSummary } from "../components/SpotSummary";
import { SUGGESTION_ROW_HEIGHT, SuggestionRow } from "../components/SuggestionRow";
import {
  Animated,
  List,
  Screen,
  StatusBarScrim,
  StyleSheet,
  Text,
  View,
  useSafeAreaInsets,
  useTheme,
  useThemedStyles,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type Theme,
} from "../design-system";
import type { RootTabParamList } from "../navigation/RootTabs";
import {
  spotExtent,
  spotSubtitle,
  spotTitle,
  statusLabel,
  type Spot,
} from "../state/spots";
import { useAppStore } from "../state/store";

const mapCenter = { latitude: 51.0447, longitude: -114.0719 };
// One step tighter than the old boxed map: with the whole screen to draw on, downtown Calgary fills
// the view at 13 instead of being a smudge in the middle of Alberta.
const mapZoom = 13;

/** Fractions of the screen the sheet snaps to, on top of its measured peek height. */
const SHEET_MID_FRACTION = 0.46;
const SHEET_FULL_FRACTION = 0.88;

/** Gap between the sheet's top edge and the floating button riding above it. */
const FAB_GAP = 14;

/** Used until the sheet header has measured itself, so the first frame is not a flat rectangle. */
const PEEK_FALLBACK = 190;

type FilterDefinition = { key: FilterKey; label: string };

/** Static: the data array handed to a list must keep a stable reference. */
const FILTERS: readonly FilterDefinition[] = [
  { key: "all", label: "detected" },
  { key: "free", label: "free" },
  { key: "occupied", label: "occupied" },
  { key: "review", label: "in review" },
  { key: "unscanned", label: "not scanned" },
];

const filterKeyExtractor = (filter: FilterDefinition) => filter.key;
const suggestionKeyExtractor = (suggestion: string) => suggestion;
const spotKeyExtractor = (spot: Spot) => spot.id;

const EMPTY_SUGGESTIONS: readonly string[] = [];

type Props = NativeBottomTabScreenProps<RootTabParamList, "Map">;

export function MapScreen({ navigation }: Props) {
  const { navigate } = navigation;
  const theme = useTheme();
  const styles = useThemedStyles(mapStyles);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

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

  // --- layout -------------------------------------------------------------
  // Measured, not read off Dimensions: the sheet's snap points are fractions of the space this
  // screen actually got, which is the window minus the native tab bar, and changes on rotation.
  const [canvasHeight, setCanvasHeight] = useState(window.height);
  const [peekHeight, setPeekHeight] = useState(PEEK_FALLBACK);

  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setCanvasHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
  }, []);

  // The peek height IS the header: whatever the selected-curb block measures is exactly how much
  // sheet the user gets without dragging. Hard-coding it would clip the verdict line on the curbs
  // that have the most to say.
  const onSheetHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setPeekHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
  }, []);

  const snapPoints = useMemo(() => {
    const peek = Math.round(peekHeight);
    const full = Math.max(peek + 80, Math.round(canvasHeight * SHEET_FULL_FRACTION));
    const mid = Math.round(canvasHeight * SHEET_MID_FRACTION);
    const points = [peek];
    if (mid > peek + 60 && mid < full - 60) points.push(mid);
    points.push(full);
    return points;
  }, [canvasHeight, peekHeight]);

  const sheet = useBottomSheet(snapPoints);
  const { index: sheetIndex, maxHeight: sheetMax, snapTo, translateY } = sheet;

  // The locate button rides the sheet's top edge, on the same native-driven value, and fades out
  // once the sheet has swallowed the map it would recentre.
  const fabTranslate = useMemo(() => {
    const span = Math.max(1, sheetMax - snapPoints[0]);
    return translateY.interpolate({
      inputRange: [0, span],
      outputRange: [-(sheetMax + FAB_GAP), -(snapPoints[0] + FAB_GAP)],
      extrapolate: "clamp",
    });
  }, [sheetMax, snapPoints, translateY]);

  const fabOpacity = useMemo(() => {
    const span = Math.max(1, sheetMax - snapPoints[0]);
    return translateY.interpolate({
      inputRange: [0, span * 0.45, span],
      outputRange: [0, 1, 1],
      extrapolate: "clamp",
    });
  }, [sheetMax, snapPoints, translateY]);

  const fabDockStyle = useMemo(
    () => [styles.fabDock, { opacity: fabOpacity, transform: [{ translateY: fabTranslate }] }],
    [fabOpacity, fabTranslate, styles.fabDock]
  );

  const topOverlayStyle = useMemo(
    () => [styles.topOverlay, { paddingTop: insets.top + theme.space.sm }],
    [insets.top, styles.topOverlay, theme.space.sm]
  );

  // --- derived data -------------------------------------------------------
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

  // --- map panning --------------------------------------------------------
  const focusNonce = useRef(0);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const focusOn = useCallback(
    (spot: Spot) => {
      focusNonce.current += 1;
      setFocus({
        latitude: spot.latitude,
        longitude: spot.longitude,
        // Half the sheet's peek, so the pin lands above it rather than behind it.
        offsetY: Math.round(peekHeight / 2),
        nonce: focusNonce.current,
      });
    },
    [peekHeight]
  );

  // --- handlers -----------------------------------------------------------
  const onLocate = useCallback(async () => {
    const result = await locate();
    if (result === "denied") {
      Alert.alert("Location disabled", "Enable location access in Settings to see nearby spots.");
    } else if (result === "failed") {
      Alert.alert("Could not locate you", "Keep using the Calgary map or try again.");
    }
  }, [locate]);

  const onSubmitQuery = useCallback(() => rememberQuery(query), [query, rememberQuery]);
  const onClearQuery = useCallback(() => setQuery(""), [setQuery]);

  const onPickSuggestion = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      setStatusFilter("all");
    },
    [setQuery, setStatusFilter]
  );

  // Both ways into Evidence -- the pin popup's "Tap to see the frame" and the sheet's button --
  // are a request for the image, so both carry the nonce that scrolls it back into view.
  const onOpenEvidence = useCallback(
    (spotId: string) => {
      selectSpot(spotId);
      navigate("Evidence", { frameNonce: Date.now() });
    },
    [navigate, selectSpot]
  );

  // Tapping a pin only selects: the map is already showing where it is, and recentring under the
  // user's finger is disorienting.
  const onSelectMarker = useCallback((spotId: string) => selectSpot(spotId), [selectSpot]);

  // Tapping a row is the other way round — the pin may be off screen or under the sheet, so the
  // map pans to it and the sheet drops back to its peek to uncover the answer.
  const onSelectFromList = useCallback(
    (spotId: string) => {
      selectSpot(spotId);
      const spot = spots.find((s) => s.id === spotId);
      if (spot) focusOn(spot);
      snapTo(0);
    },
    [focusOn, selectSpot, snapTo, spots]
  );

  const onToggleFavorite = useCallback(() => {
    if (selected) toggleFavorite(selected.id);
  }, [selected, toggleFavorite]);

  const onOpenSelectedEvidence = useCallback(
    () => navigate("Evidence", { frameNonce: Date.now() }),
    [navigate]
  );

  const onToggleSheet = useCallback(
    () => snapTo(sheetIndex === 0 ? 1 : 0),
    [sheetIndex, snapTo]
  );

  // --- renderers ----------------------------------------------------------
  const renderFilter = useCallback(
    ({ item }: ListRenderItemInfo<FilterDefinition>) => (
      <FilterChip
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

  const renderSpot = useCallback(
    ({ item }: ListRenderItemInfo<Spot>) => (
      <NearbySpotRow
        id={item.id}
        title={spotTitle(item)}
        detail={spotSubtitle(item)}
        status={item.status}
        selected={item.id === selectedSpotId}
        onPress={onSelectFromList}
      />
    ),
    [onSelectFromList, selectedSpotId]
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
      <Screen style={styles.emptyScreen}>
        <ScreenHeader title="Calgary Parking" />
        <Muted>No curb segments are bundled with this build.</Muted>
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge onLayout={onCanvasLayout}>
      <OsmMap
        style={styles.map}
        markers={markers}
        center={mapCenter}
        zoom={mapZoom}
        userLocation={userLocation}
        zoomControl={false}
        bottomInset={Math.round(peekHeight + theme.space.sm)}
        focus={focus}
        onSelect={onSelectMarker}
        onOpen={onOpenEvidence}
      />

      <StatusBarScrim variant="veil" />

      {/* box-none: the overlay itself must not eat pans meant for the map behind it. */}
      <View style={topOverlayStyle} pointerEvents="box-none">
        <View style={styles.topInset}>
          <MapSearchBar
            value={query}
            onChangeText={setQuery}
            onSubmit={onSubmitQuery}
            onClear={onClearQuery}
          />
          <DetectorBanner />
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
        </View>

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
      </View>

      <Animated.View style={fabDockStyle} pointerEvents="box-none">
        <MapFab icon="⌖" label="Centre the map on me" busy={locating} onPress={onLocate} />
      </Animated.View>

      <BottomSheet height={sheetMax} translateY={translateY}>
        {/* The pan handlers live on the header only, so the list below still scrolls. */}
        <View onLayout={onSheetHeaderLayout} {...sheet.panHandlers}>
          <SheetGrabber expanded={sheetIndex > 0} onPress={onToggleSheet} />
          <SpotSummary
            spot={selected}
            saved={isSelectedFavorite}
            onToggleSave={onToggleFavorite}
            onOpenEvidence={onOpenSelectedEvidence}
          />
        </View>

        <View style={styles.listHead}>
          <SectionLabel>NEARBY CURBS</SectionLabel>
          <Text style={styles.listCount}>{visibleSpots.length}</Text>
        </View>

        <List
          data={visibleSpots}
          renderItem={renderSpot}
          keyExtractor={spotKeyExtractor}
          extraData={selectedSpotId}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      </BottomSheet>
    </Screen>
  );
}

const mapStyles = (theme: Theme) =>
  StyleSheet.create({
    emptyScreen: { paddingHorizontal: theme.space.lg, gap: theme.space.sm },
    // The map is the screen. Everything else is an overlay on top of it.
    map: { ...StyleSheet.absoluteFillObject },
    topOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      gap: theme.space.sm,
    },
    // Horizontal padding sits here rather than on the overlay, so the chip row can scroll from edge
    // to edge underneath it.
    topInset: { paddingHorizontal: theme.space.lg, gap: theme.space.sm },
    suggestionPanel: {
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      overflow: "hidden",
      boxShadow: theme.shadow.card,
    },
    filterRow: { height: FILTER_CHIP_HEIGHT },
    filterContent: { paddingHorizontal: theme.space.lg },
    fabDock: { position: "absolute", right: theme.space.lg, bottom: 0 },
    listHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.space.lg,
      paddingTop: theme.space.sm,
      paddingBottom: theme.space.xs,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    listCount: { color: theme.color.textMuted, fontSize: theme.fontSize.caption, fontWeight: "800" },
    listContent: { paddingBottom: theme.space.xl },
  });
