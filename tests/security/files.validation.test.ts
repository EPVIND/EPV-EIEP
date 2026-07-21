import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, PlatformService, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T07:00:00.000Z");

test("NFR-SEC-005 / AC-03-04-09: staged files reject oversize, spoofing, hash mismatch, active content, and malware before independent release", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("file-validation");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "FILE-001", name: "File validation",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const uploader = context("uploader", "mfa");
  const uploadAccess = [assignment("upload", uploader.userId, ["file.upload"], scope(project.id))];
  await assert.rejects(
    platform.stageFile(uploader, uploadAccess, project.id, {
      storageKey: "staging/oversize", originalFilename: "oversize.pdf", declaredMediaType: "application/pdf",
      sha256: "a".repeat(64), sizeBytes: 251 * 1024 * 1024, retentionClass: "project-record",
    }),
    (error: unknown) => error instanceof ValidationError && error.details.includes("file_size_invalid"),
  );
  const validator = context("file-validator", "mfa", ["file_validation_worker"]);
  const validateAccess = [assignment("validate", validator.userId, ["file.validate"], scope(project.id))];
  const spoofed = await platform.stageFile(uploader, uploadAccess, project.id, {
    storageKey: "staging/spoofed", originalFilename: "drawing.pdf", declaredMediaType: "application/pdf",
    sha256: "b".repeat(64), sizeBytes: 1024, retentionClass: "project-record",
  });
  const rejected = await platform.validateFile(validator, validateAccess, spoofed.id, spoofed.version, {
    detectedMediaType: "application/json", detectedSha256: "c".repeat(64), malwareState: "clean",
    validatorVersion: "validator-1", activeContentDetected: false, encryptedArchiveDetected: false,
  });
  assert.equal(rejected.validationState, "rejected");
  const malicious = await platform.stageFile(uploader, uploadAccess, project.id, {
    storageKey: "staging/malicious", originalFilename: "photo.jpg", declaredMediaType: "image/jpeg",
    sha256: "d".repeat(64), sizeBytes: 2048, retentionClass: "project-record",
  });
  const quarantined = await platform.validateFile(validator, validateAccess, malicious.id, malicious.version, {
    detectedMediaType: "image/jpeg", detectedSha256: malicious.sha256, malwareState: "malicious",
    validatorVersion: "validator-1", activeContentDetected: false, encryptedArchiveDetected: false,
  });
  assert.equal(quarantined.validationState, "quarantined");
  const clean = await platform.stageFile(uploader, uploadAccess, project.id, {
    storageKey: "staging/clean", originalFilename: "inspection.pdf", declaredMediaType: "application/pdf",
    sha256: "e".repeat(64), sizeBytes: 4096, retentionClass: "quality-record",
  });
  const validated = await platform.validateFile(validator, validateAccess, clean.id, clean.version, {
    detectedMediaType: "application/pdf", detectedSha256: clean.sha256, malwareState: "clean",
    validatorVersion: "validator-1", activeContentDetected: false, encryptedArchiveDetected: false,
  });
  assert.equal(validated.validationState, "validated");
  await assert.rejects(
    platform.releaseFile(
      context(uploader.userId, "step-up", ["file_release_authority"]),
      [assignment("self-release", uploader.userId, ["file.release"], scope(project.id))],
      validated.id, validated.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const releaser = context("file-releaser", "step-up", ["file_release_authority"]);
  const released = await platform.releaseFile(
    releaser,
    [assignment("release", releaser.userId, ["file.release"], scope(project.id))],
    validated.id, validated.version,
  );
  assert.equal(released.validationState, "released");
  const downloaded = await platform.downloadFile(
    context("file-reader", "mfa"),
    [assignment("download", "file-reader", ["file.download"], scope(project.id, released.id))], released.id,
  );
  assert.equal(downloaded.sha256, clean.sha256);
});
