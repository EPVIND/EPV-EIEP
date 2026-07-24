import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argumentsByName = new Map();
const commandArguments = process.argv.slice(2).filter((value, index) => !(index === 0 && value === "--"));
for (let index = 0; index < commandArguments.length; index += 2) {
  const name = commandArguments[index];
  const value = commandArguments[index + 1];
  if (!name?.startsWith("--") || !value) throw new Error(`Invalid argument near ${name ?? "end of command"}.`);
  argumentsByName.set(name.slice(2), value);
}

function required(name, maximumLength = 200) {
  const value = argumentsByName.get(name)?.trim();
  if (!value || value.length > maximumLength || /[\r\n\u0000]/u.test(value)) throw new Error(`--${name} is required.`);
  return value;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const organizationId = required("organization-id", 36).toLowerCase();
if (!uuidPattern.test(organizationId)) throw new Error("--organization-id must be a UUID.");
const output = resolve(argumentsByName.get("output") ?? ".eiep-pilot/pilot-manifest.json");
const validDays = Number(argumentsByName.get("valid-days") ?? "30");
if (!Number.isInteger(validDays) || validDays < 1 || validDays > 120) throw new Error("--valid-days must be between 1 and 120.");

const actions = [
  "access.assignment.manage", "access.assignment.review", "access.delegation.create", "access.delegation.manage", "access.delegation.review", "access.delegation.revoke",
  "audit.read", "cnc.execute", "cnc.execution.reconcile", "cnc.job.download", "cnc.job.release", "cnc.profile.approve", "cnc.profile.manage", "cnc.program.approve", "cnc.program.plan", "cnc.program.submit", "cnc.read",
  "collaboration.import.commit", "collaboration.import.preview", "collaboration.read", "collaboration.reconcile", "collaboration.review",
  "controls.baseline.approve", "controls.baseline.create", "controls.baseline.submit", "controls.change.approve", "controls.change.manage", "controls.cost.accept", "controls.cost.submit", "controls.policy.approve", "controls.policy.manage", "controls.progress.accept", "controls.progress.submit", "controls.read",
  "document.acknowledge", "document.approve", "document.create", "document.distribute", "document.read_current", "document.release", "document.revision.submit",
  "engineering.register.approve", "engineering.register.manage", "engineering.register.read", "engineering.register.submit", "epv.accept",
  "estimate.approve", "estimate.catalog.approve", "estimate.catalog.manage", "estimate.create", "estimate.edit", "estimate.handoff", "estimate.proposal.approve", "estimate.proposal.download", "estimate.proposal.generate", "estimate.proposal.issue", "estimate.quote.manage", "estimate.quote.select", "estimate.read", "estimate.revise", "estimate.submit",
  "execution.read", "export.create", "export.download", "export.downloaded", "export.process",
  "fabrication.accept", "fabrication.approve", "fabrication.plan", "fabrication.read", "fabrication.release", "fabrication.submit",
  "file.download", "file.read", "file.release", "file.upload", "file.validate", "identity.account.approve", "identity.account.manage",
  "import.commit", "import.create", "import.validate", "inspection.accept", "inspection.equipment.manage", "inspection.perform", "inspection.plan.approve", "inspection.plan.manage", "inspection.read",
  "integration.manage", "integration.process", "integration.receive", "material.genealogy.manage", "material.issue", "material.move", "material.mtr.review", "material.read", "material.receive", "material.release.approve", "material.return",
  "mobilization.configure", "mobilization.evaluate", "mobilization.release", "mobilization.submit", "ncr.close", "ncr.create", "ncr.disposition.approve", "ncr.disposition.propose", "ncr.read", "ncr.reinspect", "nde.approve", "nde.perform", "nde.request.manage",
  "notification.deliver", "notification.dispatch", "notification.subscription.manage", "offline.draft.create", "offline.draft.sync",
  "pmi.accept", "pmi.override.approve", "pmi.override.manage", "pmi.perform", "pmi.read",
  "procurement.bid.award", "procurement.bid.manage", "procurement.bid.recommend", "procurement.expedite.manage", "procurement.requisition.approve", "procurement.requisition.manage",
  "project.activate", "project.assignment.manage", "project.configuration.approve", "project.configuration.manage", "project.create", "project.read", "project.structure.manage",
  "punch.close", "punch.create", "punch.read", "punch.update.owned", "punch.verify", "pwht.approve", "pwht.perform", "record.governing_document.link",
  "records.disposition.approve", "records.disposition.execute", "records.disposition.manage", "records.legal_hold.manage", "records.retention.approve", "records.retention.manage",
  "report.generate", "report.read", "schedule.approve", "schedule.import", "schedule.manage", "schedule.read",
  "subcontractor.assign", "subcontractor.profile.manage", "subcontractor.qualify", "subcontractor.submit",
  "testing.approve", "testing.execute", "testing.manage", "turnover.configure", "turnover.generate", "turnover.package.create", "turnover.read",
  "welding.manage", "welding.procedure.approve", "welding.procedure.manage", "welding.qualification.approve", "welding.qualification.manage", "welding.release",
];

const readAction = (action) => /(?:^|\.)(?:read|download|downloaded)$/u.test(action) || action === "audit.read" || action === "execution.read";
const authorityAction = (action) => /(?:approve|accept|release|review|verify|reconcile|select|award|activate|close|commit|download)/u.test(action);
const coordinatorDomains = new Set(["access", "audit", "document", "export", "file", "identity", "import", "integration", "notification", "project", "record", "records", "report"]);
const coordinatorPermissions = actions.filter((action) => coordinatorDomains.has(action.split(".")[0]) || readAction(action));
const authorPermissions = actions.filter((action) => !authorityAction(action) || readAction(action));
const reviewerPermissions = actions.filter((action) => authorityAction(action) || readAction(action));

const coordinatorQualifications = ["access_administrator", "identity_administrator", "legal_hold_authority", "project_configuration_authority", "records_disposition_operator", "records_retention_authority"];
const authorQualifications = ["cnc_cut_operator", "cnc_profile_operator", "cnc_waterjet_operator", "pmi_inspector", "pwht_operator", "quality_inspector", "receiving_inspector", "test_director"];
const reviewerQualifications = [
  "access_reviewer", "cnc_profile_authority", "cnc_reconciliation_authority", "cnc_release_authority", "cnc_technical_authority",
  "collaboration_import_authority", "commercial_authority", "completion_authority", "document_collaboration_authority", "engineering_authority",
  "epv_acceptance_authority", "estimating_authority", "fabrication_engineering_authority", "fabrication_quality_authority", "fabrication_release_authority",
  "file_release_authority", "inspection_plan_authority", "integration_authority", "integration_reconciliation_authority", "material_release_authority",
  "mobilization_authority", "mtr_reviewer", "ncr_close_authority", "ncr_disposition_authority", "nde_acceptance_authority", "pmi_acceptor", "pmi_override_authority",
  "procurement_authority", "project_controls_authority", "punch_verifier", "pwht_acceptance_authority", "scheduling_authority",
  "subcontractor_qualification_authority", "testing_acceptance_authority", "welding_authority", "welding_release_authority",
];
const workerPermissions = ["export.process", "file.validate", "integration.process", "notification.dispatch", "project.read"];
const workerQualifications = ["export_worker", "file_validation_worker", "integration_service", "integration_worker", "notification_worker"];

const now = new Date();
const effectiveTo = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
function user(displayName, permissions, qualificationCodes) {
  return {
    userAccountId: randomUUID(), personId: randomUUID(), displayName, accessAssignmentId: randomUUID(),
    qualificationCodes: [...qualificationCodes].sort(), permissions: [...new Set(permissions)].sort(),
  };
}

const manifest = {
  manifestVersion: 1,
  mode: "controlled_local_pilot",
  authorizationReference: required("authorization-reference", 512),
  requesterAuthorityId: randomUUID(),
  approverAuthorityId: randomUUID(),
  businessScopeOrganizationId: organizationId,
  authorizedAt: now.toISOString(),
  effectiveFrom: now.toISOString(),
  effectiveTo: effectiveTo.toISOString(),
  users: [
    user(required("coordinator-name"), coordinatorPermissions, coordinatorQualifications),
    user(required("author-name"), authorPermissions, authorQualifications),
    user(required("reviewer-name"), reviewerPermissions, reviewerQualifications),
    user("EIEP Local Pilot Worker", workerPermissions, workerQualifications),
  ],
};
const text = `${JSON.stringify(manifest, null, 2)}\n`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
const sha256 = createHash("sha256").update(text).digest("hex");
process.stdout.write(`${JSON.stringify({ output, sha256, organizationId, effectiveTo: manifest.effectiveTo,
  users: manifest.users.map(({ userAccountId, displayName }) => ({ userAccountId, displayName })) }, null, 2)}\n`);
