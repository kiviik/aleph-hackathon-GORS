import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WEIGHTS, firstCapsuleCombos, sampleCombos } from "@/lib/explore";

const selection = {
  siluetas: Array.from({ length: 5 }, (_, i) => ({
    name: `silhouette-${i + 1}`,
    source: "dirección",
  })),
  tejidos: Array.from({ length: 2 }, (_, i) => ({
    id: `fabric-${i + 1}`,
    name: `fabric-${i + 1}`,
    source: "dirección",
  })),
  colores: Array.from({ length: 6 }, (_, i) => ({
    hex: `#00000${i}`,
    name: `colour-${i + 1}`,
    source: "dirección",
  })),
  detalles: [],
  fits: [],
};

test("ordinary exploration still respects the designer's weighting controls", () => {
  const combos = sampleCombos(selection, 4, DEFAULT_WEIGHTS);
  assert.equal(new Set(combos.map((c) => c.silueta.name)).size, 3);
  assert.equal(new Set(combos.map((c) => c.tejido.id)).size, 1);
});

test("a first capsule covers Direction breadth before repeating", () => {
  const combos = firstCapsuleCombos(selection, 4, DEFAULT_WEIGHTS);
  assert.equal(combos.length, 4);
  assert.equal(new Set(combos.map((c) => c.silueta.name)).size, 4);
  assert.equal(new Set(combos.map((c) => c.tejido.id)).size, 2);
  assert.equal(new Set(combos.map((c) => c.color.hex)).size, 4);
});
