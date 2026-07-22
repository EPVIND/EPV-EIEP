import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:3200",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type,x-eiep-user-id,x-eiep-organization-id,x-eiep-assurance",
  "content-type": "application/json",
};

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test("NFR-USE-001-002 / AC-09-10: internal shell is usable at tablet size and fails closed without the API", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Controlled project execution" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("No record actions are enabled");
  await expect(page.locator(".environment-banner")).toContainText("UNCONNECTED");

  for (const link of await page.getByRole("navigation").getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-IAM-003, NFR-USE-001-002 / AC-02-10: partner portal exposes no project data before assignment", async ({ page }) => {
  await page.goto("http://127.0.0.1:3201");
  await expect(page.getByRole("heading", { level: 1, name: "Assigned scope only" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "External pilot access is not enabled" }))
    .toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("NFR-USE-003: internal workspace scopes records and requires typed confirmation plus current version for activation", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "field-lead");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  let activationPayload: unknown = null;
  const setupRequests: Array<{ path: string; userId: string | undefined; body: unknown }> = [];
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const url = new URL(request.url());
    if (url.pathname === "/health") {
      await route.fulfill({ headers: corsHeaders, json: {
        status: "ok", environment: "test", training: false, productionReady: false,
        blockers: ["proposed_adrs_unapproved"],
      } });
      return;
    }
    if (url.pathname === "/v1/session") {
      await route.fulfill({ headers: corsHeaders, json: {
        userId: "field-lead", actingOrganizationId: "org-epv", assurance: "step-up",
        assignmentCount: 4, environment: "test", training: false,
      } });
      return;
    }
    if (url.pathname === "/v1/projects" && request.method() === "GET") {
      await route.fulfill({ headers: corsHeaders, json: [{
        id: "project-1", number: "PLANT-001", name: "Compressor station",
        customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver",
        state: "draft", version: 7,
      }] });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/search") {
      await route.fulfill({ headers: corsHeaders, json: [{
        recordType: "ncr", recordId: "ncr-17", label: "NCR-017 Weld profile",
        state: "closed", version: 4,
      }] });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/organizations") {
      setupRequests.push({ path: url.pathname, userId: request.headers()["x-eiep-user-id"], body: request.postDataJSON() });
      await route.fulfill({ headers: corsHeaders, status: 201, json: {
        id: "project-org-1", organizationId: "org-customer", participationRole: "customer", state: "active", version: 1,
      } });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/structure") {
      setupRequests.push({ path: url.pathname, userId: request.headers()["x-eiep-user-id"], body: request.postDataJSON() });
      await route.fulfill({ headers: corsHeaders, status: 201, json: {
        id: "system-1", code: "SYS-1", name: "Process system", state: "active", version: 1,
      } });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/responsibilities") {
      setupRequests.push({ path: url.pathname, userId: request.headers()["x-eiep-user-id"], body: request.postDataJSON() });
      await route.fulfill({ headers: corsHeaders, status: 201, json: {
        id: "responsibility-1", targetType: "project", targetId: "project-1",
        responsibilityType: "project_manager", state: "active", version: 1,
      } });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/configurations") {
      setupRequests.push({ path: url.pathname, userId: request.headers()["x-eiep-user-id"], body: request.postDataJSON() });
      await route.fulfill({ headers: corsHeaders, status: 201, json: {
        id: "configuration-1", configurationCode: "PROJECT_BASELINE", revision: "A", state: "under_review", version: 1,
      } });
      return;
    }
    if (url.pathname === "/v1/project-configurations/configuration-1/approve") {
      setupRequests.push({ path: url.pathname, userId: request.headers()["x-eiep-user-id"], body: request.postDataJSON() });
      await route.fulfill({ headers: corsHeaders, json: {
        id: "configuration-1", configurationCode: "PROJECT_BASELINE", revision: "A", state: "active", version: 2,
      } });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/readiness") {
      await route.fulfill({ headers: corsHeaders, json: { readiness: {}, blockers: [] } });
      return;
    }
    if (url.pathname === "/v1/projects/project-1/activate") {
      activationPayload = request.postDataJSON();
      await route.fulfill({ headers: corsHeaders, json: {
        id: "project-1", number: "PLANT-001", name: "Compressor station",
        customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver",
        state: "active", version: 8,
      } });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, json: { error: "not_found" } });
  });
  await page.goto("/");
  await expect(page.getByText("Compressor station")).toBeVisible();
  await expect(page.getByText("Active assignments").locator("..").getByText("4", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Projects/u }).click();
  await expect(page.getByRole("heading", { name: "Controlled project setup - PLANT-001" })).toBeVisible();
  await page.getByLabel("Participant organization ID").fill("org-customer");
  await page.getByRole("button", { name: "Add participant" }).click();
  await page.getByLabel("Structure code").fill("SYS-1");
  await page.getByLabel("Structure name").fill("Process system");
  await page.getByRole("button", { name: "Create structure" }).click();
  await page.getByLabel("Responsibility type").fill("project_manager");
  await page.getByLabel("Responsible organization ID").fill("org-customer");
  await page.getByRole("button", { name: "Assign responsibility" }).click();
  await page.getByLabel("Configuration code").fill("PROJECT_BASELINE");
  await page.getByLabel("Revision", { exact: true }).fill("A");
  await page.getByLabel("Released governing revision IDs").fill("released-revision-1");
  await page.getByRole("button", { name: "Submit configuration" }).click();
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.getByLabel("User ID").fill("configuration-approver");
  await page.getByRole("button", { name: "Apply identity" }).click();
  await page.getByRole("button", { name: "Approve as separate authority" }).click();
  await page.setViewportSize({ width: 810, height: 1080 });
  expect(setupRequests.find((item) => item.path.endsWith("/configurations"))?.body).toMatchObject({
    configurationCode: "PROJECT_BASELINE", revision: "A", governingDocumentRevisionIds: ["released-revision-1"],
    settings: { inspectionPlanRequired: true },
  });
  expect(setupRequests.find((item) => item.path.endsWith("/approve"))?.userId).toBe("configuration-approver");
  await page.getByLabel("Search assigned records").fill("weld");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("NCR-017 Weld profile")).toBeVisible();
  const activate = page.getByRole("button", { name: "Activate after revalidation" });
  await expect(activate).toBeDisabled();
  await page.getByRole("button", { name: "Check activation readiness" }).click();
  await expect(page.getByText("0 blocker(s)")).toBeVisible();
  await page.getByLabel("Type PLANT-001 to confirm").fill("PLANT-001");
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect(page.getByRole("status").filter({ hasText: "activated after server-side readiness revalidation" })).toBeVisible();
  expect(activationPayload).toEqual({ expectedVersion: 7 });
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-CMD-001-004, NFR-USE-001-003 / AC-02-03, AC-15: command center exposes derived tasks, activity, and module health at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "command-user");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "mfa");
  });
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const url = new URL(request.url());
    if (url.pathname === "/health") {
      await route.fulfill({ headers: corsHeaders, json: { status: "ok", environment: "test", training: false,
        productionReady: false, blockers: ["production_authorization_missing"] } });
      return;
    }
    if (url.pathname === "/v1/session") {
      await route.fulfill({ headers: corsHeaders, json: { userId: "command-user", actingOrganizationId: "org-epv",
        assurance: "mfa", assignmentCount: 8, environment: "test", training: false } });
      return;
    }
    if (url.pathname === "/v1/projects") {
      await route.fulfill({ headers: corsHeaders, json: [{ id: "command-project", number: "CMD-001",
        name: "Integrated delivery project", customerOrganizationId: "org-customer", facilityId: "facility-command",
        timeZone: "America/Denver", state: "active", version: 4 }] });
      return;
    }
    if (url.pathname === "/v1/projects/command-project/command-center") {
      await route.fulfill({ headers: corsHeaders, json: {
        generatedAt: "2026-07-21T18:00:00.000Z", project: { id: "command-project", number: "CMD-001", name: "Integrated delivery project", state: "active" },
        metrics: { documentsCurrent: 18, documentsTotal: 20, materialsTracked: 64, weldsComplete: 42, weldsTotal: 50,
          executionAccepted: 31, executionTotal: 38, openExceptions: 5, scheduleProgressPercent: 68, openTasks: 2 },
        tasks: [
          { id: "quality:punch:1", module: "quality", recordType: "punch_item", recordId: "punch-1",
            title: "Complete punch P-001", state: "open", priority: "critical", dueAt: "2026-07-20T18:00:00.000Z",
            overdue: true, action: "punch.update.owned", version: 2 },
          { id: "bluebeam:item:1", module: "bluebeam", recordType: "collaboration_item", recordId: "markup-1",
            title: "Review collaboration evidence: Valve access", state: "submitted", priority: "medium", dueAt: null,
            overdue: false, action: "collaboration.review", version: 1 },
        ],
        recentActivity: [{ id: "audit-1", occurredAt: "2026-07-21T17:45:00.000Z", actorUserId: "scheduler",
          action: "schedule.revision_approved", module: "scheduling", objectType: "schedule_revision",
          objectId: "schedule-revision-2", priorState: "under_review", newState: "approved" }],
        activityVisible: true,
        modules: [
          { module: "quality", label: "Quality / NCR / punch", total: 10, open: 3, attention: 3, completed: 7, progressPercent: 70 },
          { module: "scheduling", label: "Scheduling", total: 25, open: 8, attention: 2, completed: 17, progressPercent: 68 },
          { module: "bluebeam", label: "Document collaboration", total: 6, open: 1, attention: 1, completed: 5, progressPercent: 83 },
        ],
        schedule: { sourceRevisionIds: ["schedule-revision-2"], activityCount: 25, completedActivities: 17, lateActivities: 2, progressPercent: 68 },
      } });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, json: { error: "not_found" } });
  });
  await page.setViewportSize({ width: 810, height: 1080 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Enterprise command center" })).toBeVisible();
  await expect(page.getByText("Complete punch P-001")).toBeVisible();
  await expect(page.getByText("Schedule Revision Approved")).toBeVisible();
  await expect(page.getByText("68%", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Priority", exact: true }).selectOption("critical");
  await expect(page.getByText("Complete punch P-001")).toBeVisible();
  await expect(page.getByText("Review collaboration evidence: Valve access")).toBeHidden();
  await expect(page.getByRole("button", { name: /Bluebeam review/u })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-EST-001-010, NFR-USE-001-003 / AC-02-03, AC-09-11: estimating workspace exposes the controlled pilot workflow at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "estimator");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const estimate = {
    id: "estimate-1", number: "EST-2026-001", name: "Plant piping estimate", customerOrganizationId: "org-customer",
    dueAt: "2026-08-31T17:00:00.000Z", currency: "USD", state: "approved", currentRevisionId: "revision-a", version: 3,
  };
  const revision = {
    id: "revision-a", revision: "A", parentRevisionId: null, revisionReason: "initial", state: "approved", version: 3,
    totals: { version: "estimate-v1", currency: "USD", directCost: "2625.00", contingencyAmount: "131.25",
      escalationAmount: "52.50", markupAmount: "280.88", taxAmount: "247.17", finalPrice: "3336.80" },
    reviewReason: "Scope and pricing independently verified.",
  };
  const detail = {
    estimate, revisions: [revision],
    lines: [{ id: "line-1", revisionId: "revision-a", lineKey: "PIPE-INSTALL-001", sortOrder: 10,
      costCode: "PIPING-INSTALL", description: "Install controlled pipe assembly", quantity: "10", unitCode: "EA",
      productivityFactors: [{ factorRevisionId: "factor-1", multiplier: "1.25" }], state: "active", version: 1,
      calculation: { adjustedLaborHours: "25", laborCost: "1250.00", materialCost: "1000.00",
        equipmentCost: "100.00", subcontractCost: "200.00", totalCost: "2625.00" } }],
    quotes: [], handoffs: [],
    proposals: [{ id: "proposal-1", proposalNumber: "PROP-2026-001", totalPrice: "3336.80", currency: "USD",
      validUntil: "2026-08-31T23:59:59.000Z", sourceCanonicalSha256: "a".repeat(64),
      artifactSha256: "b".repeat(64), artifactManifestSha256: "c".repeat(64),
      artifactFilename: "prop-2026-001.html", state: "draft", version: 1 }],
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname;
    if (path === "/health") { await route.fulfill({ headers: corsHeaders, json: { status: "ok", environment: "test", training: false, productionReady: false, blockers: ["external_release_authority"] } }); return; }
    if (path === "/v1/session") { await route.fulfill({ headers: corsHeaders, json: { userId: "estimator", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 8, environment: "test", training: false } }); return; }
    if (path === "/v1/projects") { await route.fulfill({ headers: corsHeaders, json: [{ id: "project-1", number: "PRJ-001", name: "Award target", customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "draft", version: 1 }] }); return; }
    if (path === "/v1/estimates") { await route.fulfill({ headers: corsHeaders, json: [estimate] }); return; }
    if (path === "/v1/estimates/estimate-1") { await route.fulfill({ headers: corsHeaders, json: detail }); return; }
    if (path === "/v1/estimate-assemblies") { await route.fulfill({ headers: corsHeaders, json: [{ id: "assembly-1", code: "PIPE-INSTALL", revision: "1", description: "Governed pipe installation assembly", costCode: "PIPING-INSTALL", unitCode: "EA", baseLaborHoursPerUnit: "2", state: "active", version: 2 }] }); return; }
    if (path === "/v1/estimate-productivity-factors") { await route.fulfill({ headers: corsHeaders, json: [{ id: "factor-1", code: "CONGESTED", revision: "1", name: "Congested work area", multiplier: "1.25", discipline: "PIPING", sourceReference: "EST-BASIS-2026-01", state: "active", version: 2 }] }); return; }
    if (path === "/v1/estimate-authority-policies") { await route.fulfill({ headers: corsHeaders, json: [{ id: "policy-1", currency: "USD", revision: "1", standardEstimateApprovalLimit: "100000.00", standardQuoteSelectionLimit: "50000.00", standardProposalApprovalLimit: "100000.00", estimateAboveThresholdQualification: "EXECUTIVE_ESTIMATE_AUTHORITY", quoteAboveThresholdQualification: "EXECUTIVE_QUOTE_AUTHORITY", proposalAboveThresholdQualification: "EXECUTIVE_COMMERCIAL_AUTHORITY", state: "active", version: 2 }] }); return; }
    if (path === "/v1/estimate-revisions/revision-a/quote-comparison") { await route.fulfill({ headers: corsHeaders, json: [{ id: "quote-1", quoteNumber: "Q-101", vendorOrganizationId: "vendor-1", normalizedTotal: "2600.00", currency: "USD", validUntil: "2026-08-15T00:00:00.000Z", unresolvedScopeLineKeys: [], exclusions: [], qualifications: ["Schedule confirmation"], state: "normalized", version: 1 }] }); return; }
    await route.fulfill({ status: 404, headers: corsHeaders, json: { error: "not_found" } });
  });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/");
  await page.getByRole("link", { name: /Estimating/u }).click();
  await expect(page.getByRole("heading", { name: "Advanced estimating" })).toBeVisible();
  await expect(page.getByText("EST-2026-001")).toBeVisible();
  await page.getByRole("button", { name: /Cost basis/u }).click();
  await expect(page.getByText("Governed pipe installation assembly")).toBeVisible();
  await expect(page.getByText("CONGESTED · ×1.25")).toBeVisible();
  await expect(page.getByText("Estimate 100000.00 · quote 50000.00 · proposal 100000.00")).toBeVisible();
  await page.getByRole("button", { name: /Build-up/u }).click();
  await expect(page.getByText("USD 3336.80", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Estimate line calculations" })).toContainText("2625.00");
  await page.getByRole("button").filter({ hasText: "Quotes" }).click();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByText("Q-101")).toBeVisible();
  await expect(page.getByText("Complete mapped scope")).toBeVisible();
  await page.getByRole("button").filter({ hasText: "Proposal" }).click();
  await expect(page.getByText("PROP-2026-001")).toBeVisible();
  await expect(page.getByText("a".repeat(64))).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-PJC-001-004, FR-PRC-001-003, FR-SCH-001-004, NFR-USE-001-003 / AC-02-03, AC-12: project controls expose cost, procurement, and schedule evidence at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "controls-reader");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const baseline = { id: "baseline-1", sourceHandoffId: "handoff-1", number: "CB-001", revision: "1",
    revisionReason: "Incorporate CR-001", currency: "USD", currentBudgetAmount: "1400.00",
    managementReserveAmount: "100.00", state: "approved", version: 3, lines: [{ lineKey: "PIPE-001",
      sourceEstimateLineKey: "PIPE-001", costCode: "PIPING", wbsCode: "WBS-PIPING", workPackageCode: "WP-PIPING",
      controlAccountCode: "CA-PIPING", budgetQuantity: "12", unitCode: "EA", budgetAmount: "1200.00" }] };
  const snapshot = {
    baselines: [baseline], changes: [{ id: "change-1", number: "CR-001", title: "Additional piping",
      origin: "Owner request", totalCostImpact: "200.00", scheduleDaysImpact: "3", state: "incorporated", version: 3 }],
    costEntries: [{ id: "cost-1", entryType: "actual", amount: "300.00", currency: "USD",
      periodStart: "2026-07-01T00:00:00.000Z", sourceId: "ACTUAL-2026-07", state: "accepted", version: 2 }],
    progressClaims: [{ id: "progress-1", baselineLineKey: "PIPE-001", claimedQuantity: "5",
      claimedEarnedAmount: "500.00", qualityAcceptanceState: "not_evaluated", invoiceApprovalState: "not_submitted",
      state: "accepted", version: 2 }],
    requisitions: [{ id: "req-1", number: "REQ-001", title: "Piping materials and services", state: "approved", version: 3,
      items: [{ itemKey: "ITEM-001", description: "Controlled pipe item", quantity: "5", unitCode: "EA",
        needBy: "2026-09-01T00:00:00.000Z", specificationReference: "SPEC-100 REV 0",
        governingDocumentRevisionIds: ["revision-controls"] }] }],
    bidPackages: [{ id: "bid-1", number: "BID-001", state: "awarded", version: 5,
      recommendedOfferKey: "OFFER-A", awardedOfferKey: "OFFER-A", offers: [
        { offerKey: "OFFER-A", vendorOrganizationId: "vendor-a", totalAmount: "850.00", currency: "USD",
          validUntil: "2026-08-31T00:00:00.000Z", unresolvedItemKeys: [], sourceSha256: "a".repeat(64) },
        { offerKey: "OFFER-B", vendorOrganizationId: "vendor-b", totalAmount: "820.00", currency: "USD",
          validUntil: "2026-08-31T00:00:00.000Z", unresolvedItemKeys: ["ITEM-001"], sourceSha256: "b".repeat(64) },
      ] }],
    commitments: [{ id: "commitment-1", purchaseOrderReference: "PO-001", revision: "0", vendorOrganizationId: "vendor-a",
      amount: "850.00", currency: "USD", state: "received", version: 3, statusEvents: [{ eventType: "receipt",
        status: "Linked controlled receiving record.", sourceReference: "REC-001" }] }],
    schedules: [{ id: "schedule-1", number: "SCH-001", name: "Project control schedule", timeZone: "America/Denver",
      currentRevisionId: "schedule-update-2", version: 4 }],
    scheduleRevisions: [{ id: "schedule-update-2", scheduleId: "schedule-1", revision: "U2", revisionType: "update",
      dataDate: "2026-08-04T00:00:00.000Z", baselineVarianceDays: "3", sourceSystem: "p6", state: "approved", version: 3,
      activities: [{ activityKey: "A200", name: "Activity A200", plannedStart: "2026-08-03T00:00:00.000Z",
        plannedFinish: "2026-08-13T00:00:00.000Z", fieldClaimPercent: "15", acceptedProgressPercent: "10",
        constraintCodes: ["MATERIAL-DELIVERY"] }] }],
    scheduleImports: [{ id: "import-1", sourceSystem: "p6", sourceVersion: "P6-24.12", mappingVersion: "P6-MAP-1",
      targetRevision: "U2", state: "committed", previewErrors: [], version: 2 }],
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname;
    const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (path === "/health") return respond({ status: "ok", environment: "test", training: false, productionReady: false, blockers: ["external_pilot_approval"] });
    if (path === "/v1/session") return respond({ userId: "controls-reader", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 12, environment: "test", training: false });
    if (path === "/v1/projects") return respond([{ id: "project-1", number: "PJC-001", name: "Project controls pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", version: 4 }]);
    if (path === "/v1/projects/project-1/controls") return respond(snapshot);
    if (path === "/v1/projects/project-1/cost-summary") return respond({ currency: "USD", currentBudget: "1400.00",
      commitments: "850.00", actuals: "300.00", accruals: "100.00", acceptedProgress: "500.00",
      forecastRemaining: "500.00", estimateAtCompletion: "900.00", varianceAtCompletion: "500.00",
      contingencyDraws: "0.00", reserveMovements: "0.00" });
    if (path === "/v1/project-controls-authority-policies") return respond([{ id: "policy-1", currency: "USD", revision: "1",
      standardChangeApprovalLimit: "100.00", standardProcurementAwardLimit: "800.00", state: "active" }]);
    if (path === "/v1/schedules/schedule-1/look-ahead") return respond([{ activity: snapshot.scheduleRevisions[0]!.activities[0]!, blockers: ["MATERIAL-DELIVERY"] }]);
    return respond({ error: "not_found" }, 404);
  });

  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/");
  await page.getByRole("link", { name: /Project Controls/u }).click();
  await expect(page.getByRole("heading", { name: "Controls, procurement & schedule — PJC-001" })).toBeVisible();
  await expect(page.getByText("USD 1400.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Quality not_evaluated · invoice not_submitted")).toBeVisible();
  await expect(page.getByText("Change limit 100.00 · procurement award limit 800.00")).toBeVisible();

  await page.getByRole("link", { name: /Procurement/u }).click();
  await expect(page.getByRole("strong").filter({ hasText: "REQ-001 · Piping materials and services" })).toBeVisible();
  await expect(page.getByText("Complete mapped scope")).toBeVisible();
  await expect(page.getByText("Scope gaps: ITEM-001")).toBeVisible();
  await expect(page.getByText("PO-001 · revision 0")).toBeVisible();

  await page.getByRole("link", { name: /Scheduling/u }).click();
  await expect(page.getByText("U2 · update")).toBeVisible();
  await expect(page.getByText("p6 P6-24.12 → U2")).toBeVisible();
  const lookAheadButton = page.getByRole("button", { name: "30-day look-ahead" });
  await expect(lookAheadButton).toBeEnabled();
  await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/v1/schedules/schedule-1/look-ahead" && response.status() === 200,
    ),
    lookAheadButton.click(),
  ]);
  await expect(page.getByRole("status").filter({ hasText: "30-day look-ahead derived" })).toBeVisible();
  await expect(page.getByText("A200 · Activity A200")).toBeVisible();
  await expect(page.getByText("MATERIAL-DELIVERY", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-WLD-001-003, FR-NDE-001-002, FR-PWH-001, FR-TST-001-002 / AC-02-03, EX-AC-06-07: execution disciplines expose repair-cycle and boundary evidence at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "execution-reader");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const snapshot = {
    procedures: [{ id: "wps-1", procedureType: "wps", number: "WPS-001", revision: "0", processCodes: ["GTAW"],
      materialGroupCodes: ["P1"], state: "approved", version: 2 }],
    welderQualifications: [{ id: "wpq-1", welderUserId: "welder-1", qualificationNumber: "WPQ-001",
      processCodes: ["GTAW"], validTo: "2027-01-01T00:00:00.000Z", state: "active", version: 2 }],
    welds: [{ id: "weld-1", number: "W-100", systemCode: "SYS-01", workPackageCode: "WP-PIPING",
      weldMapLocation: "ISO-100 / JOINT 1", wpsRevisionId: "wps-1", requiredExaminationMethods: ["RT"],
      pwhtRequired: true, repairCycle: 1, state: "pending_examination", version: 9,
      events: [{ id: "event-1", eventType: "weld_pass", repairCycle: 0, performedBy: "welder-1", result: "pass" },
        { id: "event-2", eventType: "visual_examination", repairCycle: 0, performedBy: "inspector-1", result: "pass" },
        { id: "event-3", eventType: "repair_excavation", repairCycle: 0, performedBy: "welder-1", result: "observed" },
        { id: "event-4", eventType: "repair_weld", repairCycle: 1, performedBy: "welder-1", result: "pass" },
        { id: "event-5", eventType: "visual_examination", repairCycle: 1, performedBy: "inspector-1", result: "pass" }] }],
    ndeRequests: [{ id: "nde-request-0", number: "NDE-RT-100-0", weldId: "weld-1", repairCycle: 0, methodCode: "RT",
      reportRevisionIds: ["nde-report-0"], state: "rejected", version: 3 },
      { id: "nde-request-1", number: "NDE-RT-100-1", weldId: "weld-1", repairCycle: 1, methodCode: "RT",
        reportRevisionIds: ["nde-report-1"], state: "accepted", version: 3 }],
    ndeReports: [{ id: "nde-report-0", requestId: "nde-request-0", revision: "0", examinerUserId: "nde-examiner",
      result: "reject", state: "accepted", version: 2 },
      { id: "nde-report-1", requestId: "nde-request-1", revision: "1", examinerUserId: "nde-examiner",
        result: "accept", state: "accepted", version: 2 }],
    pwhtCycles: [{ id: "pwht-1", number: "PWHT-100", weldIds: ["weld-1"], result: "pass", interruptions: [], state: "accepted", version: 2 }],
    testPackages: [{ id: "test-1", number: "TP-001", testType: "pressure", completionBoundaryId: "boundary-1",
      targetPressure: "225", result: "pass", deficiencyNcrIds: [], state: "accepted", version: 3 }],
    weldReadiness: [{ weldId: "weld-1", blockers: [] }],
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname;
    const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (path === "/health") return respond({ status: "ok", environment: "test", training: false, productionReady: false, blockers: ["external_pilot_approval"] });
    if (path === "/v1/session") return respond({ userId: "execution-reader", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 14, environment: "test", training: false });
    if (path === "/v1/projects") return respond([{ id: "project-1", number: "EXE-001", name: "Execution disciplines pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", version: 4 }]);
    if (path === "/v1/projects/project-1/execution-disciplines") return respond(snapshot);
    return respond({ error: "not_found" }, 404);
  });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/");
  await page.getByRole("link", { name: /Welding/u }).click();
  await expect(page.getByRole("heading", { name: "Welding, NDE, PWHT & testing — EXE-001" })).toBeVisible();
  await expect(page.getByText("WPS WPS-001 · revision 0")).toBeVisible();
  await expect(page.getByText("W-100 · SYS-01 · repair cycle 1")).toBeVisible();
  await expect(page.getByText("Release prerequisites complete")).toBeVisible();
  await expect(page.getByText("repair weld — pass · cycle 1 · welder-1")).toBeVisible();

  await page.getByRole("link", { name: /NDE \/ PWHT/u }).click();
  await expect(page.getByText("NDE-RT-100-0 · RT · repair cycle 0")).toBeVisible();
  await expect(page.getByText("NDE-RT-100-1 · RT · repair cycle 1")).toBeVisible();
  await expect(page.getByText("PWHT-100 · pass")).toBeVisible();

  await page.getByRole("link", { name: /Testing/u }).click();
  await expect(page.getByText("TP-001 · pressure test")).toBeVisible();
  await expect(page.getByText("Result pass")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-FAB-001-006 / AC-02-03, AC-09: fabrication workspace exposes exact spool lineage, traveler sequence, and hold state at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "fabrication-reader");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const snapshot = {
    assemblies: [{ id: "assembly-1", number: "SP-100", revision: "0", assemblyType: "pipe_spool", parentRevisionId: null,
      revisionReason: "Issued spool definition from released isometric.", sourceSystem: "manual", sourceVersion: null, sourceSha256: null,
      systemCode: "SYS-01", areaCode: "AREA-01", workPackageCode: "WP-FAB", completionBoundaryId: "boundary-1",
      drawingRevisionIds: ["drawing-revision-1"], materialItemIds: ["material-1"], weldIds: ["weld-1"],
      requiredInspectionIds: ["inspection-1"], bomLines: [{ lineKey: "BOM-001", materialItemId: "material-1",
        description: "NPS 4 pipe", quantity: "10", unitCode: "FT", pieceMark: "P-100" }],
      cutLines: [{ lineKey: "CUT-001", bomLineKey: "BOM-001", materialItemId: "material-1", cutLength: "120",
        lengthUnitCode: "IN", cutAngleDegrees: "0", bevelCode: "BW-V", quantity: "1" }],
      state: "in_fabrication", submittedBy: "fabrication-planner", reviewedBy: "fabrication-engineer",
      releasedBy: "fabrication-release", acceptedBy: null, version: 5 }],
    travelers: [{ id: "traveler-1", assemblyRevisionId: "assembly-1", number: "TRV-SP-100", revision: "0", state: "on_hold",
      issuedBy: "fabrication-release", version: 6, operations: [
        { operationKey: "CUT", sequence: 10, operationType: "cut", workCenterCode: "SAW-01",
          requiredQualificationCodes: ["FABRICATOR"], procedureDocumentRevisionId: "drawing-revision-1", holdPoint: false,
          materialItemIds: ["material-1"], weldIds: [], plannedHours: "1.5", instructions: "Cut and preserve heat identity." },
        { operationKey: "FIT", sequence: 20, operationType: "fit_up", workCenterCode: "FIT-BAY-01",
          requiredQualificationCodes: ["FABRICATOR"], procedureDocumentRevisionId: "drawing-revision-1", holdPoint: true,
          materialItemIds: ["material-1"], weldIds: ["weld-1"], plannedHours: "2", instructions: "Fit spool and present hold point." },
      ] }],
    events: [
      { id: "event-1", sequence: 1, travelerId: "traveler-1", operationKey: "CUT", eventType: "start", result: "observed", performedBy: "fabricator-1", performedAt: "2026-07-21T16:00:00.000Z" },
      { id: "event-2", sequence: 2, travelerId: "traveler-1", operationKey: "CUT", eventType: "complete", result: "pass", performedBy: "fabricator-1", performedAt: "2026-07-21T16:30:00.000Z" },
      { id: "event-3", sequence: 3, travelerId: "traveler-1", operationKey: "FIT", eventType: "start", result: "observed", performedBy: "fabricator-1", performedAt: "2026-07-21T17:00:00.000Z" },
      { id: "event-4", sequence: 4, travelerId: "traveler-1", operationKey: "FIT", eventType: "hold", result: "observed", performedBy: "fabricator-1", performedAt: "2026-07-21T17:30:00.000Z" },
    ],
    releaseReadiness: [{ assemblyRevisionId: "assembly-1", blockers: [] }],
    acceptanceReadiness: [{ assemblyRevisionId: "assembly-1", blockers: ["traveler_incomplete", "inspection_not_accepted:inspection-1"] }],
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname;
    const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (path === "/health") return respond({ status: "ok", environment: "test", training: false, productionReady: false, blockers: ["external_pilot_approval"] });
    if (path === "/v1/session") return respond({ userId: "fabrication-reader", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 9, environment: "test", training: false });
    if (path === "/v1/projects") return respond([{ id: "project-1", number: "FAB-001", name: "Fabrication controlled pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", version: 4 }]);
    if (path === "/v1/projects/project-1/fabrication") return respond(snapshot);
    return respond({ error: "not_found" }, 404);
  });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/#fabrication");
  await expect(page.getByRole("heading", { name: "Fabrication & spool generation — FAB-001" })).toBeVisible();
  await expect(page.getByText("SP-100 · revision 0").first()).toBeVisible();
  await expect(page.getByText("TRV-SP-100 · revision 0")).toBeVisible();
  await expect(page.getByText("FIT · fit up")).toBeVisible();
  await expect(page.getByText("FIT-BAY-01 · 2 h · HOLD POINT")).toBeVisible();
  await expect(page.getByText("hold · observed · fabricator-1")).toBeVisible();
  await expect(page.getByText(/traveler incomplete · inspection not accepted:inspection-1/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Append immutable event" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-CNC-001-006 / AC-02-03, AC-17: CNC workspace exposes exact release identity, execution genealogy, and no-control boundary at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "cnc-reconciliation-authority");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const snapshot = {
    machineProfiles: [{ id: "profile-1", workCenterCode: "SAW-01", revision: "1", revisionReason: "Approved profile",
      processTypes: ["saw"], stockFormCodes: ["PIPE"], supportedOperationTypes: ["cut"], supportedFeatureCodes: ["STRAIGHT_CUT"],
      unitCode: "IN", coordinateSystemCode: "XYZ_RIGHT_HAND", maximumLength: "240", maximumWidth: "24", maximumThickness: "4",
      postprocessorName: "Machine-neutral package", postprocessorVersion: "1.0", state: "approved", version: 2 }],
    programs: [{ id: "program-1", number: "CNC-SP-100", revision: "0", revisionReason: "Initial controlled cut", processType: "saw",
      sourceFormat: "machine_neutral_json", sourceVersion: "1.0", sourceSha256: "a".repeat(64), sourceFileId: "source-file-1",
      sourceDocumentRevisionId: "source-revision-1", assemblyRevisionId: "assembly-1", travelerId: "traveler-1",
      travelerOperationKey: "CUT", machineProfileRevisionId: "profile-1", materialItemId: "material-1", pieceMark: "P-100",
      quantity: "1", coordinateSystemCode: "XYZ_RIGHT_HAND", operations: [{ operationKey: "CUT-10", sequence: 10,
        operationType: "cut", featureCode: "STRAIGHT_CUT", instruction: "Cut and preserve heat identity." }], validationFindings: [],
      normalizedPackageSha256: "b".repeat(64), releasedArtifactSha256: "c".repeat(64), state: "execution_recorded", version: 5,
      createdBy: "cnc-programmer", submittedBy: "cnc-programmer", reviewedBy: "cnc-technical-authority", releasedBy: "cnc-release-authority" }],
    executions: [{ id: "execution-1", programRevisionId: "program-1", releasedArtifactSha256: "c".repeat(64), workCenterCode: "SAW-01",
      machineIdentifier: "SAW-A", operatorUserId: "cnc-operator", actualQuantity: "1", scrapQuantity: "0",
      producedMaterialItemIds: ["piece-P-100"], remnantMaterialItemIds: ["remnant-100"], evidenceFileIds: ["execution-evidence-1"],
      exceptionNcrIds: [], result: "complete", state: "submitted", version: 1 }],
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname;
    const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (path === "/health") return respond({ status: "ok", environment: "test", training: false,
      productionReady: false, blockers: ["external_pilot_approval"] });
    if (path === "/v1/session") return respond({ userId: "cnc-reconciliation-authority", actingOrganizationId: "org-epv",
      assurance: "step-up", assignmentCount: 4, environment: "test", training: false });
    if (path === "/v1/projects") return respond([{ id: "project-1", number: "CNC-001", name: "Controlled CNC pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", version: 4 }]);
    if (path === "/v1/projects/project-1/cnc") return respond(snapshot);
    if (path === "/v1/cnc-executions/execution-1/reconcile") return respond({ program: { ...snapshot.programs[0], state: "reconciled", version: 6 },
      execution: { ...snapshot.executions[0], state: "accepted", version: 2 } });
    return respond({ error: "not_found" }, 404);
  });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/#cnc");
  await expect(page.getByRole("heading", { name: "CNC, waterjet & profiling — CNC-001" })).toBeVisible();
  await expect(page.getByText(/never starts, stops, configures, interlocks, or directly controls equipment/u)).toBeVisible();
  await expect(page.getByText("CNC-SP-100 · r0")).toBeVisible();
  await expect(page.getByText("Execution · SAW-A")).toBeVisible();
  await expect(page.getByText(/Release hash cccccccccccccccc/u)).toBeVisible();
  await expect(page.getByText(/produced 1 · remnants 1/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept reconciliation" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-ENG-001-006 / AC-02-03, AC-18: engineering workspace exposes stable revision identity, findings, hash, and independent approval at tablet size", async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem("eiep.userId", "engineering-authority"); sessionStorage.setItem("eiep.organizationId", "org-epv"); sessionStorage.setItem("eiep.assurance", "step-up"); });
  const item = { id: "eng-item-1", registerType: "equipment", tag: "P-101", revision: "0", parentRevisionId: null, title: "Transfer pump",
    disciplineCode: "MECH", systemCode: "SYS-01", areaCode: "AREA-01", workPackageCode: "WP-01", responsibleOrganizationId: "org-epv",
    documentRevisionIds: ["drawing-revision-1"], relatedItemRevisionIds: ["system-revision-1"], attributes: { SERVICE: "TRANSFER" },
    validationFindings: [], canonicalSha256: "e".repeat(64), state: "under_review", version: 2, createdBy: "engineering-author",
    submittedBy: "engineering-author", reviewedBy: null };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request(); if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname; const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (path === "/health") return respond({ status: "ok", environment: "test", training: false, productionReady: false, blockers: ["external_pilot_approval"] });
    if (path === "/v1/session") return respond({ userId: "engineering-authority", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 3, environment: "test", training: false });
    if (path === "/v1/projects") return respond([{ id: "project-1", number: "ENG-001", name: "Engineering pilot", customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", version: 4 }]);
    if (path === "/v1/projects/project-1/engineering-registers") return respond({ generatedAt: "2026-07-21T20:00:00.000Z", items: [item], counts: { requirement: 0, deliverable: 0, system: 0, equipment: 1, line: 0, instrument: 0, component: 0, tag: 0 }, openValidationFindingCount: 0 });
    if (path === "/v1/engineering-register-items/eng-item-1/review") return respond({ ...item, state: "approved", version: 3, reviewedBy: "engineering-authority" });
    return respond({ error: "not_found" }, 404);
  });
  await page.setViewportSize({ width: 900, height: 1100 }); await page.goto("/#engineering");
  await expect(page.getByRole("heading", { name: "Engineering registers · ENG-001" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "P-101 · Rev 0" })).toBeVisible(); await expect(page.getByText(/equipment · Rev 0 · MECH/u)).toBeVisible();
  await expect(page.getByText(/eeeeeeeeeeeeeeee/u)).toBeVisible(); await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByText(/No illustrative engineering records/u)).not.toBeVisible(); await expectNoSeriousAccessibilityViolations(page);
});

test("FR-BBM-001-005 / AC-02-03, EX-AC-08: Bluebeam workspace exposes governed import fidelity, reconciliation, and disabled outbound boundary at tablet size", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "collaboration-reader");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const snapshot = {
    imports: [{ id: "import-1", providerProduct: "Bluebeam Revu Studio export", providerProjectId: "BB-PROJECT-1",
      providerSessionId: "BB-SESSION-10", sourceVersion: "2026-07-21T17:30Z", sourceSha256: "b".repeat(64),
      previewIssues: [], committedItemIds: ["item-1", "item-2"], state: "committed", version: 2, previewedBy: "previewer" }],
    items: [{ id: "item-1", providerItemId: "BB-MARKUP-1", providerDocumentId: "BB-DOC-1",
      documentRevisionId: "P-100-REV-2", parentItemId: null, itemType: "markup", pageNumber: 3,
      authorUserId: "designer-account", providerStatusCode: "Accepted", evidenceStatus: "closed_claim",
      subject: "Valve orientation", sourceUpdatedAt: "2026-07-21T16:30:00.000Z", state: "accepted", version: 2 },
      { id: "item-2", providerItemId: "BB-REPLY-1", providerDocumentId: "BB-DOC-1",
        documentRevisionId: "P-100-REV-2", parentItemId: "item-1", itemType: "reply", pageNumber: 3,
        authorUserId: "designer-account", providerStatusCode: "Accepted", evidenceStatus: "closed_claim",
        subject: "Field reply", sourceUpdatedAt: "2026-07-21T16:45:00.000Z", state: "submitted", version: 1 }],
    reconciliations: [{ id: "issue-1", importId: "import-1", code: "unsupported_content",
      sourceObjectId: "BB-MARKUP-3", field: "unsupportedContentCodes", detail: "Unsupported provider content type: measurement-calibration.",
      state: "open", version: 1 }],
    outbound: { enabled: false, provider: "bluebeam", blockers: ["live_provider_contract_unapproved", "sandbox_not_verified",
      "outbound_identity_not_configured", "rate_retry_reconciliation_not_accepted", "tenant_project_ownership_not_verified",
      "vendor_terms_and_retention_not_accepted"] },
  };
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
    const path = new URL(request.url()).pathname;
    const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (path === "/health") return respond({ status: "ok", environment: "test", training: false, productionReady: false, blockers: ["external_pilot_approval"] });
    if (path === "/v1/session") return respond({ userId: "collaboration-reader", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 6, environment: "test", training: false });
    if (path === "/v1/projects") return respond([{ id: "project-1", number: "BBM-001", name: "Bluebeam controlled pilot",
      customerOrganizationId: "org-customer", facilityId: "facility-1", timeZone: "America/Denver", state: "active", version: 4 }]);
    if (path === "/v1/projects/project-1/collaboration") return respond(snapshot);
    return respond({ error: "not_found" }, 404);
  });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/");
  await page.getByRole("link", { name: /Bluebeam/u }).click();
  await expect(page.getByRole("heading", { name: "Bluebeam governed import — BBM-001" })).toBeVisible();
  await expect(page.getByText("BB-SESSION-10")).toBeVisible();
  await expect(page.getByRole("cell", { name: /BB-MARKUP-1 Valve orientation/u })).toBeVisible();
  await expect(page.getByText("closed claim", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("unsupported content", { exact: true })).toBeVisible();
  await expect(page.getByText("live provider contract unapproved", { exact: true })).toBeVisible();
  await expect(page.getByText(/No live Bluebeam write action is exposed/u)).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("FR-DOC-001-004, FR-MAT-001-004, FR-PMI-001-003, FR-NCR-001-003, FR-PCH-001, FR-TOV-001-004 / AC-03-09: guided internal workflow reaches an immutable turnover version", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.userId", "chain-controller");
    sessionStorage.setItem("eiep.organizationId", "org-epv");
    sessionStorage.setItem("eiep.assurance", "step-up");
  });
  const requests: Array<{ path: string; body: unknown }> = [];
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const url = new URL(request.url());
    const body = request.postData()
      ? request.headers()["content-type"]?.includes("application/json") ? request.postDataJSON() : "multipart-body"
      : null;
    if (request.method() !== "GET") requests.push({ path: url.pathname, body });
    const respond = async (json: unknown, status = 200) => route.fulfill({ status, headers: corsHeaders, json });
    if (url.pathname === "/health") return respond({ status: "ok", environment: "test", training: false, productionReady: false, blockers: ["controlled_adrs_unapproved"] });
    if (url.pathname === "/v1/session") return respond({ userId: "chain-controller", actingOrganizationId: "org-epv", assurance: "step-up", assignmentCount: 18, environment: "test", training: false });
    if (url.pathname === "/v1/projects" && request.method() === "GET") return respond([{
      id: "project-chain", number: "CHAIN-001", name: "Controlled chain", customerOrganizationId: "org-owner",
      facilityId: "facility-chain", timeZone: "America/Denver", state: "active", version: 8,
    }]);
    if (url.pathname === "/v1/projects/project-chain/documents") return respond({ id: "document-1", number: "MTR-001", title: "Material certification", version: 1, state: "draft" }, 201);
    if (url.pathname === "/v1/projects/project-chain/file-uploads") return respond({ id: "file-mtr-1", originalFilename: "mtr.pdf", validationState: "staged", version: 1 }, 201);
    if (url.pathname === "/v1/files/file-mtr-1" && request.method() === "GET") return respond({ id: "file-mtr-1", originalFilename: "mtr.pdf", validationState: "validated", version: 2 });
    if (url.pathname === "/v1/files/file-mtr-1/release") return respond({ id: "file-mtr-1", originalFilename: "mtr.pdf", validationState: "released", version: 3 });
    if (url.pathname === "/v1/documents/document-1/revisions") return respond({ id: "revision-1", revision: "A", version: 1, state: "under_review" }, 201);
    if (url.pathname === "/v1/revisions/revision-1/approve") return respond({ id: "revision-1", revision: "A", version: 2, state: "approved" });
    if (url.pathname === "/v1/revisions/revision-1/release") return respond({ id: "revision-1", revision: "A", version: 3, state: "released" });
    if (url.pathname === "/v1/projects/project-chain/materials") return respond({ id: "material-1", identifier: "HEAT-001", version: 1, state: "received_pending", requirements: { mtrRequired: true, mtrAccepted: false, mtrReviewId: null } }, 201);
    if (url.pathname === "/v1/materials/material-1/mtr-reviews") return respond({ material: { id: "material-1", identifier: "HEAT-001", version: 2, state: "received_pending", requirements: { mtrRequired: true, mtrAccepted: true, mtrReviewId: "mtr-review-1" } }, review: { id: "mtr-review-1" } }, 201);
    if (url.pathname === "/v1/materials/material-1/receiving-inspection/accept") return respond({ id: "material-1", identifier: "HEAT-001", version: 3, state: "received_pending", requirements: { mtrRequired: true, mtrAccepted: true, mtrReviewId: "mtr-review-1" } });
    if (url.pathname === "/v1/projects/project-chain/inspection-equipment") return respond({ id: "equipment-1", identifier: "XRF-001", version: 1, state: "active" }, 201);
    if (url.pathname === "/v1/materials/material-1/pmi") return respond({ id: "pmi-1", version: 1, state: "submitted", result: "pass", ncrId: null }, 201);
    if (url.pathname === "/v1/pmi/pmi-1/accept") return respond({ id: "pmi-1", version: 2, state: "accepted", result: "pass", ncrId: null });
    if (url.pathname === "/v1/materials/material-1/release") return respond({ id: "material-1", identifier: "HEAT-001", version: 4, state: "released" });
    if (url.pathname === "/v1/projects/project-chain/ncrs") return respond({ id: "ncr-1", version: 1, state: "open" }, 201);
    if (url.pathname === "/v1/ncrs/ncr-1/disposition") return respond({ id: "ncr-1", version: 2, state: "disposition_proposed" });
    if (url.pathname === "/v1/ncrs/ncr-1/disposition/approve") return respond({ id: "ncr-1", version: 3, state: "disposition_approved" });
    if (url.pathname === "/v1/ncrs/ncr-1/reinspection") return respond({ id: "ncr-1", version: 4, state: "reinspection_complete" });
    if (url.pathname === "/v1/ncrs/ncr-1/close") return respond({ id: "ncr-1", version: 5, state: "closed" });
    if (url.pathname === "/v1/projects/project-chain/punch-items") return respond({ id: "punch-1", version: 1, state: "open" }, 201);
    if (url.pathname === "/v1/punch-items/punch-1/owner-update") return respond({ id: "punch-1", version: 2, state: "ready_for_verification" });
    if (url.pathname === "/v1/punch-items/punch-1/verify") return respond({ id: "punch-1", version: 3, state: "verified" });
    if (url.pathname === "/v1/punch-items/punch-1/close") return respond({ id: "punch-1", version: 4, state: "closed" });
    if (url.pathname === "/v1/projects/project-chain/completion-boundaries") return respond({ id: "boundary-1", version: 1, state: "active" }, 201);
    if (url.pathname === "/v1/completion-boundaries/boundary-1/turnover-requirements") return respond({ id: "requirement-1", version: 1, state: "active" }, 201);
    if (url.pathname === "/v1/completion-boundaries/boundary-1/turnover-packages") return respond({ id: "package-1", version: 1, state: "ready" }, 201);
    if (url.pathname === "/v1/turnover-packages/package-1/readiness") return respond([{ requirementCode: "MAT-ACCEPTED", status: "accepted", reason: "released material present" }]);
    if (url.pathname === "/v1/turnover/generate") return respond({ id: "package-version-1", versionNumber: 1, manifestSha256: "a".repeat(64), manifest: [{ sourceType: "material" }] }, 201);
    if (url.pathname === "/v1/projects/project-chain/report-dashboard") return respond({
      generatedAt: "2026-07-21T18:00:00.000Z", readiness: { ready: true, blockers: [] },
      documents: { total: 1, revisions: 1, currentReleased: 1, unreleased: 0, supersededRevisions: 0 },
      materials: { total: 1, byState: { released: 1 }, unlocated: 0,
        mtr: { required: 1, accepted: 1, pending: 0 }, pmi: { required: 1, accepted: 1, pending: 0 } },
      qualificationExpirations: [], exceptions: { openNcrs: [], openPunchItems: [] },
      subcontractors: [], turnover: [{ packageId: "package-1", state: "generated", requirementCount: 1, generatedVersionCount: 1 }],
      privilegedAudit: { total: 9 },
    });
    if (url.pathname === "/v1/projects/project-chain/reports" && request.method() === "GET") return respond([]);
    if (url.pathname === "/v1/projects/project-chain/reports" && request.method() === "POST") return respond({
      id: "report-1", formCode: "FORM-PRJ-001", title: "Project profile and readiness report",
      recordStatus: "active", revisionNumber: 1, filenameStem: "CHAIN-001_FORM-PRJ-001_r0001",
    }, 201);
    return route.fulfill({ status: 404, headers: corsHeaders, json: { error: "not_found", correlationId: "browser-chain" } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: /Documents/u }).click();
  await expect(page.getByRole("heading", { name: "Guided controlled execution - CHAIN-001" })).toBeVisible();
  await page.getByLabel("Document number").fill("MTR-001");
  await page.getByLabel("Title", { exact: true }).fill("Material certification");
  await page.getByLabel("Document type").fill("MTR");
  await page.getByLabel("Discipline").fill("Materials");
  await page.getByRole("button", { name: "Register document" }).click();
  await page.getByLabel("File to upload").setInputFiles({ name: "mtr.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n%%EOF") });
  await page.getByRole("button", { name: "Upload to private staging" }).click();
  await page.getByRole("button", { name: "Refresh processing status" }).click();
  await page.getByRole("button", { name: "Release as distinct file authority" }).click();
  await page.getByLabel("Revision").fill("A");
  await page.getByLabel("Purpose").fill("Material release");
  await page.getByLabel("Source").fill("Vendor submission");
  await page.getByRole("button", { name: "Submit released-file revision" }).click();
  await page.getByRole("button", { name: "Approve as distinct actor" }).click();
  await page.getByRole("button", { name: "Release current-for-work" }).click();

  await page.getByRole("link", { name: /Materials/u }).click();
  const materialValues: Readonly<Record<string, string>> = {
    "Approved project configuration revision ID": "config-1", "Material identifier": "HEAT-001",
    "Receipt number": "REC-001", "Purchase reference": "PO-001", "Vendor organization ID": "org-vendor",
    "Specification": "SPEC-001", "Grade": "GRADE-1", "Form": "pipe", "Dimensions": "2 in",
    "Quantity": "10", "Unit code": "EA", "Heat / lot": "LOT-001", "Released MTR revision ID": "revision-1",
    "Receipt evidence file IDs": "file-receipt-1", "Storage location": "controlled-rack-1", "Governing PMI rule": "PMI-RULE-1",
  };
  for (const [label, fieldValue] of Object.entries(materialValues)) await page.getByLabel(label, { exact: true }).fill(fieldValue);
  await page.getByRole("button", { name: "Receive material" }).click();
  await page.getByLabel("Heat / lot matches").check();
  await page.getByLabel("Grade matches").check();
  await page.getByLabel("Specification matches").check();
  await page.getByLabel("MTR review notes").fill("Exact released revision matches the received material.");
  await page.getByLabel("MTR review evidence file IDs").fill("file-mtr-review-1");
  await page.getByRole("button", { name: "Accept as distinct qualified reviewer" }).click();
  await page.getByRole("button", { name: "Accept receiving inspection" }).click();

  await page.getByRole("link", { name: /Quality/u }).click();
  await page.getByLabel("Equipment identifier").fill("XRF-001");
  await page.getByLabel("Serial number").fill("SER-001");
  await page.getByLabel("Method capabilities").fill("XRF");
  await page.getByLabel("Verification evidence file ID").fill("file-cal-1");
  await page.getByLabel("Valid from").fill("2026-07-01T08:00");
  await page.getByLabel("Valid to").fill("2027-07-01T08:00");
  await page.getByRole("button", { name: "Register verified equipment" }).click();
  await page.getByLabel("Governing rule", { exact: true }).fill("PMI-RULE-1");
  await page.getByLabel("Required material").fill("GRADE-1");
  await page.getByLabel("Observed material").fill("GRADE-1");
  await page.getByLabel("Method", { exact: true }).fill("XRF");
  await page.getByLabel("Component location").fill("HEAT-001 receiving rack");
  await page.getByLabel("PMI notes").fill("Observed material matches the controlled requirement.");
  await page.getByLabel("Inspected at").fill("2026-07-21T08:00");
  await page.getByLabel("Reading summary").fill("Match");
  await page.getByLabel("Evidence file IDs", { exact: true }).fill("file-pmi-1");
  await page.getByLabel("PMI result").selectOption("fail");
  await expect(page.getByLabel("Failed PMI NCR number")).toBeVisible();
  await expect(page.getByLabel("Failure responsible user ID")).toBeVisible();
  await page.getByLabel("PMI result").selectOption("pass");
  await page.getByRole("button", { name: "Submit PMI result" }).click();
  await page.getByRole("button", { name: "Accept as distinct qualified actor" }).click();
  await page.getByRole("link", { name: /Materials/u }).click();
  await page.getByRole("button", { name: "Release after all checks" }).click();

  await page.getByRole("link", { name: /Quality/u }).click();
  await page.getByLabel("NCR number").fill("NCR-001");
  await page.getByLabel("Requirement reference").fill("SPEC-001 4.2");
  await page.getByLabel("Description", { exact: true }).first().fill("Controlled exception");
  await page.getByLabel("Containment").fill("Quarantine affected material");
  await page.getByLabel("Initial evidence file IDs").fill("file-ncr-initial-1");
  await page.getByLabel("Responsible user ID").fill("material-owner");
  await page.getByRole("button", { name: "Open NCR" }).click();
  await page.getByLabel("Proposed disposition").fill("Repair and reinspect");
  await page.getByLabel("Corrective action").fill("Repair the condition and repeat the governed inspection.");
  await page.getByLabel("Reinspection evidence file ID").fill("file-reinspect-1");
  await page.getByRole("button", { name: "Propose disposition" }).click();
  await page.getByRole("button", { name: "Approve disposition" }).click();
  await page.getByRole("button", { name: "Record reinspection" }).click();
  await page.getByRole("button", { name: "Close NCR" }).click();
  await page.getByLabel("Punch number").fill("P-001");
  await page.getByLabel("Type", { exact: true }).last().fill("completion");
  await page.getByLabel("Owner user ID").fill("punch-owner");
  await page.getByLabel("Description", { exact: true }).last().fill("Install identification tag");
  await page.getByRole("button", { name: "Open punch" }).click();
  await page.getByLabel("Owner evidence file IDs").fill("file-owner-1");
  await page.getByRole("article").filter({ hasText: "Optional punch path" })
    .getByLabel("Verification evidence file ID").fill("file-verify-1");
  await page.getByRole("button", { name: "Owner complete" }).click();
  await page.getByRole("button", { name: "Verify independently" }).click();
  await page.getByRole("button", { name: "Close punch" }).click();

  await page.getByRole("link", { name: /Turnover/u }).click();
  await page.getByLabel("Boundary code").fill("SYS-001");
  await page.getByLabel("Boundary name").fill("Process system");
  await page.getByRole("button", { name: "Create boundary" }).click();
  await page.getByLabel("Requirement code").fill("MAT-ACCEPTED");
  await page.getByLabel("Acceptance authority").fill("quality-authority");
  await page.getByRole("button", { name: "Add requirement" }).click();
  await page.getByLabel("Package code").fill("TOV-SYS-001");
  await page.getByLabel("Recipient scope").fill("owner-operator");
  await page.getByRole("button", { name: "Create package" }).click();
  await page.getByRole("button", { name: "Recalculate readiness" }).click();
  await expect(page.getByText("released material present")).toBeVisible();
  await page.getByRole("button", { name: "Generate immutable version" }).click();
  await expect(page.getByText("Version 1 generated")).toBeVisible();
  await page.getByRole("link", { name: /Reports/u }).click();
  await page.getByRole("button", { name: "Recalculate dashboard" }).click();
  await expect(page.getByText("9 privileged project action(s)")).toBeVisible();
  await page.getByRole("button", { name: "Generate immutable report" }).click();
  await expect(page.getByText("Project profile and readiness report")).toBeVisible();
  expect(requests.map((item) => item.path)).toContain("/v1/turnover/generate");
  expect(requests.map((item) => item.path)).toContain("/v1/projects/project-chain/file-uploads");
  expect(requests.map((item) => item.path)).toContain("/v1/materials/material-1/mtr-reviews");
  expect(requests.find((item) => item.path === "/v1/projects/project-chain/materials")?.body).toMatchObject({
    projectConfigurationRevisionId: "config-1", mtrDocumentRevisionId: "revision-1", pmiRequired: true,
  });
  expect(requests.find((item) => item.path === "/v1/materials/material-1/pmi")?.body).toMatchObject({
    componentLocation: "HEAT-001 receiving rack", notes: "Observed material matches the controlled requirement.", result: "pass",
  });
  expect(requests.find((item) => item.path === "/v1/projects/project-chain/ncrs")?.body).toMatchObject({
    evidenceFileIds: ["file-ncr-initial-1"], responsibleUserId: "material-owner",
  });
  await expectNoSeriousAccessibilityViolations(page);
});

test("NFR-USE-003: partner submission shows released scope and remains an EPV review claim", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("eiep.portal.userId", "partner-user");
    sessionStorage.setItem("eiep.portal.organizationId", "org-partner");
  });
  await page.route("http://127.0.0.1:3100/**", async (route) => {
    const request = route.request();
    const portalCors = { ...corsHeaders, "access-control-allow-origin": "http://127.0.0.1:3201" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: portalCors });
      return;
    }
    const url = new URL(request.url());
    if (url.pathname === "/health") {
      await route.fulfill({ headers: portalCors, json: { environment: "test", training: false } });
      return;
    }
    if (url.pathname === "/v1/portal/assigned-work") {
      await route.fulfill({ headers: portalCors, json: [{
        id: "assignment-1", projectId: "project-1", organizationId: "org-partner",
        approvedScopeCode: "PIPE-FAB", workPackageIds: ["wp-10"], authorizationReference: "PO-10",
        mobilizationState: "released", version: 3,
      }] });
      return;
    }
    if (url.pathname === "/v1/portal/projects/project-1/work-packages/wp-10/submissions") {
      await route.fulfill({ status: 201, headers: portalCors, json: {
        id: "submission-1", projectId: "project-1", workPackageId: "wp-10", category: "progress",
        title: "Week 32 progress", state: "submitted", version: 1,
      } });
      return;
    }
    await route.fulfill({ status: 404, headers: portalCors, json: { error: "not_found" } });
  });
  await page.goto("http://127.0.0.1:3201");
  await page.getByRole("button", { name: "Load assigned work" }).click();
  await expect(page.getByText("PIPE-FAB")).toBeVisible();
  await page.getByLabel("Title").fill("Week 32 progress");
  await page.getByLabel("Claimed progress (%)").fill("72.5");
  await page.getByLabel("Released evidence file IDs").fill("file-evidence-1");
  await page.getByRole("button", { name: "Submit for EPV review" }).click();
  await expect(page.getByRole("status").filter({ hasText: "remains a claim until distinct EPV acceptance" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});
