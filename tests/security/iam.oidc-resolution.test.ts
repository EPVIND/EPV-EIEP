import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  IdentityAdministrationService,
  InMemoryFoundationStore,
  OidcAuthenticator,
  StoreIdentityResolver,
} from "@eiep/api";
import { AuthorizationDeniedError } from "@eiep/rules-engine";
import { assignment, context, scope, sequentialIds } from "../helpers/foundation-fixture.js";

const controlledNow = new Date("2026-07-21T12:00:00.000Z");

test("FR-IAM-001-002 / AC-02-03: governed account activation maps immutable subject and revocation denies later resolution", async () => {
  const store = new InMemoryFoundationStore();
  const service = new IdentityAdministrationService(store, () => controlledNow, sequentialIds("identity"));
  const provisioner = context("identity-provisioner", "step-up", ["identity_administrator"]);
  const provisionAccess = [assignment(
    "identity-manage", provisioner.userId, ["identity.account.manage"], scope(), {}, "org-epv",
  )];
  const invited = await service.provisionAccount(provisioner, provisionAccess, {
    businessScopeOrganizationId: "org-epv", personId: "person-100", displayName: "Controlled user",
    qualificationCodes: ["receiving_inspector"],
  });
  await assert.rejects(
    service.activateAccount(
      provisioner,
      [assignment("identity-self-approve", provisioner.userId, ["identity.account.approve"], scope())],
      "org-epv", invited.id, invited.version,
    ),
    (error: unknown) => error instanceof AuthorizationDeniedError && error.reasonCode === "separation_of_duty",
  );
  const approver = context("identity-approver", "step-up", ["identity_administrator"]);
  const active = await service.activateAccount(
    approver,
    [assignment("identity-approve", approver.userId, ["identity.account.approve"], scope())],
    "org-epv", invited.id, invited.version,
  );
  await service.linkExternalIdentity(provisioner, provisionAccess, active.id, {
    businessScopeOrganizationId: "org-epv", issuer: "https://identity.example.test/tenant/v2.0",
    subject: "immutable-subject-100", identityType: "internal",
  });
  store.seedAssignments([assignment("resolved-project-role", active.id, ["project.read"], scope(null), {}, "org-epv")]);
  const resolver = new StoreIdentityResolver(store, () => controlledNow);
  const resolved = await resolver.resolve({
    issuer: "https://identity.example.test/tenant/v2.0", subject: "immutable-subject-100",
    requestedOrganizationId: "org-epv", assurance: "mfa", sessionId: "resolved-session",
    correlationId: "resolved-correlation", authenticatedAt: controlledNow,
  });
  assert.equal(resolved.userId, active.id);
  assert.equal(resolved.actingOrganizationId, "org-epv");
  assert.deepEqual(resolved.qualifications, ["RECEIVING_INSPECTOR"]);
  const refreshedIdentity = [...store.snapshot().externalIdentities.values()][0];
  assert.equal(refreshedIdentity?.lastVerifiedAt?.toISOString(), controlledNow.toISOString());
  assert.ok(store.snapshot().audits.some((audit) => audit.action === "auth.sign_in_succeeded"));

  const disabled = await service.disableAccount(
    provisioner, provisionAccess, "org-epv", active.id, active.version, "employment ended",
  );
  assert.equal(disabled.state, "disabled");
  await assert.rejects(
    resolver.resolve({
      issuer: "https://identity.example.test/tenant/v2.0", subject: "immutable-subject-100",
      requestedOrganizationId: "org-epv", assurance: "mfa", sessionId: "revoked-session",
      correlationId: "revoked-correlation", authenticatedAt: controlledNow,
    }),
    /not active/u,
  );
});

test("FR-IAM-001, NFR-SEC-004 / AC-02: signed OIDC token resolves only through local active subject and organization assignment", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const keyId = "controlled-test-key";
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const issuer = `http://127.0.0.1:${address.port}/tenant/v2.0`;
  server.on("request", (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/tenant/v2.0/.well-known/openid-configuration") {
      response.end(JSON.stringify({ issuer, jwks_uri: `http://127.0.0.1:${address.port}/keys` }));
      return;
    }
    if (request.url === "/keys") {
      response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: keyId, use: "sig", alg: "RS256" }] }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const store = new InMemoryFoundationStore();
  await store.transaction((transaction) => {
    transaction.insertIdentityAccount({
      id: "local-user-200", personId: "person-200", displayName: "OIDC user", state: "active",
      qualificationCodes: ["QUALITY_AUTHORITY"], version: 1, createdAt: controlledNow,
      createdBy: "identity-admin", updatedAt: controlledNow, updatedBy: "identity-admin",
    });
    transaction.insertExternalIdentity({
      id: "external-200", userAccountId: "local-user-200", issuer, subject: "subject-200", identityType: "guest",
      lastVerifiedAt: null, version: 1, createdAt: controlledNow, createdBy: "identity-admin",
    });
  });
  store.seedAssignments([assignment("oidc-role", "local-user-200", ["project.read"], scope(), {}, "org-partner")]);
  const authenticator = await OidcAuthenticator.create(
    issuer, "api://eiep-test", new StoreIdentityResolver(store, () => controlledNow), true,
  );
  const epoch = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ sub: "subject-200", amr: ["mfa"], auth_time: epoch, sid: "oidc-session" })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(issuer)
    .setAudience("api://eiep-test")
    .setIssuedAt(epoch)
    .setExpirationTime(epoch + 300)
    .sign(privateKey);
  const resolved = await authenticator.authenticate({
    authorizationHeader: `Bearer ${token}`, developmentUserId: undefined,
    requestedOrganizationId: "org-partner", developmentAssurance: undefined, correlationId: "oidc-correlation",
  });
  assert.equal(resolved.userId, "local-user-200");
  assert.equal(resolved.actingOrganizationId, "org-partner");
  assert.equal(resolved.assurance, "mfa");
  assert.deepEqual(resolved.qualifications, ["QUALITY_AUTHORITY"]);
  await assert.rejects(
    authenticator.authenticate({
      authorizationHeader: `Bearer ${token}`, developmentUserId: undefined,
      requestedOrganizationId: "org-unassigned", developmentAssurance: undefined, correlationId: "oidc-denied",
    }),
    /Authentication failed/u,
  );
  await assert.rejects(OidcAuthenticator.create(issuer, "api://eiep-test", new StoreIdentityResolver(store)), /requires HTTPS/u);
});
