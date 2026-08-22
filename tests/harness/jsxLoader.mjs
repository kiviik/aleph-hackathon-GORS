// Node module hooks that make `import Component from "@/components/X"` work
// outside Next.js.
//
// Node can run this repo's pure `.mjs` modules unaided, which is why the suite
// stopped there — and why a component that threw on every render still passed
// 59/59. Three things block Node from loading a component: it cannot parse JSX,
// it does not know the `@/` alias that every import in `components/` uses, and
// it will not resolve the extensionless specifiers webpack accepts. All three
// are mechanical, so they are fixed here rather than by adding a second test
// runner with its own config surface.
//
// The alias is READ FROM jsconfig.json, never restated. A harness that keeps
// its own copy of the alias table starts passing on imports the app itself
// cannot resolve, which is worse than having no harness.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { transformSync } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT_URL = pathToFileURL(ROOT).href;

// { "@/*": ["./*"] } -> [{ prefix: "@/", target: "<root>/" }]
const ALIASES = Object.entries(
  JSON.parse(readFileSync(path.join(ROOT, "jsconfig.json"), "utf8"))
    .compilerOptions?.paths || {},
).map(([from, [to]]) => ({
  prefix: from.replace(/\*$/, ""),
  target: path.resolve(ROOT, to.replace(/\*$/, "")),
}));

// Next resolves an extensionless import against this list; so must we, or the
// harness would demand import specifiers the app does not use.
const EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".json"];

function probe(base) {
  for (const candidate of [base, ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => path.join(base, `index${e}`))]) {
    try {
      if (statSync(candidate).isFile()) return pathToFileURL(candidate).href;
    } catch { /* try the next candidate */ }
  }
  return null;
}

function resolveAliased(specifier) {
  const alias = ALIASES.find((a) => specifier.startsWith(a.prefix));
  if (!alias) return null;
  return probe(path.join(alias.target, specifier.slice(alias.prefix.length)));
}

function resolveRelative(specifier, parentURL) {
  if (!specifier.startsWith(".") || !parentURL?.startsWith("file:")) return null;
  return probe(path.resolve(path.dirname(fileURLToPath(parentURL)), specifier));
}

const isSource = (url) =>
  url.startsWith(ROOT_URL) && !url.includes("/node_modules/") && /\.(js|jsx)$/.test(url);

export function resolve(specifier, context, nextResolve) {
  const local = resolveAliased(specifier)
    || resolveRelative(specifier, context.parentURL);
  // This repo has no `"type": "module"`, so Node would sniff every source `.js`
  // file and warn about the reparse. They are all ESM; say so up front.
  if (local) {
    return { url: local, format: isSource(local) ? "module" : undefined, shortCircuit: true };
  }
  const resolved = nextResolve(specifier, context);
  if (isSource(resolved.url)) return { ...resolved, format: "module" };
  return resolved;
}

export function load(url, context, nextLoad) {
  if (!url.endsWith(".jsx")) return nextLoad(url, context);

  const { code } = transformSync(readFileSync(fileURLToPath(url), "utf8"), {
    loader: "jsx",
    format: "esm",
    // The automatic runtime matches Next's default, so a component that never
    // imports React behaves here exactly as it does in the app.
    jsx: "automatic",
    sourcefile: fileURLToPath(url),
    sourcemap: "inline",
  });
  return { format: "module", source: code, shortCircuit: true };
}
