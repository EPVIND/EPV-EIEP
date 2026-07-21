import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  createEmptyMemoryState,
  decodeRepositoryWire,
  encodeRepositoryWire,
  type MemoryState,
  type RepositoryWireValue,
} from "@eiep/api";

export interface RecoveryObjectInput {
  readonly boundary: "staged" | "quarantine" | "released";
  readonly storageKey: string;
  readonly content: Uint8Array;
}

interface RecoveryObjectWire {
  readonly boundary: RecoveryObjectInput["boundary"];
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly contentBase64: string;
}

interface RecoveryPayload {
  readonly schemaVersion: 1;
  readonly repositoryState: RepositoryWireValue;
  readonly objects: readonly RecoveryObjectWire[];
}

export interface EncryptedRecoveryBundle {
  readonly schemaVersion: 1;
  readonly algorithm: "AES-256-GCM";
  readonly sourceEnvironment: "development" | "test" | "training" | "production";
  readonly sourceBuildId: string;
  readonly createdAtUtc: string;
  readonly nonceBase64: string;
  readonly authTagBase64: string;
  readonly ciphertextBase64: string;
  readonly ciphertextSha256: string;
}

export interface RestoredRecoveryBundle {
  readonly state: MemoryState;
  readonly objects: readonly RecoveryObjectInput[];
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function validStorageKey(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return Boolean(normalized) && !normalized.startsWith("/")
    && normalized.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function aad(bundle: Pick<EncryptedRecoveryBundle, "schemaVersion" | "algorithm" | "sourceEnvironment" | "sourceBuildId" | "createdAtUtc">): Buffer {
  return Buffer.from(JSON.stringify({
    schemaVersion: bundle.schemaVersion,
    algorithm: bundle.algorithm,
    sourceEnvironment: bundle.sourceEnvironment,
    sourceBuildId: bundle.sourceBuildId,
    createdAtUtc: bundle.createdAtUtc,
  }), "utf8");
}

function requireKey(key: Uint8Array): Buffer {
  if (key.length !== 32) throw new Error("Recovery encryption key must contain exactly 32 bytes.");
  return Buffer.from(key);
}

function validatedState(value: unknown): MemoryState {
  if (!value || typeof value !== "object") throw new Error("Recovery repository state is invalid.");
  const state = { ...createEmptyMemoryState(), ...(value as Partial<MemoryState>) };
  const baseline = createEmptyMemoryState();
  for (const key of Object.keys(baseline) as (keyof MemoryState)[]) {
    const expected = baseline[key];
    const actual = state[key];
    if (expected instanceof Map && !(actual instanceof Map)) throw new Error(`Recovery state map ${String(key)} is invalid.`);
    if (Array.isArray(expected) && !Array.isArray(actual)) throw new Error(`Recovery state list ${String(key)} is invalid.`);
  }
  return state;
}

export function createEncryptedRecoveryBundle(
  state: MemoryState,
  objects: readonly RecoveryObjectInput[],
  key: Uint8Array,
  metadata: {
    readonly sourceEnvironment: EncryptedRecoveryBundle["sourceEnvironment"];
    readonly sourceBuildId: string;
    readonly createdAt: Date;
  },
): EncryptedRecoveryBundle {
  if (!metadata.sourceBuildId.trim()) throw new Error("Recovery source build ID is required.");
  const createdAtUtc = metadata.createdAt.toISOString();
  if (objects.length > 10_000) throw new Error("Recovery object count exceeds policy.");
  const objectKeys = new Set<string>();
  const objectWires = objects.map((object): RecoveryObjectWire => {
    if (!validStorageKey(object.storageKey)) throw new Error("Recovery object storage key is invalid.");
    const uniqueKey = `${object.boundary}:${object.storageKey}`;
    if (objectKeys.has(uniqueKey)) throw new Error("Recovery object storage key is duplicated.");
    objectKeys.add(uniqueKey);
    if (object.content.byteLength > 100 * 1024 * 1024) throw new Error("Recovery object exceeds the per-object policy.");
    return {
      boundary: object.boundary,
      storageKey: object.storageKey,
      sizeBytes: object.content.byteLength,
      sha256: sha256(object.content),
      contentBase64: Buffer.from(object.content).toString("base64"),
    };
  });
  const payload: RecoveryPayload = {
    schemaVersion: 1,
    repositoryState: encodeRepositoryWire(state),
    objects: objectWires,
  };
  const header = {
    schemaVersion: 1 as const,
    algorithm: "AES-256-GCM" as const,
    sourceEnvironment: metadata.sourceEnvironment,
    sourceBuildId: metadata.sourceBuildId.trim(),
    createdAtUtc,
  };
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireKey(key), nonce);
  cipher.setAAD(aad(header));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    ...header,
    nonceBase64: nonce.toString("base64"),
    authTagBase64: cipher.getAuthTag().toString("base64"),
    ciphertextBase64: ciphertext.toString("base64"),
    ciphertextSha256: sha256(ciphertext),
  };
}

export function restoreEncryptedRecoveryBundle(bundle: EncryptedRecoveryBundle, key: Uint8Array): RestoredRecoveryBundle {
  if (bundle.schemaVersion !== 1 || bundle.algorithm !== "AES-256-GCM") throw new Error("Recovery bundle version is unsupported.");
  const ciphertext = Buffer.from(bundle.ciphertextBase64, "base64");
  if (sha256(ciphertext) !== bundle.ciphertextSha256) throw new Error("Recovery bundle ciphertext integrity check failed.");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(key), Buffer.from(bundle.nonceBase64, "base64"));
  decipher.setAAD(aad(bundle));
  decipher.setAuthTag(Buffer.from(bundle.authTagBase64, "base64"));
  let payload: RecoveryPayload;
  try {
    payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as RecoveryPayload;
  } catch {
    throw new Error("Recovery bundle authentication or payload validation failed.");
  }
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.objects)) throw new Error("Recovery payload version is unsupported.");
  const seen = new Set<string>();
  const objects = payload.objects.map((object): RecoveryObjectInput => {
    if (!validStorageKey(object.storageKey)) throw new Error("Recovery object storage key is invalid.");
    const uniqueKey = `${object.boundary}:${object.storageKey}`;
    if (seen.has(uniqueKey)) throw new Error("Recovery object storage key is duplicated.");
    seen.add(uniqueKey);
    const content = Buffer.from(object.contentBase64, "base64");
    if (content.byteLength !== object.sizeBytes || sha256(content) !== object.sha256) {
      throw new Error("Recovery object integrity check failed.");
    }
    return { boundary: object.boundary, storageKey: object.storageKey, content };
  });
  return { state: validatedState(decodeRepositoryWire(payload.repositoryState)), objects };
}
