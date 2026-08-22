import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonObject } from "../src/json.js";

test("parses plain and fenced JSON", () => {
  assert.deepEqual(parseJsonObject('{"ok":true}'), { ok: true });
  assert.deepEqual(parseJsonObject('```json\n{"ok":true}\n```'), { ok: true });
});

test("rejects non-object JSON", () => {
  assert.throws(() => parseJsonObject("[]"), /must be an object/);
});
