// What the canvas is allowed to say, and where it is allowed to say it.
//
// The geometry tests prove the arithmetic; these prove the SENTENCES. Three of
// them are the ones a canvas gets wrong in a way no user can detect:
//
//   · a refusal softened into "algo salió mal" — the designer then retries the
//     same impossible request forever, and the engine's actual reason (this
//     model has no alpha mask) never reaches her;
//   · a masked edit that silently falls back to a whole-image generation —
//     the picture comes back looking fine, with everything she was protecting
//     quietly redrawn;
//   · a generation presented as a photograph or a try-on.
//
// The first two are asserted on rendered markup and on the source of the one
// function that can commit them. Nothing else can see them.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { TITLES, resolveView, sectionForView } from "@/lib/nav";
import { AREA_VIEWS } from "@/lib/collectionAreas";

const read = (rel) =>
  readFileSync(new URL(`../${rel}`, import.meta.url).pathname, "utf8");

async function render(element) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(element);
}

// ---------------------------------------------------------------- routing --

test("the canvas is a real destination inside the collection", () => {
  assert.equal(resolveView("canvas").view, "canvas");
  assert.equal(TITLES.canvas, "Lienzo");
  assert.equal(sectionForView("canvas"), "collection",
    "a view the drawer lists but VIEW_SECTIONS does not own lights a "
    + "different global — the 'teleport' navOwnership exists to prevent");
  assert.ok(AREA_VIEWS.includes("canvas"),
    "routable and in no menu is unreachable by clicking");
});

// -------------------------------------------------------------- refusals --

test("the engine's refusal is rendered verbatim, in its own words", async () => {
  const { default: CanvasPrompt } = await import("@/components/canvas/CanvasPrompt");
  const React = (await import("react")).default;

  const said = "region: gemini-2.5-flash-image does not document an alpha mask; "
    + "a regional edit is refused rather than sent without its mask, which "
    + "would change the whole image";
  const html = await render(React.createElement(CanvasPrompt, {
    authored: "hacé la manga más ancha", onAuthored: () => {},
    mode: { kind: "edit", card: { name: "saco" }, ready: true },
    tier: "balanced", onTier: () => {}, onSend: () => {}, busy: false,
    refusal: said, error: null, lastSent: null,
  }));

  assert.ok(html.includes(said.slice(0, 60)),
    "the engine's sentence has to reach the screen unchanged — it is the only "
    + "place the reason exists");
  assert.ok(/textual/i.test(html),
    "and it must be attributed, so it does not read as the app's own copy");
  assert.ok(!/algo salió mal|error inesperado/i.test(html));
});

test("a refusal says the request was not retried whole-image", async () => {
  const { default: CanvasPrompt } = await import("@/components/canvas/CanvasPrompt");
  const React = (await import("react")).default;
  const html = await render(React.createElement(CanvasPrompt, {
    authored: "x", onAuthored: () => {}, mode: { kind: "edit", ready: true },
    tier: "fast", onTier: () => {}, onSend: () => {}, busy: false,
    refusal: "unknown operation: 'edit'", error: null, lastSent: null,
  }));
  assert.ok(/no se reintentó/i.test(html),
    "the silent whole-image retry is the failure a mask exists to prevent; "
    + "the screen states that it did not happen");
});

test("the masked path has no fallback generator, in source", () => {
  // ⚠ A SOURCE RULE, because the defect is an ABSENCE at runtime: a fallback
  // that fires produces a beautiful image and no error, so no behavioural
  // test in this suite would fail. DesignStudio legitimately falls back to
  // this app's own /api/generate when no engine is reachable; on a masked
  // edit that same fallback would rewrite the entire garment.
  const src = read("components/views/Canvas.jsx");
  assert.ok(!src.includes("/api/generate"),
    "the canvas must not reach the app's own unmasked generator");
  assert.ok(!src.includes("fallbackPrompt"),
    "fallbackPrompt is the no-engine degradation; a canvas edit has no "
    + "degraded form that is still the edit she asked for");

  const refusalAt = src.indexOf("engineRefusal(err?.body)");
  const genericAt = src.indexOf("El motor no completó el pedido");
  assert.ok(refusalAt > -1 && genericAt > refusalAt,
    "the engine's own sentence must be read BEFORE anything generic is "
    + "shown, or the reason is swallowed by the catch-all");
});

// ------------------------------------------------------------- the cards --

test("a generated card says so, and never claims to be a photograph", async () => {
  const { default: CanvasCard } = await import("@/components/canvas/CanvasCard");
  const { makeImageCard } = await import("@/lib/canvas.mjs");
  const React = (await import("react")).default;

  const html = await render(React.createElement(CanvasCard, {
    card: makeImageCard({ assetId: "a1", src: "blob:x", origin: "generated",
                          role: "fabric", strength: 1 }),
    selected: false,
  }));
  assert.ok(html.includes("generado"));
  assert.ok(!/\bfoto\b|fotografía|try-?on|prueba real/i.test(html),
    "a generation is never presented as a photograph or a real try-on");
  assert.ok(html.includes("tela"), "the role it carries is shown on the card");
  assert.ok(html.includes("primary"),
    "and the weight in the engine's own word, since that word is what the "
    + "compiled prompt will contain");
});

test("a browser-only image is labelled on the card, not just in a panel", async () => {
  const { default: CanvasCard } = await import("@/components/canvas/CanvasCard");
  const { makeImageCard } = await import("@/lib/canvas.mjs");
  const React = (await import("react")).default;

  const html = await render(React.createElement(CanvasCard, {
    card: makeImageCard({ local: true, src: "blob:x", name: "foto.jpg" }),
    selected: false,
  }));
  assert.ok(html.includes("solo en este navegador"),
    "an image the engine has no row for cannot travel as a reference, and "
    + "the card is where she is looking when she assumes it can");
});

test("a card whose pixels did not survive the reload explains itself", async () => {
  const { default: CanvasCard } = await import("@/components/canvas/CanvasCard");
  const { makeImageCard } = await import("@/lib/canvas.mjs");
  const React = (await import("react")).default;

  const html = await render(React.createElement(CanvasCard, {
    card: makeImageCard({ local: true, src: null, name: "foto.jpg" }),
    selected: false,
  }));
  assert.ok(/sesión anterior/.test(html) && /Volvé a soltarla/.test(html),
    "a grey rectangle reads as a bug; a sentence reads as a fact about "
    + "where the board is stored");
});

// -------------------------------------------------- the rail's honesty ----

test("the rail says locks and roles are prompt guidance, not provider switches", async () => {
  const { default: CanvasInspector } = await import("@/components/canvas/CanvasInspector");
  const { freshBoard } = await import("@/lib/canvas.mjs");
  const React = (await import("react")).default;

  const html = await render(React.createElement(CanvasInspector, {
    card: null, board: freshBoard(), library: undefined, brandId: null,
    busy: false, onRole: () => {}, onStrength: () => {}, onToggleLock: () => {},
    onExclusions: () => {}, onAddFromLibrary: () => {}, onExportPng: () => {},
    onExportJson: () => {},
  }));
  // "guía de prompt" is the one Spanish phrase lib/generationIntent.mjs owns
  // for this treatment; a control offered without it is the exact defect the
  // typed contract was built to end.
  assert.ok(html.includes("guía de prompt"),
    "a control that is really prose must say so beside itself");
  assert.ok(html.includes("silueta") && html.includes("estampa"),
    "the locks are shown in Spanish, from the engine's own list");
});

test("an unaskable library and an empty one are different sentences", async () => {
  const { default: CanvasInspector } = await import("@/components/canvas/CanvasInspector");
  const { freshBoard } = await import("@/lib/canvas.mjs");
  const React = (await import("react")).default;

  const props = {
    card: null, board: freshBoard(), brandId: "b1", busy: false,
    onRole: () => {}, onStrength: () => {}, onToggleLock: () => {},
    onExclusions: () => {}, onAddFromLibrary: () => {}, onExportPng: () => {},
    onExportJson: () => {},
  };
  const failed = await render(React.createElement(CanvasInspector,
    { ...props, library: null }));
  const empty = await render(React.createElement(CanvasInspector,
    { ...props, library: [] }));

  assert.ok(/no lo sabemos/.test(failed),
    "a request that failed is not a library that is empty");
  assert.ok(/todavía no tiene activos/.test(empty));
  assert.ok(!/todavía no tiene activos/.test(failed));
});
