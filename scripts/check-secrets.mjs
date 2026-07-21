import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", "coverage", ".cache", ".tmp"]);
const textExtensions = new Set(["", ".md", ".txt", ".json", ".yaml", ".yml", ".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".sql", ".bicep", ".example"]);
const patterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u },
  {
    name: "literal secret assignment",
    regex: /\b(?:client_secret|password|api_key)\s*[:=]\s*["'][^"'<>$\s{}]{12,}["']/iu,
  },
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !(entry.isDirectory() && ignoredDirectories.has(entry.name)))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(path) : [path];
      }),
  );
  return nested.flat();
}

const failures = [];
for (const path of await filesUnder(root)) {
  if (!textExtensions.has(extname(path))) continue;
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) failures.push(`${relative(root, path)} matches ${pattern.name}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`secret scan failure: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("repository secret pattern checks passed\n");
}
