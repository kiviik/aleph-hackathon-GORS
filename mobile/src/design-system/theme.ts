// Design tokens. One palette: the app is dark-only, so there is no theme to switch and no
// `dark && styles.xDark` arrays anywhere.
//
// Font sizes are deliberately limited to four steps: hierarchy comes from weight and colour, not
// from a dozen ad-hoc sizes. Radii always ship with `borderCurve: "continuous"` at the call site,
// and elevation is expressed as a CSS `boxShadow` string rather than the legacy shadow* props.

export type Theme = {
  color: {
    background: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    accentStrong: string;
    onAccent: string;
    danger: string;
    free: string;
    occupied: string;
    review: string;
    unscanned: string;
    scrim: string;
  };
  fontSize: {
    display: number;
    title: number;
    body: number;
    caption: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  space: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  shadow: {
    card: string;
    raised: string;
  };
};

export const theme: Theme = {
  color: {
    background: "#101713",
    surface: "#1a251f",
    surfaceMuted: "#2c4032",
    border: "#34473b",
    text: "#f4f7f1",
    textMuted: "#a7b4aa",
    accent: "#4fae7e",
    accentStrong: "#173326",
    onAccent: "#ffffff",
    danger: "#d98c76",
    scrim: "rgba(16,23,19,0.94)",
    // Status colours encode meaning, not chrome. `unscanned` is deliberately grey and not amber —
    // a segment nobody has looked at is not the same claim as one the detector looked at and
    // found genuinely ambiguous.
    free: "#247b52",
    occupied: "#b6543b",
    review: "#ae7c27",
    unscanned: "#718075",
  },
  fontSize: { display: 34, title: 22, body: 15, caption: 13 },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 18, xl: 24 },
  shadow: {
    card: "0 4px 12px rgba(0, 0, 0, 0.35)",
    raised: "0 7px 16px rgba(0, 0, 0, 0.45)",
  },
};
