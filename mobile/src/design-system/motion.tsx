// Movement primitives.
//
// Reanimated is deliberately not a dependency of this build: the only native module this app ships
// is the QVAC ONNX addon, and every extra native library is another thing that has to survive
// `expo prebuild` on a device we cannot emulate. Movement therefore goes through React Native's own
// `Animated`, always with `useNativeDriver: true`, and always on `transform` / `opacity` — never on
// height, top or margin, which would relayout the map and the sheet on every frame.
export { Animated, Easing, PanResponder, useWindowDimensions } from "react-native";
export type {
  GestureResponderHandlers,
  LayoutChangeEvent,
  PanResponderGestureState,
} from "react-native";
