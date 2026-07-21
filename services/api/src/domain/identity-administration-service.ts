import { createHash, randomUUID } from "node:crypto";
import { normalizeCodeListValue, requireAuthorization } from "@eiep/rules-engine";
import type {
  AccessContext,
  AuditEvent,
  ExternalIdentityRecord,
  IdentityAccountRecord,
  RoleAssignment,
} from "@eiep/shared-types";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type { FoundationStore } from "./foundation-store.js";

export interface ProvisionIdentityAccountInput {
  readonly businessScopeOrganizationId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly qualificationCodes: readonly string[];
}

export interface LinkExternalIdentityInput {
  readonly businessScopeOrganizationId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly identityType: ExternalIdentityRecord["identityType"];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${field} is required.`, [`${field}_required`]);
  return normalized;
}

function scope(organizationId: string, objectId: string | null) {
  return { organizationId, projectId: null, workPackageId: null, objectId };
}

function event(
  id: string,
  now: Date,
  context: AccessContext,
  input: Omit<AuditEvent, "id" | "occurredAt" | "actorUserId" | "actingOrganizationId" | "correlationId" | "canonicalSha256">,
): AuditEvent {
  const payload = {
    actorUserId: context.userId,
    actingOrganizationId: context.actingOrganizationId,
    projectId: input.projectId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    priorState: input.priorState,
    newState: input.newState,
    reason: input.reason,
    correlationId: context.correlationId,
    changedFields: input.changedFields,
  };
  return { id, occurredAt: now, ...payload, canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

export class IdentityAdministrationService {
  public constructor(
    private readonly store: FoundationStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
  ) {}

  public provisionAccount(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    input: ProvisionIdentityAccountInput,
  ): Promise<IdentityAccountRecord> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "identity.account.manage",
      resource: scope(input.businessScopeOrganizationId, null),
      requiredQualifications: ["identity_administrator"], forbiddenActorIds: [], minimumAssurance: "step-up",
    }, now);
    const qualifications = input.qualificationCodes.map((value) => normalizeCodeListValue(value));
    if (qualifications.some((value) => !value) || new Set(qualifications).size !== qualifications.length) {
      throw new ValidationError("Qualification codes must be unique controlled codes.", ["qualification_codes_invalid"]);
    }
    const account: IdentityAccountRecord = {
      id: this.idFactory(), personId: required(input.personId, "personId"), displayName: required(input.displayName, "displayName"),
      state: "invited", qualificationCodes: qualifications as string[], version: 1,
      createdAt: now, createdBy: context.userId, updatedAt: now, updatedBy: context.userId,
    };
    return this.store.transaction((transaction) => {
      transaction.insertIdentityAccount(account);
      transaction.appendAudit(event(this.idFactory(), now, context, {
        projectId: null, action: "identity.account_provisioned", objectType: "user_account", objectId: account.id,
        priorState: null, newState: account.state, reason: null,
        changedFields: { personId: account.personId, qualificationCodes: account.qualificationCodes },
      }));
      return account;
    });
  }

  public activateAccount(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    businessScopeOrganizationId: string,
    accountId: string,
    expectedVersion: number,
  ): Promise<IdentityAccountRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const account = transaction.identityAccountById(accountId);
      if (!account || account.state !== "invited") throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "identity.account.approve", resource: scope(businessScopeOrganizationId, account.id),
        requiredQualifications: ["identity_administrator"], forbiddenActorIds: [account.createdBy], minimumAssurance: "step-up",
      }, now);
      if (account.version !== expectedVersion) throw new ConflictError();
      const active: IdentityAccountRecord = {
        ...account, state: "active", version: account.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateIdentityAccount(active, expectedVersion);
      transaction.appendAudit(event(this.idFactory(), now, context, {
        projectId: null, action: "identity.account_activated", objectType: "user_account", objectId: account.id,
        priorState: account.state, newState: active.state, reason: null, changedFields: {},
      }));
      return active;
    });
  }

  public linkExternalIdentity(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    accountId: string,
    input: LinkExternalIdentityInput,
  ): Promise<ExternalIdentityRecord> {
    const now = this.clock();
    requireAuthorization(context, assignments, {
      action: "identity.account.manage", resource: scope(input.businessScopeOrganizationId, accountId),
      requiredQualifications: ["identity_administrator"], forbiddenActorIds: [], minimumAssurance: "step-up",
    }, now);
    const issuer = required(input.issuer, "issuer");
    let issuerUrl: URL;
    try {
      issuerUrl = new URL(issuer);
    } catch {
      throw new ValidationError("The identity issuer is invalid.", ["identity_issuer_invalid"]);
    }
    if (issuerUrl.protocol !== "https:" || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash) {
      throw new ValidationError("The identity issuer is invalid.", ["identity_issuer_invalid"]);
    }
    const identity: ExternalIdentityRecord = {
      id: this.idFactory(), userAccountId: accountId, issuer, subject: required(input.subject, "subject"),
      identityType: input.identityType, lastVerifiedAt: null, version: 1, createdAt: now, createdBy: context.userId,
    };
    return this.store.transaction((transaction) => {
      if (!transaction.identityAccountById(accountId)) throw new NotFoundError();
      if (transaction.externalIdentityBySubject(identity.issuer, identity.subject)) throw new ConflictError();
      transaction.insertExternalIdentity(identity);
      transaction.appendAudit(event(this.idFactory(), now, context, {
        projectId: null, action: "identity.external_linked", objectType: "external_identity", objectId: identity.id,
        priorState: null, newState: "linked", reason: identity.identityType,
        changedFields: { userAccountId: accountId, issuer: identity.issuer },
      }));
      return identity;
    });
  }

  public disableAccount(
    context: AccessContext,
    assignments: readonly RoleAssignment[],
    businessScopeOrganizationId: string,
    accountId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<IdentityAccountRecord> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const account = transaction.identityAccountById(accountId);
      if (!account || !["active", "invited"].includes(account.state)) throw new NotFoundError();
      requireAuthorization(context, assignments, {
        action: "identity.account.manage", resource: scope(businessScopeOrganizationId, account.id),
        requiredQualifications: ["identity_administrator"], forbiddenActorIds: [], minimumAssurance: "step-up",
      }, now);
      if (account.version !== expectedVersion) throw new ConflictError();
      const disabled: IdentityAccountRecord = {
        ...account, state: "disabled", version: account.version + 1, updatedAt: now, updatedBy: context.userId,
      };
      transaction.updateIdentityAccount(disabled, expectedVersion);
      transaction.appendAudit(event(this.idFactory(), now, context, {
        projectId: null, action: "identity.account_disabled", objectType: "user_account", objectId: account.id,
        priorState: account.state, newState: disabled.state, reason: required(reason, "reason"), changedFields: {},
      }));
      return disabled;
    });
  }
}
