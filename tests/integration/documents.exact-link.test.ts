import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { FoundationService, InMemoryFoundationStore, NotFoundError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, seedGovernedFile, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T05:00:00.000Z");

test("FR-DOC-003-004 / AC-03-04: exact released revisions are distributed, downloaded, acknowledged, and linked with recipient scope and audit", async () => {
  const store = new InMemoryFoundationStore();
  const service = new FoundationService(store, () => now, sequentialIds("document-distribution"));
  const project = await service.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "DOC-DIST-001", name: "Document distribution",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const controller = context("document-controller", "mfa");
  const document = await service.registerDocument(
    controller,
    [assignment("create-document", controller.userId, ["document.create"], scope(project.id))],
    project.id, { number: "DWG-100", title: "Issued fabrication drawing", type: "drawing", discipline: "mechanical" },
  );
  await seedGovernedFile(store, project.id, "drawing-file-a");
  const submitted = await service.submitDocumentRevision(
    controller,
    [assignment("submit-document", controller.userId, ["document.revision.submit"], scope(project.id, document.id))],
    document.id,
    { revision: "A", purpose: "fabrication", source: "engineering", fileId: "drawing-file-a", requiredApprovalCount: 1 },
  );
  const approver = context("document-approver");
  const approved = await service.approveDocumentRevision(
    approver,
    [assignment("approve-document", approver.userId, ["document.approve"], scope(project.id, document.id))],
    submitted.id, submitted.version, true,
  );
  const released = await service.releaseDocumentRevision(
    context("document-releaser"),
    [assignment("release-document", "document-releaser", ["document.release"], scope(project.id, document.id))],
    approved.id, approved.version, document.version,
  );
  const distribution = await service.distributeDocumentRevision(
    controller,
    [assignment("distribute-document", controller.userId, ["document.distribute"], scope(project.id))],
    released.id,
    {
      recipientOrganizationId: "org-fabricator", recipientUserId: "fabricator-user", workPackageId: "WP-FAB-100",
      purpose: "current-for-fabrication", acknowledgementRequired: true,
    },
  );
  const recipient = context("fabricator-user", "mfa", [], "org-fabricator");
  const recipientAccess = [assignment(
    "recipient-document", recipient.userId, ["file.download", "document.acknowledge"],
    scope(project.id, null, "org-fabricator", "WP-FAB-100"), {}, "org-fabricator",
  )];
  await assert.rejects(
    service.downloadDistributedDocument(
      context("other-user", "mfa", [], "org-other"),
      [assignment(
        "other-download", "other-user", ["file.download"], scope(project.id, null, "org-other", "WP-FAB-100"), {}, "org-other",
      )],
      distribution.id, distribution.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  const downloaded = await service.downloadDistributedDocument(
    recipient, recipientAccess, distribution.id, distribution.version,
  );
  assert.equal(downloaded.fileId, "drawing-file-a");
  assert.equal(downloaded.revision.id, released.id);
  const acknowledged = await service.acknowledgeDocumentDistribution(
    recipient, recipientAccess, distribution.id, downloaded.distribution.version,
    "Received exact revision A for fabrication use.",
  );
  assert.equal(acknowledged.acknowledgedBy, recipient.userId);
  const link = await service.linkGoverningDocumentRevision(
    controller,
    [assignment("link-document", controller.userId, ["record.governing_document.link"], scope(project.id))],
    project.id,
    { targetType: "material", targetId: "material-100", documentRevisionId: released.id, governingPurpose: "fabrication drawing" },
  );
  await seedGovernedFile(store, project.id, "drawing-file-b");
  const unreleased = await service.submitDocumentRevision(
    controller,
    [assignment("submit-document", controller.userId, ["document.revision.submit"], scope(project.id, document.id))],
    document.id,
    { revision: "B", purpose: "fabrication", source: "engineering", fileId: "drawing-file-b", requiredApprovalCount: 1 },
  );
  await assert.rejects(
    service.linkGoverningDocumentRevision(
      controller,
      [assignment("link-document", controller.userId, ["record.governing_document.link"], scope(project.id))],
      project.id,
      { targetType: "material", targetId: "material-100", documentRevisionId: unreleased.id, governingPurpose: "fabrication drawing" },
    ),
    (error: unknown) => error instanceof NotFoundError,
  );
  const storedLinks = await store.transaction((transaction) =>
    transaction.governingDocumentLinksForTarget(project.id, "material", "material-100"),
  );
  assert.equal(storedLinks.length, 1);
  assert.equal(storedLinks[0]?.id, link.id);
  assert.equal(storedLinks[0]?.documentRevisionId, released.id);
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.ok(audit.some((event) => event.action === "document.distributed"));
  assert.ok(audit.some((event) => event.action === "file.downloaded"));
  assert.ok(audit.some((event) => event.action === "document.acknowledged"));
  assert.ok(audit.some((event) => event.action === "record.governing_document_linked"));
});
