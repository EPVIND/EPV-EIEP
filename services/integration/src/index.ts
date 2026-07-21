import { createHmac, timingSafeEqual } from "node:crypto";

export interface IntegrationEnvelope<TPayload> {
  readonly messageId: string;
  readonly schemaVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly occurredAtUtc: string;
  readonly payload: TPayload;
}

export interface DeliveryResult {
  readonly disposition: "accepted" | "retry" | "permanent_failure";
  readonly statusCode: number | null;
  readonly errorCode: string | null;
  readonly retryAfterSeconds: number | null;
}

export interface OutboundTransport {
  deliver<TPayload>(envelope: IntegrationEnvelope<TPayload>): Promise<DeliveryResult>;
}

export interface HttpJsonTransportOptions {
  readonly endpoint: string;
  readonly authorizationHeader: string | null;
  readonly timeoutMilliseconds: number;
  readonly allowInsecureLoopback: boolean;
  readonly maximumResponseBytes: number;
}

export function validateEnvelope(envelope: IntegrationEnvelope<unknown>): readonly string[] {
  const issues: string[] = [];
  if (!envelope.messageId.trim()) issues.push("message_id_required");
  if (envelope.schemaVersion < 1 || !Number.isInteger(envelope.schemaVersion)) issues.push("schema_version_invalid");
  if (!envelope.idempotencyKey.trim()) issues.push("idempotency_key_required");
  if (!envelope.correlationId.trim()) issues.push("correlation_id_required");
  const occurredAt = new Date(envelope.occurredAtUtc);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== envelope.occurredAtUtc) issues.push("occurred_at_invalid");
  return issues;
}

function validateEndpoint(endpoint: string, allowInsecureLoopback: boolean): URL {
  const url = new URL(endpoint);
  if (url.username || url.password || url.hash) throw new Error("Integration endpoints cannot contain credentials or fragments.");
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(allowInsecureLoopback && loopback && url.protocol === "http:")) {
    throw new Error("Integration endpoints require HTTPS.");
  }
  return url;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  if (/^\d+$/u.test(header)) return Math.min(Number(header), 3600);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.min(Math.ceil((at - Date.now()) / 1000), 3600));
}

async function boundedResponseText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maximumBytes) throw new Error("Integration response exceeded the configured limit.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export class HttpJsonTransport implements OutboundTransport {
  private readonly endpoint: URL;

  public constructor(private readonly options: HttpJsonTransportOptions) {
    this.endpoint = validateEndpoint(options.endpoint, options.allowInsecureLoopback);
    if (!Number.isInteger(options.timeoutMilliseconds) || options.timeoutMilliseconds < 100 || options.timeoutMilliseconds > 120_000) {
      throw new Error("Integration timeout is outside policy.");
    }
    if (!Number.isInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 0
      || options.maximumResponseBytes > 1024 * 1024) throw new Error("Integration response limit is outside policy.");
    if (options.authorizationHeader?.includes("\r") || options.authorizationHeader?.includes("\n")) {
      throw new Error("Integration authorization header is invalid.");
    }
  }

  public async deliver<TPayload>(envelope: IntegrationEnvelope<TPayload>): Promise<DeliveryResult> {
    const issues = validateEnvelope(envelope);
    if (issues.length > 0) return {
      disposition: "permanent_failure", statusCode: null, errorCode: issues[0] ?? "envelope_invalid", retryAfterSeconds: null,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMilliseconds);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          accept: "application/json",
          "idempotency-key": envelope.idempotencyKey,
          "x-correlation-id": envelope.correlationId,
          "x-eiep-message-id": envelope.messageId,
          "x-eiep-schema-version": String(envelope.schemaVersion),
          ...(this.options.authorizationHeader ? { authorization: this.options.authorizationHeader } : {}),
        },
        body: JSON.stringify(envelope),
        redirect: "error",
        signal: controller.signal,
      });
      const responseText = await boundedResponseText(response, this.options.maximumResponseBytes);
      if (response.status >= 200 && response.status < 300) {
        return { disposition: "accepted", statusCode: response.status, errorCode: null, retryAfterSeconds: null };
      }
      const errorCode = (() => {
        try {
          const body = JSON.parse(responseText) as { error?: unknown };
          return typeof body.error === "string" && body.error.length <= 100 ? body.error : `http_${response.status}`;
        } catch {
          return `http_${response.status}`;
        }
      })();
      if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
        return {
          disposition: "retry", statusCode: response.status, errorCode,
          retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
        };
      }
      return { disposition: "permanent_failure", statusCode: response.status, errorCode, retryAfterSeconds: null };
    } catch (error) {
      return {
        disposition: "retry", statusCode: null,
        errorCode: error instanceof Error && error.name === "AbortError" ? "request_timeout" : "transport_error",
        retryAfterSeconds: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface HmacVerificationInput {
  readonly rawBody: Uint8Array;
  readonly signatureHex: string;
  readonly timestampUtc: string;
  readonly sharedSecret: Uint8Array;
  readonly now: Date;
  readonly maximumClockSkewSeconds: number;
}

export function signHmacSha256(rawBody: Uint8Array, timestampUtc: string, sharedSecret: Uint8Array): string {
  return createHmac("sha256", sharedSecret).update(timestampUtc, "utf8").update(".", "utf8").update(rawBody).digest("hex");
}

export function verifyHmacSha256(input: HmacVerificationInput): boolean {
  const timestamp = new Date(input.timestampUtc);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== input.timestampUtc) return false;
  if (!Number.isInteger(input.maximumClockSkewSeconds) || input.maximumClockSkewSeconds < 0) return false;
  if (Math.abs(input.now.getTime() - timestamp.getTime()) > input.maximumClockSkewSeconds * 1000) return false;
  if (!/^[0-9a-f]{64}$/u.test(input.signatureHex)) return false;
  const expected = Buffer.from(signHmacSha256(input.rawBody, input.timestampUtc, input.sharedSecret), "hex");
  const supplied = Buffer.from(input.signatureHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function boundedBackoffSeconds(attemptNumber: number, baseSeconds = 5, maximumSeconds = 300): number {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new Error("Attempt number must be a positive integer.");
  if (!Number.isFinite(baseSeconds) || baseSeconds <= 0 || !Number.isFinite(maximumSeconds) || maximumSeconds < baseSeconds) {
    throw new Error("Backoff policy is invalid.");
  }
  return Math.min(baseSeconds * 2 ** (attemptNumber - 1), maximumSeconds);
}
