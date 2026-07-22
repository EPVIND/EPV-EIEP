import type { FoundationStore } from "../domain/foundation-store.js";
import type { Authenticator, AuthenticationInput } from "./authenticator.js";
import { AuthenticationError } from "./authenticator.js";
import { DevelopmentAuthenticator } from "./development-authenticator.js";

/**
 * Development headers remain the authentication mechanism, but a controlled pilot
 * must resolve an active local account before qualifications can enter policy checks.
 * Production and training never construct this authenticator.
 */
export class StoreBackedDevelopmentAuthenticator implements Authenticator {
  private readonly headers = new DevelopmentAuthenticator();

  public constructor(private readonly store: FoundationStore) {}

  public async authenticate(input: AuthenticationInput) {
    const context = await this.headers.authenticate(input);
    const account = await this.store.transaction((transaction) => transaction.identityAccountById(context.userId));
    if (!account || account.state !== "active") throw new AuthenticationError();
    return { ...context, qualifications: [...account.qualificationCodes] };
  }
}
