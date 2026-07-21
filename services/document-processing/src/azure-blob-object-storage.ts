import { createHash } from "node:crypto";
import { ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { ImmutableStorageConflictError, type ObjectStoragePort, type StagedUploadStoragePort } from "./index.js";

export interface AzureBlobStorageConfiguration {
  readonly accountName: string;
  readonly managedIdentityClientId?: string;
  readonly endpointSuffix?: string;
  readonly stagedContainer?: string;
  readonly quarantineContainer?: string;
  readonly releasedContainer?: string;
  readonly generatedContainer?: string;
  readonly maximumMoveBytes?: number;
}

export interface GovernedBlobProperties {
  readonly contentLength: number;
  readonly etag: string;
  readonly sha256: string;
  readonly sourceEtag: string | null;
}

export interface GovernedBlobContainerPort {
  assertPrivate(): Promise<void>;
  putIfAbsent(
    storageKey: string,
    content: Uint8Array,
    sha256: string,
    sourceEtag: string | null,
  ): Promise<void>;
  properties(storageKey: string): Promise<GovernedBlobProperties | null>;
  readExact(storageKey: string, maximumSizeBytes: number, etag: string): Promise<Uint8Array>;
  deleteExact(storageKey: string, etag: string): Promise<void>;
}

export interface GovernedBlobBoundaries {
  readonly staged: GovernedBlobContainerPort;
  readonly quarantine: GovernedBlobContainerPort;
  readonly released: GovernedBlobContainerPort;
  readonly generated: GovernedBlobContainerPort;
}

function statusCode(error: unknown): number | null {
  return error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : null;
}

function opaqueStorageKey(storageKey: string): string {
  const normalized = storageKey.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.length < 2 || segments.some((segment) => !/^[A-Za-z0-9_-]{8,128}$/u.test(segment))) {
    throw new Error("Azure Blob storage keys must contain only opaque identifier segments.");
  }
  return normalized;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

class AzureSdkBlobContainer implements GovernedBlobContainerPort {
  public constructor(
    private readonly client: ContainerClient,
    private readonly boundary: "staged" | "quarantine" | "released" | "generated",
  ) {}

  public async assertPrivate(): Promise<void> {
    const properties = await this.client.getProperties();
    if (properties.blobPublicAccess !== undefined) {
      throw new Error(`The ${this.boundary} Blob container permits public access.`);
    }
  }

  public async putIfAbsent(
    storageKey: string,
    content: Uint8Array,
    digest: string,
    sourceEtag: string | null,
  ): Promise<void> {
    await this.client.getBlockBlobClient(storageKey).uploadData(content, {
      conditions: { ifNoneMatch: "*" },
      blobHTTPHeaders: { blobContentType: "application/octet-stream" },
      metadata: {
        eiepboundary: this.boundary,
        eiepsha256: digest,
        ...(sourceEtag ? { eiepsourceetag: Buffer.from(sourceEtag, "utf8").toString("base64url") } : {}),
      },
    });
  }

  public async properties(storageKey: string): Promise<GovernedBlobProperties | null> {
    try {
      const properties = await this.client.getBlockBlobClient(storageKey).getProperties();
      if (properties.contentLength === undefined || !properties.etag || !properties.metadata?.eiepsha256) {
        throw new Error("The governed Blob object is missing required immutable metadata.");
      }
      return {
        contentLength: properties.contentLength,
        etag: properties.etag,
        sha256: properties.metadata.eiepsha256,
        sourceEtag: properties.metadata.eiepsourceetag
          ? Buffer.from(properties.metadata.eiepsourceetag, "base64url").toString("utf8")
          : null,
      };
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }

  public readExact(storageKey: string, maximumSizeBytes: number, etag: string): Promise<Uint8Array> {
    return this.client.getBlockBlobClient(storageKey).downloadToBuffer(0, maximumSizeBytes + 1, {
      conditions: { ifMatch: etag },
    });
  }

  public async deleteExact(storageKey: string, etag: string): Promise<void> {
    await this.client.getBlockBlobClient(storageKey).delete({ conditions: { ifMatch: etag } });
  }
}

async function putImmutableExact(
  boundary: GovernedBlobContainerPort,
  storageKey: string,
  content: Uint8Array,
  maximumSizeBytes: number,
  label: string,
): Promise<void> {
  if (content.length < 1 || content.length > maximumSizeBytes) {
    throw new Error(`The ${label} object exceeds the storage policy.`);
  }
  const contentSha256 = sha256(content);
  const existing = await boundary.properties(storageKey);
  if (existing) {
    if (existing.contentLength !== content.length || existing.sha256 !== contentSha256) {
      if (label === "staged") throw new ImmutableStorageConflictError();
      throw new Error(`The immutable ${label} Blob object already exists with different content.`);
    }
    const existingContent = await boundary.readExact(storageKey, maximumSizeBytes, existing.etag);
    if (existingContent.length !== content.length || sha256(existingContent) !== contentSha256) {
      throw new Error(`The immutable ${label} Blob object failed its content check.`);
    }
    return;
  }
  try {
    await boundary.putIfAbsent(storageKey, content, contentSha256, null);
  } catch (error) {
    if (statusCode(error) !== 409 && statusCode(error) !== 412) throw error;
    const raced = await boundary.properties(storageKey);
    if (!raced || raced.contentLength !== content.length || raced.sha256 !== contentSha256) {
      if (label === "staged") throw new ImmutableStorageConflictError();
      throw new Error(`A conflicting ${label} Blob object won the immutable-write race.`);
    }
  }
}

export class AzureBlobStagedUploadStorage implements StagedUploadStoragePort {
  private static readonly defaultMaximumUploadBytes = 256 * 1024 * 1024;

  public static async createWithManagedIdentity(
    configuration: Pick<AzureBlobStorageConfiguration,
      "accountName" | "managedIdentityClientId" | "endpointSuffix" | "stagedContainer" | "maximumMoveBytes">,
  ): Promise<AzureBlobStagedUploadStorage> {
    if (!/^[a-z0-9]{3,24}$/u.test(configuration.accountName)) {
      throw new Error("The Azure Storage account name is invalid.");
    }
    const suffix = configuration.endpointSuffix ?? "blob.core.windows.net";
    if (!/^[a-z0-9.-]+$/u.test(suffix)) throw new Error("The Azure Storage endpoint suffix is invalid.");
    const credential = configuration.managedIdentityClientId
      ? new ManagedIdentityCredential(configuration.managedIdentityClientId)
      : new ManagedIdentityCredential();
    const service = new BlobServiceClient(`https://${configuration.accountName}.${suffix}`, credential);
    const staged = new AzureSdkBlobContainer(service.getContainerClient(configuration.stagedContainer ?? "staged"), "staged");
    const storage = new AzureBlobStagedUploadStorage(staged, configuration.maximumMoveBytes);
    await storage.assertPrivateBoundary();
    return storage;
  }

  public constructor(
    private readonly staged: GovernedBlobContainerPort,
    private readonly maximumUploadBytes = AzureBlobStagedUploadStorage.defaultMaximumUploadBytes,
  ) {
    if (!Number.isSafeInteger(maximumUploadBytes) || maximumUploadBytes < 1) {
      throw new Error("The maximum Blob upload size is invalid.");
    }
  }

  public assertPrivateBoundary(): Promise<void> {
    return this.staged.assertPrivate();
  }

  public putStaged(storageKey: string, content: Uint8Array): Promise<void> {
    return putImmutableExact(this.staged, opaqueStorageKey(storageKey), content, this.maximumUploadBytes, "staged");
  }
}

export class AzureBlobObjectStorage implements ObjectStoragePort {
  private static readonly defaultMaximumMoveBytes = 256 * 1024 * 1024;

  public static async createWithManagedIdentity(
    configuration: AzureBlobStorageConfiguration,
  ): Promise<AzureBlobObjectStorage> {
    if (!/^[a-z0-9]{3,24}$/u.test(configuration.accountName)) {
      throw new Error("The Azure Storage account name is invalid.");
    }
    const suffix = configuration.endpointSuffix ?? "blob.core.windows.net";
    if (!/^[a-z0-9.-]+$/u.test(suffix)) throw new Error("The Azure Storage endpoint suffix is invalid.");
    const credential = configuration.managedIdentityClientId
      ? new ManagedIdentityCredential(configuration.managedIdentityClientId)
      : new ManagedIdentityCredential();
    const service = new BlobServiceClient(`https://${configuration.accountName}.${suffix}`, credential);
    const boundary = (name: string, kind: "staged" | "quarantine" | "released" | "generated") =>
      new AzureSdkBlobContainer(service.getContainerClient(name), kind);
    const storage = new AzureBlobObjectStorage({
      staged: boundary(configuration.stagedContainer ?? "staged", "staged"),
      quarantine: boundary(configuration.quarantineContainer ?? "quarantine", "quarantine"),
      released: boundary(configuration.releasedContainer ?? "released", "released"),
      generated: boundary(configuration.generatedContainer ?? "turnover", "generated"),
    }, configuration.maximumMoveBytes);
    await storage.assertPrivateBoundaries();
    return storage;
  }

  public constructor(
    private readonly boundaries: GovernedBlobBoundaries,
    private readonly maximumMoveBytes = AzureBlobObjectStorage.defaultMaximumMoveBytes,
  ) {
    if (!Number.isSafeInteger(maximumMoveBytes) || maximumMoveBytes < 1) {
      throw new Error("The maximum Blob move size is invalid.");
    }
  }

  public async assertPrivateBoundaries(): Promise<void> {
    await Promise.all([
      this.boundaries.staged.assertPrivate(),
      this.boundaries.quarantine.assertPrivate(),
      this.boundaries.released.assertPrivate(),
      this.boundaries.generated.assertPrivate(),
    ]);
  }

  public async putStaged(storageKey: string, content: Uint8Array): Promise<void> {
    const key = opaqueStorageKey(storageKey);
    await putImmutableExact(this.boundaries.staged, key, content, this.maximumMoveBytes, "staged");
  }

  public readStaged(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array> {
    return this.read(this.boundaries.staged, storageKey, maximumSizeBytes);
  }

  public readQuarantined(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array> {
    return this.read(this.boundaries.quarantine, storageKey, maximumSizeBytes);
  }

  public moveToQuarantine(storageKey: string): Promise<void> {
    return this.move(this.boundaries.staged, this.boundaries.quarantine, storageKey);
  }

  public release(storageKey: string): Promise<void> {
    return this.move(this.boundaries.staged, this.boundaries.released, storageKey);
  }

  public readReleased(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array> {
    return this.read(this.boundaries.released, storageKey, maximumSizeBytes);
  }

  public async putGenerated(storageKey: string, content: Uint8Array): Promise<void> {
    const key = opaqueStorageKey(storageKey);
    if (content.length > this.maximumMoveBytes) throw new Error("The generated object exceeds the storage policy.");
    const contentSha256 = sha256(content);
    const existing = await this.boundaries.generated.properties(key);
    if (existing) {
      if (existing.contentLength !== content.length || existing.sha256 !== contentSha256) {
        throw new Error("The immutable generated Blob object already exists with different content.");
      }
      const existingContent = await this.boundaries.generated.readExact(key, this.maximumMoveBytes, existing.etag);
      if (existingContent.length !== content.length || sha256(existingContent) !== contentSha256) {
        throw new Error("The immutable generated Blob object failed its content check.");
      }
      return;
    }
    try {
      await this.boundaries.generated.putIfAbsent(key, content, contentSha256, null);
    } catch (error) {
      if (statusCode(error) !== 409 && statusCode(error) !== 412) throw error;
      const raced = await this.boundaries.generated.properties(key);
      if (!raced || raced.contentLength !== content.length || raced.sha256 !== contentSha256) {
        throw new Error("A conflicting generated Blob object won the immutable-write race.");
      }
    }
  }

  public async readGenerated(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array | null> {
    const key = opaqueStorageKey(storageKey);
    const properties = await this.boundaries.generated.properties(key);
    if (!properties) return null;
    return this.read(this.boundaries.generated, key, maximumSizeBytes);
  }

  private async read(
    boundary: GovernedBlobContainerPort,
    storageKey: string,
    maximumSizeBytes: number,
  ): Promise<Uint8Array> {
    const key = opaqueStorageKey(storageKey);
    if (!Number.isSafeInteger(maximumSizeBytes) || maximumSizeBytes < 1) {
      throw new Error("The Blob read limit is invalid.");
    }
    const properties = await boundary.properties(key);
    if (!properties || properties.contentLength > maximumSizeBytes) {
      throw new Error("The stored object is missing or exceeds the read policy.");
    }
    const content = await boundary.readExact(key, maximumSizeBytes, properties.etag);
    if (content.length !== properties.contentLength || sha256(content) !== properties.sha256) {
      throw new Error("The stored object failed its immutable-content check.");
    }
    return content;
  }

  private async move(
    source: GovernedBlobContainerPort,
    target: GovernedBlobContainerPort,
    storageKey: string,
  ): Promise<void> {
    const key = opaqueStorageKey(storageKey);
    const sourceProperties = await source.properties(key);
    const targetProperties = await target.properties(key);
    if (!sourceProperties) {
      if (targetProperties) return;
      throw new Error("The source Blob object does not exist.");
    }
    if (targetProperties) {
      if (targetProperties.sha256 !== sourceProperties.sha256 || targetProperties.sourceEtag !== sourceProperties.etag) {
        throw new Error("The immutable target Blob object conflicts with the staged source.");
      }
      await source.deleteExact(key, sourceProperties.etag);
      return;
    }
    if (sourceProperties.contentLength > this.maximumMoveBytes) {
      throw new Error("The staged Blob object exceeds the move policy.");
    }
    const content = await source.readExact(key, this.maximumMoveBytes, sourceProperties.etag);
    if (content.length !== sourceProperties.contentLength || sha256(content) !== sourceProperties.sha256) {
      throw new Error("The staged Blob object failed its immutable-content check.");
    }
    await target.putIfAbsent(key, content, sourceProperties.sha256, sourceProperties.etag);
    await source.deleteExact(key, sourceProperties.etag);
  }
}
