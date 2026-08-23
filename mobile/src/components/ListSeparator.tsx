
import { StyleSheet, View } from "../design-system";

/** Spacing between list rows. A separator rather than a margin on the row itself. */
export function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  separator: { height: 8, width: 8 },
});
