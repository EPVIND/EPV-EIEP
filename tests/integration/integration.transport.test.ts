import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  boundedBackoffSeconds,
  HttpJsonTransport,
  signHmacSha256,
  verifyHmacSha256,
  type IntegrationEnvelope,
} from "@eiep/integration";

test("FR-INT-003, NFR-REL-004 / AC-10: HTTP transport preserves contract headers, classifies responses, bounds content, and verifies replay-resistant HMAC", async () => {
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
      if (request.url === "/accepted") {
        response.writeHead(202, { "content-type": "application/json" });
        response.end('{"accepted":true}');
      } else if (request.url === "/retry") {
        response.writeHead(503, { "content-type": "application/json", "retry-after": "2" });
        response.end('{"error":"upstream_busy"}');
      } else if (request.url === "/permanent") {
        response.writeHead(400, { "content-type": "application/json" });
        response.end('{"error":"schema_rejected"}');
      } else {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("x".repeat(512));
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const envelope: IntegrationEnvelope<{ recordId: string }> = {
      messageId: "message-1", schemaVersion: 1, idempotencyKey: "event-1", correlationId: "correlation-1",
      causationId: null, occurredAtUtc: "2026-07-21T12:30:00.000Z", payload: { recordId: "record-1" },
    };
    const transport = (path: string, maximumResponseBytes = 1024) => new HttpJsonTransport({
      endpoint: `${base}${path}`, authorizationHeader: null, timeoutMilliseconds: 2_000,
      allowInsecureLoopback: true, maximumResponseBytes,
    });
    assert.deepEqual(await transport("/accepted").deliver(envelope), {
      disposition: "accepted", statusCode: 202, errorCode: null, retryAfterSeconds: null,
    });
    assert.equal(received[0]?.headers["idempotency-key"], envelope.idempotencyKey);
    assert.equal(received[0]?.headers["x-correlation-id"], envelope.correlationId);
    assert.equal((JSON.parse(received[0]?.body ?? "{}") as IntegrationEnvelope<unknown>).messageId, envelope.messageId);
    assert.deepEqual(await transport("/retry").deliver(envelope), {
      disposition: "retry", statusCode: 503, errorCode: "upstream_busy", retryAfterSeconds: 2,
    });
    assert.deepEqual(await transport("/permanent").deliver(envelope), {
      disposition: "permanent_failure", statusCode: 400, errorCode: "schema_rejected", retryAfterSeconds: null,
    });
    assert.equal((await transport("/large", 64).deliver(envelope)).errorCode, "transport_error");

    assert.throws(() => new HttpJsonTransport({
      endpoint: "http://example.invalid/hook", authorizationHeader: null, timeoutMilliseconds: 1_000,
      allowInsecureLoopback: false, maximumResponseBytes: 1024,
    }), /require HTTPS/u);
    assert.throws(() => new HttpJsonTransport({
      endpoint: `${base.replace("http://", "http://user@")}/hook`, authorizationHeader: null,
      timeoutMilliseconds: 1_000, allowInsecureLoopback: true, maximumResponseBytes: 1024,
    }), /credentials/u);

    const rawBody = Buffer.from('{"event":"released"}', "utf8");
    const keyMaterial = Buffer.from([41, 82, 19, 7, 211, 66, 109, 31, 94, 13, 87, 55, 120, 201, 16, 77]);
    const timestampUtc = "2026-07-21T12:30:00.000Z";
    const signatureHex = signHmacSha256(rawBody, timestampUtc, keyMaterial);
    assert.equal(verifyHmacSha256({
      rawBody, signatureHex, timestampUtc, sharedSecret: keyMaterial,
      now: new Date("2026-07-21T12:30:30.000Z"), maximumClockSkewSeconds: 60,
    }), true);
    assert.equal(verifyHmacSha256({
      rawBody, signatureHex, timestampUtc, sharedSecret: keyMaterial,
      now: new Date("2026-07-21T12:32:00.000Z"), maximumClockSkewSeconds: 60,
    }), false);
    assert.equal(verifyHmacSha256({
      rawBody: Buffer.from('{"event":"changed"}', "utf8"), signatureHex, timestampUtc, sharedSecret: keyMaterial,
      now: new Date("2026-07-21T12:30:30.000Z"), maximumClockSkewSeconds: 60,
    }), false);
    assert.deepEqual([1, 2, 3, 8].map((attempt) => boundedBackoffSeconds(attempt)), [5, 10, 20, 300]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
