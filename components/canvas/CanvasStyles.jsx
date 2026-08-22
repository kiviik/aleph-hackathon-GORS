"use client";
// The Lienzo's whole stylesheet, in one place, on the `lz-` namespace.
//
// ⚠ `dangerouslySetInnerHTML`, NEVER `<style>{CSS}</style>`. React escapes `>`
// and `"` when it serialises a text child on the server; the browser does not
// unescape inside a <style> element, so the client's text differs from the
// server's and React throws the entire tree away on every page load. That is
// a source rule here — `tests/styleHydration.test.mjs` fails the build on the
// other spelling — and it is not a hypothetical: five screens shipped with it.
//
// The canvas borrows no class from any other stylesheet. Those files are owned
// by other work this session, and a screen that depends on a class it does not
// own is a screen that loses its layout to somebody else's refactor.
const CSS = `
/* ================= Lienzo — lz- ==================================
   The imagery is the content. Every piece of chrome is a hairline around
   it, --action (oxblood) marks the one thing you press, --observed blue is
   reserved for what the world supplied and --inferred amber for what the
   model proposed. 11px is the type floor. */

.lz { min-width: 0; }

.lz-eyebrow {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s3);
}
.lz-eyebrow span { color: var(--ink-3); }
.lz-title {
  font-family: var(--serif); font-weight: 500; font-size: 30px;
  line-height: 1.1; letter-spacing: -.015em; color: var(--ink);
  margin: 0 0 6px;
}
.lz-lede {
  font-size: 13.5px; line-height: 1.5; color: var(--ink-2);
  margin: 0 0 var(--s3); max-width: 96ch;
}

/* ---- the frame: a region with a height, never a page that grows ----
   ⚠ THE PROMPT BAR HAS TO BE ON SCREEN. The frame is tall enough to work in
   and short enough that its bottom row — where the designer types — sits
   above the fold at 900px. Wheel events over the surface are captured for
   zooming, so a prompt bar below the fold is not merely inconvenient: the
   obvious gesture for reaching it does something else instead. */
.lz-frame {
  position: relative; display: flex; flex-direction: column;
  height: min(calc(100vh - 352px), 780px); min-height: 430px;
  border: 1px solid var(--line); border-radius: var(--r);
  background: var(--card); overflow: hidden; box-shadow: var(--shadow);
}
/* ⚠ min-height:0 ALONE COLLAPSED THE BOARD TO A HAIRLINE. Opening the
   receipt grows the prompt block, and a flex child that may shrink to zero
   does: the canvas — the entire point of the screen — became a 9px strip
   under an expanded panel. The floor below is what keeps the work visible
   while the panel explains itself.
   (⚠ and no backticks in this file's comments: the stylesheet is a JS
   template literal, so one backtick ends the string and the build fails
   pointing at a line thirty rows above the real cause.) */
.lz-body { flex: 1; display: flex; min-height: 260px; min-width: 0; }

/* ---- toolbar ---- */
.lz-bar {
  display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap;
  padding: 9px var(--s4); border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.lz-tools { display: flex; gap: 2px; padding: 2px;
  border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--paper); }
.lz-tool {
  border: 0; background: transparent; color: var(--ink-2); cursor: pointer;
  font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 6px;
  transition: background .12s, color .12s;
}
.lz-tool:hover { color: var(--ink); }
.lz-tool.on { background: var(--ink); color: var(--surface); font-weight: 600; }
.lz-btn {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  border-radius: var(--r-sm); padding: 6px 11px; font: inherit; font-size: 12px;
  cursor: pointer; white-space: nowrap;
}
.lz-btn:hover:not(:disabled) { border-color: var(--hair-2); }
.lz-btn:disabled { color: var(--ink-3); cursor: not-allowed; opacity: .7; }
.lz-btn.primary {
  background: var(--action); border-color: var(--action); color: #fff;
  font-weight: 600;
}
.lz-btn.primary:hover:not(:disabled) { background: var(--action-ink); }
.lz-btn.danger { color: var(--danger); }
.lz-spacer { flex: 1; }
.lz-zoom {
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.lz-file { display: none; }

/* ---- the surface ---- */
.lz-surface {
  position: relative; flex: 1; min-width: 0; overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, var(--hair) 1px, transparent 0)
    0 0 / 24px 24px, var(--paper);
  touch-action: none; cursor: grab;
}
.lz-surface.panning { cursor: grabbing; }
.lz-surface.drawing { cursor: crosshair; }
.lz-surface.dropping { outline: 2px dashed var(--action); outline-offset: -6px; }
.lz-world { position: absolute; inset: 0; transform-origin: 0 0; }
.lz-ink { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }

/* ---- cards ---- */
.lz-card {
  position: absolute; background: var(--surface);
  border: 1px solid var(--line); border-radius: 4px;
  box-shadow: 0 1px 2px rgba(23,24,28,.06), 0 10px 30px -18px rgba(23,24,28,.5);
  overflow: hidden; user-select: none;
}
.lz-card.sel { border-color: var(--action); box-shadow: 0 0 0 2px var(--action-wash), 0 10px 30px -18px rgba(23,24,28,.5); }
.lz-card img { display: block; width: 100%; height: 100%; object-fit: contain;
  background: var(--paper-2); pointer-events: none; }
.lz-card.note {
  background: var(--inferred-wash); border-color: var(--inferred);
  padding: 9px 11px; display: flex; flex-direction: column; gap: 5px;
}
.lz-note-t {
  flex: 1; border: 0; background: transparent; resize: none; font: inherit;
  font-size: 13px; line-height: 1.45; color: var(--ink); outline: none;
}
.lz-gone {
  display: flex; align-items: center; justify-content: center; height: 100%;
  padding: 10px; text-align: center; font-size: 11px; line-height: 1.45;
  color: var(--ink-3); background: var(--paper-2);
}
.lz-tags {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex;
  gap: 4px; flex-wrap: wrap; padding: 5px 6px;
  background: linear-gradient(to top, rgba(255,255,255,.96), rgba(255,255,255,0));
}
.lz-tag {
  font-family: var(--d); font-size: 10px; letter-spacing: .04em;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
  border-radius: 999px; padding: 1px 7px; white-space: nowrap;
}
.lz-tag.made { border-color: var(--inferred); color: #8a6410; background: var(--inferred-wash); }
.lz-tag.local { border-color: var(--hair-2); color: var(--ink-3); }
.lz-tag.role { border-color: var(--observed); color: var(--observed-ink); background: var(--observed-wash); }
.lz-grip {
  position: absolute; right: -1px; bottom: -1px; width: 14px; height: 14px;
  background: var(--action); border-radius: 3px 0 3px 0; cursor: nwse-resize;
}
.lz-region {
  position: absolute; border: 1.5px dashed var(--action);
  background: rgba(150,64,47,.12); pointer-events: none;
}
.lz-marquee {
  position: absolute; border: 1.5px dashed var(--ink-3);
  background: rgba(26,24,21,.06); pointer-events: none;
}

/* ---- right rail ---- */
.lz-rail {
  width: 292px; flex: 0 0 292px; border-left: 1px solid var(--line);
  background: var(--surface); overflow-y: auto; padding: var(--s3) var(--s4) var(--s5);
}
.lz-sec { border-top: 1px solid var(--hair); padding-top: var(--s3); margin-top: var(--s3); }
.lz-sec:first-child { border-top: 0; margin-top: 0; padding-top: 0; }
.lz-k {
  font-family: var(--d); font-size: 11px; font-weight: 600; letter-spacing: .07em;
  text-transform: uppercase; color: var(--ink-3); margin: 0 0 6px;
}
.lz-p { font-size: 11.5px; line-height: 1.5; color: var(--ink-2); margin: 0 0 7px; }
.lz-p.quiet { color: var(--ink-3); }
.lz-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.lz-chip {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 11.5px;
  cursor: pointer;
}
.lz-chip:hover { border-color: var(--hair-2); }
.lz-chip.on { background: var(--ink); border-color: var(--ink); color: var(--surface); font-weight: 600; }
.lz-chip.on.observed { background: var(--observed); border-color: var(--observed); }
.lz-range { width: 100%; accent-color: var(--action); margin: 4px 0 2px; }
.lz-in {
  width: 100%; border: 1px solid var(--line); background: var(--paper);
  border-radius: var(--r-sm); padding: 6px 9px; font: inherit; font-size: 12px;
  color: var(--ink);
}
.lz-in::placeholder { color: var(--ink-3); }
.lz-excl { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.lz-x {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px;
  border: 1px solid var(--hair-2); border-radius: 999px; padding: 2px 5px 2px 10px;
  color: var(--ink-2); background: var(--paper-2);
}
.lz-x button { border: 0; background: transparent; cursor: pointer; color: var(--ink-3); font: inherit; line-height: 1; padding: 0 3px; }

/* ---- library strip ---- */
.lz-lib { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.lz-lib button {
  border: 1px solid var(--line); border-radius: 5px; overflow: hidden;
  background: var(--paper-2); cursor: pointer; padding: 0; aspect-ratio: 1;
}
.lz-lib button:hover { border-color: var(--action); }
.lz-lib img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* ---- prompt bar ---- */
.lz-prompt {
  border-top: 1px solid var(--line); background: var(--surface);
  padding: var(--s3) var(--s4); display: flex; flex-direction: column; gap: 8px;
  /* The receipt is long by design — four voices and one chip per control.
     It scrolls inside its own strip rather than eating the board. */
  max-height: 52%; overflow-y: auto; flex: 0 0 auto;
}
.lz-mode {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 11.5px; color: var(--ink-2);
}
.lz-mode b { font-weight: 700; color: var(--ink); }
.lz-mode .pill {
  font-family: var(--d); font-size: 10.5px; letter-spacing: .04em;
  border-radius: 999px; padding: 2px 9px; border: 1px solid var(--action);
  color: var(--action); background: var(--action-wash);
}
.lz-row { display: flex; gap: var(--s2); align-items: flex-start; }
.lz-ta {
  flex: 1; min-height: 46px; max-height: 130px; border: 1px solid var(--line);
  background: var(--paper); border-radius: var(--r-sm); padding: 9px 11px;
  font: inherit; font-size: 14px; line-height: 1.45; color: var(--ink);
  resize: vertical;
}
.lz-ta::placeholder { color: var(--ink-3); }
.lz-side { display: flex; flex-direction: column; gap: 6px; width: 168px; }
.lz-sel {
  width: 100%; border: 1px solid var(--line); background: var(--surface);
  border-radius: var(--r-sm); padding: 6px 9px; font: inherit; font-size: 12px;
  color: var(--ink);
}
.lz-note {
  font-size: 11px; line-height: 1.45; color: var(--ink-3);
}
.lz-refuse {
  border: 1px solid var(--warning); background: #FBF6E9; border-radius: var(--r-sm);
  padding: 9px 11px;
}
.lz-refuse .lz-k { color: var(--warning); }
.lz-verbatim {
  font-family: var(--d); font-size: 11.5px; line-height: 1.5; color: var(--ink);
  white-space: pre-wrap; overflow-wrap: anywhere; margin: 0;
}
.lz-err {
  border: 1px solid var(--hair-2); background: var(--paper-2);
  border-radius: var(--r-sm); padding: 8px 11px; font-size: 11.5px; color: var(--ink-2);
}

/* ---- compare ---- */
.lz-compare {
  position: absolute; inset: 0; z-index: 40; background: rgba(23,24,28,.86);
  display: flex; flex-direction: column; padding: var(--s4);
}
.lz-compare-h {
  display: flex; align-items: center; gap: var(--s3);
  color: #fff; font-size: 12px; margin-bottom: var(--s3);
}
.lz-compare-g { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: var(--s4); min-height: 0; }
.lz-compare-c { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; }
/* ⚠ width:100% and max-width are NOT redundant here. An img is replaced
   content: inside a flex column it keeps its INTRINSIC width, so a
   1200px source overflowed its 470px cell and the two panes overlapped —
   the compare read as one broken picture rather than two. */
.lz-compare-c img {
  flex: 1; min-height: 0; width: 100%; max-width: 100%;
  object-fit: contain; background: #0d0e10; border-radius: 6px;
}
.lz-compare-m { font-family: var(--d); font-size: 11px; color: #cfcac2; line-height: 1.5; }

/* ---- empty state ---- */
.lz-empty {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; pointer-events: none; padding: var(--s5);
}
.lz-empty div {
  max-width: 46ch; text-align: center; font-size: 13px; line-height: 1.6;
  color: var(--ink-3);
}

@media (max-width: 1100px) {
  .lz-rail { width: 240px; flex-basis: 240px; }
}
`;

export default function CanvasStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
