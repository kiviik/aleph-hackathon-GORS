// Screen containers.
//
// Safe areas are handled natively wherever the platform offers it:
// `contentInsetAdjustmentBehavior="automatic"` on the root scrollable, and the native tab bar
// takes care of the bottom edge. Android has no equivalent for the top edge, so the inset is
// applied there — and only there — rather than wrapping everything in a SafeAreaView.
import { useMemo, type ReactNode, type Ref } from "react";
import {
  Platform,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { List, type ListProps, type ListRef } from "./list";
import { useSafeAreaInsets } from "./safe-area";
import { ScrollView } from "./scroll-view";
import { useTheme } from "./use-theme";
import { View } from "./view";

/** Top inset the platform will NOT apply for us. iOS does it natively; Android does not. */
function useUnhandledTopInset(): number {
  const { top } = useSafeAreaInsets();
  return Platform.OS === "android" ? top : 0;
}

type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Paint under the status bar instead of below it.
   *
   * For the map this is the whole point: a full-bleed map with floating chrome is only full-bleed
   * if the tiles run to the top edge of the display. Screens that opt in own their own top inset —
   * the map spends it on the search bar rather than on empty background.
   */
  edgeToEdge?: boolean;
  /** Measured size of the screen itself, for screens that lay their own chrome out over it. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * A non-scrolling screen root (map, street view). There is no native content-inset behaviour for
 * a plain View, so the top inset is applied manually on both platforms.
 */
export function Screen({ children, style, edgeToEdge = false, onLayout }: ScreenProps) {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => [
      styles.flex,
      { backgroundColor: theme.color.background, paddingTop: edgeToEdge ? 0 : top },
      style,
    ],
    [theme.color.background, edgeToEdge, top, style]
  );

  return (
    <View style={containerStyle} onLayout={onLayout}>
      {children}
    </View>
  );
}

/** A scrolling screen root. iOS gets the native inset behaviour; Android gets the measured one. */
export function ScreenScrollView({
  children,
  contentContainerStyle,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const topInset = useUnhandledTopInset();
  const containerStyle = useMemo(
    () => [styles.flex, { backgroundColor: theme.color.background }],
    [theme.color.background]
  );
  const contentStyle = useMemo(
    () => [contentContainerStyle, topInset > 0 ? { paddingTop: topInset } : null],
    [contentContainerStyle, topInset]
  );

  return (
    <ScrollView
      style={containerStyle}
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/** A screen whose root *is* the list. Same inset story, no ScrollView wrapping a virtualiser. */
export function ScreenList<TItem>({
  contentContainerStyle,
  listRef,
  ...props
}: ListProps<TItem> & {
  /**
   * Handle on the virtualiser. A generic component cannot be wrapped in forwardRef without losing
   * its type parameter, so the ref travels as an ordinary prop.
   */
  listRef?: Ref<ListRef<TItem>>;
}) {
  const theme = useTheme();
  const topInset = useUnhandledTopInset();
  // FlashList types `style` as a plain ViewStyle, so this one stays a single flattened object.
  const containerStyle = useMemo(
    () => ({ flex: 1, backgroundColor: theme.color.background }),
    [theme.color.background]
  );
  const contentStyle = useMemo(
    () => [contentContainerStyle, topInset > 0 ? { paddingTop: topInset } : null],
    [contentContainerStyle, topInset]
  );

  return (
    <List
      {...props}
      ref={listRef}
      style={containerStyle}
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
