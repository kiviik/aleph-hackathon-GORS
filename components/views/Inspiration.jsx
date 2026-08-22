"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FileIntoDirection from "@/components/FileIntoDirection";
import { useEngine } from "@/components/EngineProvider";
import { stampHandoff } from "@/lib/handoff.mjs";
import { useChrome } from "@/components/ui/Chrome";
import {
  loadBoards, saveBoards, freshBoard, drainInbox, makeCard, parseTags,
  clusterIntoStories, briefFromCards, BRIEF_KEY,
} from "@/lib/inspiration";

// The Inspiration Room — an infinite studio wall. See lib/inspiration.js for
// why this exists and what stays honest (localStorage scope shown, clustering
// labelled deterministic, no faked AI). Styles are scoped in the CSS constant
// below on purpose: globals.css is owned elsewhere this session.
//
// 2026-08-14 — RESTYLE onto the `in2-` namespace. The old rules were
// local already, but the header borrowed `ax-*` from a stylesheet this change
// may not touch, so the screen now carries ONE complete stylesheet of its own
// and depends on no shared class at all.
//
// ⚠ THE STYLESHEET IS A MODULE-LEVEL CONSTANT MOUNTED WITH
// `dangerouslySetInnerHTML`, never `<style>{CSS}</style>`: React escapes `>`
// and `"` when it serialises a text child on the server and the browser does
// not unescape inside <style>, so the client text differs from the server's and
// React throws the whole tree away on every load (tests/styleHydration).
//
// WHAT DID NOT CHANGE: the wall is still an infinite canvas — pan, wheel-zoom,
// drag a card, drop forty images. A `repeat(auto-fill, …)` grid would have to
// delete the pointer handlers that ARE this screen, so the grid lives where the
// product genuinely has a grid of reference cards: the filing panel, where each
// reference states what it is for and where it came from. On the wall itself
// every card now gets the same anatomy — image block on --paper-2, caption
// stack UNDER it: title, then provenance in mono. A reference whose origin was
// never declared says so, in an --ochre-wash pill, instead of looking filed.
const CSS = `
/* ============ Inspiración — in2- ==================================
   Image-forward: the imagery is the content, every chrome element is a
   hairline around it. Blue only on things you press; --editorial carries
   the eyebrow. 11px is the floor, everywhere. */

.in2 { min-width: 0; }

/* ---- header. This screen used to open straight into board tabs. ---- */
.in2-eyebrow {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s3);
}
.in2-eyebrow b { font-weight: 600; }
.in2-eyebrow span { color: var(--ink-3); }
.in2-title {
  font-family: var(--serif); font-weight: 500; font-size: 36px;
  line-height: 1.08; letter-spacing: -.015em; color: var(--ink);
  margin: 0 0 var(--s2);
}
.in2-lede {
  font-size: 14px; line-height: 1.55; color: var(--ink-2);
  margin: 0 0 var(--s4); max-width: 66ch;
}

/* ---- the wall is a REGION with a height, not a page that grows: the
       header above it must never be pushed off by the canvas. ---- */
.in2-wrap {
  position: relative; display: flex; flex-direction: column;
  height: min(calc(100vh - 300px), 760px); min-height: 460px;
  border: 1px solid var(--line); border-radius: var(--r); overflow: hidden;
  background: var(--card); color: var(--ink); box-shadow: var(--shadow);
}
.in2-grow { flex: 1; }

/* ---- boards ---- */
.in2-boards {
  display: flex; gap: var(--s1); align-items: center;
  padding: 10px var(--s4) var(--s2); border-bottom: 1px solid var(--line);
  overflow-x: auto; scrollbar-width: thin;
}
.in2-tab {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
  border-radius: var(--r-sm); padding: 6px 12px; font: inherit; font-size: 13px;
  cursor: pointer; white-space: nowrap; transition: border-color .14s, color .14s;
}
.in2-tab:hover { border-color: var(--hair-2); color: var(--ink); }
.in2-tab.on {
  background: var(--ink); border-color: var(--ink); color: var(--surface);
  font-weight: 600;
}
.in2-tab.ghost { border-style: dashed; color: var(--ink-3); }
.in2-count {
  font-family: var(--d); font-size: 11px; margin-left: 5px; opacity: .7;
  font-variant-numeric: tabular-nums;
}
.in2-scope {
  font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  color: var(--ink-3); white-space: nowrap; padding-left: var(--s2);
}

/* ---- toolbar ---- */
.in2-toolbar {
  display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap;
  padding: 10px var(--s4); border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.in2-add { display: flex; gap: var(--s1); flex-wrap: wrap; }
.in2-search {
  width: 190px; border: 1px solid var(--line); background: var(--paper);
  border-radius: var(--r-sm); padding: 7px 10px; font: inherit; font-size: 12px;
  color: var(--ink);
}
.in2-search::placeholder { color: var(--ink-3); }
.in2-btn {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  border-radius: var(--r-sm); padding: 7px 12px; font: inherit; font-size: 13px;
  cursor: pointer; white-space: nowrap; transition: border-color .14s, background .14s;
}
.in2-btn:hover { border-color: var(--hair-2); }
.in2-btn.primary {
  background: var(--cobalt); border-color: var(--cobalt); color: var(--surface);
  font-weight: 600;
}
.in2-btn.primary:hover { border-color: var(--cobalt); filter: brightness(.94); }
.in2-btn.dark { background: var(--ink); border-color: var(--ink); color: var(--surface); }
.in2-btn.danger { color: var(--danger); border-color: var(--clay-wash); background: var(--clay-wash); }
.in2-btn.sm { padding: 5px 10px; font-size: 12px; }
.in2-btn[disabled] { opacity: .4; cursor: not-allowed; }
.in2-zoom { display: flex; align-items: center; gap: 2px; }
.in2-icon {
  width: 30px; height: 30px; border: 1px solid var(--line);
  background: var(--surface); border-radius: var(--r-xs); cursor: pointer;
  font-size: 15px; color: var(--ink-2);
}
.in2-icon:hover { border-color: var(--hair-2); color: var(--ink); }
.in2-zval {
  font-family: var(--d); font-size: 12px; color: var(--ink-2);
  width: 46px; text-align: center; font-variant-numeric: tabular-nums;
}

/* ---- filing panel: THE grid of reference cards. Each one has to say
       what it is for and where it came from — the engine refuses an
       untagged reference, and so does this screen's layout: the two
       selects sit under the image where a caption would be. ---- */
.in2-filing {
  padding: var(--s4); border-bottom: 1px solid var(--line);
  background: var(--paper); max-height: 46%; overflow-y: auto;
}
.in2-filing .fid-list {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--s3); max-height: none; overflow: visible;
}
.in2-filing .fid-list li {
  flex-direction: column; align-items: stretch; gap: var(--s2);
  padding: var(--s2); background: var(--card); border-radius: var(--r-sm);
}
.in2-filing .fid-list img,
.in2-filing .fid-list .dir-chip {
  width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover;
  border-radius: var(--r-xs); background: var(--paper-2);
}
.in2-filing .fid-list li > div b { font-size: 13px; font-weight: 600; line-height: 1.3; }
.in2-filing .fid-list select { width: 100%; font-size: 12px; }

.in2-warn {
  margin: var(--s2) var(--s4) 0; color: var(--danger); font-size: 13px;
}
.in2-flash {
  position: absolute; left: 50%; transform: translateX(-50%); top: 74px;
  z-index: 40; background: var(--ink); color: var(--surface);
  padding: var(--s2) var(--s4); border-radius: 20px; font-size: 13px;
  box-shadow: var(--shadow);
}

/* ---- the wall ---- */
.in2-stage { flex: 1; display: flex; min-height: 0; }
.in2-canvas {
  position: relative; flex: 1; overflow: hidden; cursor: grab;
  background: var(--paper);
  background-image: radial-gradient(var(--hair-2) 1px, transparent 1px);
  background-size: 26px 26px; touch-action: none;
}
.in2-canvas:active { cursor: grabbing; }
.in2-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }

/* ---- empty wall: a designed drop zone over the hidden file input,
       never a raw file control. ---- */
.in2-hint {
  position: absolute; inset: 0; display: grid; place-items: center;
  padding: var(--s6); pointer-events: none;
}
.in2-drop {
  pointer-events: auto; display: flex; flex-direction: column; gap: var(--s2);
  align-items: center; text-align: center; width: min(460px, 100%);
  padding: var(--s6) var(--s5); cursor: pointer;
  border: 2px dashed var(--hair-2); border-radius: var(--r);
  background: var(--surface); color: var(--ink-3);
  transition: border-color .14s, background .14s;
}
.in2-drop:hover { border-color: var(--cobalt); background: var(--paper); }
.in2-drop-t { font-family: var(--serif); font-weight: 500; font-size: 21px; color: var(--ink); }
.in2-drop-s { font-size: 13px; line-height: 1.55; color: var(--ink-2); }
.in2-drop-a {
  font-family: var(--d); font-size: 11px; letter-spacing: .06em;
  text-transform: uppercase; color: var(--cobalt); font-weight: 600;
}

/* ---- a card on the wall: image block, caption UNDER it ---- */
.in2-card {
  position: absolute; display: flex; flex-direction: column; overflow: hidden;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-sm); box-shadow: var(--shadow);
  cursor: grab; user-select: none; transition: opacity .14s, filter .14s;
}
.in2-card.dim { opacity: .16; filter: grayscale(1); }
.in2-card.sel { outline: 2px solid var(--cobalt); outline-offset: 2px; z-index: 5; }
.in2-media { position: relative; flex: 1; min-height: 0; background: var(--paper-2); }
.in2-media img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  pointer-events: none;
}
.in2-broken {
  width: 100%; height: 100%; display: grid; place-items: center;
  font-family: var(--d); font-size: 11px; letter-spacing: .04em; color: var(--ink-3);
}
.in2-cap {
  flex: none; padding: 7px 9px 8px; border-top: 1px solid var(--hair);
  background: var(--surface);
}
.in2-cap-t {
  font-size: 13px; font-weight: 600; line-height: 1.25; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.in2-cap-src {
  display: block; margin-top: 3px; font-family: var(--d); font-size: 11px;
  letter-spacing: .03em; color: var(--ink-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Not a claim about rights — a statement that nobody made one yet. */
.in2-pill {
  display: inline-block; margin-top: 4px; padding: 1px 7px;
  background: var(--ochre-wash); color: var(--warning);
  font-family: var(--d); font-size: 11px; letter-spacing: .03em;
  border-radius: 99px;
}
.in2-tags {
  position: absolute; top: 5px; left: 5px; display: flex; gap: 3px;
  flex-wrap: wrap; max-width: 88%;
}
.in2-tags span {
  background: var(--surface); border: 1px solid var(--hair);
  color: var(--ink-2); font-family: var(--d); font-size: 11px;
  padding: 1px 6px; border-radius: 99px;
}
.in2-palette-dots {
  position: absolute; right: 6px; bottom: 6px; display: flex;
  border: 1px solid var(--surface); border-radius: 99px; overflow: hidden;
}
.in2-palette-dots i { width: 12px; height: 12px; display: block; }

.in2-card.k-note { background: transparent; border: none; box-shadow: none; }
.in2-noteta {
  width: 100%; min-height: 120px; border: none; border-radius: var(--r-sm);
  resize: none; padding: var(--s3); font: inherit; font-size: 13px;
  color: var(--ink); box-shadow: var(--shadow); line-height: 1.45;
}
.in2-noteta:focus { outline: 2px solid var(--cobalt); }
.in2-card.k-swatch { border: none; }
.in2-swatch {
  width: 100%; height: 100%; display: flex; align-items: flex-end;
  cursor: pointer; position: relative;
}
.in2-swatch input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.in2-swatch span {
  font-family: var(--d); font-size: 11px; color: var(--surface);
  mix-blend-mode: difference; padding: 6px var(--s2);
}

/* ---- right rail ---- */
.in2-rail {
  width: 320px; border-left: 1px solid var(--line); background: var(--surface);
  overflow-y: auto; padding: var(--s4);
}
.in2-inspector { display: block; }
.in2-rh {
  font-family: var(--d); font-size: 11px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--editorial); margin-bottom: 10px;
  display: flex; align-items: center; justify-content: space-between; gap: var(--s2);
}
.in2-x { border: none; background: none; cursor: pointer; color: var(--ink-3); font-size: 14px; }
.in2-prev {
  width: 100%; border-radius: var(--r-sm); margin-bottom: 10px; display: block;
  background: var(--paper-2);
}
.in2-f { display: block; margin-bottom: 10px; }
.in2-f span {
  display: block; font-family: var(--d); font-size: 11px; letter-spacing: .04em;
  color: var(--ink-2); margin-bottom: 4px;
}
.in2-f input {
  width: 100%; border: 1px solid var(--line); border-radius: var(--r-xs);
  padding: 7px 9px; font: inherit; font-size: 13px; background: var(--paper);
  color: var(--ink);
}
.in2-note { font-size: 11px; color: var(--ink-3); line-height: 1.5; margin: 0 0 var(--s3); }
.in2-palette { display: flex; gap: 5px; margin: 0 0 var(--s2); flex-wrap: wrap; }
.in2-palette i {
  width: 34px; height: 34px; border-radius: var(--r-xs);
  border: 1px solid var(--line); display: block;
}
.in2-palette + .in2-btn { width: 100%; margin-bottom: 7px; }

.in2-stories { display: block; }
.in2-story {
  border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 10px; margin-bottom: 10px; background: var(--paper);
}
.in2-story-h { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s2); margin-bottom: var(--s2); }
.in2-story-h b { font-family: var(--disp); font-size: 14px; font-weight: 700; }
.in2-by { font-family: var(--d); font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.in2-strip {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: var(--s1); margin-bottom: var(--s2);
}
.in2-thumb {
  aspect-ratio: 4 / 5; border-radius: var(--r-xs); border: 1px solid var(--line);
  overflow: hidden; cursor: pointer; padding: 0; background: var(--paper-2);
}
.in2-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.in2-empty {
  display: grid; place-items: center; gap: var(--s2); text-align: center;
  padding: var(--s7) var(--s5); color: var(--ink-3); font-size: 13px;
  font-family: var(--serif);
}

@media (max-width: 900px) {
  .in2-rail { width: 240px; }
  .in2-title { font-size: 30px; }
}
`;

// Downscale any uploaded/pasted image to a compact JPEG data-URI so a board of
// 40 photos doesn't blow the localStorage quota (same tactic as DesignStudio).
async function fileToCompact(file, max = 1000) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const ratio = c.height / c.width;
  // Extract a small, deterministic working palette from the designer's own
  // upload. This is pixel sampling in-browser, not an AI claim.
  const sample = document.createElement("canvas");
  sample.width = 48; sample.height = 48;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, 48, 48);
  const px = ctx.getImageData(0, 0, 48, 48).data;
  const bins = new Map();
  for (let i = 0; i < px.length; i += 16) {
    if (px[i + 3] < 180) continue;
    const r = Math.round(px[i] / 32) * 32;
    const g = Math.round(px[i + 1] / 32) * 32;
    const b = Math.round(px[i + 2] / 32) * 32;
    const light = (r + g + b) / 3;
    if (light > 244 || light < 12) continue;
    const key = [Math.min(255, r), Math.min(255, g), Math.min(255, b)].join(",");
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const chosen = [];
  for (const [key] of [...bins.entries()].sort((a, b) => b[1] - a[1])) {
    const rgb = key.split(",").map(Number);
    const distinct = chosen.every((other) =>
      Math.hypot(rgb[0] - other[0], rgb[1] - other[1], rgb[2] - other[2]) > 64);
    if (distinct) chosen.push(rgb);
    if (chosen.length === 5) break;
  }
  const palette = chosen.map(([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`);
  return { src: c.toDataURL("image/jpeg", 0.82), ratio, palette };
}

export default function Inspiration({ onNavigate }) {
  const engine = useEngine();
  const [boards, setBoards] = useState(null);        // null = loading
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [filing, setFiling] = useState(false);
  const [stories, setStories] = useState(null);      // null = panel closed
  const [flash, setFlash] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [query, setQuery] = useState("");

  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drag = useRef(null);       // { type:'pan'|'card', id?, sx, sy, ox, oy }
  const boardsRef = useRef([]);

  // ---- load + persist ------------------------------------------------------
  useEffect(() => {
    const initial = loadBoards(engine.brandId);
    const inbox = drainInbox(engine.brandId);
    if (inbox.length) {
      initial[0] = {
        ...initial[0],
        cards: [
          ...inbox.map((it, i) => makeCard(it.kind || "reference", {
            src: it.src || it.image || null,
            url: it.url || null,
            title: it.title || "",
            source: it.source || "",
            tags: parseTags((it.tags || []).join(",")),
          }, { x: 40 + (i % 5) * 240, y: 40 + Math.floor(i / 5) * 300 })),
          ...initial[0].cards,
        ],
      };
    }
    // ⚠ THE BRAND TRAVELS WITH THE BOARDS, IN ONE STATE UPDATE (owner review,
    // fourth pass 2026-08-12). The first fix used a ref set here, which is
    // assigned BEFORE React applies the new boards — so the save effect from
    // that same render could still see the PREVIOUS brand's boards while the
    // ref already said the new brand, and write A's work under B's key. The
    // next render repaired it, which makes the isolation a race that usually
    // wins rather than a guarantee.
    //
    // Pairing them in a single object removes the window entirely: there is no
    // render in which `boards.brandId` and `boards.list` disagree, because they
    // are set by the same call. A guard that depends on ordering is not a
    // guard; one that depends on a value being unsplittable is.
    setBoards({ brandId: engine.brandId, list: initial });
    setActiveId(initial[0].id);
    // The inbox is drained per brand, so this must re-run when the brand
    // changes — otherwise the switch leaves the previous tenant's board in
    // state, which is the leak this scoping exists to close.
  }, [engine.brandId]);

  // ⚠ NEVER WRITE ONE BRAND'S BOARDS UNDER ANOTHER'S KEY. Scoping the storage
  // opens an ordering hazard the global key did not have: on a brand switch the
  // state still holds the PREVIOUS brand's boards for a render, and a save that
  // fired then would copy them into the new brand — turning a read leak into a
  // write one. The boards carry the brand they were loaded for, and the save is
  // skipped until the load for the new brand has landed.
  useEffect(() => {
    if (!boards) return;
    boardsRef.current = boards.list;
    // Structurally impossible to write one brand's boards under another's key:
    // the brand being written is the one the boards were loaded with, taken
    // from the same object.
    if (boards.brandId !== engine.brandId) return;
    const r = saveBoards(boards.list, boards.brandId);
    setSaveErr(r.ok ? "" : r.message);
  }, [boards, engine.brandId]);

  // ⚠ ONE PAIR, NOT TWO STATES. `boards` holds { brandId, list } so the brand a
  // board set belongs to cannot lag behind the boards themselves for a render —
  // see the load effect. Everything below reads this derived list and is
  // unchanged by the pairing.
  const boardList = useMemo(() => boards?.list || [], [boards]);

  const active = useMemo(
    () => boardList.find((b) => b.id === activeId) || boardList[0],
    [boardList, activeId]
  );
  const cards = active?.cards || [];

  // The rail says the one thing about this screen that is easy to get wrong:
  // what is on the wall is NOT evidence yet. Counts come from the board itself;
  // nothing here is interpreted.
  useChrome({
    read: {
      interpretation: cards.length
        ? `Este tablero tiene ${cards.length} pieza(s). Ninguna es evidencia todavía: lo será cuando la archives en la dirección de la colección, con su origen.`
        : "El tablero está vacío. Pegá una imagen, una URL o una nota — no hace falta decidir nada todavía.",
      signals: [
        { icon: "grid", label: "Tableros", text: String(boardList.length) },
        { icon: "bookmark", label: "Piezas en este tablero", text: String(cards.length) },
      ],
      unknowns: [
        "Un tablero vive en este navegador: si cambiás de máquina no viaja, y eso es a propósito mientras sea material en bruto.",
      ],
      trace: [
        { icon: "doc", label: "Origen", text: "tablero local (localStorage), archivado en la dirección del motor" },
      ],
    },
  }, [boardList.length, cards.length]);


  const note = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 2600); };

  // ---- board mutation helpers ---------------------------------------------
  const mutateActive = useCallback((fn) => {
    setBoards((prev) => ({ ...prev, list: prev.list.map((b) => (b.id === activeId ? fn(b) : b)) }));
  }, [activeId]);

  const addCards = useCallback((newCards) => {
    mutateActive((b) => ({ ...b, cards: [...b.cards, ...newCards] }));
    setStories(null);
  }, [mutateActive]);

  const patchCard = useCallback((id, patch) => {
    mutateActive((b) => ({
      ...b, cards: b.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, [mutateActive]);

  const removeCard = useCallback((id) => {
    mutateActive((b) => ({ ...b, cards: b.cards.filter((c) => c.id !== id) }));
    setSelectedId((s) => (s === id ? null : s));
    setStories(null);
  }, [mutateActive]);

  const bringToFront = useCallback((id) => {
    mutateActive((b) => {
      const card = b.cards.find((c) => c.id === id);
      if (!card) return b;
      return { ...b, cards: [...b.cards.filter((c) => c.id !== id), card] };
    });
  }, [mutateActive]);

  // Where "center of the current view" lands in canvas coordinates — new cards
  // drop where the designer is looking, not at a fixed origin.
  const viewCenter = useCallback(() => {
    const el = canvasRef.current;
    const rect = el?.getBoundingClientRect() || { width: 900, height: 600 };
    return {
      x: (rect.width / 2 - view.x) / view.scale,
      y: (rect.height / 2 - view.y) / view.scale,
    };
  }, [view]);

  // ---- adding content ------------------------------------------------------
  const onFiles = useCallback(async (files, at) => {
    const center = at || viewCenter();
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    const made = [];
    for (let i = 0; i < imgs.length; i++) {
      try {
        const { src, ratio, palette } = await fileToCompact(imgs[i]);
        const w = 220, h = Math.round(Math.min(360, Math.max(120, w * ratio)));
        made.push(makeCard("image", { src, w, h, palette },
          { x: center.x + (i % 4) * 20, y: center.y + (i % 4) * 20 }));
      } catch { /* skip unreadable file */ }
    }
    if (made.length) { addCards(made); note(`${made.length} imagen${made.length === 1 ? "" : "es"} en el tablero`); }
  }, [addCards, viewCenter]);

  const addImageUrl = useCallback(() => {
    const url = window.prompt("Pegá la URL de una imagen (o de una pieza que quieras guardar):");
    if (!url) return;
    addCards([makeCard("image", { src: url.trim(), url: url.trim() }, viewCenter())]);
    note("Imagen agregada desde URL");
  }, [addCards, viewCenter]);

  const addNote = useCallback(() => {
    addCards([makeCard("note", { text: "", color: "#FBF3DC" }, viewCenter())]);
  }, [addCards, viewCenter]);

  const addSwatch = useCallback(() => {
    addCards([makeCard("swatch", { color: "#C4582B", label: "#C4582B" }, viewCenter())]);
  }, [addCards, viewCenter]);

  // Paste image straight from the clipboard.
  useEffect(() => {
    const onPaste = (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const files = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); onFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  // ---- pan / zoom / drag ---------------------------------------------------
  const onCanvasPointerDown = (e) => {
    if (e.target.closest("[data-card]")) return; // card handles its own drag
    setSelectedId(null);
    drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onCardPointerDown = (e, card) => {
    if (e.target.closest("input,textarea,button,select,[contenteditable]")) return;
    e.stopPropagation();
    setSelectedId(card.id);
    bringToFront(card.id);
    drag.current = { type: "card", id: card.id, sx: e.clientX, sy: e.clientY, ox: card.x, oy: card.y, moved: false };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    if (d.type === "pan") {
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
    } else {
      const dx = (e.clientX - d.sx) / view.scale;
      const dy = (e.clientY - d.sy) / view.scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      patchCard(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) });
    }
  }, [view.scale, patchCard]);

  const onPointerUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0016);
      const scale = Math.min(2.5, Math.max(0.25, v.scale * factor));
      // keep the point under the cursor fixed while zooming
      return {
        scale,
        x: px - ((px - v.x) / v.scale) * scale,
        y: py - ((py - v.y) / v.scale) * scale,
      };
    });
  };

  const zoomBy = (f) => setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.25, v.scale * f)) }));
  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  const fitAll = () => {
    if (!cards.length) return resetView();
    const pad = 80;
    const xs = cards.map((c) => c.x), ys = cards.map((c) => c.y);
    const xe = cards.map((c) => c.x + c.w), ye = cards.map((c) => c.y + c.h);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xe) - minX, h = Math.max(...ye) - minY;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = Math.min(2, Math.max(0.25, Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h)));
    setView({ scale, x: pad - minX * scale, y: pad - minY * scale });
  };

  // ---- boards --------------------------------------------------------------
  const newBoard = () => {
    const b = freshBoard(`Tablero ${boardList.length + 1}`);
    setBoards((prev) => ({ ...prev, list: [...prev.list, b] }));
    setActiveId(b.id);
    setStories(null);
    resetView();
  };
  const renameBoard = (id) => {
    const cur = boardList.find((b) => b.id === id);
    const name = window.prompt("Nombre del tablero:", cur?.name || "");
    if (name != null) setBoards((prev) => ({ ...prev, list: prev.list.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)) }));
  };
  const deleteBoard = (id) => {
    if (boardList.length === 1) { note("No podés borrar el único tablero"); return; }
    if (!window.confirm("¿Borrar este tablero y todas sus referencias?")) return;
    setBoards((prev) => {
      const next = prev.list.filter((b) => b.id !== id);
      if (id === activeId) setActiveId(next[0].id);
      return { ...prev, list: next };
    });
  };

  // ---- stories + handoff to Studio ----------------------------------------
  const buildStories = () => {
    if (cards.length < 2) { note("Agregá al menos dos referencias para agrupar"); return; }
    setStories(clusterIntoStories(cards));
  };

  const toStudio = (storyCards, title) => {
    const brief = briefFromCards(storyCards, { title, boardName: active?.name });
    // Stamped: Studio refuses a handoff whose brand it cannot verify.
    try { localStorage.setItem(BRIEF_KEY, JSON.stringify(stampHandoff(brief, { brandId: engine.brandId, collectionNeutral: true }))); } catch { /* quota */ }
    onNavigate?.("studio");
  };

  const selected = cards.find((c) => c.id === selectedId) || null;
  const search = query.trim().toLowerCase();
  const cardMatches = (card) => !search || [
    card.title, card.source, card.text, ...(card.tags || []),
  ].join(" ").toLowerCase().includes(search);

  const addPalette = (palette = []) => {
    const center = viewCenter();
    addCards(palette.map((color, index) => makeCard("swatch", { color, label: color },
      { x: center.x + (index - palette.length / 2) * 135, y: center.y })));
    note(`${palette.length} colores agregados al tablero`);
  };

  // ⚠ THE STYLESHEET SHIPS WITH EVERY BRANCH. The loading state returned before
  // the <style> block existed, so the first paint of every visit was unstyled.
  if (!boards) {
    return (
      <section className="in2">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="in2-wrap"><div className="in2-empty">Cargando…</div></div>
      </section>
    );
  }

  return (
    <section className="in2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* THE SCREEN SAYS WHAT IT IS. This was the only view in the product with
          no title and no lede — it opened straight into board tabs, which is
          exactly why it read as a tool somebody left behind rather than a stage
          of the collection. The canvas below is unchanged: a scratch wall is
          the right shape for this work, and the header does not pretend the
          board is more governed than it is. */}
      <div className="in2-eyebrow"><b>{engine.brandName || "Atelier"}</b><span>·</span>Inspiración</div>
      <h1 className="in2-title">Inspiración</h1>
      <p className="in2-lede">
        Una pared de estudio: junta referencias, notas y colores sin pedirte
        estructura primero. Vive en este navegador — una referencia recién cuenta
        como evidencia cuando la archivás en la dirección de la colección, y ahí
        viaja con su origen.
      </p>

      <div className="in2-wrap">
      {/* board tabs */}
      <div className="in2-boards">
        {boardList.map((b) => (
          <button
            key={b.id}
            className={"in2-tab" + (b.id === activeId ? " on" : "")}
            onClick={() => { setActiveId(b.id); setStories(null); }}
            onDoubleClick={() => renameBoard(b.id)}
            title="Doble clic para renombrar"
          >
            {b.name} <span className="in2-count">{b.cards.length}</span>
          </button>
        ))}
        <button className="in2-tab ghost" onClick={newBoard}>＋ Tablero</button>
        <div className="in2-grow" />
        {/* The board IS a scratch surface and that is the right shape for it.
            What changed with §3b is that a card can now LEAVE — filed into the
            collection's direction, server-side, with its provenance. The chip
            says both halves, because "nothing syncs" is no longer true. */}
        <span className="in2-scope" title="El tablero vive en este navegador. Una referencia archivada en la dirección de la colección sí queda del lado del motor, con su origen.">
          ◍ tablero local · se archiva en la dirección
        </span>
      </div>

      {/* toolbar */}
      <div className="in2-toolbar">
        <div className="in2-add">
          <button className="in2-btn" onClick={() => fileRef.current?.click()}>＋ Imagen</button>
          <button className="in2-btn" onClick={addImageUrl}>URL / pieza</button>
          <button className="in2-btn" onClick={addNote}>＋ Nota</button>
          <button className="in2-btn" onClick={addSwatch}>＋ Color</button>
          <button className="in2-btn" onClick={() => onNavigate?.("integrations")}
                  title="La conexión real requiere OAuth; no simulamos una importación">
            Pinterest ↗
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
                 onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="in2-grow" />
        <input className="in2-search" value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="Buscar en el tablero…" aria-label="Buscar referencias" />
        <div className="in2-zoom">
          <button className="in2-icon" onClick={() => zoomBy(1 / 1.2)} title="Alejar">−</button>
          <span className="in2-zval">{Math.round(view.scale * 100)}%</span>
          <button className="in2-icon" onClick={() => zoomBy(1.2)} title="Acercar">＋</button>
          <button className="in2-icon" onClick={fitAll} title="Encuadrar todo">⤢</button>
          <button className="in2-icon" onClick={resetView} title="Reiniciar vista">↺</button>
        </div>
        <button className="in2-btn primary" onClick={buildStories}>✦ Agrupar en historias</button>
        {/* RENAMED. It used to say "Convertir tablero en dirección", which now
            collides with a real server-owned object (§3b) — this button does the
            localStorage handoff into the Studio and nothing else. */}
        <button className="in2-btn dark" disabled={!cards.length}
                onClick={() => toStudio(cards, active?.name)}
                title="Siembra un brief local para el Estudio de concepto. No guarda nada del lado del motor.">
          Llevar al Estudio →
        </button>
        <button className="in2-btn primary" disabled={!cards.length}
                onClick={() => setFiling((v) => !v)}
                title="Archiva las referencias del lado del motor, con para qué son y de dónde vienen.">
          {filing ? "Cerrar" : "Archivar en la dirección →"}
        </button>
      </div>

      {filing && (
        <div className="in2-filing">
          <FileIntoDirection cards={cards} boardName={active?.name}
                             onDone={(n) => n > 0 && note(`${n} archivada(s) en la dirección`)} />
        </div>
      )}

      {saveErr && <div className="in2-warn">⚠ {saveErr}</div>}
      {flash && <div className="in2-flash">{flash}</div>}

      <div className="in2-stage">
        {/* the infinite canvas */}
        <div
          ref={canvasRef}
          className="in2-canvas"
          onPointerDown={onCanvasPointerDown}
          onWheel={onWheel}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const rect = canvasRef.current.getBoundingClientRect();
            const at = {
              x: (e.clientX - rect.left - view.x) / view.scale,
              y: (e.clientY - rect.top - view.y) / view.scale,
            };
            if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files, at);
          }}
        >
          {cards.length === 0 && (
            <div className="in2-hint">
              {/* The empty wall IS the upload affordance now: a drawn drop zone
                  over the same hidden input the toolbar uses, rather than a
                  paragraph you cannot act on. Copy unchanged. */}
              <button type="button" className="in2-drop" onClick={() => fileRef.current?.click()}>
                <b className="in2-drop-t">Tu pared del estudio.</b>
                <span className="in2-drop-s">Subí imágenes, pegá una URL, dejá notas y muestras de color.
                Arrastrá para mover, rueda para hacer zoom. Cuando tengas material,
                agrupalo en historias y mandá una a Concept Studio.</span>
                <span className="in2-drop-a">Soltá imágenes acá o elegilas</span>
              </button>
            </div>
          )}
          <div className="in2-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            {cards.map((card) => (
              <CardView
                key={card.id}
                card={card}
                selected={card.id === selectedId}
                dimmed={!cardMatches(card)}
                onPointerDown={(e) => onCardPointerDown(e, card)}
                onPatch={(patch) => patchCard(card.id, patch)}
              />
            ))}
          </div>
        </div>

        {/* right rail: selection inspector OR stories */}
        {(selected || stories) && (
          <aside className="in2-rail">
            {selected && !stories && (
              <Inspector card={selected} onPatch={(p) => patchCard(selected.id, p)}
                         onAddPalette={() => addPalette(selected.palette || [])}
                         onDelete={() => removeCard(selected.id)} />
            )}
            {stories && (
              <StoriesPanel stories={stories} onClose={() => setStories(null)}
                            onToStudio={toStudio} onSelect={(id) => { setSelectedId(id); }} />
            )}
          </aside>
        )}
      </div>

      </div>
    </section>
  );
}

// ---- a single card ---------------------------------------------------------
function CardView({ card, selected, dimmed, onPointerDown, onPatch }) {
  const style = { left: card.x, top: card.y, width: card.w, height: card.kind === "note" ? "auto" : card.h };
  return (
    <div data-card className={"in2-card k-" + card.kind + (selected ? " sel" : "") + (dimmed ? " dim" : "")}
         style={style} onPointerDown={onPointerDown}>
      {card.kind === "image" || card.kind === "reference" ? (
        <>
          <div className="in2-media">
            {card.src
              ? <img src={card.src} alt="" draggable={false} referrerPolicy="no-referrer"
                     onError={(e) => { e.currentTarget.style.opacity = 0.15; }} />
              : <div className="in2-broken">sin imagen</div>}
            {card.tags?.length > 0 && (
              <div className="in2-tags">{card.tags.map((t) => <span key={t}>{t}</span>)}</div>
            )}
            {card.palette?.length > 0 && (
              <div className="in2-palette-dots">{card.palette.map((color) => <i key={color} style={{ background: color }} />)}</div>
            )}
          </div>
          {/* ⚠ THE PROVENANCE LINE IS NOT OPTIONAL. It used to render only when
              there was something to say, so a reference whose origin nobody had
              declared looked exactly like one that was filed and sourced. The
              line is always there; when the origin is blank it says so, which
              is a statement of absence and never a claim about rights. */}
          <div className="in2-cap">
            <div className="in2-cap-t">{card.title || "sin título"}</div>
            {card.source
              ? <span className="in2-cap-src" title={card.source}>{card.source}</span>
              : <span className="in2-pill">origen sin declarar</span>}
          </div>
        </>
      ) : card.kind === "note" ? (
        <textarea
          className="in2-noteta" style={{ background: card.color }}
          value={card.text || ""} placeholder="Escribí una nota, una idea, una tensión…"
          onChange={(e) => onPatch({ text: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <label className="in2-swatch" style={{ background: card.color }}>
          <input type="color" value={card.color} onPointerDown={(e) => e.stopPropagation()}
                 onChange={(e) => onPatch({ color: e.target.value, label: e.target.value })} />
          <span>{card.color}</span>
        </label>
      )}
    </div>
  );
}

// ---- selection inspector ---------------------------------------------------
function Inspector({ card, onPatch, onAddPalette, onDelete }) {
  return (
    <div className="in2-inspector">
      <div className="in2-rh">Referencia</div>
      {(card.kind === "image" || card.kind === "reference") && card.src && (
        <img className="in2-prev" src={card.src} alt="" referrerPolicy="no-referrer" />
      )}
      {(card.kind === "image" || card.kind === "reference") && (
        <label className="in2-f">
          <span>Título / caption</span>
          <input value={card.title || ""} onChange={(e) => onPatch({ title: e.target.value })}
                 placeholder="qué es, de dónde salió" />
        </label>
      )}
      <label className="in2-f">
        <span>Etiquetas (coma)</span>
        <input defaultValue={(card.tags || []).join(", ")}
               onBlur={(e) => onPatch({ tags: parseTags(e.target.value) })}
               placeholder="silueta, color, tejido, mood…" />
      </label>
      <p className="in2-note">Las etiquetas son lo que usa “Agrupar en historias”.</p>
      {card.palette?.length > 0 && <>
        <div className="in2-palette">{card.palette.map((color) => <i key={color} style={{ background: color }} title={color} />)}</div>
        <button className="in2-btn primary" onClick={onAddPalette}>Usar paleta en el tablero</button>
        <p className="in2-note">Paleta extraída localmente de los píxeles de tu imagen.</p>
      </>}
      <button className="in2-btn danger" onClick={onDelete}>Eliminar del tablero</button>
    </div>
  );
}

// ---- stories panel ---------------------------------------------------------
function StoriesPanel({ stories, onClose, onToStudio, onSelect }) {
  return (
    <div className="in2-stories">
      <div className="in2-rh">
        Historias del tablero
        <button className="in2-x" onClick={onClose}>✕</button>
      </div>
      <p className="in2-note">
        Agrupado por tus etiquetas y colores — regla determinista, todavía sin IA.
        Editá etiquetas y volvé a agrupar para afinarlo.
      </p>
      {stories.map((s) => (
        <div key={s.id} className="in2-story">
          <div className="in2-story-h">
            <b>{s.label}</b>
            <span className="in2-by">{s.cards.length} · por {s.by}</span>
          </div>
          <div className="in2-strip">
            {s.cards.slice(0, 8).map((c) => (
              <button key={c.id} className={"in2-thumb k-" + c.kind}
                      style={c.kind === "swatch" || c.kind === "note" ? { background: c.color } : undefined}
                      onClick={() => onSelect(c.id)} title={c.title || c.kind}>
                {(c.kind === "image" || c.kind === "reference") && c.src &&
                  <img src={c.src} alt="" referrerPolicy="no-referrer" />}
              </button>
            ))}
          </div>
          {s.id !== "rest" && (
            <button className="in2-btn dark sm" onClick={() => onToStudio(s.cards, s.label)}>
              Convertir historia en dirección →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
