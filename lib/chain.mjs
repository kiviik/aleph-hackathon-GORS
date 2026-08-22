// The chain, read: inspo → imagen → 3D → ficha.
//
// ⚠ THE SHAPE IS A Y, NOT A LINE, AND THIS MODULE ENCODES THAT. The 3D render
// is built FROM the generated image, so it adds no information the image
// lacked — no panels, no seams, no grading. It is a LEAF: shown for approval
// and showroom, never allowed between the image and the factory. The spec
// path runs image → dibujo → ficha, and the engine refuses a render as a
// drawing (422) rather than trusting a screen to remember.

import { engineFetch } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function get(path) {
  try {
    const res = await engineFetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const listAssets = (b) => get(`/brands/${b}/assets`);
export const listPacks = (b) => get(`/brands/${b}/tech-packs`);
export const listDrawings = (b, s) => get(`/brands/${b}/styles/${s}/drawings`);
export const derivations = (b) => get(`/brands/${b}/derivations`);
export const measurements = (b, d, size) =>
  get(`/brands/${b}/drawings/${d}/measurements${size ? `?size=${encodeURIComponent(size)}` : ""}`);
export const bundle = (b, p) => get(`/brands/${b}/tech-packs/${p}/bundle`);

export function assetUrl(brandId, assetId) {
  return `${API_BASE}/brands/${brandId}/assets/${assetId}/content`;
}

/** Every stage answers one of these, and they must not render alike.
 *  `blocked` is the one that matters: it means the product WILL NOT do this,
 *  which is different from not having done it yet. */
export const STAGE = {
  done: { label: "LISTO", tone: "#2f6f4f" },
  empty: { label: "TODAVÍA NO", tone: "#8a6d3b" },
  blocked: { label: "SIN PROVEEDOR", tone: "#6b6560" },
  leaf: { label: "NO ES ESPECIFICACIÓN", tone: "#8a3b3b" },
};
