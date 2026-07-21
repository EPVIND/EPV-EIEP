import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { mobilizedSubcontractorFixture } from "../helpers/subcontractor-fixture.js";

test("FR-SUB-003 / AC-02-08: portal reads and submissions are limited to acting organization, project, and work package", async () => {
  const fixture = await mobilizedSubcontractorFixture("portal-scope", "org-subcontractor-scope");
  const visible = await fixture.operations.portalAssignedWork(fixture.portalContext, fixture.portalAssignments);
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.id, fixture.releasedAssignment.id);
  assert.deepEqual(visible[0]?.workPackageIds, ["portal-scope-WP-1"]);
  await assert.rejects(
    fixture.operations.submitSubcontractorRecord(
      fixture.portalContext, fixture.portalAssignments, fixture.project.id, "portal-scope-WP-OTHER",
      { category: "inspection", title: "Out-of-scope inspection", claimedProgressPercent: null, evidenceFileIds: ["evidence"] },
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  await assert.rejects(
    fixture.operations.submitSubcontractorRecord(
      fixture.portalContext, fixture.portalAssignments, "unassigned-project", "portal-scope-WP-1",
      { category: "turnover", title: "Out-of-scope turnover", claimedProgressPercent: null, evidenceFileIds: ["evidence"] },
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "scope_denied",
  );
  const submission = await fixture.operations.submitSubcontractorRecord(
    fixture.portalContext, fixture.portalAssignments, fixture.project.id, "portal-scope-WP-1",
    { category: "inspection", title: "Assigned weld inspection evidence", claimedProgressPercent: null, evidenceFileIds: ["inspection-evidence"] },
  );
  assert.equal(submission.organizationId, fixture.portalContext.actingOrganizationId);
  assert.equal(submission.state, "submitted");
});
