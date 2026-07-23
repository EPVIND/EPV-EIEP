import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateEnvironmentConfig } from "@eiep/rules-engine";
import type { EnvironmentConfig } from "@eiep/shared-types";
import { loadRuntimeConfig } from "@eiep/api";

test("NFR-MNT-003 / AC-01: all controlled environment files satisfy isolation guards", async () => {
  for (const name of ["development", "test", "training", "production"]) {
    const path = join(process.cwd(), "config", "environments", `${name}.json`);
    const config = JSON.parse(await readFile(path, "utf8")) as EnvironmentConfig;
    assert.deepEqual(validateEnvironmentConfig(config), [], name);
  }
});

test("NFR-SEC-002 / AC-01: production rejects development authentication and memory data", () => {
  const issues = validateEnvironmentConfig({
    environment: "production",
    authentication: "development",
    dataStore: "memory",
    trainingBanner: true,
    allowSyntheticData: true,
    allowProductionData: false,
  });
  assert.deepEqual(
    new Set(issues),
    new Set([
      "production_requires_oidc",
      "production_requires_postgres",
      "production_cannot_show_training_banner",
      "production_cannot_allow_synthetic_data",
      "production_data_flag_must_be_explicit",
      "training_banner_only_valid_in_training",
    ]),
  );
});

test("DEC-005 / AC-01: training requires its visible and persistent boundary", () => {
  const issues = validateEnvironmentConfig({
    environment: "training",
    authentication: "development",
    dataStore: "memory",
    trainingBanner: false,
    allowSyntheticData: true,
    allowProductionData: false,
  });
  assert.deepEqual(
    new Set(issues),
    new Set(["training_requires_banner", "training_cannot_use_development_auth", "training_requires_isolated_persistent_store"]),
  );
});

test("NFR-SEC-002-003, NFR-MNT-003 / AC-01: local pilot configuration is hash-paired and development-PostgreSQL only", async () => {
  const root = await mkdtemp(join(tmpdir(), "eiep-pilot-config-"));
  const environmentDirectory = join(root, "config", "environments");
  const originalEnvironment = { ...process.env };
  try {
    await mkdir(environmentDirectory, { recursive: true });
    const environment: EnvironmentConfig = {
      environment: "development", authentication: "development", dataStore: "postgres",
      trainingBanner: false, allowSyntheticData: true, allowProductionData: false,
    };
    await writeFile(join(environmentDirectory, "development.json"), JSON.stringify(environment), "utf8");
    Object.assign(process.env, {
      EIEP_ENV: "development",
      DATABASE_URL: "postgresql://local-pilot.invalid/eiep",
      EIEP_LOCAL_PILOT_BOOTSTRAP_FILE: join(root, "manifest.json"),
      EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256: "a".repeat(64),
    });
    const valid = await loadRuntimeConfig(root);
    assert.equal(valid.localPilotBootstrapSha256, "a".repeat(64));

    delete process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256;
    await assert.rejects(loadRuntimeConfig(root), /must be supplied together/u);
    process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256 = "not-a-sha";
    await assert.rejects(loadRuntimeConfig(root), /must be a lowercase SHA-256/u);

    process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256 = "b".repeat(64);
    await writeFile(join(environmentDirectory, "development.json"), JSON.stringify({ ...environment, dataStore: "memory" }), "utf8");
    await assert.rejects(loadRuntimeConfig(root), /requires development authentication, PostgreSQL/u);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in originalEnvironment)) delete process.env[name];
    Object.assign(process.env, originalEnvironment);
    await rm(root, { recursive: true, force: true });
  }
});

test("NFR-SEC-002-003 / AC-01: ephemeral pilot bootstrap is memory-development only and excludes persistent input", async () => {
  const root = await mkdtemp(join(tmpdir(), "eiep-ephemeral-pilot-config-"));
  const environmentDirectory = join(root, "config", "environments");
  const originalEnvironment = { ...process.env };
  try {
    await mkdir(environmentDirectory, { recursive: true });
    const environment: EnvironmentConfig = {
      environment: "development", authentication: "development", dataStore: "memory",
      trainingBanner: false, allowSyntheticData: true, allowProductionData: false,
    };
    await writeFile(join(environmentDirectory, "development.json"), JSON.stringify(environment), "utf8");
    Object.assign(process.env, {
      EIEP_ENV: "development",
      EIEP_EPHEMERAL_PILOT_BOOTSTRAP_JSON: "{\"manifestVersion\":1}",
    });
    delete process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_FILE;
    delete process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256;
    const valid = await loadRuntimeConfig(root);
    assert.equal(valid.ephemeralPilotBootstrapJson, "{\"manifestVersion\":1}");

    process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_FILE = join(root, "manifest.json");
    process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256 = "a".repeat(64);
    await assert.rejects(loadRuntimeConfig(root), /cannot be combined/u);

    delete process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_FILE;
    delete process.env.EIEP_LOCAL_PILOT_BOOTSTRAP_SHA256;
    await writeFile(join(environmentDirectory, "development.json"), JSON.stringify({ ...environment, dataStore: "postgres" }), "utf8");
    process.env.DATABASE_URL = "postgresql://pilot.invalid/eiep";
    await assert.rejects(loadRuntimeConfig(root), /requires development authentication, memory data/u);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in originalEnvironment)) delete process.env[name];
    Object.assign(process.env, originalEnvironment);
    await rm(root, { recursive: true, force: true });
  }
});
