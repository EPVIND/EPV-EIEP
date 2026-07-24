import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type { AuditEvent, IdentityAccountRecord, ManagedAccessAssignmentRecord } from "@eiep/shared-types";
import type { FoundationStore } from "./foundation-store.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const codePattern = /^[a-z][a-z0-9_.:-]{1,127}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

export interface LocalPilotUserInput {
  readonly userAccountId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly accessAssignmentId: string;
  readonly qualificationCodes: readonly string[];
  readonly permissions: readonly string[];
}
export interface LocalPilotBootstrapInput {
  readonly manifestVersion: 1;
  readonly mode: "controlled_local_pilot";
  readonly authorizationReference: string;
  readonly requesterAuthorityId: string;
  readonly approverAuthorityId: string;
  readonly businessScopeOrganizationId: string;
  readonly authorizedAt: Date;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date;
  readonly users: readonly LocalPilotUserInput[];
}

export interface LocalPilotBootstrapResult {
  readonly status: "created" | "verified";
  readonly userCount: number;
  readonly manifestSha256: string;
  readonly effectiveTo: Date;
}

export class LocalPilotBootstrapError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LocalPilotBootstrapError";
  }
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    throw new LocalPilotBootstrapError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maximumLength = 256): string {
  if (typeof value !== "string") throw new LocalPilotBootstrapError(`${field} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || /[\r\n\u0000]/u.test(normalized)) {
    throw new LocalPilotBootstrapError(`${field} is invalid.`);
  }
  return normalized;
}

function requiredUuid(value: unknown, field: string): string {
  const normalized = requiredString(value, field, 36).toLowerCase();
  if (!uuidPattern.test(normalized)) throw new LocalPilotBootstrapError(`${field} must be a UUID.`);
  return normalized;
}

function requiredDate(value: unknown, field: string): Date {
  const parsed = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime()) || typeof value !== "string" || parsed.toISOString() !== value) {
    throw new LocalPilotBootstrapError(`${field} must be an exact UTC ISO timestamp.`);
  }
  return parsed;
}

function requiredCodes(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) {
    throw new LocalPilotBootstrapError(`${field} must contain between 1 and 256 values.`);
  }
  const codes = value.map((entry, index) => requiredString(entry, `${field}[${index}]`, 128).toLowerCase());
  if (codes.some((code) => !codePattern.test(code)) || new Set(codes).size !== codes.length) {
    throw new LocalPilotBootstrapError(`${field} contains an invalid or duplicate code.`);
  }
  return [...codes].sort();
}

function parseUser(value: unknown, index: number): LocalPilotUserInput {
  const user = requiredObject(value, `users[${index}]`);
  return {
    userAccountId: requiredUuid(user.userAccountId, `users[${index}].userAccountId`),
    personId: requiredUuid(user.personId, `users[${index}].personId`),
    displayName: requiredString(user.displayName, `users[${index}].displayName`, 200),
    accessAssignmentId: requiredUuid(user.accessAssignmentId, `users[${index}].accessAssignmentId`),
    qualificationCodes: requiredCodes(user.qualificationCodes, `users[${index}].qualificationCodes`),
    permissions: requiredCodes(user.permissions, `users[${index}].permissions`),
  };
}

export function parseLocalPilotBootstrapJson(text: string): LocalPilotBootstrapInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LocalPilotBootstrapError("The local pilot manifest must be valid JSON.");
  }
  const input = requiredObject(parsed, "local pilot manifest");
  if (input.manifestVersion !== 1 || input.mode !== "controlled_local_pilot") {
    throw new LocalPilotBootstrapError("The local pilot manifest version or mode is invalid.");
  }
  if (!Array.isArray(input.users) || input.users.length < 3 || input.users.length > 12) {
    throw new LocalPilotBootstrapError("A controlled pilot requires between 3 and 12 distinct users.");
  }
  const users = input.users.map((user, index) => parseUser(user, index));
  const uniquenessGroups = [
    users.map((user) => user.userAccountId),
    users.map((user) => user.personId),
    users.map((user) => user.accessAssignmentId),
  ];
  if (uniquenessGroups.some((values) => new Set(values).size !== values.length)) {
    throw new LocalPilotBootstrapError("Pilot account, person, and assignment identifiers must be distinct.");
  }
  const requesterAuthorityId = requiredUuid(input.requesterAuthorityId, "requesterAuthorityId");
  const approverAuthorityId = requiredUuid(input.approverAuthorityId, "approverAuthorityId");
  if (requesterAuthorityId === approverAuthorityId) {
    throw new LocalPilotBootstrapError("Pilot request and approval authorities must be distinct.");
  }
  if (users.some((user) => user.userAccountId === requesterAuthorityId || user.userAccountId === approverAuthorityId)) {
    throw new LocalPilotBootstrapError("Pilot authorizing authorities must be distinct from pilot users.");
  }
  const authorizedAt = requiredDate(input.authorizedAt, "authorizedAt");
  const effectiveFrom = requiredDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = requiredDate(input.effectiveTo, "effectiveTo");
  if (effectiveFrom.getTime() < authorizedAt.getTime() || effectiveTo.getTime() <= effectiveFrom.getTime()) {
    throw new LocalPilotBootstrapError("Pilot authorization and access dates are not ordered correctly.");
  }
  if (!users.some((user) => user.permissions.includes("project.create"))
    || users.some((user) => !user.permissions.includes("project.read"))) {
    throw new LocalPilotBootstrapError("At least one pilot user must create projects and every pilot user must read assigned projects.");
  }
  return {
    manifestVersion: 1,
    mode: "controlled_local_pilot",
    authorizationReference: requiredString(input.authorizationReference, "authorizationReference", 512),
    requesterAuthorityId,
    approverAuthorityId,
    businessScopeOrganizationId: requiredUuid(input.businessScopeOrganizationId, "businessScopeOrganizationId"),
    authorizedAt,
    effectiveFrom,
    effectiveTo,
    users,
  };
}

export function loadEphemeralLocalPilotBootstrapJson(text: string) {
  if (Buffer.byteLength(text, "utf8") < 2 || Buffer.byteLength(text, "utf8") > 128 * 1024) {
    throw new LocalPilotBootstrapError("The ephemeral pilot manifest must be between 2 bytes and 128 KiB.");
  }
  return {
    input: parseLocalPilotBootstrapJson(text),
    manifestSha256: createHash("sha256").update(text).digest("hex"),
  };
}

export async function loadLocalPilotBootstrapFile(path: string, expectedSha256: string) {
  if (!sha256Pattern.test(expectedSha256)) throw new LocalPilotBootstrapError("The local pilot manifest SHA-256 is invalid.");
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > 128 * 1024) {
    throw new LocalPilotBootstrapError("The local pilot manifest must be a regular JSON file no larger than 128 KiB.");
  }
  const text = await readFile(path, "utf8");
  const actualSha256 = createHash("sha256").update(text).digest("hex");
  if (actualSha256 !== expectedSha256) throw new LocalPilotBootstrapError("The local pilot manifest SHA-256 does not match.");
  return { input: parseLocalPilotBootstrapJson(text), manifestSha256: actualSha256 };
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function auditEvent(
  manifestSha256: string,
  input: LocalPilotBootstrapInput,
  action: string,
  objectType: string,
  objectId: string,
  actorUserId: string,
  changedFields: Readonly<Record<string, unknown>>,
): AuditEvent {
  const correlationId = `local-pilot-bootstrap:${manifestSha256.slice(0, 24)}`;
  const payload = {
    actorUserId,
    actingOrganizationId: input.businessScopeOrganizationId,
    projectId: null,
    action,
    objectType,
    objectId,
    priorState: null,
    newState: "active",
    reason: input.authorizationReference,
    correlationId,
    changedFields,
  };
  return {
    id: stableUuid(`${manifestSha256}:${action}:${objectId}`),
    occurredAt: input.authorizedAt,
    ...payload,
    canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

function expectedBoundary(input: LocalPilotBootstrapInput, manifestSha256: string) {
  const accounts: IdentityAccountRecord[] = [];
  const assignments: ManagedAccessAssignmentRecord[] = [];
  const audits: AuditEvent[] = [];
  for (const user of input.users) {
    const account: IdentityAccountRecord = {
      id: user.userAccountId,
      personId: user.personId,
      displayName: user.displayName,
      state: "active",
      qualificationCodes: user.qualificationCodes,
      version: 1,
      createdAt: input.authorizedAt,
      createdBy: input.requesterAuthorityId,
      updatedAt: input.authorizedAt,
      updatedBy: input.approverAuthorityId,
    };
    const assignment: ManagedAccessAssignmentRecord = {
      id: user.accessAssignmentId,
      userId: user.userAccountId,
      actingOrganizationId: input.businessScopeOrganizationId,
      permissions: user.permissions,
      scope: { organizationId: input.businessScopeOrganizationId, projectId: null, workPackageId: null, objectId: null },
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      revokedAt: null,
      grantedBy: input.requesterAuthorityId,
      grantReason: input.authorizationReference,
      reviewedAt: input.authorizedAt,
      reviewedBy: input.approverAuthorityId,
      version: 2,
      createdAt: input.authorizedAt,
    };
    accounts.push(account);
    assignments.push(assignment);
    audits.push(
      auditEvent(manifestSha256, input, "identity.local_pilot_account_activated", "user_account", account.id,
        input.requesterAuthorityId, { displayName: account.displayName, qualificationCodes: account.qualificationCodes }),
      auditEvent(manifestSha256, input, "access.local_pilot_assignment_reviewed", "role_assignment", assignment.id,
        input.approverAuthorityId, { userId: assignment.userId, permissions: assignment.permissions, effectiveTo: assignment.effectiveTo?.toISOString() }),
    );
  }
  audits.push(auditEvent(manifestSha256, input, "identity.local_pilot_bootstrap_completed", "local_pilot_bootstrap",
    stableUuid(`${manifestSha256}:boundary`), input.approverAuthorityId, { userCount: input.users.length, manifestSha256 }));
  return { accounts, assignments, audits };
}

export async function bootstrapLocalPilotAccess(
  store: FoundationStore,
  input: LocalPilotBootstrapInput,
  manifestSha256: string,
  clock: () => Date = () => new Date(),
): Promise<LocalPilotBootstrapResult> {
  const now = clock();
  if (input.authorizedAt.getTime() > now.getTime() || input.effectiveFrom.getTime() > now.getTime()
    || input.effectiveTo.getTime() <= now.getTime() || input.effectiveTo.getTime() - input.effectiveFrom.getTime() > 120 * 24 * 60 * 60 * 1000) {
    throw new LocalPilotBootstrapError("Pilot authorization must be current and access must expire within 120 days.");
  }
  const expected = expectedBoundary(input, manifestSha256);
  const status = await store.transaction((transaction) => {
    const currentAccounts = expected.accounts.map((account) => transaction.identityAccountById(account.id));
    const currentAssignments = expected.assignments.map((assignment) => transaction.accessAssignmentById(assignment.id));
    const present = [...currentAccounts, ...currentAssignments].filter(Boolean).length;
    if (present === 0) {
      for (const account of expected.accounts) transaction.insertIdentityAccount(account);
      for (const assignment of expected.assignments) transaction.insertAccessAssignment(assignment);
      for (const audit of expected.audits) transaction.appendAudit(audit);
      return "created" as const;
    }
    if (present !== currentAccounts.length + currentAssignments.length
      || !isDeepStrictEqual(currentAccounts, expected.accounts)
      || !isDeepStrictEqual(currentAssignments, expected.assignments)) {
      throw new LocalPilotBootstrapError("Existing identity state conflicts with the exact local pilot manifest; no changes were made.");
    }
    return "verified" as const;
  });
  return { status, userCount: input.users.length, manifestSha256, effectiveTo: input.effectiveTo };
}
