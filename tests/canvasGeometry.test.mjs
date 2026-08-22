// The board's arithmetic, which is the part that fails silently.
//
// Every other defect on a canvas announces itself: a card in the wrong place
// is visible, a missing stroke is visible. The transform is not. A screen→
// board conversion that is off by the pan offset still produces a rectangle,
// still produces a mask, still produces an image — of the wrong part of the
// garment, with nothing anywhere saying so. So the transform, its inverse,
// the zoom anchor and the card→image-pixel mapping are asserted here rather
// than eyeballed at 100 % zoom, where almost every wrong implementation
// happens to look right.
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ZOOM, MIN_ZOOM, boardToScreen, bringToFront, childPlacement, clampZoom,
  lineageEdges, normalizeRect, regionCoverage, regionToImagePixels,
  screenToBoard, strengthWord, zoomAt,
} from "@/lib/canvas.mjs";

test("screen and board coordinates are exact inverses", () => {
  const view = { x: -320.5, y: 88, k: 2.4 };
  for (const pt of [{ x: 0, y: 0 }, { x: 1440, y: 900 }, { x: -70, y: 13.25 }]) {
    const back = boardToScreen(screenToBoard(pt, view), view);
    assert.ok(Math.abs(back.x - pt.x) < 1e-9, `x drifted: ${back.x} vs ${pt.x}`);
    assert.ok(Math.abs(back.y - pt.y) < 1e-9, `y drifted: ${back.y} vs ${pt.y}`);
  }
});

test("wheel-zoom keeps the board point under the cursor", () => {
  // The property that makes zooming feel like a physical surface: whatever is
  // under the pointer stays under it. Implementations that zoom about the
  // origin look identical when the board has not been panned, which is the
  // only state anyone tests by hand.
  const view = { x: 140, y: -60, k: 1 };
  const cursor = { x: 900, y: 420 };
  const before = screenToBoard(cursor, view);
  const after = screenToBoard(cursor, zoomAt(view, cursor, 1.9));
  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);
});

test("zoom clamps, and clamping does not drift the board sideways", () => {
  const view = { x: 200, y: 200, k: MAX_ZOOM };
  const cursor = { x: 500, y: 300 };
  const zoomed = zoomAt(view, cursor, 4);
  assert.equal(zoomed.k, MAX_ZOOM, "past the ceiling the scale must not move");
  // ...and because it did not move, neither may the offset. A zoomAt that
  // clamps AFTER solving the offset slides the board on every blocked wheel
  // tick, which reads as the canvas fighting the user.
  assert.ok(Math.abs(zoomed.x - view.x) < 1e-9);
  assert.ok(Math.abs(zoomed.y - view.y) < 1e-9);
  assert.equal(clampZoom(0.0001), MIN_ZOOM);
  assert.equal(clampZoom(NaN), 1, "a non-number is not a zoom level");
});

test("a rectangle dragged in any direction has non-negative extent", () => {
  const a = { x: 300, y: 200 }, b = { x: 100, y: 50 };
  assert.deepEqual(normalizeRect(a, b), { x: 100, y: 50, w: 200, h: 150 });
  assert.deepEqual(normalizeRect(b, a), { x: 100, y: 50, w: 200, h: 150 });
});

// ---------------------------------------------------------------------------
// the selection → the source image's own pixels
// ---------------------------------------------------------------------------

const CARD = { x: 100, y: 100, w: 400, h: 300 };
const NATURAL = { width: 2000, height: 1500 };   // the card is displayed at 1/5

test("a region maps into the source image's pixels, not the card's", () => {
  // The whole feature rests on this: the card is a 400px-wide view of a
  // 2000px-wide photograph, and the mask must be in the photograph's pixels.
  // A version that forgot the scale would return {100,50,200,150} here and
  // the provider would edit the top-left corner of the jacket instead of its
  // middle.
  const px = regionToImagePixels(CARD, { x: 200, y: 150, w: 100, h: 60 }, NATURAL);
  assert.deepEqual(px, { x: 500, y: 250, width: 500, height: 300 });
});

test("a drag that runs off the card is clipped to it, never past it", () => {
  const px = regionToImagePixels(CARD, { x: -400, y: -400, w: 2000, h: 2000 }, NATURAL);
  assert.deepEqual(px, { x: 0, y: 0, width: 2000, height: 1500 },
    "a selection may cover the whole image; it may not exceed it, because a "
    + "mask larger than the base image is a request the provider rejects");
});

test("a hairline drag still selects at least one pixel", () => {
  const px = regionToImagePixels(CARD, { x: 200, y: 150, w: 0.02, h: 0.02 }, NATURAL);
  assert.ok(px.width >= 1 && px.height >= 1,
    "rounded to zero, the mask has no hole in it — an edit request that "
    + "asks for nothing and returns something");
});

test("a drag that misses the card is null, not an empty mask", () => {
  assert.equal(regionToImagePixels(CARD, { x: 900, y: 900, w: 50, h: 50 }, NATURAL), null);
  assert.equal(regionToImagePixels(CARD, { x: 0, y: 0, w: 10, h: 10 }, null), null);
  assert.equal(regionToImagePixels(CARD, { x: 0, y: 0, w: 10, h: 10 },
    { width: 0, height: 0 }), null, "an image whose size we do not know yet "
    + "cannot be masked — and guessing one would mask the wrong thing");
});

test("coverage is the fraction of the image being rewritten", () => {
  const px = regionToImagePixels(CARD, { x: 100, y: 100, w: 200, h: 150 }, NATURAL);
  assert.ok(Math.abs(regionCoverage(px, NATURAL) - 0.25) < 1e-9);
  assert.equal(regionCoverage(null, NATURAL), null);
});

// ---------------------------------------------------------------------------
// stacking and lineage
// ---------------------------------------------------------------------------

test("bringing a card forward renumbers instead of incrementing forever", () => {
  const cards = [{ id: "a", z: 0 }, { id: "b", z: 1 }, { id: "c", z: 2 }];
  const out = bringToFront(cards, "a");
  const z = Object.fromEntries(out.map((c) => [c.id, c.z]));
  assert.equal(z.a, 2);
  assert.deepEqual([z.b, z.c].sort(), [0, 1]);
  assert.deepEqual(bringToFront(cards, "nope"), cards);
});

test("lineage draws only links whose parent is still on the board", () => {
  const cards = [
    { id: "p", x: 0, y: 0 },
    { id: "c1", parentId: "p" },
    { id: "orphan", parentId: "deleted" },
  ];
  const edges = lineageEdges(cards);
  assert.equal(edges.length, 1, "an edge to a card that is gone would be a "
    + "line to nowhere, drawn to the board's origin");
  assert.equal(edges[0].to.id, "c1");
});

test("two results from one card do not land on top of each other", () => {
  const parent = { x: 0, y: 0, w: 300, h: 400 };
  const a = childPlacement(parent, 0);
  const b = childPlacement(parent, 1);
  assert.equal(a.x, b.x);
  assert.ok(b.y > a.y + parent.h - 1);
});

test("strength is shown in the engine's own three words", () => {
  // The compiler buckets at .75 and .4 and writes "primary"/"secondary"/
  // "subtle" into the prompt. Showing a percentage instead would promise a
  // precision the compiled sentence does not carry.
  assert.equal(strengthWord(1), "primary");
  assert.equal(strengthWord(0.75), "primary");
  assert.equal(strengthWord(0.5), "secondary");
  assert.equal(strengthWord(0.2), "subtle");
  assert.equal(strengthWord(undefined), null);
});
