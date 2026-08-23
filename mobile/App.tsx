// Root of the app: providers only. Every screen lives under src/screens and is mounted by the
// native tab navigator in src/navigation/RootTabs.
import { useEffect, useMemo } from "react";
import {
  DarkTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from "@react-navigation/native";

import {
  SafeAreaProvider,
  StatusBar,
  StatusBarScrim,
  StyleSheet,
  View,
  useTheme,
} from "./src/design-system";
import { RootTabs } from "./src/navigation/RootTabs";
import { useAppStore } from "./src/state/store";
import { useAutoScan } from "./src/state/useAutoScan";

export default function App() {
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Lives at the root, not on the Map screen: the rescan cadence is a property of the app being
  // in the foreground, not of which tab happens to be mounted.
  useAutoScan();

  return (
    <SafeAreaProvider>
      <ThemedNavigation />
    </SafeAreaProvider>
  );
}

function ThemedNavigation() {
  const theme = useTheme();

  // The app is dark-only, so the navigator theme is fixed rather than derived from the OS scheme.
  const navigationTheme = useMemo<NavigationTheme>(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: theme.color.accent,
        background: theme.color.background,
        card: theme.color.surface,
        text: theme.color.text,
        border: theme.color.border,
      },
    }),
    [theme]
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <NavigationContainer theme={navigationTheme}>
        <RootTabs />
      </NavigationContainer>
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
