import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requirementsText = [
  await readFile(join(root, "docs", "01-requirements", "FUNCTIONAL_REQUIREMENTS.md"), "utf8"),
  await readFile(join(root, "docs", "01-requirements", "NONFUNCTIONAL_REQUIREMENTS.md"), "utf8"),
].join("\n");
const matrixText = await readFile(
  join(root, "docs", "05-testing", "REQUIREMENTS_TRACEABILITY_MATRIX.md"),
  "utf8",
);

const controlled = [...requirementsText.matchAll(/\*\*((?:FR|NFR)-[A-Z]+-\d{3})\*\*/gu)].map((match) => match[1]);
const mapped = [...matrixText.matchAll(/^\| ((?:FR|NFR)-[A-Z]+-\d{3}) \|/gmu)].map((match) => match[1]);

function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count !== 1).map(([value, count]) => `${value}:${count}`);
}

const controlledSet = new Set(controlled);
const mappedSet = new Set(mapped);
const failures = [];
for (const duplicate of duplicates(controlled)) failures.push(`controlled requirement occurrence ${duplicate}`);
for (const duplicate of duplicates(mapped)) failures.push(`matrix occurrence ${duplicate}`);
for (const requirement of controlledSet) if (!mappedSet.has(requirement)) failures.push(`missing matrix row ${requirement}`);
for (const requirement of mappedSet) if (!controlledSet.has(requirement)) failures.push(`uncontrolled matrix row ${requirement}`);

if (controlledSet.size !== 65) failures.push(`expected 65 controlled requirements, found ${controlledSet.size}`);
if (mappedSet.size !== 65) failures.push(`expected 65 mapped requirements, found ${mappedSet.size}`);

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`traceability failure: ${failure}\n`);
  process.exitCode = 1;
} else {
  const functional = [...controlledSet].filter((id) => id.startsWith("FR-")).length;
  const nonfunctional = [...controlledSet].filter((id) => id.startsWith("NFR-")).length;
  process.stdout.write(`traceability checks passed (${functional} functional, ${nonfunctional} nonfunctional)\n`);
}
