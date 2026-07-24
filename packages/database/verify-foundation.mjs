import pg from "pg";
import { databaseConnectionConfig } from "./connection.mjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Supply it through protected environment configuration.");
}

const client = new pg.Client(databaseConnectionConfig(connectionString));

try {
  await client.connect();
  const versionResult = await client.query("SELECT current_setting('server_version_num')::integer AS version_num");
  const versionNumber = Number(versionResult.rows[0]?.version_num ?? 0);
  if (versionNumber < 180000 || versionNumber >= 190000) {
    throw new Error(`Expected PostgreSQL 18.x, received server_version_num=${versionNumber}.`);
  }

  const objectsResult = await client.query(`
    SELECT
      to_regclass('project.project') IS NOT NULL AS project_table,
      to_regclass('document.document_revision') IS NOT NULL AS revision_table,
      to_regclass('platform.audit_event') IS NOT NULL AS audit_table,
      to_regclass('platform.outbox_message') IS NOT NULL AS outbox_table,
      to_regclass('material.material_item') IS NOT NULL AS material_table,
      to_regclass('inspection.inspection_plan_revision') IS NOT NULL AS inspection_plan_revision_table,
      to_regclass('inspection.inspection_record') IS NOT NULL AS inspection_record_table,
      to_regclass('inspection.pmi_record') IS NOT NULL AS pmi_table,
      to_regclass('inspection.pmi_override') IS NOT NULL AS pmi_override_table,
      to_regclass('deficiency.nonconformance') IS NOT NULL AS ncr_table,
      to_regclass('deficiency.punch_item') IS NOT NULL AS punch_table,
      to_regclass('turnover.package_material_scope') IS NOT NULL AS turnover_scope_table,
      to_regclass('turnover.turnover_package_version') IS NOT NULL AS turnover_version_table,
      to_regclass('subcontractor.subcontractor_profile') IS NOT NULL AS subcontractor_profile_table,
      to_regclass('subcontractor.mobilization_requirement') IS NOT NULL AS mobilization_requirement_table,
      to_regclass('subcontractor.submission') IS NOT NULL AS subcontractor_submission_table,
      to_regclass('subcontractor.epv_acceptance') IS NOT NULL AS epv_acceptance_table,
      to_regclass('project.project_rule_version') IS NOT NULL AS project_rule_version_table,
      to_regclass('document.distribution') IS NOT NULL AS document_distribution_table,
      to_regclass('document.governing_document_link') IS NOT NULL AS governing_document_link_table,
      to_regclass('platform.audit_change') IS NOT NULL AS audit_change_table,
      to_regclass('platform.retention_disposition') IS NOT NULL AS retention_disposition_table,
      to_regclass('platform.import_job') IS NOT NULL AS import_job_table,
      to_regclass('platform.external_identifier') IS NOT NULL AS external_identifier_table,
      to_regclass('platform.export_job') IS NOT NULL AS export_job_table,
      to_regclass('platform.integration_message') IS NOT NULL AS integration_message_table,
      to_regclass('platform.workflow_connectivity_policy') IS NOT NULL AS connectivity_policy_table,
      to_regclass('platform.offline_draft') IS NOT NULL AS offline_draft_table,
      to_regclass('platform.notification_subscription') IS NOT NULL AS notification_subscription_table,
      to_regclass('platform.notification') IS NOT NULL AS notification_table,
      to_regclass('platform.application_state') IS NOT NULL AS application_state_table,
      to_regclass('platform.repository_entity') IS NOT NULL AS repository_entity_table,
      to_regclass('platform.integration_work_lease') IS NOT NULL AS integration_work_lease_table,
      to_regclass('platform.repository_mtr_review_project_lookup') IS NOT NULL AS mtr_review_index,
      to_regclass('platform.repository_material_movement_project_lookup') IS NOT NULL AS material_movement_index,
      to_regclass('platform.repository_controlled_report_project_lookup') IS NOT NULL AS controlled_report_index,
      to_regclass('platform.repository_revision_seq') IS NOT NULL AS repository_revision_sequence,
      to_regclass('platform.unit_definition') IS NOT NULL AS unit_definition_table,
      to_regclass('platform.code_list') IS NOT NULL AS code_list_table,
      to_regclass('platform.code_list_entry') IS NOT NULL AS code_list_entry_table
      ,to_regclass('iam.user_qualification') IS NOT NULL AS user_qualification_table
  `);
  const objects = objectsResult.rows[0];
  if (!objects || Object.values(objects).some((present) => present !== true)) {
    throw new Error(`Foundation objects are incomplete: ${JSON.stringify(objects)}.`);
  }

  const migrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0001_foundation.up.sql'",
  );
  if (migrationResult.rows[0]?.count !== 1) {
    throw new Error("Foundation migration ledger entry is missing or duplicated.");
  }

  const operationalMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0002_operational_vertical_slice.up.sql'",
  );
  if (operationalMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Operational vertical-slice migration ledger entry is missing or duplicated.");
  }

  const subcontractorMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0003_subcontractor_control.up.sql'",
  );
  if (subcontractorMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Subcontractor-control migration ledger entry is missing or duplicated.");
  }

  const governanceMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0004_governance_controls.up.sql'",
  );
  if (governanceMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Governance-controls migration ledger entry is missing or duplicated.");
  }

  const platformServicesMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0005_platform_services.up.sql'",
  );
  if (platformServicesMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Platform-services migration ledger entry is missing or duplicated.");
  }

  const repositoryRuntimeMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0006_repository_runtime.up.sql'",
  );
  if (repositoryRuntimeMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Repository-runtime migration ledger entry is missing or duplicated.");
  }

  const leastPrivilegeMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0007_least_privilege_roles.up.sql'",
  );
  if (leastPrivilegeMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Least-privilege migration ledger entry is missing or duplicated.");
  }

  const masterDataMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0008_master_data_and_integration_payload.up.sql'",
  );
  if (masterDataMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Master-data and integration-payload migration ledger entry is missing or duplicated.");
  }

  const identityResolutionMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0009_identity_resolution.up.sql'",
  );
  if (identityResolutionMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Identity-resolution migration ledger entry is missing or duplicated.");
  }

  const materialRuleGovernanceMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0010_material_rule_governance.up.sql'",
  );
  if (materialRuleGovernanceMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Material-rule-governance migration ledger entry is missing or duplicated.");
  }

  const normalizedRepositoryMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0011_normalized_repository_and_work_leases.up.sql'",
  );
  if (normalizedRepositoryMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Normalized-repository/work-lease migration ledger entry is missing or duplicated.");
  }

  const materialHistoryMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0012_material_review_and_movement_history.up.sql'",
  );
  if (materialHistoryMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Material review/movement migration ledger entry is missing or duplicated.");
  }

  const controlledReportMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0013_immutable_controlled_reports.up.sql'",
  );
  if (controlledReportMigrationResult.rows[0]?.count !== 1) {
    throw new Error("Immutable controlled-report migration ledger entry is missing or duplicated.");
  }

  const pmiNcrExecutionDetailMigrationResult = await client.query(
    "SELECT count(*)::integer AS count FROM public.eiep_schema_migration WHERE name = '0014_pmi_ncr_execution_detail.up.sql'",
  );
  if (pmiNcrExecutionDetailMigrationResult.rows[0]?.count !== 1) {
    throw new Error("PMI/NCR execution-detail migration ledger entry is missing or duplicated.");
  }

  const constraintResult = await client.query(`
    SELECT count(*)::integer AS count
    FROM pg_constraint
    WHERE conname IN (
      'material_item_identifier_unique',
      'material_item_quantity_positive',
      'inspection_equipment_validity_order',
      'pmi_acceptance_consistent',
      'ncr_disposition_approval_separation',
      'ncr_closed_complete',
      'turnover_package_version_unique',
      'turnover_manifest_source_unique',
      'subcontractor_profile_org_unique',
      'subcontractor_qualification_validity',
      'mobilization_review_separation',
      'subcontractor_submission_review_separation',
      'access_assignment_time_bounded',
      'delegation_time_bounded',
      'delegation_approval_separation',
      'project_rule_approval_separation',
      'governing_document_exact_link_unique',
      'audit_change_redaction_consistent',
      'retention_policy_approval_separation',
      'legal_hold_release_separation',
      'retention_disposition_separation',
      'platform_file_size_policy',
      'platform_file_validation_consistent',
      'import_job_state_consistent',
      'import_row_number_unique',
      'external_identifier_unique',
      'export_job_result_consistent',
      'integration_message_idempotency_unique',
      'integration_message_state_consistent',
      'integration_message_payload_object',
      'workflow_connectivity_authority_safe',
      'offline_draft_idempotency_unique',
      'offline_draft_state_consistent',
      'notification_subscription_unique',
      'notification_subscription_state_consistent',
      'notification_idempotency_unique',
      'notification_state_consistent',
      'application_state_singleton',
      'application_state_wire_payload',
      'code_list_revision_unique',
      'code_list_approval_separation',
      'code_list_state_consistent'
      ,'external_identity_version_positive'
      ,'user_qualification_unique'
      ,'user_qualification_validity'
      ,'user_qualification_approval_separation'
      ,'user_qualification_state_consistent'
      ,'pmi_override_justification_present'
      ,'pmi_override_approval_separation'
      ,'pmi_override_state_consistent'
      ,'material_item_override_rule_consistent'
      ,'repository_entity_payload_wire'
      ,'repository_entity_kind_consistent'
      ,'repository_entity_domain_version_positive'
      ,'repository_entity_work_metadata'
      ,'integration_work_lease_entity_type'
      ,'integration_work_lease_duration_valid'
      ,'integration_work_lease_identity_present'
      ,'pmi_component_location_present'
      ,'pmi_notes_present'
      ,'ncr_corrective_action_complete'
    )
  `);
  if (constraintResult.rows[0]?.count !== 61) {
    throw new Error(`Controlled constraint set is incomplete: ${constraintResult.rows[0]?.count ?? 0}/61.`);
  }

  await client.query("BEGIN");
  try {
    for (const [index, entityType] of ["mtrReviews", "materialMovements", "controlledReports"].entries()) {
      const entityId = `immutability-probe-${index}`;
      await client.query(`
        INSERT INTO platform.repository_entity (
          entity_type, entity_id, entity_kind, project_id, domain_version, occurred_at, payload
        ) VALUES ($1, $2, 'map', 'verification-project', 1, CURRENT_TIMESTAMP, $3::jsonb)
      `, [entityType, entityId, JSON.stringify({ type: "object", value: { id: { type: "scalar", value: entityId } } })]);
      await client.query("SAVEPOINT immutable_update_probe");
      try {
        await client.query("UPDATE platform.repository_entity SET domain_version = 2 WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
        throw new Error(`Immutable ${entityType} record unexpectedly allowed an update.`);
      } catch (error) {
        if (error?.code !== "55000") throw error;
        await client.query("ROLLBACK TO SAVEPOINT immutable_update_probe");
      }
      await client.query("SAVEPOINT immutable_delete_probe");
      try {
        await client.query("DELETE FROM platform.repository_entity WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
        throw new Error(`Immutable ${entityType} record unexpectedly allowed deletion.`);
      } catch (error) {
        if (error?.code !== "55000") throw error;
        await client.query("ROLLBACK TO SAVEPOINT immutable_delete_probe");
      }
    }
  } finally {
    await client.query("ROLLBACK");
  }


  const applicationStateResult = await client.query(`
    SELECT revision::integer AS revision, payload->>'type' AS wire_type
    FROM platform.application_state
    WHERE state_key = 'foundation'
  `);
  if (applicationStateResult.rows[0]?.revision !== 1 || applicationStateResult.rows[0]?.wire_type !== "object") {
    throw new Error("The retired aggregate application-state baseline was unexpectedly modified.");
  }

  const normalizedRepositoryResult = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM platform.repository_entity) AS entity_count,
      (SELECT count(*)::integer FROM platform.integration_work_lease) AS lease_count,
      (SELECT last_value::integer FROM platform.repository_revision_seq) AS repository_revision
  `);
  if (normalizedRepositoryResult.rows[0]?.entity_count !== 0
    || normalizedRepositoryResult.rows[0]?.lease_count !== 0
    || normalizedRepositoryResult.rows[0]?.repository_revision !== 1) {
    throw new Error("The normalized repository baseline is invalid.");
  }

  const rolesResult = await client.query(`
    SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('eiep_runtime', 'eiep_job_worker', 'eiep_audit_reader')
    ORDER BY rolname
  `);
  if (rolesResult.rows.length !== 3 || rolesResult.rows.some((role) =>
    role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolcanlogin)) {
    throw new Error(`Least-privilege database roles are invalid: ${JSON.stringify(rolesResult.rows)}.`);
  }

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE eiep_runtime");
    await client.query("SELECT entity_id FROM platform.repository_entity LIMIT 1");
    await client.query("SELECT last_value FROM platform.repository_revision_seq");
  } finally {
    await client.query("ROLLBACK");
  }

    await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE eiep_runtime");
    await client.query("DELETE FROM platform.repository_entity WHERE entity_type = 'projects'");
    throw new Error("Expected the runtime role to be denied repository-entity deletion.");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected the runtime role")) throw error;
    if (!(error && typeof error === "object" && "code" in error && error.code === "42501")) throw error;
  } finally {
    await client.query("ROLLBACK");
  }

  await client.query("BEGIN");
  try {
    await client.query(`
      INSERT INTO party.organization (
        id, code, name, organization_type, state, created_at, created_by, updated_at, updated_by
      ) VALUES
        ('00000000-0000-0000-0000-000000000010', 'VERIFY-EPV', 'Verification EPV', 'epv', 'active', CURRENT_TIMESTAMP,
          '00000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000002'),
        ('00000000-0000-0000-0000-000000000011', 'VERIFY-CUSTOMER', 'Verification Customer', 'customer', 'active', CURRENT_TIMESTAMP,
          '00000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000002');
      INSERT INTO project.facility (
        id, owner_organization_id, code, name, time_zone, state
      ) VALUES (
        '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000010',
        'VERIFY-FACILITY', 'Verification Facility', 'UTC', 'active'
      );
      INSERT INTO project.project (
        id, business_scope_organization_id, customer_organization_id, facility_id,
        project_number, name, time_zone, state, readiness, created_at, created_by, updated_at, updated_by
      ) VALUES (
        '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
        'VERIFY-001', 'Verification Project', 'UTC', 'draft', '{}'::jsonb, CURRENT_TIMESTAMP,
        '00000000-0000-0000-0000-000000000002', CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000002'
      );
    `);
    await client.query(`
      INSERT INTO platform.file_object (
        id, project_id, storage_key, sha256, declared_media_type, size_bytes, validation_state,
        retention_class, original_filename, uploaded_at, uploaded_by
      ) VALUES (
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013',
        'verification/invalid-hash', 'not-a-sha256',
        'application/pdf', 1, 'staged', 'verification', 'invalid.pdf', CURRENT_TIMESTAMP,
        '00000000-0000-0000-0000-000000000002'
      )
    `);
    throw new Error("Expected the file SHA-256 constraint to reject invalid data.");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected the file SHA-256")) throw error;
    if (!(error && typeof error === "object" && "code" in error && error.code === "23514")) throw error;
  } finally {
    await client.query("ROLLBACK");
  }

  process.stdout.write("PostgreSQL 18 foundation through PMI/NCR execution-detail migration, 61 controlled constraints, and runtime role boundaries verified.\n");
} finally {
  await client.end();
}
