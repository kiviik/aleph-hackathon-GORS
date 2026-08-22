import test from "node:test";
import assert from "node:assert/strict";

import {
  linkTrendToItem,
  sameCurrencyPrices,
  scoreProductDna,
  tokenSet,
} from "../lib/trustMatching.mjs";

test("generic fit words cannot create a false trend match", () => {
  const item = {
    title: "Black ballet flat",
    product_type: "shoe",
    tags: ["fit", "fits", "new style"],
  };
  const trends = [{
    name: "Bold Floral Safari",
    summary: "A new fashion style with an easy fit",
  }];

  assert.equal(linkTrendToItem(item, trends), null);
});

test("a distinctive trend-name word can create an explainable match", () => {
  const item = {
    title: "Floral midi dress",
    product_type: "dress",
    tags: ["printed"],
  };
  const trend = {
    name: "Floral Safari",
    summary: "Botanical print dresses",
  };

  const match = linkTrendToItem(item, [trend]);
  assert.equal(match?.trend, trend);
  assert.ok(match?.reasons.includes("floral"));
});

test("generic copy does not inflate textual brand affinity", () => {
  const item = {
    title: "New style",
    product_type: "top",
    tags: ["fit", "fits", "outfit"],
  };
  const dna = {
    aesthetic_keywords: ["regular fit", "fashion style"],
    materials: [],
    silhouettes: [],
    motifs: [],
  };

  assert.deepEqual(scoreProductDna(item, dna), {
    score: 0,
    reasons: [],
    basis: "lexical-unvalidated",
  });
  assert.deepEqual([...tokenSet("fit fits outfit fashion style")], []);
});

test("price context never mixes currencies", () => {
  const item = { currency: "ARS", price: 100 };
  const prices = sameCurrencyPrices(item, [
    item,
    { currency: "USD", price: 5 },
    { currency: "ARS", price: 80 },
    { currency: "ARS", price: 120 },
    { currency: "ARS", price: null },
  ]);

  assert.deepEqual(prices, [80, 100, 120]);
});
