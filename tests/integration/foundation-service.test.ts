import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, seedAuthoritativeProjectReadiness, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const fixedTime = new Date("2026-07-20T21:00:00.000Z");

test("FR-PRJ-001, FR-PRJ-003, FR-DOC-001-004, FR-AUD-001-003 / AC-03-04: controlled foundation path preserves current revision and audit history", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => fixedTime, sequentialIds());
  const creator = context("creator");
  const project = await service.createProject(
    creator,
    [assignment("create", creator.userId, ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv",
      number: "eiep-001",
      name: "Controlled project",
      customerOrganizationId: "org-customer",
      facilityId: "facility-1",
      timeZone: "America/Denver",
      readiness: completeReadiness,
    },
  );
  assert.equal(project.number, "EIEP-001");
  assert.equal(project.readiness.projectAuthorityAssigned, false);
  await seedAuthoritativeProjectReadiness(store, project.id, fixedTime);

  const activated = await service.activateProject(
    context("project-authority"),
    [assignment("activate", "project-authority", ["project.activate"], scope(project.id))],
    project.id,
    project.version,
  );
  assert.equal(activated.state, "active");
  assert.equal(activated.readiness.projectAuthorityAssigned, true);

  const document = await service.registerDocument(
    context("document-controller"),
    [assignment("document-create", "document-controller", ["document.create"], scope(project.id))],
    project.id,
    { number: "dwg-100", title: "Controlled drawing", type: "drawing", discipline: "general" },
  );

  await seedGovernedFile(store, project.id, "file-a");
  const revisionA = await service.submitDocumentRevision(
    creator,
    [assignment("revision-submit", creator.userId, ["document.revision.submit"], scope(project.id))],
    document.id,
    {
      revision: "A",
      purpose: "Issued for review",
      source: "controlled upload",
      fileId: "file-a",
      requiredApprovalCount: 1,
    },
  );
  const approvedA = await service.approveDocumentRevision(
    context("approver-a"),
    [assignment("approve-a", "approver-a", ["document.approve"], scope(project.id, document.id))],
    revisionA.id,
    revisionA.version,
    true,
  );
  const releasedA = await service.releaseDocumentRevision(
    context("release-controller"),
    [assignment("release-a", "release-controller", ["document.release"], scope(project.id, document.id))],
    approvedA.id,
    approvedA.version,
    document.version,
  );
  assert.equal(releasedA.state, "released");

  await seedGovernedFile(store, project.id, "file-b");
  const revisionB = await service.submitDocumentRevision(
    creator,
    [assignment("revision-submit-b", creator.userId, ["document.revision.submit"], scope(project.id))],
    document.id,
    {
      revision: "B",
      purpose: "Issued for construction",
      source: "controlled upload",
      fileId: "file-b",
      requiredApprovalCount: 1,
    },
  );
  assert.equal(revisionB.supersedesRevisionId, revisionA.id);
  const approvedB = await service.approveDocumentRevision(
    context("approver-b"),
    [assignment("approve-b", "approver-b", ["document.approve"], scope(project.id, document.id))],
    revisionB.id,
    revisionB.version,
    true,
  );
  const releasedB = await service.releaseDocumentRevision(
    context("release-controller"),
    [assignment("release-b", "release-controller", ["document.release"], scope(project.id, document.id))],
    approvedB.id,
    approvedB.version,
    2,
  );

  const current = await service.currentDocumentRevision(
    context("field-reader", "standard"),
    [assignment("current-read", "field-reader", ["document.read_current"], scope(project.id))],
    document.id,
  );
  assert.equal(current?.id, releasedB.id);
  assert.equal(current?.revision, "B");

  const history = await service.auditHistory(
    context("auditor", "mfa"),
    [assignment("audit", "auditor", ["audit.read"], scope(project.id))],
    project.id,
  );
  assert.deepEqual(
    history.map((event) => event.action),
    [
      "project.created",
      "project.activated",
      "document.created",
      "document.revision_submitted",
      "document.revision_approved",
      "document.released",
      "document.revision_submitted",
      "document.revision_approved",
      "document.superseded",
      "document.released",
    ],
  );
  assert.ok(history.every((event) => /^[0-9a-f]{64}$/u.test(event.canonicalSha256)));
});

test("FR-DOC-002 / AC-04: unvalidated governed files cannot enter document review", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => fixedTime, sequentialIds("blocked"));
  const project = await service.createProject(
    context("creator"),
    [assignment("create", "creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv",
      number: "eiep-002",
      name: "Controlled project",
      customerOrganizationId: "org-customer",
      facilityId: "facility-1",
      timeZone: "UTC",
      readiness: completeReadiness,
    },
  );
  const document = await service.registerDocument(
    context("controller"),
    [assignment("doc", "controller", ["document.create"], scope(project.id))],
    project.id,
    { number: "DOC-1", title: "Document", type: "drawing", discipline: "general" },
  );
  await seedGovernedFile(store, project.id, "staged-file", "staged");
  await assert.rejects(
    service.submitDocumentRevision(
      context("author"),
      [assignment("submit", "author", ["document.revision.submit"], scope(project.id))],
      document.id,
      { revision: "0", purpose: "Review", source: "upload", fileId: "staged-file", requiredApprovalCount: 1 },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("file_not_released"),
  );
  const current = await service.currentDocumentRevision(
    context("reader", "standard"),
    [assignment("read", "reader", ["document.read_current"], scope(project.id))],
    document.id,
  );
  assert.equal(current, null);
});

test("FR-IAM-003 / AC-02: a project-scoped document permission cannot cross projects", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => fixedTime, sequentialIds("scope"));
  const project = await service.createProject(
    context("creator"),
    [assignment("create", "creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv",
      number: "eiep-003",
      name: "Controlled project",
      customerOrganizationId: "org-customer",
      facilityId: "facility-1",
      timeZone: "UTC",
      readiness: completeReadiness,
    },
  );
  await assert.rejects(
    service.registerDocument(
      context("limited-user"),
      [assignment("wrong-project", "limited-user", ["document.create"], scope("different-project"))],
      project.id,
      { number: "DOC-2", title: "Document", type: "drawing", discipline: "general" },
    ),
    AuthorizationDeniedError,
  );
});
