import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const required = [
  "PROJECT-CONTEXT.md",
  "SESSION-RULES.md",
  "PROMPT-PREFIX.md",
  "context/CONTEXT.md",
];
const forbiddenPatterns = [
  /-----BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY-----/i,
  /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*['"]?[^\s'"`]{12,}/i,
  /(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}/,
];

for (const relative of required) {
  const content = await readFile(path.join(here, relative), "utf8");
  if (content.trim().length < 80) throw new Error(`${relative} is unexpectedly short`);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) throw new Error(`${relative} matches secret pattern ${pattern}`);
  }
}

const combined = await readFile(path.join(here, "context/CONTEXT.md"), "utf8");
for (const marker of ["BA Estaciona", "QVAC", "hackaton", "REFUSE"]) {
  if (!combined.includes(marker)) throw new Error(`Generated context is missing: ${marker}`);
}

console.log(`Context verified: ${required.length} files, no secret patterns found.`);
