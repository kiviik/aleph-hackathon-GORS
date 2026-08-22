// Where the engine's source is, when it is here at all.
//
// Four tests in this suite read the ENGINE repo directly — the generation
// vocabulary, the reason codes, the preflight sections, the decision policy —
// because the failure they catch is DRIFT BETWEEN TWO REPOSITORIES, and that
// is invisible to either one alone. A frontend that invents a `role` gets a 422
// in a designer's face days later.
//
// ⚠ THE HONEST PART: on a machine or a CI runner where the engine is not
// checked out beside this tree, those assertions cannot run. They must skip —
// a missing sibling is not a product bug — but a skip that says nothing is how
// a suite reports green while checking less than anybody thinks. So this
// module makes the absence VISIBLE: every guarded test prints why it did not
// run, and CI can count those lines.
//
// `ATELIER_ENGINE_TREE` overrides the location, which is also how the skip path
// itself gets tested.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_TREE = fileURLToPath(
  new URL("../../../atelier/atelier-engine/", import.meta.url));

export const engineTree = () =>
  process.env.ATELIER_ENGINE_TREE
    ? (process.env.ATELIER_ENGINE_TREE.endsWith("/")
        ? process.env.ATELIER_ENGINE_TREE
        : `${process.env.ATELIER_ENGINE_TREE}/`)
    : DEFAULT_TREE;

export const hasEngineTree = () => existsSync(engineTree());

/** Absolute path to a file inside the engine tree, or null when it is absent. */
export function engineFile(relative) {
  const path = `${engineTree()}${relative}`;
  return existsSync(path) ? path : null;
}

/**
 * True when the caller should stop. Prints the reason, so a reader of the CI
 * log can see WHICH cross-repo contract went unchecked instead of counting a
 * silent pass.
 */
export function skipWithoutEngine(what) {
  if (hasEngineTree()) return false;
  console.log(`# SKIPPED cross-repo check (${what}): no engine tree at `
    + `${engineTree()} — this contract was NOT verified in this run`);
  return true;
}
