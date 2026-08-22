// Brand-switch isolation, enforced as a repo invariant (owner audit P0, 2026-07-24).
//
// Two effects read `brandId` inside an empty dependency list, so switching brand
// left the previous tenant's data on screen — and BrandDNA's `persist` would then
// write that stale state into the NEW brand's bucket. The scoping rule was right;
// the React wiring silently defeated it.
//
// A unit test on the storage layer cannot catch this: the bug is a stale
// closure, not a wrong key. There is no component-test harness in this repo
// (every existing test is node --test over pure modules), so rather than
// pretend, this asserts the invariant directly against the source: an effect or
// callback that READS a brand identifier must DECLARE it.
//
// It is a lint rule in test form, and it fails on the exact code that shipped
// the bug. If a component-test harness lands later, replace this with a real
// mount-and-switch test — this is the honest tool available today, not the ideal.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function jsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsxFiles(full));
    else if (entry.endsWith(".jsx")) out.push(full);
  }
  return out;
}

// useEffect(() => { ... }, [deps]) / useCallback(...) — capture body + dep list.
const HOOK = /use(?:Effect|Callback|Memo)\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\}\s*,\s*\[([^\]]*)\]\s*\)/g;

// A read of the active brand. `brandIdRef.current` is deliberately EXCLUDED:
// a ref is the documented way to read a fresh value without re-subscribing.
const READS_BRAND = /(?<!Ref\.current)\b(brandId|engine\.brandId|collectionCtx\.activeId)\b/;

test("an effect that reads the active brand declares it as a dependency", () => {
  const offenders = [];
  for (const file of jsxFiles(path.join(ROOT, "components"))) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(HOOK)) {
      const [, body, deps] = match;
      if (body.includes("Ref.current")) continue;      // ref-based reads are fine
      if (!READS_BRAND.test(body)) continue;
      // Case-insensitive: `engineBrandId` and `collectionCtx.activeId` both count.
      const declared = /brandid|activeid/i.test(deps);
      if (!declared) {
        const line = src.slice(0, match.index).split("\n").length;
        offenders.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }
  }
  assert.deepEqual(
    offenders, [],
    "these read the active brand but do not depend on it, so a brand switch "
    + "leaves the previous tenant's data in state:\n  " + offenders.join("\n  "),
  );
});

test("the keys holding one brand's work are never written globally", () => {
  // Every authoritative key must go through brandStore, which scopes it. A raw
  // localStorage.setItem on one of these is the bug in its other form.
  const AUTHORITATIVE = [
    "ACCEPTED_KEY", "DECISIONS_KEY", "PIPE_KEY", "FABRICS_KEY",
    "STORE_KEY", "PERSONAS_KEY", "DISMISS_KEY",
  ];
  const offenders = [];
  for (const file of jsxFiles(path.join(ROOT, "components"))) {
    const src = readFileSync(file, "utf8");
    for (const key of AUTHORITATIVE) {
      const raw = new RegExp(`localStorage\\.setItem\\(\\s*${key}\\b`);
      if (raw.test(src)) offenders.push(`${path.relative(ROOT, file)} -> ${key}`);
    }
  }
  assert.deepEqual(offenders, [], "write these through writeScoped():\n  " + offenders.join("\n  "));
});
