import assert from "node:assert/strict";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, PlatformService, ValidationError } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T10:30:00.000Z");

test("NFR-OFF-003 / AC-04-06-10: authoritative release and current-state claims are denied offline and audited", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("offline-denial");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "OFF-002", name: "Offline denial",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  const user = context("field-releaser", "mfa");
  for (const operation of ["material.release", "document.current_for_work", "turnover.generate"]) {
    await assert.rejects(
      platform.assertConnectivity(user, project.id, operation, false),
      (error: unknown) => error instanceof ValidationError
        && error.details.includes("authoritative_state_unavailable_offline"),
    );
  }
  const onlinePolicy = await platform.assertConnectivity(user, project.id, "material.release", true);
  assert.equal(onlinePolicy.classification, "online_required");
  assert.throws(
    () => platform.queueOfflineDraft(
      user,
      [assignment("draft", user.userId, ["offline.draft.create"], scope(project.id))],
      project.id,
      {
        operation: "material.release", payload: { materialId: "material-1" },
        idempotencyKey: "forbidden-release-1", originalAt: now, deviceId: "device-1",
      },
    ),
    (error: unknown) => error instanceof ValidationError && error.details.includes("offline_queue_not_allowed"),
  );
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.deepEqual(
    audit.filter((event) => event.action === "offline.authority_denied").map((event) => event.reason),
    ["material.release", "document.current_for_work", "turnover.generate"],
  );
  assert.ok(audit.filter((event) => event.action === "offline.authority_denied")
    .every((event) => event.changedFields.authoritativeClaimAllowedOffline === false));
});
