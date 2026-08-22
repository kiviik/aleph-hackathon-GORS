// El Lienzo — the board's model, its geometry, and the mask it draws.
//
// WHY THIS MODULE IS PURE. The canvas is the first surface in the product
// where the designer's HAND produces the payload: a rectangle she dragged over
// a jacket becomes a PNG whose transparent pixels tell the provider which part
// of the image it may rewrite. Every step of that translation — screen point →
// board point → fraction of a card → pixel of the source image → byte of an
// alpha channel — is arithmetic that is either right or silently wrong. A
// mask that is off by a scale factor does not throw; it edits the sleeve next
// to the one she selected. So the arithmetic lives here, with no React and no
// DOM, and `tests/canvas*.test.mjs` checks it end to end.
//
// ⚠ THE MASK IS ENCODED, NOT PAINTED. The obvious implementation is an
// offscreen <canvas>: fill white, `clearRect` the selection, `toDataURL`. It
// works in a browser and is untestable in this suite (jsdom ships no 2D
// context), which is the same as saying the one calculation that must be
// exact is the one nothing checks. `maskPng()` below writes the PNG bytes
// directly — IHDR, one IDAT deflated through the platform's own
// CompressionStream, IEND — so a test can decode the result and assert the
// dimensions and the alpha of a pixel inside and outside the hole. It is also
// strictly more correct: no device-pixel-ratio, no canvas backing-store
// rounding, no colour-space surprise between the base image and its mask.
//
// THE VOCABULARIES ARE THE ENGINE'S. `REFERENCE_ROLES` and `LOCKS` are copied
// from api/app/generation_intent.py and `tests/canvasVocabulary.test.mjs`
// reads that file and fails if they drift. Inventing a role here would not
// produce a nicer canvas — `_validate_vocab` raises IntentRefused and the
// designer gets a 422 for a word this file made up.
import { buildIntent, refusalMessage } from "@/lib/generationIntent.mjs";
import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

// --------------------------------------------------------------------------
// vocabularies — mirrored from api/app/generation_intent.py, checked by test
// --------------------------------------------------------------------------

/** What a reference image is FOR. The engine refuses any other word. */
export const REFERENCE_ROLES = ["silhouette", "fabric", "palette", "styling",
  "composition", "garment"];

/** What must not change. Same list, same order, as the engine's LOCKS. */
export const LOCKS = ["silhouette", "fabric", "color", "print", "model",
  "pose", "camera", "background"];

/** Spanish for the screen. The KEY is what travels; this is only a label, and
 *  an unknown key falls through untranslated rather than being hidden. */
export const ROLE_LABELS = {
  silhouette: "silueta", fabric: "tela", palette: "paleta",
  styling: "styling", composition: "composición", garment: "prenda",
};
export const LOCK_LABELS = {
  silhouette: "silueta", fabric: "tela", color: "color", print: "estampa",
  model: "modelo", pose: "pose", camera: "cámara", background: "fondo",
};
export const roleLabel = (r) => ROLE_LABELS[r] || r || "";
export const lockLabel = (l) => LOCK_LABELS[l] || l || "";

/** Advisory weight → the engine's own three words for it, so the card shows
 *  what the compiled prompt will actually say rather than a number the
 *  provider never sees. `compile_intent` buckets at .75 and .4. */
export function strengthWord(strength) {
  const s = Number(strength);
  if (!Number.isFinite(s)) return null;
  if (s >= 0.75) return "primary";
  if (s >= 0.4) return "secondary";
  return "subtle";
}

// --------------------------------------------------------------------------
// geometry
// --------------------------------------------------------------------------

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

export const clampZoom = (k) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(k) ? k : 1));

/** The view is one affine transform: screen = board * k + (x, y). Two
 *  functions, one inverse of the other, and nothing else in the app is
 *  allowed to do this conversion by hand — a second copy is how a click
 *  lands one place and a drag another. */
export const boardToScreen = (pt, view) => ({
  x: pt.x * view.k + view.x,
  y: pt.y * view.k + view.y,
});

export const screenToBoard = (pt, view) => ({
  x: (pt.x - view.x) / view.k,
  y: (pt.y - view.y) / view.k,
});

/** Zoom about a fixed screen point — the board coordinate under the cursor
 *  stays under the cursor. Clamping happens BEFORE the offset is solved, so
 *  a wheel gesture at the zoom limit does not drift the board sideways. */
export function zoomAt(view, screenPt, factor) {
  const k = clampZoom(view.k * factor);
  const anchor = screenToBoard(screenPt, view);
  return { k, x: screenPt.x - anchor.x * k, y: screenPt.y - anchor.y * k };
}

/** Two corners → a rect with non-negative extent. */
export function normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  };
}

/**
 * A rectangle the designer dragged, in BOARD units, over one card → the same
 * rectangle in the SOURCE IMAGE's own pixels.
 *
 * ⚠ THIS IS THE CALCULATION THE WHOLE FEATURE RESTS ON. The card is a scaled,
 * panned view of an image whose real size is `natural`; the mask must be in
 * the image's pixels or the provider edits the wrong part of the garment and
 * nothing in the result says so. Returns null when the drag does not overlap
 * the card at all — an empty mask would be a fully-opaque PNG, which is a
 * request to change nothing, returned as if it had changed something.
 */
export function regionToImagePixels(card, rect, natural) {
  if (!card || !rect || !natural) return null;
  const nw = Math.round(natural.width || 0);
  const nh = Math.round(natural.height || 0);
  if (!(nw > 0 && nh > 0) || !(card.w > 0 && card.h > 0)) return null;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const u0 = clamp01((rect.x - card.x) / card.w);
  const v0 = clamp01((rect.y - card.y) / card.h);
  const u1 = clamp01((rect.x + rect.w - card.x) / card.w);
  const v1 = clamp01((rect.y + rect.h - card.y) / card.h);
  if (u1 <= u0 || v1 <= v0) return null;

  const x = Math.floor(u0 * nw);
  const y = Math.floor(v0 * nh);
  // At least one pixel: a hairline drag is still a selection, and rounding it
  // away would hand the engine a mask with no hole in it.
  const width = Math.max(1, Math.min(nw - x, Math.round((u1 - u0) * nw)));
  const height = Math.max(1, Math.min(nh - y, Math.round((v1 - v0) * nh)));
  return { x, y, width, height };
}

/** The fraction of the base image the selection covers, 0..1. Shown on screen
 *  because "you are about to rewrite 94 % of this image" is the difference
 *  between a regional edit and a whole-image one wearing a mask. */
export const regionCoverage = (pixels, natural) =>
  (!pixels || !natural?.width || !natural?.height) ? null
    : (pixels.width * pixels.height) / (natural.width * natural.height);

// --------------------------------------------------------------------------
// the board
// --------------------------------------------------------------------------

export const BOARD_KEY = "atelier-canvas-board";

/** ⚠ SCHEMA VERSION, NOT A DECORATION. A board is persisted in the browser and
 *  read back weeks later; a v1 board must never be reinterpreted under v2's
 *  rules. `loadBoard` refuses an unknown version instead of guessing. */
export const BOARD_VERSION = 1;

export const freshBoard = () => ({
  version: BOARD_VERSION,
  cards: [],
  strokes: [],
  locks: [],
  exclusions: [],
  view: { x: 0, y: 0, k: 1 },
  updatedAt: null,
});

let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * An image card. THREE ORIGINS, KEPT APART, because they are not
 * interchangeable to the engine:
 *   assetId  — a row in this brand's ledger. It can travel as a reference and
 *              it can be the base of a regional edit.
 *   url      — an http(s) address the engine can fetch.
 *   local    — bytes that only exist in this browser tab. It can be looked at
 *              and drawn on; it CANNOT travel, and the card says so rather
 *              than failing silently at generation time.
 */
export function makeImageCard({
  assetId = null, url = null, src = null, local = false, name = "",
  x = 0, y = 0, w = 320, h = 320, natural = null, parentId = null,
  origin = null, promptSent = null, role = null, strength = 0.8,
} = {}) {
  return {
    id: uid("card"), kind: "image", assetId, url, src, local, name,
    x, y, w, h, natural, parentId, origin, promptSent,
    // ⚠ null = NOT ASKED. Never defaulted to "garment": a role the designer
    // did not choose still reaches the compiled prompt, and the receipt would
    // then report her as having asked for it.
    role: REFERENCE_ROLES.includes(role) ? role : null,
    strength,
    z: 0,
    createdAt: new Date().toISOString(),
  };
}

/** A note anchored to a point on the board. Not a comment on a card: the
 *  board is the document, and a note about the space between two references
 *  is a real thing a designer writes. */
export function makeNoteCard({ text = "", x = 0, y = 0 } = {}) {
  return {
    id: uid("note"), kind: "note", text, x, y, w: 220, h: 110, z: 0,
    createdAt: new Date().toISOString(),
  };
}

/** One pen gesture: board-space points, so it pans and zooms with the work
 *  underneath it instead of floating over the viewport. */
export function makeStroke(points, { color = "ink", width = 2 } = {}) {
  return { id: uid("ink"), points: points || [], color, width };
}

/** Top of the stack, with the z-values renumbered so they cannot creep to
 *  Infinity over a long session. */
export function bringToFront(cards, id) {
  const ordered = [...cards].sort((a, b) => (a.z || 0) - (b.z || 0));
  const idx = ordered.findIndex((c) => c.id === id);
  if (idx === -1) return cards;
  const [card] = ordered.splice(idx, 1);
  ordered.push(card);
  const z = new Map(ordered.map((c, i) => [c.id, i]));
  return cards.map((c) => ({ ...c, z: z.get(c.id) ?? c.z }));
}

/** Parent → children, for the lineage links. A child whose parent is no
 *  longer on the board yields no edge — the link would point at nothing, and
 *  drawing it to the origin is how a board grows a line to the corner. */
export function lineageEdges(cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return cards
    .filter((c) => c.parentId && byId.has(c.parentId))
    .map((c) => ({ from: byId.get(c.parentId), to: c }));
}

/** Where a result goes: to the right of its parent, below any sibling already
 *  there. Deterministic, so two results from one card do not stack. */
export function childPlacement(parent, siblingCount = 0) {
  return {
    x: parent.x + parent.w + 48,
    y: parent.y + siblingCount * (parent.h + 24),
    w: parent.w, h: parent.h,
  };
}

// --------------------------------------------------------------------------
// persistence
// --------------------------------------------------------------------------

/**
 * What of a board survives a reload. LOCAL PIXELS DO NOT, and that is a
 * decision rather than an omission: a dropped photograph is megabytes of
 * base64, localStorage holds about five, and a board that silently ate the
 * quota would take the rest of the brand's browser state down with it. The
 * card is kept — position, role, name — and marked `missing`, so the board
 * still reads as the designer left it and says which image has to come back.
 */
export function serializeBoard(board) {
  return {
    version: BOARD_VERSION,
    cards: (board.cards || []).map((c) => {
      const { src, ...rest } = c;
      return c.local ? { ...rest, src: null, missing: true } : { ...rest, src: null };
    }),
    strokes: board.strokes || [],
    locks: board.locks || [],
    exclusions: board.exclusions || [],
    view: board.view || { x: 0, y: 0, k: 1 },
    updatedAt: new Date().toISOString(),
  };
}

/** A stored board, or a fresh one. An unknown `version` returns null — the
 *  caller then says "this board was written by another version" rather than
 *  half-reading it. */
export function reviveBoard(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.version !== BOARD_VERSION) return null;
  return {
    ...freshBoard(), ...raw,
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    strokes: Array.isArray(raw.strokes) ? raw.strokes : [],
    locks: (Array.isArray(raw.locks) ? raw.locks : []).filter((l) => LOCKS.includes(l)),
    exclusions: Array.isArray(raw.exclusions) ? raw.exclusions : [],
  };
}

// --------------------------------------------------------------------------
// the board on the server (engine migration 0088)
// --------------------------------------------------------------------------
//
// ⚠ THE SERVER IS THE DOCUMENT, localStorage IS THE CACHE. Until 0088 the board
// lived in this browser only, so an arrangement did not follow the designer to
// another machine and clearing site data destroyed a day's work with no trace.
// The engine now stores the document — and stores it OPAQUELY: it does not know
// what a card is, which is why every function above still lives here.
//
// Three outcomes are kept apart on every call, because collapsing them is how a
// canvas lies about whether the work is safe: SAVED, CONFLICT (somebody else
// wrote after we read — saving now would erase their afternoon), and UNREACHABLE
// (we are local and must say so). None of these throw; a thrown network error
// would land in a React effect and read as a crash.

export const boardUrl = (brandId, key = "default") =>
  `${API_BASE}/brands/${brandId}/canvas-boards/${encodeURIComponent(key)}`;

/** The stored board, or the honest reason there is none. */
export async function fetchBoard(brandId, key = "default") {
  if (!brandId) return { ok: false, reason: "no_brand" };
  try {
    const res = await engineFetch(boardUrl(brandId, key));
    if (!res.ok) return { ok: false, reason: "http", status: res.status };
    const body = await res.json();
    return {
      ok: true,
      exists: !!body.exists,
      // Revived HERE, not on the server: an unknown schema version returns
      // null and the caller says "written by another version" instead of
      // half-reading it.
      board: body.exists ? reviveBoard(body.document) : null,
      revision: body.revision ?? 0,
      updatedAt: body.updated_at || null,
      updatedBy: body.updated_by || null,
      unreadable: !!body.exists && reviveBoard(body.document) === null,
    };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * Store the board with the revision we read.
 *
 * `revision: null` means "I did not check" — the engine accepts it (a client
 * that declined to say what it read cannot block one that does) and this is the
 * fallback for a board we just created, never the normal path.
 */
export async function pushBoard(brandId, board, { key = "default",
                                                  revision = null } = {}) {
  if (!brandId) return { ok: false, reason: "no_brand" };
  const document = serializeBoard(board);
  const url = revision === null ? boardUrl(brandId, key)
    : `${boardUrl(brandId, key)}?expected_revision=${revision}`;
  let res;
  try {
    res = await engineFetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema_version: BOARD_VERSION, document }),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: true, revision: body.revision ?? null, document };
  }
  const detail = await res.json().then((b) => b?.detail).catch(() => null);
  if (res.status === 409) {
    return {
      ok: false, reason: "conflict",
      revision: (detail && detail.revision) ?? null,
      message: (detail && detail.message)
        || "otra sesión guardó este tablero después de que lo abriste",
    };
  }
  if (res.status === 413) {
    return { ok: false, reason: "too_large",
             message: (detail && detail.message) || "el tablero es demasiado grande" };
  }
  return {
    ok: false, reason: "refused", status: res.status,
    message: (detail && detail.message)
      || (typeof detail === "string" ? detail : "el motor rechazó el tablero"),
  };
}

/**
 * Which copy governs when both exist, and it never discards silently.
 *
 * The server's copy wins — it is the one another machine can also see. But a
 * local copy with a NEWER `updatedAt` is real work that has not reached the
 * server (the last save failed, or the tab was offline), so the caller is told
 * `localIsNewer` and shows it rather than overwriting either side. Choosing
 * automatically is exactly the decision a program should not make about
 * somebody's afternoon.
 */
export function reconcileBoards(remote, local) {
  if (!remote && !local) return { board: null, source: "none", localIsNewer: false };
  if (!remote) return { board: local, source: "local", localIsNewer: false };
  if (!local) return { board: remote, source: "engine", localIsNewer: false };
  const a = Date.parse(local.updatedAt || "") || 0;
  const b = Date.parse(remote.updatedAt || "") || 0;
  return { board: remote, source: "engine", localIsNewer: a > b };
}

// --------------------------------------------------------------------------
// the board as a typed intent
// --------------------------------------------------------------------------

/** The engine's cap on `references` (GenerationIntent.max_length=14). */
export const MAX_REFERENCES = 14;

/**
 * The board's structure + the designer's sentence → one GenerationIntent.
 *
 * ⚠ `authored` IS HER TEXT AND NOTHING ELSE. Not the board's locks rendered
 * as prose, not "a fashion photograph of", not the collection's name. Those
 * travel as STRUCTURE, which is the entire point of the typed contract: the
 * engine composes, labels each part with the voice it came from, and answers
 * with what it did to each control. Concatenating here would sign the
 * designer's name to the app's words.
 *
 * Returns `{ intent, references, skipped }` — `skipped` being the cards that
 * could not travel (local pixels with no ledger row), so the caller can NAME
 * them instead of quietly sending fewer references than the board shows.
 */
export function boardIntent(board, { authored, context = null, cardIds = null } = {}) {
  const cards = (board?.cards || [])
    .filter((c) => c.kind === "image")
    .filter((c) => (cardIds ? cardIds.includes(c.id) : true))
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  const usable = [];
  const skipped = [];
  for (const c of cards) {
    if (c.assetId || c.url) usable.push(c);
    else skipped.push(c);
  }
  const overflow = usable.slice(MAX_REFERENCES);
  const references = usable.slice(0, MAX_REFERENCES);

  const intent = buildIntent({
    authored,
    context,
    references: references.map((c) => ({
      assetId: c.assetId || undefined,
      url: c.assetId ? undefined : c.url,
      // ⚠ NO DEFAULT ROLE. An untagged reference is sent with no role and the
      // engine's own default applies; writing "garment" here would put a word
      // in the compiled prompt that the designer never chose, on a control
      // the receipt would then report as hers.
      ...(c.role ? { role: c.role } : {}),
      strength: Number.isFinite(c.strength) ? c.strength : undefined,
    })),
    locks: (board?.locks || []).filter((l) => LOCKS.includes(l)),
    exclusions: (board?.exclusions || []).map((e) => String(e).trim()).filter(Boolean),
  });

  return { intent, references, skipped, overflow };
}

// --------------------------------------------------------------------------
// the mask
// --------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes) {
  // PNG's IDAT is zlib-wrapped deflate (RFC 1950), which is exactly what
  // CompressionStream("deflate") produces — "deflate-raw" is the one that
  // would not work here. Present in every browser this app supports and in
  // Node 18+, so the same code path runs in the test.
  const cs = new CompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The regional-edit mask: a PNG the SAME PIXEL SIZE as the base image, fully
 * opaque everywhere except the selected rectangle, which is alpha 0.
 *
 * ⚠ ALPHA 0 MEANS "EDIT HERE". That is the OpenAI edits convention and it is
 * the inverse of what most people assume from paint software, where the
 * selection is the opaque part. Getting it backwards produces a request that
 * preserves the region she selected and rewrites everything else — a
 * plausible image, wrong in the one way she was being careful about. The test
 * decodes the bytes and asserts both sides of it.
 *
 * Returns a `data:image/png;base64,…` string, the transport the engine's
 * body already uses for `mask_data_uri`.
 */
export async function maskPng({ width, height, region }) {
  const w = Math.round(width);
  const h = Math.round(height);
  if (!(w > 0 && h > 0)) throw new Error("mask needs the base image's size");
  if (!region || !(region.width > 0 && region.height > 0)) {
    throw new Error("mask needs a region; an all-opaque mask edits nothing");
  }
  const x0 = Math.max(0, Math.min(w, Math.round(region.x)));
  const y0 = Math.max(0, Math.min(h, Math.round(region.y)));
  const x1 = Math.max(x0, Math.min(w, x0 + Math.round(region.width)));
  const y1 = Math.max(y0, Math.min(h, y0 + Math.round(region.height)));

  // One filter byte (0 = None) + RGBA per pixel, per scanline.
  const stride = 1 + w * 4;
  const raw = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    raw[row] = 0;
    const inRows = y >= y0 && y < y1;
    for (let x = 0; x < w; x++) {
      const p = row + 1 + x * 4;
      const hole = inRows && x >= x0 && x < x1;
      // Opaque white for "keep"; fully transparent black for "edit here".
      raw[p] = hole ? 0 : 255;
      raw[p + 1] = hole ? 0 : 255;
      raw[p + 2] = hole ? 0 : 255;
      raw[p + 3] = hole ? 0 : 255;
    }
  }

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w);
  iv.setUint32(4, h);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA — an alpha channel is the whole point
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = await deflate(raw);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return `data:image/png;base64,${base64(png)}`;
}

/** Base64 without assuming a browser's `btoa` or Node's `Buffer`. */
export function base64(bytes) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += A[a >> 2];
    out += A[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : A[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : A[c & 63];
  }
  return out;
}

// --------------------------------------------------------------------------
// the engine
// --------------------------------------------------------------------------

/**
 * Refusals and errors, read the way the engine writes them.
 *
 * ⚠ THE CANVAS NEEDS A WIDER READER THAN `refusalMessage`. That one knows the
 * two typed refusal codes and correctly returns null for anything else. But
 * the regional-edit route is being built as this is written, and the engine's
 * answer to a request it does not yet understand is a 422 whose `detail` is a
 * plain sentence ("unknown operation: 'edit'") or FastAPI's validation array.
 * Those are the engine's words too, and the rule for the screen is the same:
 * show them, never translate them into "algo salió mal", and never retry the
 * request as a whole-image generation.
 */
export function engineRefusal(body) {
  const typed = refusalMessage(body);
  if (typed) return typed;
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const lines = detail
      .map((d) => {
        const where = Array.isArray(d?.loc) ? d.loc.join(".") : null;
        return d?.msg ? (where ? `${where}: ${d.msg}` : d.msg) : null;
      })
      .filter(Boolean);
    if (lines.length) return lines.join(" · ");
  }
  if (typeof body?.detail?.reason === "string") return body.detail.reason;
  return null;
}

async function post(url, body, { idempotencyKey } = {}) {
  const res = await engineFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

const objectUrls = new Map();

/**
 * An asset's bytes, as something an `<img src>` can show.
 *
 * ⚠ AN <img> CANNOT CARRY A BEARER TOKEN. `/brands/{id}/assets/{id}/content`
 * is tenant-checked — deliberately, it is the whole reason the route exists
 * instead of `/static` — so pointing an image element straight at it returns
 * 401 the moment production auth is on, and the canvas fills with broken
 * cards for reasons nothing on screen explains. The bytes are fetched through
 * the authorised path and handed to the DOM as an object URL instead.
 *
 * Cached by path: a board showing one asset twice, and the library strip
 * beside it, must not fetch the same megabyte three times.
 */
export async function assetObjectUrl(path) {
  if (!path) throw new Error("no asset path");
  if (objectUrls.has(path)) return objectUrls.get(path);
  const href = /^https?:/i.test(path) ? path : `${API_BASE}${path}`;
  const res = await engineFetch(href);
  if (!res.ok) {
    const err = new Error(`engine ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const url = URL.createObjectURL(await res.blob());
  objectUrls.set(path, url);
  return url;
}

/**
 * Bytes the designer dropped, offered to this brand's ledger.
 *
 * WHY A DROP UPLOADS AT ALL. A reference the engine cannot fetch is not a
 * reference: `generation_intent.references` takes an `asset_id` or a `url`,
 * and a `blob:` address is neither. So a dropped photograph either becomes a
 * row in the brand's own library or it stays a picture on a wall that
 * generation cannot see — and the card says which of the two it is.
 */
export const ingestAsset = (brandId, body) =>
  post(`${API_BASE}/brands/${brandId}/assets/ingest`, body);

/**
 * A regional edit: this asset, this mask, this intent.
 *
 * ⚠ THE CONTRACT IS THE ENGINE'S AND MAY NOT HAVE LANDED. `operation: "edit"`
 * is not in the router's `OPERATIONS` tuple as this ships, so today the call
 * returns 422 `unknown operation: 'edit'`. The screen renders that sentence
 * verbatim and STOPS. It must never fall back to `generateAssets`, because
 * the same prompt without the mask is a request to redraw the whole image —
 * the designer would get a plausible picture in which everything she was
 * protecting had silently moved.
 */
export const editAsset = (brandId, { assetId, maskDataUri, intent, ...rest },
                          opts = {}) =>
  post(`${API_BASE}/brands/${brandId}/assets/generate`, {
    edit_asset_id: assetId,
    mask_data_uri: maskDataUri,
    generation_intent: intent,
    operation: "edit",
    n: 1,
    ...rest,
  }, opts);

/** A whole-board generation. Same door as the studio's, same envelope back:
 *  `{assets, control_mapping, model, …}`. */
export const generateFromBoard = (brandId, { intent, parentAssetId = null,
                                             collectionId = null, ...rest },
                                  opts = {}) =>
  post(`${API_BASE}/brands/${brandId}/assets/generate`, {
    generation_intent: intent,
    n: 1,
    operation: "generate",
    ...(parentAssetId ? { parent_asset_id: parentAssetId } : {}),
    ...(collectionId ? { collection_id: collectionId } : {}),
    ...rest,
  }, opts);

// --------------------------------------------------------------------------
// export
// --------------------------------------------------------------------------

/**
 * The board as a file. Positions, roles, locks, notes, lineage — everything
 * the screen knows, in the engine's own vocabulary so the JSON is readable
 * beside an intent rather than needing a translation table.
 *
 * `src` is deliberately absent: a JSON carrying base64 of forty photographs
 * is not a document anybody opens twice. Each image card names its ledger id
 * and its content path, which is where the pixels actually live.
 */
export function exportBoardJson(board, { brandId = null, brandName = null } = {}) {
  return {
    kind: "atelier.canvas.board",
    version: BOARD_VERSION,
    exported_at: new Date().toISOString(),
    brand_id: brandId,
    brand_name: brandName,
    locks: board?.locks || [],
    exclusions: board?.exclusions || [],
    view: board?.view || null,
    cards: (board?.cards || []).map((c) => (c.kind === "note" ? {
      id: c.id, kind: "note", text: c.text, x: c.x, y: c.y,
    } : {
      id: c.id, kind: "image",
      asset_id: c.assetId || null,
      content_path: c.url || null,
      // ⚠ `null` here is "asked and there is none", not "not asked": a local
      // drop has no ledger row, and the file says so rather than omitting the
      // key and letting a reader assume it was never uploaded.
      browser_only: !!c.local && !c.assetId,
      name: c.name || null,
      role: c.role || null,
      strength: Number.isFinite(c.strength) ? c.strength : null,
      parent_id: c.parentId || null,
      origin: c.origin || null,
      x: c.x, y: c.y, w: c.w, h: c.h, z: c.z || 0,
      natural: c.natural || null,
    })),
    strokes: (board?.strokes || []).map((s) => ({
      id: s.id, points: s.points, width: s.width,
    })),
  };
}
