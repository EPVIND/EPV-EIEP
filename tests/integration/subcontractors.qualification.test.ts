import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { InMemoryFoundationStore, OperationalService, ValidationError } from "@eiep/api";
import { assignment, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T00:00:00.000Z");

test("FR-SUB-001 / AC-08: organization-linked profiles require independent, evidenced, current scope qualification", async () => {
  const store = new InMemoryFoundationStore();
  const operations = new OperationalService(store, () => now, sequentialIds("subcontractor-qualification"));
  const organizationId = "org-subcontractor-a";
  const profileCreator = context("profile-creator", "mfa");
  const profile = await operations.createSubcontractorProfile(
    profileCreator,
    [assignment("manage-profile", profileCreator.userId, ["subcontractor.profile.manage"], scope(null, null, organizationId))],
    {
      organizationId, legalTaxReference: "controlled-party-reference-001", declaredScopes: ["pipe-fabrication"],
      geography: ["US-CO"], laborModel: "union", lowerTierDisclosureRequired: true,
    },
  );
  const qualificationInput = {
    category: "quality" as const, code: "QUAL-PIPE-001", approvedScopes: ["pipe-fabrication"],
    issuer: "EPV supplier quality", effectiveAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: new Date("2027-07-01T00:00:00.000Z"), evidenceFileId: "qualification-evidence-file",
    exceptionReason: null,
  };
  await assert.rejects(
    operations.verifySubcontractorQualification(
      context(profileCreator.userId, "step-up", ["subcontractor_qualification_authority"]),
      [assignment("self-qualify", profileCreator.userId, ["subcontractor.qualify"], scope(null, profile.id, organizationId))],
      profile.id, profile.version, qualificationInput,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const verifier = context("qualification-authority", "step-up", ["subcontractor_qualification_authority"]);
  const verifyAccess = [assignment(
    "qualify", verifier.userId, ["subcontractor.qualify"], scope(null, profile.id, organizationId),
  )];
  const qualification = await operations.verifySubcontractorQualification(
    verifier, verifyAccess, profile.id, profile.version, qualificationInput,
  );
  assert.equal(qualification.state, "verified");
  assert.equal(qualification.organizationId, organizationId);
  const qualifiedProfile = await store.transaction((transaction) => transaction.subcontractorProfileById(profile.id));
  assert.equal(qualifiedProfile?.qualificationState, "qualified");
  assert.deepEqual(qualifiedProfile?.approvedScopes, ["pipe-fabrication"]);
  assert.equal(qualifiedProfile?.qualificationValidTo?.toISOString(), "2027-07-01T00:00:00.000Z");
  await assert.rejects(
    operations.verifySubcontractorQualification(
      verifier, verifyAccess, profile.id, qualifiedProfile!.version,
      {
        ...qualificationInput, code: "QUAL-EXPIRED", effectiveAt: new Date("2025-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("qualification_validity_invalid"),
  );
});
