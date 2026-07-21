import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type {
  AuditEvent,
  ExternalIdentityRecord,
  IdentityAccountRecord,
  ManagedAccessAssignmentRecord,
} from "@eiep/shared-types";
import type { FoundationStore } from "./foundation-store.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const initialIdentityAdministratorPermissions = [
  "identity.account.manage",
  "identity.account.approve",
  "access.assignment.manage",
  "access.assignment.review",
  "access.delegation.create",
  "access.delegation.manage",
  "access.delegation.review",
  "access.delegation.revoke",
] as const;

export const initialIdentityAdministratorQualifications = [
  "identity_administrator",
  "access_administrator",
  "access_reviewer",
] as const;

export interface InitialApplicationAdministratorInput {
  readonly userAccountId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly externalIdentityId: string;
  readonly subject: string;
  readonly accessAssignmentId: string;
}

export interface ApplicationIdentityBootstrapInput {
  readonly authorizationReference: string;
  readonly requesterAuthorityId: string;
  readonly approverAuthorityId: string;
  readonly businessScopeOrganizationId: string;
  readonly issuer: string;
  readonly authorizedAt: Date;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date;
  readonly administrators: readonly InitialApplicationAdministratorInput[];
}

export interface ApplicationIdentityBootstrapResult {
  readonly status: "created" | "verified";
  readonly administratorCount: 2;
  readonly authorizationReferenceSha256: string;
  readonly effectiveTo: Date;
}

export class ApplicationIdentityBootstrapError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ApplicationIdentityBootstrapError";
  }
}

function requiredString(value: unknown, field: string, maximumLength = 256): string {
  if (typeof value !== "string") throw new ApplicationIdentityBootstrapError(`${field} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || /[\r\n\u0000]/u.test(normalized)) {
    throw new ApplicationIdentityBootstrapError(`${field} is invalid.`);
  }
  return normalized;
}

function requiredUuid(value: unknown, field: string): string {
  const normalized = requiredString(value, field, 36);
  if (!uuidPattern.test(normalized)) throw new ApplicationIdentityBootstrapError(`${field} must be a UUID.`);
  return normalized.toLowerCase();
}

function requiredDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? new Date(value) : typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime()) || (typeof value === "string" && date.toISOString() !== value)) {
    throw new ApplicationIdentityBootstrapError(`${field} must be an exact UTC ISO timestamp.`);
  }
  return date;
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    throw new ApplicationIdentityBootstrapError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function normalizeIssuer(value: unknown): string {
  const issuer = requiredString(value, "issuer", 2048);
  let parsed: URL;
  try {
    parsed = new URL(issuer);
  } catch {
    throw new ApplicationIdentityBootstrapError("issuer must be an HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ApplicationIdentityBootstrapError("issuer must be an HTTPS URL without credentials, query, or fragment.");
  }
  return issuer;
}

function normalizeAdministrator(value: unknown, index: number): InitialApplicationAdministratorInput {
  const administrator = requiredObject(value, `administrators[${index}]`);
  return {
    userAccountId: requiredUuid(administrator.userAccountId, `administrators[${index}].userAccountId`),
    personId: requiredUuid(administrator.personId, `administrators[${index}].personId`),
    displayName: requiredString(administrator.displayName, `administrators[${index}].displayName`, 200),
    externalIdentityId: requiredUuid(administrator.externalIdentityId, `administrators[${index}].externalIdentityId`),
    subject: requiredString(administrator.subject, `administrators[${index}].subject`, 512),
    accessAssignmentId: requiredUuid(administrator.accessAssignmentId, `administrators[${index}].accessAssignmentId`),
  };
}

function normalizeInput(input: ApplicationIdentityBootstrapInput, now: Date): ApplicationIdentityBootstrapInput {
  const inputRecord = requiredObject(input, "bootstrap input");
  const administratorsValue = inputRecord.administrators;
  if (!Array.isArray(administratorsValue) || administratorsValue.length !== 2) {
    throw new ApplicationIdentityBootstrapError("Exactly two initial application administrators are required.");
  }
  const administrators = administratorsValue.map((administrator, index) => normalizeAdministrator(administrator, index));
  const authorizationReference = requiredString(inputRecord.authorizationReference, "authorizationReference", 512);
  const requesterAuthorityId = requiredUuid(inputRecord.requesterAuthorityId, "requesterAuthorityId");
  const approverAuthorityId = requiredUuid(inputRecord.approverAuthorityId, "approverAuthorityId");
  const businessScopeOrganizationId = requiredUuid(inputRecord.businessScopeOrganizationId, "businessScopeOrganizationId");
  const authorizedAt = requiredDate(inputRecord.authorizedAt, "authorizedAt");
  const effectiveFrom = requiredDate(inputRecord.effectiveFrom, "effectiveFrom");
  const effectiveTo = requiredDate(inputRecord.effectiveTo, "effectiveTo");
  if (requesterAuthorityId === approverAuthorityId) {
    throw new ApplicationIdentityBootstrapError("Bootstrap request and approval authorities must be distinct.");
  }
  if (authorizedAt.getTime() > now.getTime() || effectiveFrom.getTime() < authorizedAt.getTime()
    || effectiveFrom.getTime() > now.getTime() || effectiveTo.getTime() <= now.getTime()
    || effectiveTo.getTime() <= effectiveFrom.getTime()) {
    throw new ApplicationIdentityBootstrapError("Bootstrap authorization and access dates are not currently valid and bounded.");
  }
  const uniquenessGroups: readonly (readonly string[])[] = [
    administrators.map((administrator) => administrator.userAccountId),
    administrators.map((administrator) => administrator.personId),
    administrators.map((administrator) => administrator.externalIdentityId),
    administrators.map((administrator) => administrator.subject),
    administrators.map((administrator) => administrator.accessAssignmentId),
  ];
  if (uniquenessGroups.some((values) => new Set(values).size !== values.length)) {
    throw new ApplicationIdentityBootstrapError("Initial administrator identities and assignments must be distinct.");
  }
  const accountIds = new Set(administrators.map((administrator) => administrator.userAccountId));
  if (accountIds.has(requesterAuthorityId) || accountIds.has(approverAuthorityId)) {
    throw new ApplicationIdentityBootstrapError("Bootstrap authorities must be distinct from the initial administrator accounts.");
  }
  return {
    authorizationReference,
    requesterAuthorityId,
    approverAuthorityId,
    businessScopeOrganizationId,
    issuer: normalizeIssuer(inputRecord.issuer),
    authorizedAt,
    effectiveFrom,
    effectiveTo,
    administrators,
  };
}

export function parseApplicationIdentityBootstrapJson(text: string): ApplicationIdentityBootstrapInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApplicationIdentityBootstrapError("APPLICATION_IDENTITY_BOOTSTRAP_JSON must be valid JSON.");
  }
  const input = requiredObject(parsed, "bootstrap input");
  if (!Array.isArray(input.administrators) || input.administrators.length !== 2) {
    throw new ApplicationIdentityBootstrapError("Exactly two initial application administrators are required.");
  }
  return {
    authorizationReference: requiredString(input.authorizationReference, "authorizationReference", 512),
    requesterAuthorityId: requiredUuid(input.requesterAuthorityId, "requesterAuthorityId"),
    approverAuthorityId: requiredUuid(input.approverAuthorityId, "approverAuthorityId"),
    businessScopeOrganizationId: requiredUuid(input.businessScopeOrganizationId, "businessScopeOrganizationId"),
    issuer: normalizeIssuer(input.issuer),
    authorizedAt: requiredDate(input.authorizedAt, "authorizedAt"),
    effectiveFrom: requiredDate(input.effectiveFrom, "effectiveFrom"),
    effectiveTo: requiredDate(input.effectiveTo, "effectiveTo"),
    administrators: input.administrators.map((administrator, index) => normalizeAdministrator(administrator, index)),
  };
}

function event(
  key: string,
  occurredAt: Date,
  actorUserId: string,
  actingOrganizationId: string,
  correlationId: string,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId,
    actingOrganizationId,
    projectId: input.projectId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    priorState: input.priorState,
    newState: input.newState,
    reason: input.reason,
    correlationId,
    changedFields: input.changedFields,
  };
  return {
    id: stableUuid(key), occurredAt, ...payload,
    canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

function sortedById<T extends { readonly id: string }>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function expectedBoundary(input: ApplicationIdentityBootstrapInput) {
  const referenceSha256 = createHash("sha256").update(input.authorizationReference).digest("hex");
  const correlationId = `application-identity-bootstrap:${referenceSha256.slice(0, 24)}`;
  const scope = {
    organizationId: input.businessScopeOrganizationId,
    projectId: null,
    workPackageId: null,
    objectId: null,
  } as const;
  const accounts: IdentityAccountRecord[] = [];
  const identities: ExternalIdentityRecord[] = [];
  const assignments: ManagedAccessAssignmentRecord[] = [];
  const audits: AuditEvent[] = [];
  for (const administrator of input.administrators) {
    const account: IdentityAccountRecord = {
      id: administrator.userAccountId,
      personId: administrator.personId,
      displayName: administrator.displayName,
      state: "active",
      qualificationCodes: initialIdentityAdministratorQualifications,
      version: 2,
      createdAt: input.authorizedAt,
      createdBy: input.requesterAuthorityId,
      updatedAt: input.authorizedAt,
      updatedBy: input.approverAuthorityId,
    };
    const identity: ExternalIdentityRecord = {
      id: administrator.externalIdentityId,
      userAccountId: administrator.userAccountId,
      issuer: input.issuer,
      subject: administrator.subject,
      identityType: "internal",
      lastVerifiedAt: null,
      version: 1,
      createdAt: input.authorizedAt,
      createdBy: input.requesterAuthorityId,
    };
    const assignment: ManagedAccessAssignmentRecord = {
      id: administrator.accessAssignmentId,
      userId: administrator.userAccountId,
      actingOrganizationId: input.businessScopeOrganizationId,
      permissions: initialIdentityAdministratorPermissions,
      scope,
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
    identities.push(identity);
    assignments.push(assignment);
    const eventKey = `${referenceSha256}:${administrator.userAccountId}`;
    audits.push(
      event(`${eventKey}:account-provisioned`, input.authorizedAt, input.requesterAuthorityId,
        input.businessScopeOrganizationId, correlationId, {
          projectId: null, action: "identity.account_provisioned", objectType: "user_account",
          objectId: account.id, priorState: null, newState: "invited", reason: input.authorizationReference,
          changedFields: { personId: account.personId, qualificationCodes: account.qualificationCodes },
        }),
      event(`${eventKey}:account-activated`, input.authorizedAt, input.approverAuthorityId,
        input.businessScopeOrganizationId, correlationId, {
          projectId: null, action: "identity.account_activated", objectType: "user_account",
          objectId: account.id, priorState: "invited", newState: "active", reason: input.authorizationReference,
          changedFields: {},
        }),
      event(`${eventKey}:external-linked`, input.authorizedAt, input.requesterAuthorityId,
        input.businessScopeOrganizationId, correlationId, {
          projectId: null, action: "identity.external_linked", objectType: "external_identity",
          objectId: identity.id, priorState: null, newState: "linked", reason: "internal",
          changedFields: { userAccountId: account.id, issuer: input.issuer },
        }),
      event(`${eventKey}:assignment-created`, input.authorizedAt, input.requesterAuthorityId,
        input.businessScopeOrganizationId, correlationId, {
          projectId: null, action: "access.assignment_changed", objectType: "role_assignment",
          objectId: assignment.id, priorState: null, newState: "active", reason: input.authorizationReference,
          changedFields: { userId: assignment.userId, permissions: assignment.permissions, scope,
            effectiveTo: assignment.effectiveTo?.toISOString() },
        }),
      event(`${eventKey}:assignment-reviewed`, input.authorizedAt, input.approverAuthorityId,
        input.businessScopeOrganizationId, correlationId, {
          projectId: null, action: "access.assignment_reviewed", objectType: "role_assignment",
          objectId: assignment.id, priorState: "active", newState: "active", reason: input.authorizationReference,
          changedFields: { reviewedBy: input.approverAuthorityId },
        }),
    );
  }
  const bootstrapObjectId = stableUuid(`${referenceSha256}:application-identity-bootstrap`);
  audits.push(event(`${referenceSha256}:bootstrap-completed`, input.authorizedAt, input.approverAuthorityId,
    input.businessScopeOrganizationId, correlationId, {
      projectId: null, action: "identity.bootstrap_completed", objectType: "application_identity_bootstrap",
      objectId: bootstrapObjectId, priorState: null, newState: "verified", reason: input.authorizationReference,
      changedFields: { administratorCount: 2, effectiveTo: input.effectiveTo.toISOString() },
    }));
  return {
    accounts: sortedById(accounts),
    identities: sortedById(identities),
    assignments: sortedById(assignments),
    audits: sortedById(audits),
    referenceSha256,
  };
}

export async function bootstrapInitialApplicationAdministrators(
  store: FoundationStore,
  suppliedInput: ApplicationIdentityBootstrapInput,
  clock: () => Date = () => new Date(),
): Promise<ApplicationIdentityBootstrapResult> {
  const now = clock();
  if (Number.isNaN(now.getTime())) throw new ApplicationIdentityBootstrapError("The bootstrap clock is invalid.");
  const input = normalizeInput(suppliedInput, now);
  const expected = expectedBoundary(input);
  const status = await store.transaction((transaction) => {
    const current = transaction.applicationIdentityBootstrapState();
    const stateIsEmpty = current.identityAccounts.length === 0 && current.externalIdentities.length === 0
      && current.seededAssignments.length === 0 && current.managedAccessAssignments.length === 0
      && current.delegations.length === 0 && current.audits.length === 0;
    if (stateIsEmpty) {
      for (const account of expected.accounts) transaction.insertIdentityAccount(account);
      for (const identity of expected.identities) transaction.insertExternalIdentity(identity);
      for (const assignment of expected.assignments) transaction.insertAccessAssignment(assignment);
      for (const audit of expected.audits) transaction.appendAudit(audit);
      return "created" as const;
    }
    const exactRetry = current.seededAssignments.length === 0 && current.delegations.length === 0
      && isDeepStrictEqual(sortedById(current.identityAccounts), expected.accounts)
      && isDeepStrictEqual(sortedById(current.externalIdentities), expected.identities)
      && isDeepStrictEqual(sortedById(current.managedAccessAssignments), expected.assignments)
      && isDeepStrictEqual(sortedById(current.audits), expected.audits);
    if (!exactRetry) {
      throw new ApplicationIdentityBootstrapError(
        "Application identity state is nonempty or conflicts with the exact authorized bootstrap; no changes were made.",
      );
    }
    return "verified" as const;
  });
  return {
    status,
    administratorCount: 2,
    authorizationReferenceSha256: expected.referenceSha256,
    effectiveTo: input.effectiveTo,
  };
}
