import type { Authenticator, AuthenticationInput } from "./authenticator.js";
import { AuthenticationError, parseAssurance } from "./authenticator.js";

export class DevelopmentAuthenticator implements Authenticator {
  public async authenticate(input: AuthenticationInput) {
    if (!input.developmentUserId || !input.requestedOrganizationId) {
      throw new AuthenticationError();
    }
    return {
      userId: input.developmentUserId,
      actingOrganizationId: input.requestedOrganizationId,
      assurance: parseAssurance(input.developmentAssurance),
      qualifications: [],
      sessionId: `development:${input.developmentUserId}`,
      correlationId: input.correlationId,
      authenticatedAt: new Date(),
    } as const;
  }
}
