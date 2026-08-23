// Screen containers.
//
// Safe areas are handled natively wherever the platform offers it:
// `contentInsetAdjustmentBehavior="automatic"` on the root scrollable, and the native tab bar
// takes care of the bottom edge. Android has no equivalent for the top edge, so the inset is
// applied there — and only there — rather than wrapping everything in a SafeAreaView.
import { useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { List, type ListProps } from "./list";
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
};

/**
 * A non-scrolling screen root (map, street view). There is no native content-inset behaviour for
 * a plain View, so the top inset is applied manually on both platforms.
 */
export function Screen({ children, style }: ScreenProps) {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => [styles.flex, { backgroundColor: theme.color.background, paddingTop: top }, style],
    [theme.color.background, top, style]
  );

  return <View style={containerStyle}>{children}</View>;
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
  ...props
}: ListProps<TItem>) {
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
