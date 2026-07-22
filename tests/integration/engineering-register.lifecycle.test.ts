import assert from "node:assert/strict";
import test from "node:test";
import { EngineeringRegisterService, InMemoryFoundationStore } from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T20:00:00.000Z");
const projectId = "engineering-project";
function access(userId: string, permissions: readonly string[], qualifications: readonly string[] = []) {
  return { context: context(userId, "step-up", qualifications), assignments: [assignment(`${userId}-engineering`, userId, permissions, scope(projectId))] };
}

test("FR-ENG-001-006: multidisciplinary register revisions validate scope, preserve lineage, and require independent approval", async () => {
  const store = new InMemoryFoundationStore(); const service = new EngineeringRegisterService(store, () => now, sequentialIds("engineering"));
  await store.transaction((transaction) => {
    transaction.insertProject({ id: projectId, businessScopeOrganizationId: "org-epv", number: "ENG-001", name: "Engineering register pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", readiness: completeReadiness,
      version: 2, createdAt: now, createdBy: "fixture", updatedAt: now, updatedBy: "fixture" });
    transaction.insertProjectOrganization({ id: "eng-org", projectId, organizationId: "org-epv", participationRole: "business_scope", state: "active", version: 1, createdAt: now, createdBy: "fixture" });
    transaction.insertProjectStructure({ id: "eng-system", projectId, type: "system", parentId: null, code: "SYS-01", name: "Process system", state: "active", version: 1, createdAt: now, createdBy: "fixture" });
  });
  const author = access("engineering-author", ["engineering.register.manage", "engineering.register.submit"]);
  const base = { revision: "0", parentRevisionId: null, revisionReason: "Initial controlled register identity.", disciplineCode: "MECH",
    areaCode: null, workPackageCode: null, responsibleOrganizationId: "org-epv", documentRevisionIds: [], relatedItemRevisionIds: [],
    attributes: {}, plannedIssueDate: null, forecastIssueDate: null, actualIssueDate: null } as const;
  let system = await service.create(author.context, author.assignments, projectId, { ...base, registerType: "system", tag: "SYS-01", title: "Process system", systemCode: null });
  assert.deepEqual(system.validationFindings, []); system = await service.submit(author.context, author.assignments, system.id, system.version);
  const selfAuthority = access("engineering-author", ["engineering.register.approve"], ["engineering_authority"]);
  await assert.rejects(service.review(selfAuthority.context, selfAuthority.assignments, system.id, system.version, "approve", "Self approval."),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty");
  const authority = access("engineering-authority", ["engineering.register.approve"], ["engineering_authority"]);
  system = await service.review(authority.context, authority.assignments, system.id, system.version, "approve", "Identity and scope independently verified.");
  let equipment = await service.create(author.context, author.assignments, projectId, { ...base, registerType: "equipment", tag: "P-101", title: "Transfer pump",
    systemCode: "SYS-01", relatedItemRevisionIds: [system.id], attributes: { service: "Transfer" } });
  assert.deepEqual(equipment.validationFindings, []); equipment = await service.submit(author.context, author.assignments, equipment.id, equipment.version);
  equipment = await service.review(authority.context, authority.assignments, equipment.id, equipment.version, "approve", "Equipment scope independently verified.");
  const invalid = await service.create(author.context, author.assignments, projectId, { ...base, registerType: "line", tag: "L-100", title: "Invalid line", systemCode: "MISSING" });
  assert.deepEqual(invalid.validationFindings.map((finding) => finding.code), ["system_scope_invalid"]);
  await assert.rejects(service.submit(author.context, author.assignments, invalid.id, invalid.version), (error: unknown) => error instanceof Error && "details" in error);
  let successor = await service.create(author.context, author.assignments, projectId, { ...base, registerType: "equipment", tag: "P-101", revision: "1",
    parentRevisionId: equipment.id, revisionReason: "Controlled service update.", title: "Transfer pump revised", systemCode: "SYS-01", relatedItemRevisionIds: [system.id] });
  successor = await service.submit(author.context, author.assignments, successor.id, successor.version);
  successor = await service.review(authority.context, authority.assignments, successor.id, successor.version, "approve", "Successor independently verified.");
  const snapshot = await service.snapshot(access("engineering-reader", ["engineering.register.read"]).context,
    access("engineering-reader", ["engineering.register.read"]).assignments, projectId);
  assert.equal(snapshot.items.find((item) => item.id === equipment.id)?.state, "superseded");
  assert.equal(snapshot.items.find((item) => item.id === successor.id)?.parentRevisionId, equipment.id);
  assert.equal(snapshot.counts.equipment, 1); assert.equal(snapshot.openValidationFindingCount, 1);
  const audits = await store.transaction((transaction) => transaction.auditForProject(projectId));
  assert.equal(audits.some((item) => item.action === "engineering.register_item_approved"), true);
});
