import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DevelopmentAuthenticator, FoundationService, InMemoryFoundationStore, OperationalService, PlatformService, buildServer,
} from "@eiep/api";
import { LocalFilesystemObjectStorage } from "@eiep/document-processing";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const headers = {
  "x-eiep-user-id": "file-uploader",
  "x-eiep-organization-id": "org-epv",
  "x-eiep-assurance": "mfa",
  "x-eiep-retention-class": "quality-record",
  "x-idempotency-key": "upload-request-0001",
};

function multipart(boundary: string, content: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="inspection.pdf"\r\n`
      + "Content-Type: application/pdf\r\n\r\n", "utf8"),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
}

test("MVP upload / NFR-SEC-005: authenticated multipart bytes enter only the private staged boundary and retry exactly", async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), "eiep-upload-test-"));
  t.after(() => rm(storageRoot, { recursive: true, force: true }));
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("upload");
  const service = new FoundationService(store, () => new Date("2026-07-21T12:00:00.000Z"), ids);
  const operations = new OperationalService(store, () => new Date("2026-07-21T12:00:00.000Z"), ids);
  const creator = context("project-creator", "mfa");
  const project = await service.createProject(
    creator,
    [assignment("project-create", creator.userId, ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "UPLOAD-001", name: "Governed upload",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  store.seedAssignments([
    assignment("file-upload", "file-uploader", ["file.upload"], scope(project.id)),
    assignment("commercial-file-upload", "commercial-uploader", ["file.upload", "file.read"], scope()),
  ]);
  const stagedUpload = new LocalFilesystemObjectStorage(storageRoot);
  const platform = new PlatformService(store, () => new Date("2026-07-21T12:00:00.000Z"), ids);
  const server = await buildServer({
    service, operations, platform, store, stagedUpload, authenticator: new DevelopmentAuthenticator(),
    environment: "test", trainingBanner: false,
  });
  t.after(() => server.close());

  const boundary = "eiep-controlled-upload-boundary";
  const content = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF", "utf8");
  const payload = multipart(boundary, content);
  const upload = () => server.inject({
    method: "POST", url: `/v1/projects/${project.id}/file-uploads`,
    headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` }, payload,
  });
  const created = await upload();
  assert.equal(created.statusCode, 201, created.body);
  const file = created.json() as { id: string; storageKey: string; sha256: string; validationState: string };
  assert.equal(file.validationState, "staged");
  assert.deepEqual(Buffer.from(await stagedUpload.readStaged(file.storageKey, 1024)), content);

  const retried = await upload();
  assert.equal(retried.statusCode, 201, retried.body);
  assert.equal(retried.json().id, file.id);
  const work = await store.transaction((transaction) => transaction.integrationMessagesForWork(100));
  assert.equal(work.filter((message) => message.interfaceCode === "document-processing.worker").length, 1);

  const conflicting = await server.inject({
    method: "POST", url: `/v1/projects/${project.id}/file-uploads`,
    headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: multipart(boundary, Buffer.from("%PDF-1.7\nconflicting retry\n%%EOF", "utf8")),
  });
  assert.equal(conflicting.statusCode, 409, conflicting.body);

  const denied = await server.inject({
    method: "POST", url: `/v1/projects/${project.id}/file-uploads`,
    headers: {
      ...headers, "x-eiep-user-id": "unassigned-user", "x-idempotency-key": "upload-request-denied",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(store.snapshot().governedFiles.size, 1);

  const quoteContent = Buffer.from("%PDF-1.7\ncommercial quote\n%%EOF", "utf8");
  const organizationUpload = await server.inject({
    method: "POST", url: "/v1/organizations/org-epv/file-uploads",
    headers: {
      ...headers, "x-eiep-user-id": "commercial-uploader", "x-idempotency-key": "commercial-quote-upload-0001",
      "x-eiep-retention-class": "commercial-quote", "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipart(boundary, quoteContent),
  });
  assert.equal(organizationUpload.statusCode, 201, organizationUpload.body);
  const organizationFile = organizationUpload.json() as {
    id: string; businessScopeOrganizationId: string; projectId: null; storageKey: string; sha256: string; version: number;
  };
  assert.equal(organizationFile.businessScopeOrganizationId, "org-epv");
  assert.equal(organizationFile.projectId, null);
  assert.match(organizationFile.storageKey, /^organizations\/org-epv\//u);
  assert.deepEqual(Buffer.from(await stagedUpload.readStaged(organizationFile.storageKey, 1024)), quoteContent);

  const validated = await platform.validateFile(
    context("commercial-validator", "mfa", ["file_validation_worker"]),
    [assignment("commercial-validation", "commercial-validator", ["file.validate"], scope())],
    organizationFile.id, organizationFile.version,
    {
      detectedMediaType: "application/pdf", detectedSha256: organizationFile.sha256, malwareState: "clean",
      validatorVersion: "controlled-test-validator-1", activeContentDetected: false, encryptedArchiveDetected: false,
    },
  );
  const released = await platform.releaseFile(
    context("commercial-release-authority", "step-up", ["file_release_authority"]),
    [assignment("commercial-release", "commercial-release-authority", ["file.release"], scope())],
    organizationFile.id, validated.version,
  );
  assert.equal(released.validationState, "released");
  assert.equal(released.projectId, null);
  assert.equal(store.snapshot().governedFiles.size, 2);

  const crossOrganizationUpload = await server.inject({
    method: "POST", url: "/v1/organizations/org-other/file-uploads",
    headers: {
      ...headers, "x-eiep-user-id": "commercial-uploader", "x-idempotency-key": "commercial-quote-upload-0002",
      "x-eiep-retention-class": "commercial-quote", "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipart(boundary, quoteContent),
  });
  assert.equal(crossOrganizationUpload.statusCode, 403, crossOrganizationUpload.body);
});
