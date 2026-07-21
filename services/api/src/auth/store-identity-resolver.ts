import { createHash, randomUUID } from "node:crypto";
import type { AccessContext, AuditEvent } from "@eiep/shared-types";
import type { IdentityResolver, ResolveIdentityInput } from "./authenticator.js";
import type { FoundationStore } from "../domain/foundation-store.js";

function audit(now: Date, input: ResolveIdentityInput, context: AccessContext): AuditEvent {
  const payload = {
    actorUserId: context.userId,
    actingOrganizationId: context.actingOrganizationId,
    projectId: null,
    action: "auth.sign_in_succeeded",
    objectType: "auth_session",
    objectId: context.sessionId,
    priorState: null,
    newState: "authenticated",
    reason: null,
    correlationId: context.correlationId,
    changedFields: { assurance: context.assurance, issuer: input.issuer },
  };
  return {
    id: randomUUID(), occurredAt: now, ...payload,
    canonicalSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

export class StoreIdentityResolver implements IdentityResolver {
  public constructor(private readonly store: FoundationStore, private readonly clock: () => Date = () => new Date()) {}

  public resolve(input: ResolveIdentityInput): Promise<AccessContext> {
    const now = this.clock();
    return this.store.transaction((transaction) => {
      const identity = transaction.externalIdentityBySubject(input.issuer, input.subject);
      const account = identity ? transaction.identityAccountById(identity.userAccountId) : null;
      if (!identity || !account || account.state !== "active") throw new Error("The external identity is not active.");
      const activeAssignments = transaction.assignmentsFor(account.id).filter((assignment) =>
        !assignment.revokedAt && assignment.effectiveFrom.getTime() <= now.getTime()
        && (!assignment.effectiveTo || assignment.effectiveTo.getTime() > now.getTime()),
      );
      const organizations = [...new Set(activeAssignments.map((assignment) => assignment.actingOrganizationId))];
      const actingOrganizationId = input.requestedOrganizationId?.trim()
        || (organizations.length === 1 ? organizations[0] : null);
      if (!actingOrganizationId || !organizations.includes(actingOrganizationId)) {
        throw new Error("The requested acting organization is not assigned.");
      }
      const context: AccessContext = {
        userId: account.id,
        actingOrganizationId,
        assurance: input.assurance,
        qualifications: [...account.qualificationCodes],
        sessionId: input.sessionId,
        correlationId: input.correlationId,
        authenticatedAt: input.authenticatedAt,
      };
      transaction.updateExternalIdentity({
        ...identity, lastVerifiedAt: now, version: identity.version + 1,
      }, identity.version);
      transaction.appendAudit(audit(now, input, context));
      return context;
    });
  }
}
