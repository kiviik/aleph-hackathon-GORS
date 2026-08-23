// The one thing the removed status tab was load-bearing for.
//
// The 38 MB YOLO26s model is downloaded on first launch (see scan/scan.ts:bootDetector). Without a
// line saying so, that first minute looks like a hung app with an all-grey map — every band reads
// "not scanned" because nothing can run on a frame yet. This renders only while the download is in
// flight or after the detector has failed to come up; the rest of the time it is nothing at all.
import { memo } from "react";

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type Theme,
  View,
  useTheme,
  useThemedStyles,
} from "../design-system";
import { useAppStore } from "../state/store";

export const DetectorBanner = memo(function DetectorBanner() {
  const styles = useThemedStyles(bannerStyles);
  const theme = useTheme();
  // Two primitives, subscribed separately: a download tick re-renders this row and nothing else on
  // the screen — not the map, not the marker list.
  const modelProgress = useAppStore((s) => s.modelProgress);
  const detectorError = useAppStore((s) => s.detectorError);

  if (modelProgress !== null) {
    return (
      <View style={[styles.banner, styles.working]}>
        <ActivityIndicator color={theme.color.review} />
        <Text style={styles.text} numberOfLines={1}>
          Downloading detector model… {Math.round(modelProgress * 100)}%
        </Text>
      </View>
    );
  }

  if (detectorError) {
    return (
      <View style={[styles.banner, styles.failed]}>
        <Text style={styles.icon}>!</Text>
        {/* Said plainly rather than dressed up: no verdict on this screen can be trusted while
            this line is showing. */}
        <Text style={styles.text} numberOfLines={2}>
          Detector unavailable — nothing is being judged. {detectorError}
        </Text>
      </View>
    );
  }

  return null;
});

const bannerStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.sm,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      borderRadius: theme.radius.md,
      borderCurve: "continuous",
      borderWidth: 1,
      backgroundColor: theme.color.surface,
    },
    working: { borderColor: theme.color.review },
    failed: { borderColor: theme.color.occupied },
    icon: { color: theme.color.occupied, fontSize: theme.fontSize.title, fontWeight: "800" },
    text: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.caption, lineHeight: 18 },
  });
