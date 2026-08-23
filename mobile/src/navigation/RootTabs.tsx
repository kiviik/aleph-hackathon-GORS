// Native bottom tabs: UITabBarController on iOS, BottomNavigationView on Android.
//
// This replaces a hand-rolled `useState<Tab>` plus a row of Pressables. The platform now owns
// tab switching, scroll-to-top on re-tap, safe areas around the bar and accessibility.
import { useMemo } from "react";
import { Platform } from "react-native";
import { createNativeBottomTabNavigator } from "@bottom-tabs/react-navigation";

import { useTheme } from "../design-system";
import { EvidenceScreen } from "../screens/EvidenceScreen";
import { MapScreen } from "../screens/MapScreen";
import { SavedScreen } from "../screens/SavedScreen";

export type RootTabParamList = {
  Map: undefined;
  Evidence: undefined;
  Saved: undefined;
};

const Tabs = createNativeBottomTabNavigator<RootTabParamList>();

// Icons are resolved once at module scope: SF Symbols where the platform has them, bundled
// PNGs (1x/2x/3x) elsewhere. `tabBarIcon` is a function, so it must be a stable reference.
const mapIcon = () =>
  Platform.select({
    ios: { sfSymbol: "mappin.and.ellipse" } as const,
    default: require("../../assets/tabs/map.png"),
  });
const evidenceIcon = () =>
  Platform.select({
    ios: { sfSymbol: "eye" } as const,
    default: require("../../assets/tabs/evidence.png"),
  });
const savedIcon = () =>
  Platform.select({
    ios: { sfSymbol: "star" } as const,
    default: require("../../assets/tabs/saved.png"),
  });

const mapOptions = { title: "Map", tabBarIcon: mapIcon };
const evidenceOptions = { title: "Evidence", tabBarIcon: evidenceIcon };
const savedOptions = { title: "Saved", tabBarIcon: savedIcon };

export function RootTabs() {
  const theme = useTheme();
  const tabBarStyle = useMemo(
    () => ({ backgroundColor: theme.color.surface }),
    [theme.color.surface]
  );

  return (
    <Tabs.Navigator
      tabBarActiveTintColor={theme.color.accent}
      tabBarInactiveTintColor={theme.color.textMuted}
      tabBarStyle={tabBarStyle}
      activeIndicatorColor={theme.color.surfaceMuted}
      rippleColor={theme.color.surfaceMuted}
      hapticFeedbackEnabled
    >
      <Tabs.Screen name="Map" component={MapScreen} options={mapOptions} />
      <Tabs.Screen name="Evidence" component={EvidenceScreen} options={evidenceOptions} />
      <Tabs.Screen name="Saved" component={SavedScreen} options={savedOptions} />
    </Tabs.Navigator>
  );
}
