import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertEnvironmentConfig } from "@eiep/rules-engine";
import type { EnvironmentConfig, EnvironmentName } from "@eiep/shared-types";

export interface RuntimeConfig {
  readonly environment: EnvironmentConfig;
  readonly host: string;
  readonly port: number;
  readonly oidcIssuer: string | null;
  readonly oidcAudience: string | null;
  readonly databaseUrlPresent: boolean;
  readonly databaseRuntimeRole: "eiep_runtime" | null;
  readonly allowedOrigins: readonly string[];
  readonly rateLimitMax: number;
  readonly metricsToken: string | null;
  readonly storageAccountName: string | null;
  readonly managedIdentityClientId: string | null;
  readonly fileStorageRoot: string | null;
}

const allowedEnvironments: readonly EnvironmentName[] = ["development", "test", "training", "production"];

export async function loadRuntimeConfig(rootDirectory = process.cwd()): Promise<RuntimeConfig> {
  const requested = process.env.EIEP_ENV ?? "development";
  if (!allowedEnvironments.includes(requested as EnvironmentName)) throw new Error("EIEP_ENV is invalid.");
  const environmentName = requested as EnvironmentName;
  const text = await readFile(resolve(rootDirectory, "config", "environments", `${environmentName}.json`), "utf8");
  const environment = JSON.parse(text) as EnvironmentConfig;
  assertEnvironmentConfig(environment);
  if (environment.environment !== environmentName) throw new Error("Environment file/name mismatch.");

  const oidcIssuer = process.env.OIDC_ISSUER?.trim() || null;
  const oidcAudience = process.env.OIDC_AUDIENCE?.trim() || null;
  if (environment.authentication === "oidc" && (!oidcIssuer || !oidcAudience)) {
    throw new Error("OIDC_ISSUER and OIDC_AUDIENCE are required for OIDC authentication.");
  }
  if (environment.dataStore === "postgres" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence.");
  }
  const requestedDatabaseRole = process.env.DATABASE_RUNTIME_ROLE?.trim() || null;
  if (requestedDatabaseRole && requestedDatabaseRole !== "eiep_runtime") {
    throw new Error("DATABASE_RUNTIME_ROLE must be eiep_runtime when supplied.");
  }
  const databaseRuntimeRole: "eiep_runtime" | null = requestedDatabaseRole === "eiep_runtime" ? "eiep_runtime" : null;
  if (environment.environment === "production" && databaseRuntimeRole !== "eiep_runtime") {
    throw new Error("Production requires DATABASE_RUNTIME_ROLE=eiep_runtime.");
  }

  const port = Number(process.env.PORT ?? "3100");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT is invalid.");
  const originText = process.env.CORS_ALLOWED_ORIGINS?.trim()
    || (environment.environment === "development" ? "http://127.0.0.1:3200,http://127.0.0.1:3201" : "");
  const allowedOrigins = originText ? [...new Set(originText.split(",").map((origin) => origin.trim()).filter(Boolean))] : [];
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("CORS_ALLOWED_ORIGINS contains an invalid origin.");
    }
    if (environment.environment === "production" && parsed.protocol !== "https:") {
      throw new Error("Production CORS origins require HTTPS.");
    }
  }
  if (environment.environment === "production" && allowedOrigins.length === 0) {
    throw new Error("Production requires at least one explicit CORS_ALLOWED_ORIGINS entry.");
  }
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? "300");
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 10 || rateLimitMax > 10_000) {
    throw new Error("RATE_LIMIT_MAX must be an integer between 10 and 10000.");
  }
  const metricsToken = process.env.METRICS_TOKEN?.trim() || null;
  if (metricsToken && metricsToken.length < 32) throw new Error("METRICS_TOKEN must contain at least 32 characters.");
  if (environment.environment === "production" && !metricsToken) {
    throw new Error("Production requires METRICS_TOKEN.");
  }
  const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim() || null;
  const managedIdentityClientId = process.env.AZURE_CLIENT_ID?.trim() || null;
  const fileStorageRoot = process.env.FILE_STORAGE_ROOT?.trim() || null;
  if (storageAccountName && !/^[a-z0-9]{3,24}$/u.test(storageAccountName)) {
    throw new Error("AZURE_STORAGE_ACCOUNT_NAME is invalid.");
  }
  if (environment.environment === "production" && (!storageAccountName || !managedIdentityClientId)) {
    throw new Error("Production requires AZURE_STORAGE_ACCOUNT_NAME and AZURE_CLIENT_ID for governed uploads.");
  }
  return {
    environment,
    host: process.env.HOST ?? "127.0.0.1",
    port,
    oidcIssuer,
    oidcAudience,
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    databaseRuntimeRole,
    allowedOrigins,
    rateLimitMax,
    metricsToken,
    storageAccountName,
    managedIdentityClientId,
    fileStorageRoot,
  };
}
