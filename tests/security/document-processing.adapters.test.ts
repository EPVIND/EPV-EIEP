import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileProcessingWorker,
  LocalFilesystemObjectStorage,
  MarkerMalwareScanner,
  validateProcessingRequest,
} from "@eiep/document-processing";

function hash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

test("NFR-SEC-005 / AC-03-09-10: filesystem boundaries and byte-derived validation reject spoofing, active content, malware, oversize, and path escape", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "eiep-object-storage-"));
  try {
    const storage = new LocalFilesystemObjectStorage(temporaryRoot);
    const worker = new FileProcessingWorker(storage, new MarkerMalwareScanner(), "validator-test/1");
    const cleanPdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >>\nendobj\n%%EOF", "latin1");
    await storage.putStaged("project-1/clean.pdf", cleanPdf);
    const clean = await worker.process({
      jobId: "job-clean", fileId: "file-clean", storageKey: "project-1/clean.pdf",
      expectedSha256: hash(cleanPdf), declaredMediaType: "application/pdf", maximumSizeBytes: 1024,
      correlationId: "correlation-clean",
    });
    assert.deepEqual(
      {
        state: clean.state, type: clean.detectedMediaType, digest: clean.detectedSha256,
        malware: clean.malwareState, active: clean.activeContentDetected, reasons: clean.reasonCodes,
      },
      {
        state: "validated", type: "application/pdf", digest: hash(cleanPdf),
        malware: "clean", active: false, reasons: [],
      },
    );
    await storage.release("project-1/clean.pdf");
    assert.deepEqual(await storage.readReleased("project-1/clean.pdf", 1024), cleanPdf);

    const spoofed = Buffer.from('{"projectId":"project-1"}', "utf8");
    await storage.putStaged("project-1/spoofed.png", spoofed);
    const spoofResult = await worker.process({
      jobId: "job-spoof", fileId: "file-spoof", storageKey: "project-1/spoofed.png",
      expectedSha256: hash(spoofed), declaredMediaType: "image/png", maximumSizeBytes: 1024,
      correlationId: "correlation-spoof",
    });
    assert.equal(spoofResult.state, "rejected");
    assert.equal(spoofResult.detectedMediaType, "application/json");
    assert.ok(spoofResult.reasonCodes.includes("media_type_mismatch"));
    await assert.rejects(storage.readStaged("project-1/spoofed.png", 1024));

    const activePdf = Buffer.from("%PDF-1.7\n/JavaScript /JS (unsafe)\n%%EOF", "latin1");
    await storage.putStaged("project-1/active.pdf", activePdf);
    const active = await worker.process({
      jobId: "job-active", fileId: "file-active", storageKey: "project-1/active.pdf",
      expectedSha256: hash(activePdf), declaredMediaType: "application/pdf", maximumSizeBytes: 1024,
      correlationId: "correlation-active",
    });
    assert.equal(active.state, "rejected");
    assert.equal(active.activeContentDetected, true);

    const malicious = Buffer.from('{"note":"EIEP_TEST_MALWARE_MARKER"}', "utf8");
    await storage.putStaged("project-1/malicious.json", malicious);
    const malware = await worker.process({
      jobId: "job-malware", fileId: "file-malware", storageKey: "project-1/malicious.json",
      expectedSha256: hash(malicious), declaredMediaType: "application/json", maximumSizeBytes: 1024,
      correlationId: "correlation-malware",
    });
    assert.equal(malware.state, "quarantined");
    assert.equal(malware.malwareState, "malicious");
    assert.ok(malware.reasonCodes.includes("malware_detected"));

    const oversized = Buffer.alloc(32, 1);
    await storage.putStaged("project-1/oversized.bin", oversized);
    const oversizeResult = await worker.process({
      jobId: "job-oversize", fileId: "file-oversize", storageKey: "project-1/oversized.bin",
      expectedSha256: hash(oversized), declaredMediaType: "application/pdf", maximumSizeBytes: 16,
      correlationId: "correlation-oversize",
    });
    assert.equal(oversizeResult.state, "rejected");
    assert.deepEqual(oversizeResult.reasonCodes, ["storage_read_or_size_failed"]);
    await assert.rejects(storage.readStaged("project-1/oversized.bin", 1024));

    assert.ok(validateProcessingRequest({
      jobId: "job-path", fileId: "file-path", storageKey: "../outside.pdf",
      expectedSha256: hash(cleanPdf), declaredMediaType: "application/pdf", maximumSizeBytes: 1024,
      correlationId: "correlation-path",
    }).includes("storage_key_invalid"));
    await assert.rejects(storage.putStaged("../outside.pdf", cleanPdf));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
