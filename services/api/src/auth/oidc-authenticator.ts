import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Authenticator, AuthenticationInput, IdentityResolver } from "./authenticator.js";
import { AuthenticationError, parseAssurance } from "./authenticator.js";

interface OidcMetadata {
  readonly issuer: string;
  readonly jwks_uri: string;
}

export class OidcAuthenticator implements Authenticator {
  private constructor(
    private readonly issuer: string,
    private readonly audience: string,
    private readonly jwks: ReturnType<typeof createRemoteJWKSet>,
    private readonly resolver: IdentityResolver,
  ) {}

  public static async create(
    issuer: string,
    audience: string,
    resolver: IdentityResolver,
    allowInsecureLoopback = false,
  ): Promise<OidcAuthenticator> {
    const issuerUrl = new URL(issuer);
    const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(issuerUrl.hostname);
    if (issuerUrl.protocol !== "https:" && !(allowInsecureLoopback && loopback && issuerUrl.protocol === "http:")) {
      throw new Error("OIDC issuer requires HTTPS.");
    }
    const metadataUrl = new URL(".well-known/openid-configuration", issuer.endsWith("/") ? issuer : `${issuer}/`);
    const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!response.ok) throw new Error("Unable to load OIDC provider metadata.");
    const metadata = (await response.json()) as OidcMetadata;
    if (metadata.issuer !== issuer || !metadata.jwks_uri) throw new Error("OIDC metadata does not match configured issuer.");
    const jwksUrl = new URL(metadata.jwks_uri);
    if (jwksUrl.origin !== issuerUrl.origin || jwksUrl.protocol !== issuerUrl.protocol) {
      throw new Error("OIDC signing keys must use the configured issuer origin.");
    }
    return new OidcAuthenticator(issuer, audience, createRemoteJWKSet(jwksUrl), resolver);
  }

  public async authenticate(input: AuthenticationInput) {
    const prefix = "Bearer ";
    if (!input.authorizationHeader?.startsWith(prefix)) throw new AuthenticationError();
    try {
      const token = input.authorizationHeader.slice(prefix.length);
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256"],
      });
      if (!verified.payload.sub || !verified.payload.iss) throw new AuthenticationError();

      const amr = Array.isArray(verified.payload.amr) ? verified.payload.amr : [];
      const assurance = amr.includes("mfa") ? "mfa" : parseAssurance(verified.payload.acr);
      const authenticationEpoch =
        typeof verified.payload.auth_time === "number"
          ? verified.payload.auth_time
          : typeof verified.payload.iat === "number"
            ? verified.payload.iat
            : 0;
      return await this.resolver.resolve({
        issuer: verified.payload.iss,
        subject: verified.payload.sub,
        requestedOrganizationId: input.requestedOrganizationId,
        assurance,
        sessionId: typeof verified.payload.sid === "string" ? verified.payload.sid : verified.payload.jti ?? "oidc",
        correlationId: input.correlationId,
        authenticatedAt: new Date(authenticationEpoch * 1000),
      });
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError();
    }
  }
}
