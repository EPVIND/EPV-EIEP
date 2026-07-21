import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AzureBlobObjectStorage,
  AzureBlobStagedUploadStorage,
  type GovernedBlobContainerPort,
  type GovernedBlobProperties,
} from "@eiep/document-processing";

interface StoredBlob extends GovernedBlobProperties {
  readonly content: Uint8Array;
}

class MemoryBlobContainer implements GovernedBlobContainerPort {
  public readonly objects = new Map<string, StoredBlob>();
  public failNextDelete = false;
  private revision = 0;

  public constructor(public isPrivate = true) {}

  public async assertPrivate(): Promise<void> {
    if (!this.isPrivate) throw new Error("public access");
  }

  public async putIfAbsent(
    storageKey: string,
    content: Uint8Array,
    sha256: string,
    sourceEtag: string | null,
  ): Promise<void> {
    if (this.objects.has(storageKey)) throw Object.assign(new Error("already exists"), { statusCode: 412 });
    this.revision += 1;
    this.objects.set(storageKey, {
      content: Uint8Array.from(content), contentLength: content.length,
      etag: `etag-${this.revision}`, sha256, sourceEtag,
    });
  }

  public async properties(storageKey: string): Promise<GovernedBlobProperties | null> {
    return this.objects.get(storageKey) ?? null;
  }

  public async readExact(storageKey: string, maximumSizeBytes: number, etag: string): Promise<Uint8Array> {
    const object = this.objects.get(storageKey);
    if (!object || object.etag !== etag) throw Object.assign(new Error("condition failed"), { statusCode: 412 });
    return object.content.slice(0, maximumSizeBytes + 1);
  }

  public async deleteExact(storageKey: string, etag: string): Promise<void> {
    const object = this.objects.get(storageKey);
    if (!object || object.etag !== etag) throw Object.assign(new Error("condition failed"), { statusCode: 412 });
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error("simulated interruption after target upload");
    }
    this.objects.delete(storageKey);
  }
}

function digest(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

test("NFR-SEC-005, NFR-DAT-001 / AC-03-09-10: Azure Blob boundaries are private, immutable, bounded, and restart-safe", async () => {
  const staged = new MemoryBlobContainer();
  const quarantine = new MemoryBlobContainer();
  const released = new MemoryBlobContainer();
  const generated = new MemoryBlobContainer();
  const storage = new AzureBlobObjectStorage({ staged, quarantine, released, generated }, 1024);
  await storage.assertPrivateBoundaries();

  const key = "project_0001/object_000001";
  const content = Buffer.from("controlled evidence", "utf8");
  await storage.putStaged(key, content);
  await storage.putStaged(key, content);
  await assert.rejects(storage.putStaged(key, Buffer.from("different", "utf8")), /different content/u);
  await assert.rejects(storage.readStaged(key, content.length - 1), /exceeds the read policy/u);
  assert.deepEqual(Buffer.from(await storage.readStaged(key, content.length)), content);

  staged.failNextDelete = true;
  await assert.rejects(storage.release(key), /simulated interruption/u);
  assert.ok(staged.objects.has(key), "interrupted move retains its source");
  assert.ok(released.objects.has(key), "interrupted move has an immutable target for recovery");
  await storage.release(key);
  await storage.release(key);
  assert.equal(staged.objects.has(key), false);
  assert.deepEqual(Buffer.from(await storage.readReleased(key, content.length)), content);
  assert.equal(released.objects.get(key)?.sha256, digest(content));

  const quarantineKey = "project_0001/object_000002";
  await storage.putStaged(quarantineKey, content);
  await storage.moveToQuarantine(quarantineKey);
  await storage.moveToQuarantine(quarantineKey);
  assert.equal(staged.objects.has(quarantineKey), false);
  assert.ok(quarantine.objects.has(quarantineKey));
  assert.deepEqual(Buffer.from(await storage.readQuarantined(quarantineKey, content.length)), content);

  const generatedKey = "project_0001/version_0001/turnoverpdf";
  await storage.putGenerated(generatedKey, content);
  await storage.putGenerated(generatedKey, content);
  assert.deepEqual(Buffer.from((await storage.readGenerated(generatedKey, content.length)) ?? []), content);
  await assert.rejects(storage.putGenerated(generatedKey, Buffer.from("changed", "utf8")), /different content/u);
  assert.equal(await storage.readGenerated("project_0001/version_0002/turnoverpdf", 1024), null);

  const conflictKey = "project_0001/object_000003";
  await storage.putStaged(conflictKey, content);
  const other = Buffer.from("different immutable bytes", "utf8");
  await released.putIfAbsent(conflictKey, other, digest(other), "unrelated-etag");
  await assert.rejects(storage.release(conflictKey), /conflicts with the staged source/u);
  assert.ok(staged.objects.has(conflictKey), "a conflicting target must not delete source evidence");

  await assert.rejects(storage.putStaged("project_0001/report.pdf", content), /opaque identifier/u);
  const publicReleased = new MemoryBlobContainer(false);
  await assert.rejects(
    new AzureBlobObjectStorage({ staged, quarantine, released: publicReleased, generated }).assertPrivateBoundaries(),
    /public access/u,
  );
});

test("FR-DOC-001, NFR-SEC-005 / AC-03-04: staged-only upload identity sees one private immutable boundary", async () => {
  const staged = new MemoryBlobContainer();
  const storage = new AzureBlobStagedUploadStorage(staged, 1024);
  await storage.assertPrivateBoundary();
  const key = "project_0001/upload_000001";
  const content = Buffer.from("%PDF-1.4\ncontrolled upload\n%%EOF\n", "utf8");
  await storage.putStaged(key, content);
  await storage.putStaged(key, content);
  assert.equal(staged.objects.get(key)?.sha256, digest(content));
  await assert.rejects(storage.putStaged(key, Buffer.from("different", "utf8")), /different content/u);
  await assert.rejects(
    new AzureBlobStagedUploadStorage(new MemoryBlobContainer(false)).assertPrivateBoundary(),
    /public access/u,
  );
});
