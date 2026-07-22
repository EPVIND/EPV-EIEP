import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
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
const acceptanceText = await readFile(
  join(root, "docs", "01-requirements", "ACCEPTANCE_CRITERIA.md"),
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

if (controlledSet.size !== 99) failures.push(`expected 99 controlled requirements, found ${controlledSet.size}`);
if (mappedSet.size !== 99) failures.push(`expected 99 mapped requirements, found ${mappedSet.size}`);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function requirementReferences(title) {
  const references = [];
  const pattern = /\b((?:FR|NFR)-[A-Z]+-)(\d{3})(?:-(\d{3}))?\b/gu;
  for (const match of title.matchAll(pattern)) {
    const prefix = match[1];
    const first = Number(match[2]);
    const last = match[3] ? Number(match[3]) : first;
    if (last < first || last - first > 50) {
      failures.push(`invalid requirement range ${match[0]} in test title ${JSON.stringify(title)}`);
      continue;
    }
    for (let number = first; number <= last; number += 1) {
      references.push(`${prefix}${String(number).padStart(3, "0")}`);
    }
  }
  return references;
}

const testCoverage = new Map([...controlledSet].map((requirement) => [requirement, new Set()]));
const testFiles = (await filesBelow(join(root, "tests"))).filter((path) => path.endsWith(".ts"));
for (const testFile of testFiles) {
  const testText = await readFile(testFile, "utf8");
  for (const line of testText.split(/\r?\n/u)) {
    const title = line.match(/\btest\(\s*"([^"]+)"/u)?.[1]
      ?? line.match(/\btest\(\s*'([^']+)'/u)?.[1]
      ?? line.match(/\btest\(\s*`([^`]+)`/u)?.[1];
    if (!title) continue;
    for (const requirement of requirementReferences(title)) {
      if (!controlledSet.has(requirement)) {
        failures.push(`${testFile.slice(root.length + 1)} references uncontrolled requirement ${requirement}`);
      } else {
        testCoverage.get(requirement).add(testFile.slice(root.length + 1).replaceAll("\\", "/"));
      }
    }
  }
}
for (const [requirement, files] of testCoverage) {
  if (files.size === 0) failures.push(`no executable test title references ${requirement}`);
}

const acceptance = new Set([...acceptanceText.matchAll(/^## (AC-\d{2})\b/gmu)].map((match) => match[1]));
const mappedAcceptance = new Set();
let evidencePathCount = 0;
for (const line of matrixText.split(/\r?\n/u)) {
  if (!/^\| (?:FR|NFR)-[A-Z]+-\d{3} \|/u.test(line)) continue;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  const [requirement, , evidence, acceptanceCell] = cells;
  const acceptanceReferences = [...acceptanceCell.matchAll(/\bAC-\d{2}\b/gu)].map((match) => match[0]);
  if (acceptanceReferences.length === 0) failures.push(`matrix row ${requirement} has no acceptance criterion`);
  for (const criterion of acceptanceReferences) {
    if (!acceptance.has(criterion)) failures.push(`matrix row ${requirement} references unknown ${criterion}`);
    else mappedAcceptance.add(criterion);
  }

  const evidencePaths = [...evidence.matchAll(/`([^`]+)`/gu)]
    .map((match) => match[1])
    .filter((path) => path.includes("/") || path.startsWith("."));
  if (evidencePaths.length === 0) failures.push(`matrix row ${requirement} has no repository evidence path`);
  let directlyCovered = false;
  for (const evidencePath of evidencePaths) {
    evidencePathCount += 1;
    const absolute = resolve(root, evidencePath);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
      failures.push(`matrix row ${requirement} evidence escapes the repository: ${evidencePath}`);
      continue;
    }
    try {
      if (!(await stat(absolute)).isFile()) failures.push(`matrix row ${requirement} evidence is not a file: ${evidencePath}`);
    } catch {
      failures.push(`matrix row ${requirement} evidence does not exist: ${evidencePath}`);
    }
    if (testCoverage.get(requirement)?.has(evidencePath)) directlyCovered = true;
  }
  if (!directlyCovered) {
    failures.push(`matrix row ${requirement} cites no test whose title directly covers that requirement`);
  }
}
for (const criterion of acceptance) {
  if (!mappedAcceptance.has(criterion)) failures.push(`acceptance criterion ${criterion} has no requirement mapping`);
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`traceability failure: ${failure}\n`);
  process.exitCode = 1;
} else {
  const functional = [...controlledSet].filter((id) => id.startsWith("FR-")).length;
  const nonfunctional = [...controlledSet].filter((id) => id.startsWith("NFR-")).length;
  process.stdout.write(`traceability checks passed (${functional} functional, ${nonfunctional} nonfunctional; ${evidencePathCount} evidence paths verified)\n`);
}
