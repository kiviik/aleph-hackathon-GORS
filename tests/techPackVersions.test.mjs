// Version history for tech packs — built only from rows the engine already
// sends, and refusing to let a draft stand in for a released document.
import assert from "node:assert/strict";
import test from "node:test";

import { groupByStyle, historyFor, verifiedCount }
  from "@/lib/techPackVersions";

const pack = (o) => ({ id: `id-${o.style_number}-${o.version}`,
  style_number: "COM-PANT-01", name: "Pantalón", version: 1,
  status: "draft", fields: {}, created_at: "2026-08-01T00:00:00", ...o });

test("the same style's versions become ONE entry, not N rows", () => {
  // The defect: `GET /tech-packs` returns every version, and rendering it flat
  // showed the same garment twice with nothing saying they were related.
  const groups = groupByStyle([
    pack({ version: 2, status: "draft" }),
    pack({ version: 1, status: "released" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].style_number, "COM-PANT-01");
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].versions.map((v) => v.version), [2, 1]);
});

test("the released version is READ, never inferred from the highest number", () => {
  // A draft v2 above a released v1 is the normal revision state. If the screen
  // took "newest" to mean "released", it would show a factory a document
  // nobody signed off.
  const [g] = groupByStyle([
    pack({ version: 2, status: "draft" }),
    pack({ version: 1, status: "released" }),
  ]);
  assert.equal(g.latest.version, 2);
  assert.equal(g.released.version, 1);
  assert.equal(g.hasRelease, true);
  assert.equal(g.revisionInFlight, true);
});

test("a style with no released version says so rather than promoting a draft", () => {
  const [g] = groupByStyle([pack({ version: 1, status: "draft" })]);
  assert.equal(g.released, null);
  assert.equal(g.hasRelease, false);
  assert.equal(g.revisionInFlight, false, "no release means nothing is being revised");
});

test("a settled style has a release and nothing in flight", () => {
  const [g] = groupByStyle([pack({ version: 1, status: "released" })]);
  assert.equal(g.revisionInFlight, false);
  assert.equal(g.hasRelease, true);
});

test("styles needing attention sort first", () => {
  // In flight → never released → settled. A merchandiser opening this list is
  // looking for what is unresolved.
  const groups = groupByStyle([
    pack({ style_number: "SETTLED", version: 1, status: "released" }),
    pack({ style_number: "INFLIGHT", version: 2, status: "draft" }),
    pack({ style_number: "INFLIGHT", version: 1, status: "released" }),
    pack({ style_number: "NEVER", version: 1, status: "draft" }),
  ]);
  assert.deepEqual(groups.map((g) => g.style_number),
                   ["INFLIGHT", "NEVER", "SETTLED"]);
});

test("a later version with no name does not blank the name", () => {
  const [g] = groupByStyle([
    pack({ version: 2, name: "" }),
    pack({ version: 1, name: "Pantalón sastrero" }),
  ]);
  assert.equal(g.name, "Pantalón sastrero");
});

test("rows without a style number are dropped, not grouped under undefined", () => {
  const groups = groupByStyle([pack({}), { id: "x" }, null]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].style_number, "COM-PANT-01");
});

test("history is one style's versions, newest first", () => {
  const all = [
    pack({ version: 1 }), pack({ version: 2 }),
    pack({ style_number: "OTHER", version: 1 }),
  ];
  assert.deepEqual(historyFor(all, "COM-PANT-01").map((v) => v.version), [2, 1]);
  assert.deepEqual(historyFor(all, "MISSING"), []);
  assert.deepEqual(historyFor(all, undefined), []);
});

test("only human_verified and supplier_confirmed count as verified", () => {
  // The product's spine: a machine proposing a value is not a person
  // standing behind it, and an imported value is an origin claim, not a check.
  const p = pack({ fields: {
    a: { provenance: "human_verified" },
    b: { provenance: "supplier_confirmed" },
    c: { provenance: "ai_proposed" },
    d: { provenance: "imported" },
    e: { provenance: "calculated" },
    f: {},
  } });
  assert.equal(verifiedCount(p), 2);
  assert.equal(verifiedCount({}), 0);
  assert.equal(verifiedCount(null), 0);
});
