import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryFoundationStore, PlatformService } from "@eiep/api";

test("NFR-OFF-001 / AC-10: field operations have fail-safe connectivity classifications", () => {
  const platform = new PlatformService(new InMemoryFoundationStore());
  assert.deepEqual(platform.connectivityPolicy("document.read_assigned"), {
    operation: "document.read_assigned", classification: "read_only_cache", authoritativeClaimAllowedOffline: false,
    rationale: "Only explicitly assigned exact revisions may be cached with expiry and an offline warning.",
  });
  assert.equal(platform.connectivityPolicy("punch.draft.capture").classification, "queued_draft");
  for (const operation of [
    "project.activate", "access.assignment.manage", "document.current_for_work", "document.release", "document.approve",
    "inspection.accept", "material.release", "material.issue", "ncr.disposition.approve", "ncr.close", "turnover.generate",
  ]) {
    const policy = platform.connectivityPolicy(operation);
    assert.equal(policy.classification, "online_required", operation);
    assert.equal(policy.authoritativeClaimAllowedOffline, false, operation);
  }
  const unknown = platform.connectivityPolicy("future.authoritative.operation");
  assert.equal(unknown.classification, "online_required");
  assert.match(unknown.rationale, /fail safe/u);
});
