import assert from "node:assert/strict";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, PlatformService } from "@eiep/api";
import { assignment, completeReadiness, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const now = new Date("2026-07-21T11:00:00.000Z");

test("MVP notification boundary / AC-02-03-10: dispatch filters recipients, minimizes payload, is idempotent, and reauthorizes delivery", async () => {
  const store = new InMemoryFoundationStore();
  const ids = sequentialIds("notification-authorization");
  const foundation = new FoundationService(store, () => now, ids);
  const platform = new PlatformService(store, () => now, ids);
  const project = await foundation.createProject(
    context("project-creator"),
    [assignment("create-project", "project-creator", ["project.create"], scope())],
    {
      businessScopeOrganizationId: "org-epv", number: "NOTIFY-001", name: "Notification authorization",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "UTC", readiness: completeReadiness,
    },
  );
  await store.transaction((transaction) => transaction.insertImportedRecord({
    id: "notify-record-1", projectId: project.id, recordType: "material_receipt",
    payload: { projectId: project.id, description: "Sensitive pressure boundary finding" },
    importJobId: "seeded-notification-import", externalId: "ERP-NOTIFY-001", createdAt: now, createdBy: "fixture",
  }));
  const allowed = context("allowed-recipient", "mfa");
  const hidden = context("hidden-recipient", "mfa");
  const subscriptionPermission = (userId: string) => [assignment(
    `subscribe-${userId}`, userId, ["notification.subscription.manage"], scope(project.id),
  )];
  await platform.configureNotificationSubscription(allowed, subscriptionPermission(allowed.userId), project.id, {
    eventTypes: ["material.released"], channel: "in_app", enabled: true,
  });
  await platform.configureNotificationSubscription(hidden, subscriptionPermission(hidden.userId), project.id, {
    eventTypes: ["material.released"], channel: "in_app", enabled: true,
  });
  const allowedRead = assignment("allowed-read", allowed.userId, ["project.read"], scope(project.id, "notify-record-1"));
  store.seedAssignments([allowedRead]);
  const worker = context("notification-worker", "mfa", ["notification_worker"]);
  const workerAccess = [assignment(
    "dispatch-deliver", worker.userId, ["notification.dispatch", "notification.deliver"], scope(project.id),
  )];
  const dispatchInput = {
    eventType: "material.released", recordClass: "imported" as const, recordId: "notify-record-1",
    recipientUserIds: [allowed.userId, hidden.userId], templateCode: "controlled-record-state-v1",
    idempotencyKey: "material-release-event-1",
  };
  const dispatched = await platform.dispatchNotification(worker, workerAccess, project.id, dispatchInput);
  assert.deepEqual(dispatched.map((notification) => [notification.recipientUserId, notification.state]), [
    [allowed.userId, "queued"], [hidden.userId, "suppressed"],
  ]);
  assert.ok(dispatched.every((notification) => !("label" in notification) && !("payload" in notification) && !("body" in notification)));
  const replay = await platform.dispatchNotification(worker, workerAccess, project.id, dispatchInput);
  assert.deepEqual(replay.map((notification) => notification.id), dispatched.map((notification) => notification.id));
  const queued = dispatched.find((notification) => notification.state === "queued");
  assert.ok(queued);
  const delivered = await platform.processNotification(worker, workerAccess, queued.id, queued.version, "success", null);
  assert.equal(delivered.state, "delivered");
  const inbox = await platform.listNotifications(allowed, [allowedRead], project.id);
  assert.deepEqual(inbox.map((notification) => notification.id), [delivered.id]);

  const second = await platform.dispatchNotification(worker, workerAccess, project.id, {
    ...dispatchInput, recipientUserIds: [allowed.userId], idempotencyKey: "material-release-event-2",
  });
  assert.equal(second[0]?.state, "queued");
  store.seedAssignments([]);
  const revokedBeforeDelivery = await platform.processNotification(
    worker, workerAccess, second[0]!.id, second[0]!.version, "success", null,
  );
  assert.equal(revokedBeforeDelivery.state, "suppressed");
  assert.equal(revokedBeforeDelivery.lastError, "recipient_scope_denied");
  const outbox = await store.transaction((transaction) =>
    transaction.integrationMessageByKey("notification.worker", revokedBeforeDelivery.id));
  assert.equal(outbox?.state, "reconciled");
  const audit = await store.transaction((transaction) => transaction.auditForProject(project.id));
  assert.ok(audit.some((event) => event.action === "notification.delivered"));
  assert.equal(audit.filter((event) => event.action === "notification.suppressed").length, 2);
});
