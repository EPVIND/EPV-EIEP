import assert from "node:assert/strict";
import test from "node:test";
import { authorize } from "@eiep/rules-engine";
import { assignment, context, scope } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-20T20:00:00.000Z");

test("FR-IAM-002 / NFR-SEC-004 / AC-02: an active permission in project scope allows the action", () => {
  const decision = authorize(
    context("user-1", "mfa"),
    [assignment("a-1", "user-1", ["document.read_current"], scope("project-1"))],
    {
      action: "document.read_current",
      resource: scope("project-1", "document-1"),
      requiredQualifications: [],
      forbiddenActorIds: [],
      minimumAssurance: "standard",
    },
    now,
  );
  assert.deepEqual(decision, { allowed: true, reasonCode: "allowed" });
});

test("FR-IAM-003 / NFR-SEC-004 / AC-02: a different project is denied without disclosing a record", () => {
  const decision = authorize(
    context("user-1", "mfa"),
    [assignment("a-1", "user-1", ["document.read_current"], scope("project-1"))],
    {
      action: "document.read_current",
      resource: scope("project-2", "document-2"),
      requiredQualifications: [],
      forbiddenActorIds: [],
      minimumAssurance: "standard",
    },
    now,
  );
  assert.deepEqual(decision, { allowed: false, reasonCode: "scope_denied" });
});

test("FR-IAM-004 / AC-02: expired and revoked assignments do not authorize", () => {
  const assignments = [
    assignment("expired", "user-1", ["project.read"], scope("project-1"), {
      effectiveTo: new Date("2026-07-19T00:00:00.000Z"),
    }),
    assignment("revoked", "user-1", ["project.read"], scope("project-1"), {
      revokedAt: new Date("2026-07-20T19:00:00.000Z"),
    }),
  ];
  const decision = authorize(
    context("user-1"),
    assignments,
    {
      action: "project.read",
      resource: scope("project-1"),
      requiredQualifications: [],
      forbiddenActorIds: [],
      minimumAssurance: "standard",
    },
    now,
  );
  assert.equal(decision.reasonCode, "no_active_assignment");
});

test("FR-INS-002 / AC-02: qualification, assurance, and separation of duty are enforced before role scope", () => {
  const baseRequest = {
    action: "inspection.accept",
    resource: scope("project-1", "inspection-1"),
    requiredQualifications: ["qc-inspector"],
    forbiddenActorIds: ["creator"],
    minimumAssurance: "step-up" as const,
  };
  const allowedAssignment = assignment("a-1", "creator", ["inspection.accept"], scope("project-1"));
  assert.equal(authorize(context("creator"), [allowedAssignment], baseRequest, now).reasonCode, "separation_of_duty");

  const differentUserAssignment = assignment("a-2", "reviewer", ["inspection.accept"], scope("project-1"));
  assert.equal(authorize(context("reviewer", "mfa"), [differentUserAssignment], baseRequest, now).reasonCode, "assurance_required");
  assert.equal(authorize(context("reviewer", "step-up"), [differentUserAssignment], baseRequest, now).reasonCode, "qualification_required");
});

