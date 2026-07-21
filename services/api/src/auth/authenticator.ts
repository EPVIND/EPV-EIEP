import type { AccessContext, AssuranceLevel } from "@eiep/shared-types";

export interface AuthenticationInput {
  readonly authorizationHeader: string | undefined;
  readonly developmentUserId: string | undefined;
  readonly requestedOrganizationId: string | undefined;
  readonly developmentAssurance: string | undefined;
  readonly correlationId: string;
}

export interface Authenticator {
  authenticate(input: AuthenticationInput): Promise<AccessContext>;
}

export class AuthenticationError extends Error {
  public constructor() {
    super("Authentication failed.");
    this.name = "AuthenticationError";
  }
}

export interface ResolveIdentityInput {
  readonly issuer: string;
  readonly subject: string;
  readonly requestedOrganizationId: string | undefined;
  readonly assurance: AssuranceLevel;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly authenticatedAt: Date;
}

export interface IdentityResolver {
  resolve(input: ResolveIdentityInput): Promise<AccessContext>;
}

export function parseAssurance(value: unknown): AssuranceLevel {
  return value === "mfa" || value === "step-up" ? value : "standard";
}
