import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outputDirectory = path.join(here, "context");
const files = ["PROJECT-CONTEXT.md", "SESSION-RULES.md", "PROMPT-PREFIX.md"];

await mkdir(outputDirectory, { recursive: true });

const sections = [];
for (const file of files) {
  const content = await readFile(path.join(here, file), "utf8");
  sections.push(`<!-- source: ai-harness/${file} -->\n\n${content.trim()}`);
}

const repositoryNote = `# Generated team context\n\n> Generated locally from the project-scoped AI harness. Do not add secrets or frame contents here.\n> Repository root: ${path.basename(root)}\n\n`;
await writeFile(path.join(outputDirectory, "CONTEXT.md"), `${repositoryNote}${sections.join("\n\n---\n\n")}\n`, "utf8");
console.log(`Wrote ai-harness/context/CONTEXT.md from ${files.length} source files.`);
