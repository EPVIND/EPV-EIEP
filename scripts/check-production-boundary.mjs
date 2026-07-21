import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const activeRoots = ["apps", "services", "packages"];
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".html", ".sql", ".yml", ".yaml"]);
const prohibitedReferences = ["training-demo", "source-intake"];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== "node_modules" && entry.name !== "dist")
      .map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(path) : [path];
      }),
  );
  return nested.flat();
}

const failures = [];
for (const activeRoot of activeRoots) {
  for (const path of await filesUnder(join(root, activeRoot))) {
    if (!textExtensions.has(extname(path))) continue;
    const text = await readFile(path, "utf8");
    for (const prohibited of prohibitedReferences) {
      if (text.includes(prohibited)) failures.push(`${relative(root, path)} references ${prohibited}`);
    }
  }
}

const dockerIgnore = new Set(
  (await readFile(join(root, ".dockerignore"), "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean),
);
for (const required of prohibitedReferences) {
  if (!dockerIgnore.has(required)) failures.push(`.dockerignore does not exclude ${required}`);
}

const expectedEnvironmentRules = {
  development: { allowProductionData: false, trainingBanner: false },
  test: { allowProductionData: false, trainingBanner: false },
  training: { allowProductionData: false, trainingBanner: true },
  production: { allowProductionData: true, trainingBanner: false, allowSyntheticData: false },
};
for (const [name, expected] of Object.entries(expectedEnvironmentRules)) {
  const path = join(root, "config", "environments", `${name}.json`);
  const actual = JSON.parse(await readFile(path, "utf8"));
  if (actual.environment !== name) failures.push(`${name}.json has a mismatched environment name`);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) failures.push(`${name}.json has unsafe ${key}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`boundary failure: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("production boundary checks passed\n");
}

