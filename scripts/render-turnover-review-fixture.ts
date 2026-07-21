import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TurnoverManifestEntry, TurnoverPackageVersionRecord } from "@eiep/shared-types";
import { TurnoverPdfRenderer } from "@eiep/turnover-renderer";

function digest(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

const states = { material: "released", pmi: "accepted", ncr: "closed", punch: "closed", document_revision: "released" } as const;
const types = Object.keys(states) as Array<keyof typeof states>;
const manifest: TurnoverManifestEntry[] = Array.from({ length: 72 }, (_, index) => {
  const sourceType = types[index % types.length]!;
  const sourceId = `${sourceType.replaceAll("_", "-")}-${String(index + 1).padStart(4, "0")}`;
  const sourceVersion = 1 + (index % 3);
  const sourceState = states[sourceType];
  const canonicalJson = JSON.stringify({
    id: sourceId, version: sourceVersion, state: sourceState,
    controlledReference: `EIEP-${String(index + 1).padStart(5, "0")}`,
    note: "Synthetic local review fixture; contains no customer or production data.",
  });
  return {
    sourceType, sourceId, sourceVersion, sourceState,
    inclusionReason: `accepted_${sourceType}_fixture`,
    filename: `${sourceType}-${sourceId}-v${sourceVersion}.json`,
    sizeBytes: Buffer.byteLength(canonicalJson), canonicalJson, canonicalSha256: digest(canonicalJson),
  };
});
const version: TurnoverPackageVersionRecord = {
  id: "review-package-version-0003", packageId: "review-turnover-package-0001", projectId: "review-project-0001",
  versionNumber: 3, recipientScope: "controlled-local-review", generatedAt: new Date("2026-07-21T18:30:00.000Z"),
  generatedBy: "local-acceptance-fixture", manifest, manifestSha256: digest(JSON.stringify(manifest)),
};
const artifacts = await new TurnoverPdfRenderer().render({
  version, projectNumber: "REVIEW-001", projectName: "Synthetic Acceptance Project",
  packageCode: "TOV-REVIEW-001", boundaryCode: "SYS-REVIEW", boundaryName: "Synthetic Process System",
});
const output = resolve("output/pdf");
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(resolve(output, "turnover-package-review.pdf"), artifacts.pdf),
  writeFile(resolve(output, "turnover-package-review.manifest.json"), artifacts.manifestJson),
  writeFile(resolve(output, "turnover-package-review.manifest.csv"), artifacts.manifestCsv),
  writeFile(resolve(output, "turnover-package-review.generation-log.json"), artifacts.generationLogJson),
]);
process.stdout.write(`${JSON.stringify({ output, hashes: artifacts.hashes, entries: manifest.length })}\n`);
