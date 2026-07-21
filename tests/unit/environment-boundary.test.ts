import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { validateEnvironmentConfig } from "@eiep/rules-engine";
import type { EnvironmentConfig } from "@eiep/shared-types";

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
