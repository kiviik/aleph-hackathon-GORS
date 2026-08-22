// The Inspiration Room's data + logic (pure, browser-storage aware).
//
// 2026-07-23 — the vision doc named the Inspiration Room "what the current
// product most clearly lacks": a studio wall where a designer brings their OWN
// world in (uploads, URLs, notes, swatches) on an infinite canvas, organizes it
// freely, and turns a cluster into a creative direction that flows into Concept
// Studio. That last hop is the owner's "huge idea" — a reference becomes a
// direction becomes a product — so it lives here, wired to the same
// `atelier-design-brief` handoff the rest of the app already uses.
//
// Persistence is localStorage for now, and — exactly like studioStore — the
// scope is NEVER hidden from the user: boards live "solo en este navegador"
// until server-side boards exist (queued follow-up, same shelf as studio
// collections). Nothing here is faked: clustering is a deterministic rule over
// the designer's own tags/colours, labelled as such, not dressed up as AI.

import { readScoped, removeScoped, scopedKey } from "./brandStore";

export const BOARDS_KEY = "atelier-inspiration-boards-v1";
export const INBOX_KEY = "atelier-inspiration-inbox"; // other views push refs here
export const BRIEF_KEY = "atelier-design-brief";       // consumed by Concept Studio

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const nowIso = () => new Date().toISOString();

// ---- storage ---------------------------------------------------------------

// ⚠ THE BOARDS THEMSELVES WERE GLOBAL, and scoping only the inbox left the
// bigger half open (owner review, third pass 2026-08-11). A moodboard is a
// brand's creative work — references, notes, swatches, the stated direction of
// a season — and one global key meant switching brands reloaded the SAME board
// under the new brand's name. The inbox leaked a few dropped references; this
// leaked the whole board.
export function loadBoards(brandId) {
  const raw = readScoped(BOARDS_KEY, brandId, null);
  if (Array.isArray(raw) && raw.length) return raw;
  return [freshBoard("Tablero 1")];
}

export function saveBoards(boards, brandId) {
  try {
    localStorage.setItem(scopedKey(BOARDS_KEY, brandId), JSON.stringify(boards));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e?.name === "QuotaExceededError"
        ? "El navegador se quedó sin espacio. Eliminá algunas imágenes del tablero."
        : "No se pudo guardar en este navegador.",
    };
  }
}

export function freshBoard(name = "Tablero") {
  return { id: uid(), name, createdAt: nowIso(), cards: [] };
}

// Anything another view drops in the inbox (a competitor drop, a library item,
// a signal) is drained into the active board on mount. Kept generic so wiring a
// "Guardar en inspiración" button from any card elsewhere is a one-liner.
// ⚠ SCOPED PER BRAND (owner review 2026-08-11). This key sat in
// `brandStore.GLOBAL_KEYS` as "a transient hand-off seam" — a claim about its
// LIFETIME that says nothing about its TENANT. A competitor reference dropped
// under Brand A would drain into Brand B's board on the next mount. Unlike the
// design brief this one is safe to scope silently: an inbox is a queue, and an
// empty queue under another brand needs no explanation.
export function drainInbox(brandId) {
  const items = readScoped(INBOX_KEY, brandId, []);
  if (Array.isArray(items) && items.length) removeScoped(INBOX_KEY, brandId);
  return Array.isArray(items) ? items : [];
}

// ---- cards -----------------------------------------------------------------

export const DEFAULT_SIZE = { image: [220, 260], reference: [220, 280], note: [200, 140], swatch: [120, 120] };

export function makeCard(kind, patch = {}, at = { x: 0, y: 0 }) {
  const [w, h] = DEFAULT_SIZE[kind] || [200, 200];
  return {
    id: uid(),
    kind,               // "image" | "reference" | "note" | "swatch"
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w, h,
    tags: [],
    createdAt: nowIso(),
    ...patch,
  };
}

export function parseTags(input) {
  return String(input || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i);
}

// ---- deterministic clustering ("stories") ----------------------------------
//
// Groups the board's cards into named creative stories. The rule is honest and
// legible: cards that share a tag go together; whatever is left clusters by its
// dominant swatch/annotation colour; the rest lands in "Sin agrupar". This is
// NOT AI — the UI says so — but it is real structure over the designer's own
// signal, and it is what a first "separate this into three stories" needs.

const HUE_NAMES = [
  [15, "Rojos"], [45, "Ámbar"], [70, "Ocres"], [150, "Verdes"],
  [200, "Cianes"], [255, "Azules"], [320, "Magentas"], [360, "Rojos"],
];

function hexToHue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.06) return max > 0.7 ? "neutros-claros" : max < 0.25 ? "neutros-oscuros" : "neutros";
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  for (const [ceil, name] of HUE_NAMES) if (h <= ceil) return name;
  return "otros";
}

function cardColor(card) {
  if (card.kind === "swatch") return card.color;
  return card.color || card.palette?.[0] || null;
}

export function clusterIntoStories(cards) {
  const remaining = new Set(cards.map((c) => c.id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const stories = [];

  // 1) by shared tag — most specific signal the designer gave us.
  const tagCounts = {};
  for (const c of cards) for (const t of c.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const tags = Object.entries(tagCounts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  for (const tag of tags) {
    const members = cards.filter((c) => remaining.has(c.id) && (c.tags || []).includes(tag));
    if (members.length >= 2) {
      members.forEach((c) => remaining.delete(c.id));
      stories.push({ id: `tag-${tag}`, label: cap(tag), by: "etiqueta", cards: members });
    }
  }

  // 2) leftover coloured cards cluster by dominant hue family.
  const byColor = {};
  for (const id of remaining) {
    const col = cardColor(byId.get(id));
    const name = col && hexToHue(col);
    if (name) (byColor[name] ||= []).push(byId.get(id));
  }
  for (const [name, members] of Object.entries(byColor)) {
    if (members.length >= 2) {
      members.forEach((c) => remaining.delete(c.id));
      stories.push({ id: `col-${name}`, label: name, by: "color", cards: members });
    }
  }

  // 3) the rest.
  const rest = [...remaining].map((id) => byId.get(id));
  if (rest.length) stories.push({ id: "rest", label: "Sin agrupar", by: "resto", cards: rest });

  return stories.sort((a, b) => b.cards.length - a.cards.length);
}

// ---- board / story → Concept Studio brief ----------------------------------
//
// Writes the exact shape DesignStudio already consumes on mount
// ({trend, summary, colors[], fabric, typology, sources[], urls[], image}),
// so a story becomes the first item of a collection with zero new plumbing.

export function briefFromCards(cards, { title, boardName } = {}) {
  const colors = [...new Set(
    cards.map(cardColor).filter(Boolean).map((c) => c.toLowerCase())
  )].slice(0, 6);

  const tags = [...new Set(cards.flatMap((c) => c.tags || []))];
  const refs = cards.filter((c) => c.kind === "reference");
  const imageCard = cards.find((c) => (c.kind === "image" || c.kind === "reference") && c.src);
  const notes = cards.filter((c) => c.kind === "note" && c.text).map((c) => c.text);

  const sources = [...new Set(refs.map((r) => r.source || r.title).filter(Boolean))].slice(0, 8);
  const urls = [...new Set(
    cards.map((c) => c.url || (c.kind === "reference" ? c.src : null)).filter(Boolean)
  )].slice(0, 8);

  const label = title || boardName || "Dirección";
  const bits = [];
  bits.push(`${cards.length} referencia${cards.length === 1 ? "" : "s"}`);
  if (tags.length) bits.push(`etiquetas: ${tags.slice(0, 6).join(", ")}`);
  if (notes.length) bits.push(notes[0].slice(0, 120));

  return {
    trend: `Dirección: ${label}`.slice(0, 60),
    summary: bits.join(" · "),
    rationale: boardName ? `Nace del tablero de inspiración "${boardName}".` : "",
    colors,
    fabric: "",     // the designer fills materials in the Studio
    typology: "",
    sources,
    urls,
    image: imageCard?.src || null,
    qty: cards.length,
    at: nowIso(),
    origin: "inspiration",
  };
}

function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
