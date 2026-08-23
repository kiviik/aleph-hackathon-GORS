// Edge-to-edge chrome, not safe-area padding.
//
// Scrolling roots deliberately let content pass under the status bar — that is what
// `contentInsetAdjustmentBehavior="automatic"` does on iOS and what Android's edge-to-edge mode
// does everywhere. Without something behind the system clock, scrolled text collides with it.
// This paints that strip and nothing else: no layout, no insets applied to content.
//
// The map wants the same protection without the opaque bar: on a full-bleed map the tiles have to
// run to the top edge, but the clock and the battery are white and the tiles are not. `veil` keeps
// the tiles visible and the system text legible.
import { useMemo } from "react";
import { StyleSheet } from "react-native";

import { useSafeAreaInsets } from "./safe-area";
import { useTheme } from "./use-theme";
import { View } from "./view";

export function StatusBarScrim({ variant = "solid" }: { variant?: "solid" | "veil" }) {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  const style = useMemo(
    () => [
      styles.scrim,
      { height: top, backgroundColor: variant === "veil" ? theme.color.veil : theme.color.background },
    ],
    [theme.color.background, theme.color.veil, top, variant]
  );

  if (top === 0) return null;

  return <View style={style} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
