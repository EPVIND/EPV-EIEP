import assert from "node:assert/strict";
import test from "node:test";
import { projectReadinessBlockers } from "@eiep/rules-engine";
import { completeReadiness } from "../helpers/foundation-fixture.js";

test("FR-PRJ-001 / AC-04: a complete project readiness context has no blocker", () => {
  assert.deepEqual(projectReadinessBlockers(completeReadiness), []);
});

test("FR-PRJ-003 / AC-04: missing authorities, boundary, requirements, and turnover block activation", () => {
  const blockers = projectReadinessBlockers({
    ...completeReadiness,
    qualityAuthorityAssigned: false,
    completionBoundaryCount: 0,
    approvedRequirementReferenceCount: 0,
    turnoverBaselineConfigured: false,
    blockingExceptionCount: 1,
  });
  assert.deepEqual(blockers, [
    "quality_authority_required",
    "completion_boundary_required",
    "approved_requirement_reference_required",
    "turnover_baseline_required",
    "blocking_exception_open",
  ]);
});

