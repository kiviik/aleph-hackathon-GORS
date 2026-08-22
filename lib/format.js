import { FAB_TEX } from "./data";

// Lighten/darken a hex colour by `amt` (ported from prototype `shade`).
export function shade(hex, amt) {
  // Tolerates a missing colour rather than throwing inside a render. A null
  // colourway is a normal state for a planned row that has no design yet, and
  // it took the Range screen down.
  if (typeof hex !== "string" || !hex.startsWith("#")) return "#4A4944";
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return "#4A4944";
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 255) + amt;
  let b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export function texClass(f) {
  return FAB_TEX[f] || "tex-jersey";
}
