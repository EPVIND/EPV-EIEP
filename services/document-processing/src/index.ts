import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface FileProcessingRequest {
  readonly jobId: string;
  readonly fileId: string;
  readonly storageKey: string;
  readonly expectedSha256: string;
  readonly declaredMediaType: string;
  readonly maximumSizeBytes: number;
  readonly correlationId: string;
}

export interface FileProcessingResult {
  readonly jobId: string;
  readonly state: "validated" | "quarantined" | "rejected";
  readonly detectedMediaType: string | null;
  readonly detectedSha256: string | null;
  readonly sizeBytes: number;
  readonly malwareState: "clean" | "malicious" | "error";
  readonly scanProvider: string;
  readonly scanVersion: string;
  readonly activeContentDetected: boolean;
  readonly encryptedArchiveDetected: boolean;
  readonly validatorVersion: string;
  readonly reasonCodes: readonly string[];
}

export interface MalwareScanResult {
  readonly state: "clean" | "malicious" | "error";
  readonly provider: string;
  readonly version: string;
  readonly signature: string | null;
}

export interface MalwareScanner {
  scan(content: Uint8Array, correlationId: string): Promise<MalwareScanResult>;
}

export interface StagedUploadStoragePort {
  putStaged(storageKey: string, content: Uint8Array): Promise<void>;
}

export class ImmutableStorageConflictError extends Error {
  public constructor() {
    super("An immutable staged object already exists with different content.");
    this.name = "ImmutableStorageConflictError";
  }
}

export interface ObjectStoragePort extends StagedUploadStoragePort {
  readStaged(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array>;
  readQuarantined(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array>;
  moveToQuarantine(storageKey: string): Promise<void>;
  release(storageKey: string): Promise<void>;
  readReleased(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array>;
  putGenerated(storageKey: string, content: Uint8Array): Promise<void>;
  readGenerated(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array | null>;
}

export function validateProcessingRequest(request: FileProcessingRequest): readonly string[] {
  const issues: string[] = [];
  if (!request.jobId.trim()) issues.push("job_id_required");
  if (!request.fileId.trim()) issues.push("file_id_required");
  if (!request.storageKey.trim() || isAbsolute(request.storageKey) || request.storageKey.includes("..")) {
    issues.push("storage_key_invalid");
  }
  if (!/^[0-9a-f]{64}$/u.test(request.expectedSha256)) issues.push("sha256_invalid");
  if (!Number.isSafeInteger(request.maximumSizeBytes) || request.maximumSizeBytes < 1) issues.push("maximum_size_invalid");
  if (!request.declaredMediaType.trim()) issues.push("declared_media_type_required");
  if (!request.correlationId.trim()) issues.push("correlation_id_required");
  return issues;
}

function detectMediaType(content: Uint8Array): string | null {
  if (content.length >= 5 && Buffer.from(content.subarray(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  if (content.length >= 8 && Buffer.from(content.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b
    && (content[2] === 0x03 || content[2] === 0x05 || content[2] === 0x07)
    && (content[3] === 0x04 || content[3] === 0x06 || content[3] === 0x08)) return "application/zip";
  const text = Buffer.from(content).toString("utf8");
  if (Buffer.from(text, "utf8").length !== content.length || text.includes("\0")) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && (typeof parsed === "object" || Array.isArray(parsed))) return "application/json";
  } catch {
    // Text may still be a controlled CSV representation.
  }
  const trimmed = text.trimStart();
  if ((trimmed.startsWith("<?xml") || /^<!DOCTYPE\b/iu.test(trimmed)
    || /^<[A-Za-z_][A-Za-z0-9_.:-]*(?:\s|>)/u.test(trimmed))
    && /<\/[A-Za-z_][A-Za-z0-9_.:-]*\s*>/u.test(trimmed)) return "application/xml";
  if (text.includes(",") && /(?:\r?\n|^)[^\r\n,]+,[^\r\n]+/u.test(text)) return "text/csv";
  return null;
}

function contentRisks(content: Uint8Array, detectedMediaType: string | null) {
  const text = Buffer.from(content).toString("latin1");
  const activeContentDetected = (detectedMediaType === "application/pdf"
    && /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/iu.test(text))
    || (detectedMediaType === "application/xml" && /<!DOCTYPE|<!ENTITY/iu.test(text));
  const encryptedArchiveDetected = detectedMediaType === "application/zip"
    || (detectedMediaType === "application/pdf" && /\/Encrypt\b/iu.test(text));
  return { activeContentDetected, encryptedArchiveDetected };
}

function safeStorageKey(storageKey: string): string {
  const normalized = storageKey.replaceAll("\\", "/");
  if (!normalized || isAbsolute(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("The storage key is invalid.");
  }
  return normalized;
}

export class LocalFilesystemObjectStorage implements ObjectStoragePort {
  public constructor(private readonly rootDirectory: string) {
    if (!isAbsolute(rootDirectory)) throw new Error("The object-storage root must be absolute.");
  }

  public async putStaged(storageKey: string, content: Uint8Array): Promise<void> {
    const path = this.path("staged", storageKey);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, content, { flag: "wx" });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readFile(path);
      if (existing.length !== content.length || !existing.equals(Buffer.from(content))) {
        throw new ImmutableStorageConflictError();
      }
    }
  }

  public readStaged(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array> {
    return this.read("staged", storageKey, maximumSizeBytes);
  }

  public readQuarantined(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array> {
    return this.read("quarantine", storageKey, maximumSizeBytes);
  }

  public moveToQuarantine(storageKey: string): Promise<void> {
    return this.move("staged", "quarantine", storageKey);
  }

  public release(storageKey: string): Promise<void> {
    return this.move("staged", "released", storageKey);
  }

  public readReleased(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array> {
    return this.read("released", storageKey, maximumSizeBytes);
  }

  public async putGenerated(storageKey: string, content: Uint8Array): Promise<void> {
    const path = this.path("generated", storageKey);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, content, { flag: "wx" });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readFile(path);
      if (existing.length !== content.length || !existing.equals(Buffer.from(content))) {
        throw new Error("The immutable generated object already exists with different content.");
      }
    }
  }

  public async readGenerated(storageKey: string, maximumSizeBytes: number): Promise<Uint8Array | null> {
    try {
      return await this.read("generated", storageKey, maximumSizeBytes);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  private path(boundary: "staged" | "quarantine" | "released" | "generated", storageKey: string): string {
    const boundaryRoot = resolve(this.rootDirectory, boundary);
    const target = resolve(boundaryRoot, ...safeStorageKey(storageKey).split("/"));
    const fromBoundary = relative(boundaryRoot, target);
    if (fromBoundary.startsWith(`..${sep}`) || fromBoundary === ".." || isAbsolute(fromBoundary)) {
      throw new Error("The storage key escapes its controlled boundary.");
    }
    return target;
  }

  private async read(
    boundary: "staged" | "quarantine" | "released" | "generated",
    storageKey: string,
    maximumSizeBytes: number,
  ): Promise<Uint8Array> {
    const path = this.path(boundary, storageKey);
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > maximumSizeBytes) throw new Error("The stored object exceeds the read policy.");
    const content = await readFile(path);
    if (content.length > maximumSizeBytes) throw new Error("The stored object changed during bounded read.");
    return content;
  }

  private async move(
    sourceBoundary: "staged",
    targetBoundary: "quarantine" | "released",
    storageKey: string,
  ): Promise<void> {
    const source = this.path(sourceBoundary, storageKey);
    const target = this.path(targetBoundary, storageKey);
    await mkdir(dirname(target), { recursive: true });
    try {
      await stat(source);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      try {
        const targetMetadata = await stat(target);
        if (targetMetadata.isFile()) return;
      } catch (targetError) {
        if (!(targetError && typeof targetError === "object" && "code" in targetError && targetError.code === "ENOENT")) {
          throw targetError;
        }
      }
      throw new Error("The source object does not exist.");
    }
    try {
      await stat(target);
      throw new Error("The target object already exists.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    await rename(source, target);
  }
}

export class MarkerMalwareScanner implements MalwareScanner {
  public constructor(private readonly maliciousMarker: Uint8Array = Buffer.from("EIEP_TEST_MALWARE_MARKER", "utf8")) {}

  public async scan(content: Uint8Array): Promise<MalwareScanResult> {
    const malicious = Buffer.from(content).includes(Buffer.from(this.maliciousMarker));
    return {
      state: malicious ? "malicious" : "clean", provider: "eiep-marker-development-scanner",
      version: "1", signature: malicious ? "controlled-test-marker" : null,
    };
  }
}

export class ClamAvTcpScanner implements MalwareScanner {
  public constructor(
    private readonly host: string,
    private readonly port = 3310,
    private readonly timeoutMilliseconds = 30_000,
  ) {
    if (!host.trim()) throw new Error("The ClamAV host is required.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("The ClamAV port is invalid.");
  }

  public scan(content: Uint8Array, correlationId: string): Promise<MalwareScanResult> {
    return new Promise((resolveScan) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const responses: Buffer[] = [];
      let resolved = false;
      const finish = (result: MalwareScanResult) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolveScan(result);
      };
      socket.setTimeout(this.timeoutMilliseconds);
      socket.on("connect", () => {
        socket.write(Buffer.from("zINSTREAM\0", "ascii"));
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < content.length; offset += chunkSize) {
          const chunk = Buffer.from(content.subarray(offset, Math.min(offset + chunkSize, content.length)));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on("data", (chunk: Buffer) => responses.push(chunk));
      socket.on("end", () => {
        const response = Buffer.concat(responses).toString("utf8").trim();
        if (response.endsWith("OK")) {
          finish({ state: "clean", provider: "clamav", version: "tcp-instream", signature: null });
        } else if (response.includes("FOUND")) {
          const signature = response.match(/: (.+) FOUND/u)?.[1] ?? "malware-detected";
          finish({ state: "malicious", provider: "clamav", version: "tcp-instream", signature });
        } else {
          finish({ state: "error", provider: "clamav", version: "tcp-instream", signature: null });
        }
      });
      socket.on("timeout", () => finish({ state: "error", provider: "clamav", version: "tcp-instream", signature: null }));
      socket.on("error", () => finish({
        state: "error", provider: "clamav", version: `tcp-instream:${correlationId ? "correlated" : "uncorrelated"}`, signature: null,
      }));
    });
  }
}

export class FileProcessingWorker {
  public constructor(
    private readonly storage: ObjectStoragePort,
    private readonly scanner: MalwareScanner,
    private readonly validatorVersion = "eiep-file-validator/1",
  ) {}

  public async process(request: FileProcessingRequest): Promise<FileProcessingResult> {
    const requestIssues = validateProcessingRequest(request);
    if (requestIssues.length > 0) throw new Error(`Invalid file-processing request: ${requestIssues.join(",")}.`);
    let content: Uint8Array;
    try {
      content = await this.storage.readStaged(request.storageKey, request.maximumSizeBytes);
    } catch {
      try {
        content = await this.storage.readQuarantined(request.storageKey, request.maximumSizeBytes);
      } catch {
        try {
          await this.storage.moveToQuarantine(request.storageKey);
          content = await this.storage.readQuarantined(request.storageKey, request.maximumSizeBytes);
        } catch {
          return this.failure(request, "error", ["storage_read_or_size_failed"]);
        }
      }
    }
    const detectedSha256 = createHash("sha256").update(content).digest("hex");
    const detectedMediaType = detectMediaType(content);
    const { activeContentDetected, encryptedArchiveDetected } = contentRisks(content, detectedMediaType);
    const reasons: string[] = [];
    if (detectedSha256 !== request.expectedSha256) reasons.push("hash_mismatch");
    if (!detectedMediaType || detectedMediaType !== request.declaredMediaType) reasons.push("media_type_mismatch");
    if (activeContentDetected) reasons.push("active_content_detected");
    if (encryptedArchiveDetected) reasons.push("encrypted_or_archive_content_detected");
    const scan = await this.scanner.scan(content, request.correlationId);
    if (scan.state === "malicious") reasons.push("malware_detected");
    if (scan.state === "error") reasons.push("malware_scan_failed");
    const state = scan.state === "malicious" ? "quarantined" : reasons.length > 0 ? "rejected" : "validated";
    if (state !== "validated") await this.storage.moveToQuarantine(request.storageKey);
    return {
      jobId: request.jobId, state, detectedMediaType, detectedSha256, sizeBytes: content.length,
      malwareState: scan.state, scanProvider: scan.provider, scanVersion: scan.version,
      activeContentDetected, encryptedArchiveDetected, validatorVersion: this.validatorVersion,
      reasonCodes: reasons,
    };
  }

  private failure(
    request: FileProcessingRequest,
    malwareState: "error",
    reasonCodes: readonly string[],
  ): FileProcessingResult {
    return {
      jobId: request.jobId, state: "rejected", detectedMediaType: null, detectedSha256: null, sizeBytes: 0,
      malwareState, scanProvider: "unavailable", scanVersion: "unavailable",
      activeContentDetected: false, encryptedArchiveDetected: false,
      validatorVersion: this.validatorVersion, reasonCodes,
    };
  }
}

export * from "./azure-blob-object-storage.js";
