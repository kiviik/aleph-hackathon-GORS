// Edge-to-edge chrome, not safe-area padding.
//
// Scrolling roots deliberately let content pass under the status bar — that is what
// `contentInsetAdjustmentBehavior="automatic"` does on iOS and what Android's edge-to-edge mode
// does everywhere. Without something behind the system clock, scrolled text collides with it.
// This paints that strip and nothing else: no layout, no insets applied to content.
import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { useSafeAreaInsets } from "./safe-area";
import { useTheme } from "./use-theme";
import { View } from "./view";

export function StatusBarScrim() {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  const style = useMemo(
    () => [styles.scrim, { height: top, backgroundColor: theme.color.background }],
    [theme.color.background, top]
  );

  if (top === 0) return null;

  return <View style={style} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
