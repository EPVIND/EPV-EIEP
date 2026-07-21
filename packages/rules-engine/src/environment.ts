import type { EnvironmentConfig } from "@eiep/shared-types";

export function validateEnvironmentConfig(config: EnvironmentConfig): readonly string[] {
  const issues: string[] = [];

  if (config.environment === "production") {
    if (config.authentication !== "oidc") issues.push("production_requires_oidc");
    if (config.dataStore !== "postgres") issues.push("production_requires_postgres");
    if (config.trainingBanner) issues.push("production_cannot_show_training_banner");
    if (config.allowSyntheticData) issues.push("production_cannot_allow_synthetic_data");
    if (!config.allowProductionData) issues.push("production_data_flag_must_be_explicit");
  } else if (config.allowProductionData) {
    issues.push("nonproduction_cannot_allow_production_data");
  }

  if (config.environment === "training") {
    if (!config.trainingBanner) issues.push("training_requires_banner");
    if (config.authentication === "development") issues.push("training_cannot_use_development_auth");
    if (config.dataStore === "memory") issues.push("training_requires_isolated_persistent_store");
  } else if (config.trainingBanner) {
    issues.push("training_banner_only_valid_in_training");
  }

  return issues;
}

export function assertEnvironmentConfig(config: EnvironmentConfig): void {
  const issues = validateEnvironmentConfig(config);
  if (issues.length > 0) {
    throw new Error(`Unsafe environment configuration: ${issues.join(", ")}`);
  }
}

