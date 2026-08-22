// "Atelier has two competing navigation models … As an owner, I repeatedly
// felt the product 'teleport' between contexts." (owner review, 2026-08-14,
// after testing all 30 routed views. Navigation scored 5.5/10, the lowest
// dimension in the review.)
//
// The cause was three maps claiming a view independently:
//   · VIEW_SECTIONS   (lib/nav.js)          — which global lights up
//   · CONTEXT_NAV     (lib/nav.js)          — the tools under a global
//   · COLLECTION_AREAS(lib/collectionAreas) — the collection's drawer
//
// "Biblioteca de evidencia" was listed in the market tools AND in the
// collection drawer, while VIEW_SECTIONS filed it under Marca & datos — so it
// appeared in two menus and lit a third. That is not a layout preference; a
// menu that lists a route it does not own is stating something false about
// where you are.
//
// The rule: ONE canonical owner per route. Contextual links may open an
// object; they may not duplicate the hierarchy.
import assert from "node:assert/strict";
import test from "node:test";

import { CONTEXT_NAV, GLOBAL_NAV, sectionForView } from "@/lib/nav";
import { AREA_VIEWS, COLLECTION_AREAS } from "@/lib/collectionAreas";

// CONTEXT_NAV keys are the menu's own name for a section; GLOBAL_NAV keys are
// the canonical ones. This is the mapping between them, and it is the only
// place the two vocabularies are allowed to meet.
// There is deliberately no `collection` entry: that key was a fourth,
// unrendered map of the same territory and is deleted. The collection's drawer
// is COLLECTION_AREAS, checked separately below.
const MENU_TO_SECTION = {
  market: "intelligence",
  results: "results",
  data: "library",
};

test("every global's tool menu lists only views that global owns", () => {
  const wrong = [];
  for (const [menu, section] of Object.entries(MENU_TO_SECTION)) {
    for (const item of CONTEXT_NAV[menu]?.items || []) {
      const owner = sectionForView(item.view);
      if (owner !== section) {
        wrong.push(`${item.view} is listed under "${menu}" (${section}) but owned by "${owner}"`);
      }
    }
  }
  assert.deepEqual(wrong, [], `menus disagree with ownership:\n  ${wrong.join("\n  ")}`);
});

test("the collection drawer lists only views the collection owns", () => {
  // This is the one that produced the reported symptom: eight views in this
  // drawer belonged to other globals, so opening any of them from inside a
  // collection threw you out of it.
  const wrong = AREA_VIEWS
    .filter((view) => sectionForView(view) !== "collection")
    .map((view) => `${view} → owned by "${sectionForView(view)}"`);
  assert.deepEqual(wrong, [],
    `the collection drawer claims views it does not own:\n  ${wrong.join("\n  ")}`);
});

test("no view is claimed by two menus at once", () => {
  const seen = new Map();
  const dupes = [];
  const claim = (view, where) => {
    if (seen.has(view)) dupes.push(`${view}: ${seen.get(view)} and ${where}`);
    else seen.set(view, where);
  };
  for (const [menu, nav] of Object.entries(CONTEXT_NAV)) {
    for (const item of nav.items || []) claim(item.view, `CONTEXT_NAV.${menu}`);
  }
  for (const group of COLLECTION_AREAS) {
    for (const item of group.items) claim(item.view, `COLLECTION_AREAS.${group.key}`);
  }
  assert.deepEqual(dupes, [], `a view appears in two menus:\n  ${dupes.join("\n  ")}`);
});

test("nothing became unreachable by clicking", () => {
  // The reason the drawer accumulated foreign views in the first place: this
  // file's own comment warns that a routable view in no menu is unreachable.
  // Removing a view from the wrong menu is only correct if it is still in the
  // right one.
  const reachable = new Set([
    ...GLOBAL_NAV.map((g) => g.view),
    ...Object.values(CONTEXT_NAV).flatMap((n) => (n.items || []).map((i) => i.view)),
    ...AREA_VIEWS,
  ]);
  for (const view of ["library", "catalog", "materials", "decisions",
                      "launchresults", "trends", "competitors", "products",
                      "dashboard"]) {
    assert.ok(reachable.has(view), `${view} is routable but in no menu`);
  }
});
