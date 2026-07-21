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

test("FR-DOC-001-004, FR-MAT-001-004, FR-PMI-001-003, FR-NCR-001-004, FR-TOV-001-004 / AC-03-09: guided internal workflow reaches an immutable turnover version", async ({ page }) => {
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
