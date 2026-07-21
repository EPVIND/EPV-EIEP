import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, context, scope } from "../helpers/foundation-fixture.js";
import { mobilizedSubcontractorFixture } from "../helpers/subcontractor-fixture.js";

test("FR-SUB-004 / AC-08: claimed progress remains submitted until a distinct EPV authority accepts it", async () => {
  const fixture = await mobilizedSubcontractorFixture("portal-acceptance", "org-subcontractor-acceptance");
  const submission = await fixture.operations.submitSubcontractorRecord(
    fixture.portalContext, fixture.portalAssignments, fixture.project.id, "portal-acceptance-WP-1",
    { category: "progress", title: "Claimed installed quantity", claimedProgressPercent: 100, evidenceFileIds: ["daily-report"] },
  );
  assert.equal(submission.state, "submitted");
  assert.equal(submission.claimedProgressPercent, 100);
  await assert.rejects(
    fixture.operations.reviewSubcontractorSubmission(
      context(fixture.portalContext.userId, "step-up", ["epv_acceptance_authority"], fixture.portalContext.actingOrganizationId),
      [assignment(
        "external-self-accept", fixture.portalContext.userId, ["epv.accept"],
        scope(fixture.project.id, submission.id, fixture.portalContext.actingOrganizationId), {}, fixture.portalContext.actingOrganizationId,
      )],
      submission.id, submission.version, "accept", "External self-acceptance attempt.",
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError,
  );
  const epvAuthority = context("epv-acceptance-authority", "step-up", ["epv_acceptance_authority"]);
  const accepted = await fixture.operations.reviewSubcontractorSubmission(
    epvAuthority,
    [assignment("epv-accept", epvAuthority.userId, ["epv.accept"], scope(fixture.project.id, submission.id))],
    submission.id, submission.version, "accept", "EPV verified the installed quantity and supporting evidence.",
  );
  assert.equal(accepted.state, "accepted");
  assert.equal(accepted.reviewedBy, epvAuthority.userId);
  assert.match(accepted.acceptanceMeaning ?? "", /EPV verified/u);
});
