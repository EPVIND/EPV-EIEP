import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg, { type Pool, type PoolClient } from "pg";
import type { IntegrationMessageRecord } from "@eiep/shared-types";
import { ConflictError } from "./errors.js";
import {
  createEmptyMemoryState,
  InMemoryFoundationStore,
  type MemoryState,
} from "./in-memory-foundation-store.js";
import type {
  FoundationStore,
  FoundationTransaction,
  IntegrationWorkClaim,
  IntegrationWorkLease,
} from "./foundation-store.js";
import type { PostgresConnectionAuthentication } from "./azure-postgres-authentication.js";

export type RepositoryWireValue =
  | { readonly type: "null" }
  | { readonly type: "undefined" }
  | { readonly type: "scalar"; readonly value: string | number | boolean }
  | { readonly type: "date"; readonly value: string }
  | { readonly type: "array"; readonly value: readonly RepositoryWireValue[] }
  | { readonly type: "map"; readonly value: readonly (readonly [RepositoryWireValue, RepositoryWireValue])[] }
  | { readonly type: "object"; readonly value: Readonly<Record<string, RepositoryWireValue>> };

export interface PostgresRepositoryHealth {
  readonly serverVersionNumber: number;
  readonly currentUser: string;
  readonly schemaMigration: string;
  readonly repositoryRevision: number;
  readonly repositoryEntityCount: number;
}

const mapCollections = [
  "identityAccounts", "externalIdentities", "projects", "projectStructures", "projectOrganizations",
  "responsibilityAssignments", "projectConfigurations", "documents", "revisions", "documentDistributions",
  "governingDocumentLinks", "retentionPolicies", "legalHolds", "retentionDispositions", "governedFiles",
  "importJobs", "importedRecords", "externalIdentifiers", "exportJobs", "integrationMessages", "offlineDrafts",
  "notificationSubscriptions", "notifications", "materials", "mtrReviews", "materialMovements", "controlledReports", "genealogies", "equipment", "inspectionPlans",
  "inspections", "pmiRecords", "pmiOverrides", "ncrs", "punches", "completionBoundaries",
  "turnoverRequirements", "turnoverPackages", "turnoverVersions", "subcontractorProfiles",
  "subcontractorQualifications", "subcontractorAssignments", "mobilizationRequirements",
  "subcontractorSubmissions", "managedAccessAssignments", "delegations", "estimateAssemblies",
  "estimateProductivityFactors", "estimateAuthorityPolicies", "estimates", "estimateRevisions",
  "estimateLines", "estimateQuotes", "estimateProposals", "estimateHandoffs",
] as const satisfies readonly (keyof MemoryState)[];

const arrayCollections = ["assignments", "audits"] as const satisfies readonly (keyof MemoryState)[];
const knownCollections = new Set<string>([...mapCollections, ...arrayCollections]);

interface RepositoryEntityRow {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly entity_kind: "map" | "array";
  readonly ordinal: string | null;
  readonly row_revision: string;
  readonly payload: RepositoryWireValue;
}

interface EntitySnapshot {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityKind: "map" | "array";
  readonly ordinal: number | null;
  readonly rowRevision: number;
  readonly value: unknown;
}

interface DesiredEntity {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityKind: "map" | "array";
  readonly ordinal: number | null;
  readonly projectId: string | null;
  readonly domainVersion: number | null;
  readonly state: string | null;
  readonly interfaceCode: string | null;
  readonly occurredAt: string | null;
  readonly payload: RepositoryWireValue;
  readonly value: unknown;
}

export function encodeRepositoryWire(value: unknown): RepositoryWireValue {
  if (value === null) return { type: "null" };
  if (value === undefined) return { type: "undefined" };
  if (value instanceof Date) return { type: "date", value: value.toISOString() };
  if (value instanceof Map) {
    return { type: "map", value: [...value.entries()].map(([key, entry]) => [encodeRepositoryWire(key), encodeRepositoryWire(entry)]) };
  }
  if (Array.isArray(value)) return { type: "array", value: value.map((entry) => encodeRepositoryWire(entry)) };
  if (typeof value === "object") {
    return { type: "object", value: Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, encodeRepositoryWire(entry)])) };
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { type: "scalar", value };
  }
  throw new TypeError(`Unsupported repository value type: ${typeof value}.`);
}

export function decodeRepositoryWire(value: RepositoryWireValue): unknown {
  if (value.type === "null") return null;
  if (value.type === "undefined") return undefined;
  if (value.type === "scalar") return value.value;
  if (value.type === "date") {
    const date = new Date(value.value);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== value.value) throw new Error("Repository date payload is invalid.");
    return date;
  }
  if (value.type === "array") return value.value.map((entry) => decodeRepositoryWire(entry));
  if (value.type === "map") return new Map(value.value.map(([key, entry]) => [decodeRepositoryWire(key), decodeRepositoryWire(entry)]));
  if (value.type === "object") {
    return Object.fromEntries(Object.entries(value.value).map(([key, entry]) => [key, decodeRepositoryWire(entry)]));
  }
  throw new Error("Repository wire payload contains an unsupported discriminator.");
}

function isRetryableDatabaseError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error
    && (error.code === "40001" || error.code === "40P01"));
}

function isUniqueDatabaseError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function requiredRecord(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date || value instanceof Map) {
    throw new Error(`${description} is not an object record.`);
  }
  return value as Record<string, unknown>;
}

function requiredEntityId(value: unknown, description: string): string {
  const id = requiredRecord(value, description).id;
  if (typeof id !== "string" || !id) throw new Error(`${description} has no stable string ID.`);
  return id;
}

function entityMetadata(entityType: string, value: unknown) {
  const record = requiredRecord(value, `${entityType} entity`);
  const projectId = typeof record.projectId === "string" ? record.projectId
    : entityType === "projects" && typeof record.id === "string" ? record.id : null;
  const domainVersion = typeof record.version === "number" && Number.isInteger(record.version) && record.version > 0
    ? record.version : null;
  const state = typeof record.state === "string" ? record.state : null;
  const interfaceCode = entityType === "integrationMessages" && typeof record.interfaceCode === "string"
    ? record.interfaceCode : null;
  const occurred = record.occurredAt instanceof Date ? record.occurredAt
    : record.createdAt instanceof Date ? record.createdAt : null;
  return {
    projectId,
    domainVersion,
    state,
    interfaceCode,
    occurredAt: occurred?.toISOString() ?? null,
  };
}

function desiredEntities(state: MemoryState): readonly DesiredEntity[] {
  const entities: DesiredEntity[] = [];
  for (const entityType of mapCollections) {
    const collection = state[entityType];
    if (!(collection instanceof Map)) throw new Error(`Repository collection ${entityType} is not a map.`);
    for (const [entityId, value] of collection.entries()) {
      if (typeof entityId !== "string" || !entityId) throw new Error(`Repository collection ${entityType} has an invalid key.`);
      const metadata = entityMetadata(entityType, value);
      entities.push({ entityType, entityId, entityKind: "map", ordinal: null,
        ...metadata, payload: encodeRepositoryWire(value), value });
    }
  }
  for (const entityType of arrayCollections) {
    const collection = state[entityType];
    if (!Array.isArray(collection)) throw new Error(`Repository collection ${entityType} is not an array.`);
    collection.forEach((value, ordinal) => {
      const entityId = requiredEntityId(value, `${entityType} entry`);
      const metadata = entityMetadata(entityType, value);
      entities.push({ entityType, entityId, entityKind: "array", ordinal,
        ...metadata, payload: encodeRepositoryWire(value), value });
    });
  }
  return entities;
}

function hydrateState(rows: readonly RepositoryEntityRow[]): { readonly state: MemoryState; readonly baseline: Map<string, EntitySnapshot> } {
  const state = createEmptyMemoryState();
  const baseline = new Map<string, EntitySnapshot>();
  const arrayValues = new Map<string, { readonly ordinal: number; readonly value: unknown }[]>();
  for (const row of rows) {
    if (!knownCollections.has(row.entity_type)) throw new Error(`Unknown repository entity type ${row.entity_type}.`);
    const value = decodeRepositoryWire(row.payload);
    const key = `${row.entity_type}\u0000${row.entity_id}`;
    if (baseline.has(key)) throw new Error(`Duplicate repository entity ${row.entity_type}/${row.entity_id}.`);
    const ordinal = row.ordinal === null ? null : Number(row.ordinal);
    baseline.set(key, {
      entityType: row.entity_type, entityId: row.entity_id, entityKind: row.entity_kind,
      ordinal, rowRevision: Number(row.row_revision), value,
    });
    if (row.entity_kind === "map") {
      const collection = state[row.entity_type as keyof MemoryState];
      if (!(collection instanceof Map)) throw new Error(`Repository entity kind mismatch for ${row.entity_type}.`);
      collection.set(row.entity_id, value as never);
    } else {
      if (ordinal === null || !Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error("Repository array ordinal is invalid.");
      const values = arrayValues.get(row.entity_type) ?? [];
      values.push({ ordinal, value });
      arrayValues.set(row.entity_type, values);
    }
  }
  for (const entityType of arrayCollections) {
    const values = (arrayValues.get(entityType) ?? []).sort((left, right) => left.ordinal - right.ordinal);
    (state[entityType] as unknown[]) = values.map((entry) => entry.value);
  }
  return { state, baseline };
}

function databaseRows(entities: readonly DesiredEntity[], baseline?: ReadonlyMap<string, EntitySnapshot>) {
  return entities.map((entity) => ({
    entity_type: entity.entityType,
    entity_id: entity.entityId,
    entity_kind: entity.entityKind,
    ordinal: entity.ordinal,
    project_id: entity.projectId,
    domain_version: entity.domainVersion,
    state: entity.state,
    interface_code: entity.interfaceCode,
    occurred_at: entity.occurredAt,
    payload: entity.payload,
    expected_revision: baseline?.get(`${entity.entityType}\u0000${entity.entityId}`)?.rowRevision ?? null,
  }));
}

export class PostgresFoundationStore implements FoundationStore {
  private constructor(private readonly pool: Pool) {}

  public static async connect(
    connectionString: string,
    runtimeRole: "eiep_runtime" | "eiep_job_worker" | null = null,
    authentication?: PostgresConnectionAuthentication,
  ): Promise<PostgresFoundationStore> {
    if (!connectionString.trim()) throw new Error("A PostgreSQL connection string is required.");
    const pool = new pg.Pool({
      connectionString,
      ...(authentication ? {
        password: authentication.password,
        ssl: { rejectUnauthorized: true },
      } : {}),
      application_name: runtimeRole === "eiep_job_worker" ? "eiep-job-worker" : "eiep-api",
      ...(runtimeRole ? { options: `-c role=${runtimeRole}` } : {}),
      max: 20,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    const store = new PostgresFoundationStore(pool);
    try {
      await store.health();
      return store;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  public async health(): Promise<PostgresRepositoryHealth> {
    const result = await this.pool.query<{
      server_version_number: number;
      current_user_name: string;
      schema_migration: string | null;
      repository_revision: string;
      repository_entity_count: string;
    }>(`
      SELECT
        current_setting('server_version_num')::integer AS server_version_number,
        current_user AS current_user_name,
        (SELECT name FROM public.eiep_schema_migration
          WHERE name = '0014_pmi_ncr_execution_detail.up.sql') AS schema_migration,
        (SELECT last_value::text FROM platform.repository_revision_seq) AS repository_revision,
        (SELECT count(*)::text FROM platform.repository_entity) AS repository_entity_count
    `);
    const row = result.rows[0];
    if (!row || row.server_version_number < 180000 || row.server_version_number >= 190000) {
      throw new Error("The PostgreSQL repository requires PostgreSQL 18.x.");
    }
    if (row.schema_migration !== "0014_pmi_ncr_execution_detail.up.sql") {
      throw new Error("The PostgreSQL repository schema is not at the required migration.");
    }
    return {
      serverVersionNumber: row.server_version_number,
      currentUser: row.current_user_name,
      schemaMigration: row.schema_migration,
      repositoryRevision: Number(row.repository_revision),
      repositoryEntityCount: Number(row.repository_entity_count),
    };
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async transaction<T>(work: (transaction: FoundationTransaction) => Promise<T> | T): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await this.pool.connect();
      try {
        return await this.executeTransaction(client, work);
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original database error remains authoritative.
        }
        if (isRetryableDatabaseError(error) && attempt < 3) continue;
        if (isRetryableDatabaseError(error) || isUniqueDatabaseError(error)) throw new ConflictError();
        throw error;
      } finally {
        client.release();
      }
    }
    throw new ConflictError();
  }

  public async claimIntegrationWork(input: IntegrationWorkClaim): Promise<readonly IntegrationWorkLease[]> {
    if (!input.ownerId.trim()) throw new Error("A worker owner ID is required.");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("The work claim limit must be between 1 and 100.");
    if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs < 1_000 || input.leaseDurationMs > 900_000) {
      throw new Error("The work lease duration must be between 1 second and 15 minutes.");
    }
    if (input.interfaceCodes.size === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const leasedUntil = new Date(input.now.getTime() + input.leaseDurationMs);
      const tokenPrefix = randomUUID();
      const result = await client.query<{
        entity_id: string;
        payload: RepositoryWireValue;
        lease_token: string;
        leased_until: Date;
      }>(`
        WITH candidates AS (
          SELECT entity.entity_id, entity.payload
          FROM platform.repository_entity AS entity
          WHERE entity.entity_type = 'integrationMessages'
            AND entity.state IN ('received', 'pending', 'retry')
            AND entity.interface_code = ANY($1::text[])
            AND NOT EXISTS (
              SELECT 1 FROM platform.integration_work_lease AS active_lease
              WHERE active_lease.message_id = entity.entity_id
                AND active_lease.leased_until > $2::timestamptz
            )
          ORDER BY entity.occurred_at, entity.entity_id
          FOR UPDATE SKIP LOCKED
          LIMIT $3
        ), leases AS (
          INSERT INTO platform.integration_work_lease (
            message_id, owner_id, lease_token, claimed_at, leased_until
          )
          SELECT candidate.entity_id, $4, $5 || ':' || candidate.entity_id, $2, $6
          FROM candidates AS candidate
          ON CONFLICT (message_id) DO UPDATE
            SET owner_id = EXCLUDED.owner_id,
                lease_token = EXCLUDED.lease_token,
                claimed_at = EXCLUDED.claimed_at,
                leased_until = EXCLUDED.leased_until
            WHERE platform.integration_work_lease.leased_until <= $2::timestamptz
          RETURNING message_id, lease_token, leased_until
        )
        SELECT candidate.entity_id, candidate.payload, leases.lease_token, leases.leased_until
        FROM candidates AS candidate
        JOIN leases ON leases.message_id = candidate.entity_id
        ORDER BY candidate.entity_id
      `, [[...input.interfaceCodes], input.now, input.limit, input.ownerId, tokenPrefix, leasedUntil]);
      await client.query("COMMIT");
      return result.rows.map((row) => {
        const message = decodeRepositoryWire(row.payload) as IntegrationMessageRecord;
        if (!message || message.id !== row.entity_id) throw new Error("A leased integration message payload is invalid.");
        return { message, leaseToken: row.lease_token, leasedUntil: new Date(row.leased_until) };
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  public async releaseIntegrationWorkLease(messageId: string, leaseToken: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM platform.integration_work_lease
      WHERE message_id = $1 AND lease_token = $2
    `, [messageId, leaseToken]);
    return result.rowCount === 1;
  }

  public async renewIntegrationWorkLease(
    messageId: string,
    leaseToken: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<Date | null> {
    if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 900_000) {
      throw new Error("The work lease duration must be between 1 second and 15 minutes.");
    }
    const leasedUntil = new Date(now.getTime() + leaseDurationMs);
    const result = await this.pool.query<{ leased_until: Date }>(`
      UPDATE platform.integration_work_lease
      SET claimed_at = $3, leased_until = $4
      WHERE message_id = $1 AND lease_token = $2 AND leased_until > $3
      RETURNING leased_until
    `, [messageId, leaseToken, now, leasedUntil]);
    const renewed = result.rows[0]?.leased_until;
    return renewed ? new Date(renewed) : null;
  }

  private async executeTransaction<T>(
    client: PoolClient,
    work: (transaction: FoundationTransaction) => Promise<T> | T,
  ): Promise<T> {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const result = await client.query<RepositoryEntityRow>(`
      SELECT entity_type, entity_id, entity_kind, ordinal::text, row_revision::text, payload
      FROM platform.repository_entity
      ORDER BY entity_type, ordinal NULLS LAST, entity_id
    `);
    const { state: initialState, baseline } = hydrateState(result.rows);
    const memory = new InMemoryFoundationStore(initialState);
    const operationResult = await memory.transaction(work);
    const nextState = memory.snapshot();
    const changed = await this.persistChanges(client, baseline, nextState);
    if (changed) await client.query("SELECT nextval('platform.repository_revision_seq')");
    await client.query("COMMIT");
    return operationResult;
  }

  private async persistChanges(
    client: PoolClient,
    baseline: ReadonlyMap<string, EntitySnapshot>,
    nextState: MemoryState,
  ): Promise<boolean> {
    const desired = desiredEntities(nextState);
    const desiredKeys = new Set(desired.map((entity) => `${entity.entityType}\u0000${entity.entityId}`));
    const removed = [...baseline.keys()].filter((key) => !desiredKeys.has(key));
    if (removed.length > 0) throw new Error("Physical repository deletion is not supported by the controlled store.");
    const added = desired.filter((entity) => !baseline.has(`${entity.entityType}\u0000${entity.entityId}`));
    const updated = desired.filter((entity) => {
      const current = baseline.get(`${entity.entityType}\u0000${entity.entityId}`);
      return current && (!isDeepStrictEqual(current.value, entity.value) || current.ordinal !== entity.ordinal);
    });
    if (added.length > 0) {
      await client.query(`
        INSERT INTO platform.repository_entity (
          entity_type, entity_id, entity_kind, ordinal, project_id, domain_version,
          state, interface_code, occurred_at, payload
        )
        SELECT entity_type, entity_id, entity_kind, ordinal, project_id, domain_version,
          state, interface_code, occurred_at, payload
        FROM jsonb_to_recordset($1::jsonb) AS incoming(
          entity_type text, entity_id text, entity_kind text, ordinal bigint,
          project_id text, domain_version bigint, state text, interface_code text,
          occurred_at timestamptz, payload jsonb, expected_revision bigint
        )
      `, [JSON.stringify(databaseRows(added))]);
    }
    if (updated.length > 0) {
      const result = await client.query(`
        UPDATE platform.repository_entity AS current
        SET entity_kind = incoming.entity_kind,
            ordinal = incoming.ordinal,
            project_id = incoming.project_id,
            domain_version = incoming.domain_version,
            state = incoming.state,
            interface_code = incoming.interface_code,
            occurred_at = incoming.occurred_at,
            payload = incoming.payload,
            row_revision = current.row_revision + 1,
            updated_at = CURRENT_TIMESTAMP
        FROM jsonb_to_recordset($1::jsonb) AS incoming(
          entity_type text, entity_id text, entity_kind text, ordinal bigint,
          project_id text, domain_version bigint, state text, interface_code text,
          occurred_at timestamptz, payload jsonb, expected_revision bigint
        )
        WHERE current.entity_type = incoming.entity_type
          AND current.entity_id = incoming.entity_id
          AND current.row_revision = incoming.expected_revision
      `, [JSON.stringify(databaseRows(updated, baseline))]);
      if (result.rowCount !== updated.length) throw new ConflictError();
    }
    return added.length > 0 || updated.length > 0;
  }
}
