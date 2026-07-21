import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { TurnoverManifestEntry, TurnoverPackageVersionRecord } from "@eiep/shared-types";
import { TurnoverPdfRenderer, turnoverRendererVersion, turnoverTemplateVersion } from "@eiep/turnover-renderer";
import { PDFDocument } from "pdf-lib";

function digest(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function entry(
  sourceType: TurnoverManifestEntry["sourceType"],
  sourceId: string,
  sourceVersion: number,
  sourceState: string,
): TurnoverManifestEntry {
  const canonicalJson = JSON.stringify({ sourceType, sourceId, sourceVersion, sourceState, evidence: "controlled" });
  return {
    sourceType, sourceId, sourceVersion, sourceState,
    inclusionReason: sourceType === "material" ? "released_material_traceability" : "accepted_pmi",
    filename: `${sourceType}-${sourceId}-v${sourceVersion}.json`,
    sizeBytes: Buffer.byteLength(canonicalJson), canonicalJson, canonicalSha256: digest(canonicalJson),
  };
}

function version(versionNumber: number, manifest: readonly TurnoverManifestEntry[]): TurnoverPackageVersionRecord {
  return {
    id: `package-version-${versionNumber}`, packageId: "turnover-package-0001", projectId: "project-0001",
    versionNumber, recipientScope: "owner-operator-controlled", generatedAt: new Date("2026-07-21T18:00:00.000Z"),
    generatedBy: "turnover-controller", manifest, manifestSha256: digest(JSON.stringify(manifest)),
  };
}

test("FR-TOV-003, NFR-DAT-001 / AC-09-10: versioned turnover output is searchable, structured, hash-verifiable, and honest about PDF/A", async () => {
  const prior = version(1, [entry("material", "material-0001", 1, "released")]);
  const current = version(2, [
    entry("material", "material-0001", 2, "issued"),
    entry("pmi", "pmi-record-0001", 1, "accepted"),
  ]);
  const artifacts = await new TurnoverPdfRenderer().render({
    version: current, priorVersion: prior, projectNumber: "EIEP-001", projectName: "Controlled Project",
    packageCode: "TOV-SYS-001", boundaryCode: "SYS-001", boundaryName: "Process System",
  });

  assert.equal(Buffer.from(artifacts.pdf.subarray(0, 5)).toString("ascii"), "%PDF-");
  assert.equal(artifacts.hashes.pdfSha256, digest(artifacts.pdf));
  assert.deepEqual(artifacts.delta, {
    added: ["pmi:pmi-record-0001"], removed: [], changed: ["material:material-0001"],
  });
  assert.equal(artifacts.artifactPrefix, "turnover-package-0001/version-0002");
  assert.equal(artifacts.preservationConformance, "not_claimed");
  const manifest = JSON.parse(Buffer.from(artifacts.manifestJson).toString("utf8")) as {
    preservationConformance: string; entries: TurnoverManifestEntry[]; sourceManifestSha256: string;
  };
  assert.equal(manifest.preservationConformance, "not_claimed");
  assert.equal(manifest.sourceManifestSha256, current.manifestSha256);
  assert.equal(manifest.entries[0]?.canonicalJson, current.manifest[0]?.canonicalJson);
  assert.match(Buffer.from(artifacts.manifestCsv).toString("utf8"), /source_type,source_id.*material,material-0001/su);
  assert.equal(JSON.stringify(artifacts).includes("training-demo"), false);

  const pdf = await PDFDocument.load(artifacts.pdf, { updateMetadata: false });
  assert.equal(pdf.getTitle(), "TOV-SYS-001 turnover package version 2");
  assert.match(pdf.getProducer() ?? "", /Skia\/PDF/u);
  assert.equal(pdf.getCreator(), "Chromium");
  assert.ok(Buffer.from(artifacts.generationLogJson).includes(Buffer.from(turnoverRendererVersion)));
  assert.ok(Buffer.from(artifacts.manifestJson).includes(Buffer.from(current.generatedAt.toISOString())));

  const tamperedEntry = { ...current.manifest[0]!, canonicalJson: '{"tampered":true}' };
  const tamperedManifest = [tamperedEntry, current.manifest[1]!];
  await assert.rejects(new TurnoverPdfRenderer().render({
    version: { ...current, manifest: tamperedManifest, manifestSha256: digest(JSON.stringify(tamperedManifest)) },
    projectNumber: "EIEP-001", projectName: "Controlled Project", packageCode: "TOV-SYS-001",
    boundaryCode: "SYS-001", boundaryName: "Process System",
  }), /snapshot verification/u);
});
