// The mask, decoded rather than trusted.
//
// ⚠ WHY THIS TEST DECODES REAL PNG BYTES. A regional edit sends the provider
// an image and a mask; the transparent pixels of the mask are the only thing
// telling it which part of the garment it may rewrite. Every way of getting
// that wrong produces a perfectly valid request and a perfectly plausible
// image:
//
//   · mask smaller than the base   → the API rejects it, or worse, scales it
//   · alpha inverted               → it preserves the sleeve she selected and
//                                    redraws everything else
//   · region in card pixels        → it edits the wrong quarter of the image
//
// None of those throw. So the assertions below open the PNG the way a decoder
// does — signature, IHDR, inflated IDAT — and read the alpha of a pixel
// inside the hole and a pixel outside it. That is the only form of this test
// that would actually have caught an inverted mask.
import assert from "node:assert/strict";
import test from "node:test";

import { base64, maskPng } from "@/lib/canvas.mjs";

// --- a minimal PNG reader, deliberately independent of the writer ----------

function bytesFromDataUri(uri) {
  const [header, payload] = String(uri).split(",");
  assert.equal(header, "data:image/png;base64",
    "the engine's `mask_data_uri` field takes exactly this transport");
  return Uint8Array.from(Buffer.from(payload, "base64"));
}

async function decode(uri) {
  const png = bytesFromDataUri(uri);
  assert.deepEqual([...png.slice(0, 8)],
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "not a PNG signature");

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let ihdr = null;
  const idat = [];
  const seen = [];
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.slice(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + len);
    seen.push(type);
    if (type === "IHDR") ihdr = data;
    if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  assert.deepEqual(seen, ["IHDR", "IDAT", "IEND"]);

  const hv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const width = hv.getUint32(0);
  const height = hv.getUint32(4);
  assert.equal(ihdr[8], 8, "8 bits per channel");
  assert.equal(ihdr[9], 6, "colour type 6 = RGBA; without an alpha channel "
    + "there is no way to say 'edit here'");

  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of idat) { joined.set(d, o); o += d.length; }
  const raw = new Uint8Array(await new Response(
    new Blob([joined]).stream().pipeThrough(new DecompressionStream("deflate"))
  ).arrayBuffer());

  const stride = 1 + width * 4;
  assert.equal(raw.length, stride * height, "scanline count or stride is wrong");
  const alphaAt = (x, y) => {
    assert.equal(raw[y * stride], 0, "filter type must be None(0)");
    return raw[y * stride + 1 + x * 4 + 3];
  };
  return { width, height, alphaAt, bytes: png.length };
}

// --- the assertions --------------------------------------------------------

test("the mask is exactly the base image's pixel size", async () => {
  // Not the card's size on screen, not a rounded power of two. The provider
  // matches mask to image pixel for pixel.
  const { width, height } = await decode(
    await maskPng({ width: 1024, height: 768, region: { x: 10, y: 10, width: 20, height: 20 } }));
  assert.equal(width, 1024);
  assert.equal(height, 768);
});

test("alpha 0 marks the region to edit, and only that region", async () => {
  const uri = await maskPng({
    width: 64, height: 48, region: { x: 16, y: 8, width: 16, height: 16 },
  });
  const { alphaAt } = await decode(uri);

  // Inside the rectangle: transparent — "you may change this".
  assert.equal(alphaAt(16, 8), 0, "the region's first pixel must be editable");
  assert.equal(alphaAt(24, 16), 0);
  assert.equal(alphaAt(31, 23), 0, "the region's last pixel must be editable");

  // Outside, on all four sides: opaque — "leave this exactly as it is".
  assert.equal(alphaAt(15, 16), 255, "one pixel left of the selection");
  assert.equal(alphaAt(32, 16), 255, "one pixel right of the selection");
  assert.equal(alphaAt(24, 7), 255, "one pixel above the selection");
  assert.equal(alphaAt(24, 24), 255, "one pixel below the selection");
  assert.equal(alphaAt(0, 0), 255);
  assert.equal(alphaAt(63, 47), 255);
});

test("a region running past the edge is clipped, not wrapped", async () => {
  const { alphaAt } = await decode(await maskPng({
    width: 32, height: 32, region: { x: 24, y: 24, width: 64, height: 64 },
  }));
  assert.equal(alphaAt(31, 31), 0);
  assert.equal(alphaAt(23, 31), 255, "the clip must not bleed left");
  assert.equal(alphaAt(0, 0), 255);
});

test("a mask with no region is refused rather than sent", async () => {
  // An all-opaque mask says "change nothing" and the provider answers with a
  // new image anyway. That is the silent whole-image edit this feature exists
  // to prevent, so it fails here, before the request.
  await assert.rejects(() => maskPng({ width: 10, height: 10, region: null }),
    /edits nothing/);
  await assert.rejects(
    () => maskPng({ width: 10, height: 10, region: { x: 0, y: 0, width: 0, height: 5 } }),
    /edits nothing/);
  await assert.rejects(
    () => maskPng({ width: 0, height: 10, region: { x: 0, y: 0, width: 2, height: 2 } }),
    /base image's size/);
});

test("a full-resolution mask stays a few kilobytes, not a few megabytes", async () => {
  // 4096×4096 RGBA is 67 MB raw. Two flat colours deflate to almost nothing,
  // which is what makes sending the mask as a data URI viable at all — an
  // uncompressed encoder would have produced a 90 MB request body.
  const uri = await maskPng({
    width: 4096, height: 4096, region: { x: 100, y: 100, width: 800, height: 600 },
  });
  const { width, bytes } = await decode(uri);
  assert.equal(width, 4096);
  assert.ok(bytes < 200_000, `mask is ${bytes} bytes — too large to post`);
});

test("base64 encodes bytes the way a decoder reads them", () => {
  // Padding is the part everyone gets wrong, and a mask one byte short of its
  // length decodes to a corrupt PNG rather than to an error.
  const cases = [[], [0], [0, 255], [1, 2, 3], [1, 2, 3, 4], [77, 97, 110]];
  for (const c of cases) {
    assert.equal(base64(Uint8Array.from(c)), Buffer.from(c).toString("base64"));
  }
});
