// Manual field edits and the provenance they may claim.
//
// The engine's contract (tech_packs.py): the only provenance a caller may
// write over HTTP is `human_verified` or `supplier_confirmed`. `imported` and
// `calculated` are 422s on purpose — they are claims about ORIGIN that only
// the assembler can make truthfully, so a person must not be able to launder
// a typed-in number into brand data by re-posting it unchanged. And there is
// NO `human_edited` in the engine's vocabulary at all: an edit over this API
// is necessarily also the editor's attestation.
import assert from "node:assert/strict";
import test from "node:test";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { STOOD_BEHIND, editedFieldPayload, fieldsEditable }
  from "@/lib/techPackFields";

const ROOT = new URL("..", import.meta.url).pathname;

// What the router accepts. Everything else — including the machine origins and
// the tempting-but-nonexistent `human_edited` — it refuses.
const WRITABLE = ["human_verified", "supplier_confirmed"];

test("a manual edit is signed by its editor as human_verified", () => {
  const p = editedFieldPayload("240", "Vicky");
  assert.equal(p.provenance, "human_verified");
  assert.ok(WRITABLE.includes(p.provenance), "the router would 422 anything else");
  assert.ok(STOOD_BEHIND.includes(p.provenance),
    "an edit that nobody stands behind cannot exist over this API");
  assert.equal(p.value, "240");
  assert.match(p.note, /corregido y verificado por Vicky/);
});

test("the payload never invents a provenance the engine does not have", () => {
  // `human_edited` exists nowhere in the engine (its vocabulary is
  // ai_proposed · imported · calculated · human_verified · supplier_confirmed)
  // — putting it on screen would be a word no row backs.
  const p = editedFieldPayload("x", null);
  assert.notEqual(p.provenance, "human_edited");
  assert.notEqual(p.provenance, "imported");
  assert.notEqual(p.provenance, "calculated");
  assert.notEqual(p.provenance, "ai_proposed");
  assert.match(p.note, /el equipo/, "an anonymous edit still names a signer scope");
});

test("released and superseded versions are immutable at the screen too", () => {
  assert.equal(fieldsEditable("draft"), true);
  assert.equal(fieldsEditable("in_review"), true);
  // The engine answers 409 for both; the screen must not offer the round trip
  // as if it might succeed.
  assert.equal(fieldsEditable("released"), false);
  assert.equal(fieldsEditable("superseded"), false);
});

test("no component ever PUTs a machine provenance", async () => {
  // Source rule, same shape as styleHydration's: every `provenance:` literal a
  // component writes must be one the router accepts. A component posting
  // `imported` would be the laundering path the engine 422s — better caught
  // here than as a runtime 422 in a demo.
  async function* walk(dir) {
    let entries;
    try { entries = await readdir(join(ROOT, dir), { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) yield* walk(rel);
      else if (/\.jsx?$/.test(e.name)) yield rel;
    }
  }
  const offenders = [];
  for await (const rel of walk("components")) {
    const src = await readFile(join(ROOT, rel), "utf8");
    for (const m of src.matchAll(/provenance:\s*["']([\w-]+)["']/g)) {
      if (!WRITABLE.includes(m[1])) offenders.push(`${rel}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [],
    `components writing a provenance the router refuses:\n  ${offenders.join("\n  ")}`);
});
