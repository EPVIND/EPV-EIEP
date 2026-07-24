import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = process.cwd();
const destinationArgument = process.argv.indexOf("--output");
const destination = resolve(root, destinationArgument >= 0 && process.argv[destinationArgument + 1]
  ? process.argv[destinationArgument + 1]
  : "artifacts/sbom.cdx.json");
let packageManagerCli = process.env.npm_execpath;
if (!packageManagerCli) {
  const bundledCandidate = resolve(dirname(process.execPath), "..", "node_modules", "pnpm", "bin", "pnpm.mjs");
  try {
    await access(bundledCandidate);
    packageManagerCli = bundledCandidate;
  } catch {
    // A normal package-manager script supplies npm_execpath; this fallback supports the bundled desktop runtime.
  }
}
if (!packageManagerCli) throw new Error("The pnpm CLI path is unavailable; run the generator through pnpm run sbom:generate.");
const command = process.execPath;
const commandArguments = [packageManagerCli, "list", "--json", "-r", "--prod", "--depth", "Infinity"];
const listing = await execute(command, commandArguments, {
  cwd: root,
  windowsHide: true,
  maxBuffer: 32 * 1024 * 1024,
});
const roots = JSON.parse(listing.stdout);
const workspaceVersions = new Map(roots.map((entry) => [entry.name, entry.version]));
const components = new Map();
const relationships = new Map();

function resolvedVersion(name, value) {
  return typeof value === "string" && value.startsWith("link:")
    ? workspaceVersions.get(name) ?? "0.0.0-workspace"
    : value;
}

function visit(name, node) {
  const version = resolvedVersion(name, node.version ?? "0.0.0");
  const reference = `${name}@${version}`;
  if (!components.has(reference)) {
    components.set(reference, {
      type: "library",
      "bom-ref": reference,
      name,
      version,
      purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
    });
  }
  const children = [];
  for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
    const childReference = visit(childName, child);
    children.push(childReference);
  }
  relationships.set(reference, [...new Set([...(relationships.get(reference) ?? []), ...children])].sort());
  return reference;
}

const applicationReferences = roots.map((entry) => visit(entry.name, entry));
const lockSha256 = createHash("sha256").update(await readFile(resolve(root, "pnpm-lock.yaml"))).digest("hex");
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: { components: [{ type: "application", name: "eiep-sbom-generator", version: "1" }] },
    component: { type: "application", "bom-ref": "eiep-platform@0.1.0", name: "eiep-platform", version: "0.1.0" },
    properties: [{ name: "eiep:pnpm-lock-sha256", value: lockSha256 }],
  },
  components: [...components.values()].sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"])),
  dependencies: [
    { ref: "eiep-platform@0.1.0", dependsOn: [...new Set(applicationReferences)].sort() },
    ...[...relationships.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([ref, dependsOn]) => ({ ref, dependsOn })),
  ],
};

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(bom, null, 2)}\n`, { flag: "w" });
process.stdout.write(`CycloneDX 1.6 SBOM written with ${bom.components.length} components.\n`);
