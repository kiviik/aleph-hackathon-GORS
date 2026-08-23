// Theme access for the design system.
//
// There is one palette, so `useTheme` is a constant lookup and `useThemedStyles` builds each
// stylesheet exactly once, at first use. Screens still get the *same* stylesheet object on every
// render — that reference stability is what lets memoised list rows skip re-rendering.
import { theme, type Theme } from "./theme";

export function useTheme(): Theme {
  return theme;
}

type StyleFactory<T> = (theme: Theme) => T;

const styleCache = new WeakMap<StyleFactory<any>, unknown>();

export function useThemedStyles<T extends Record<string, unknown>>(factory: StyleFactory<T>): T {
  let styles = styleCache.get(factory) as T | undefined;
  if (!styles) {
    styles = factory(theme);
    styleCache.set(factory, styles);
  }
  return styles;
}
