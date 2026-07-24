import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, resolve, sep } from "node:path";

const allowedEnvironments = new Set(["development", "test", "training", "production"]);
const environment = process.env.EIEP_ENV?.trim() || "development";
if (!allowedEnvironments.has(environment)) throw new Error("EIEP_ENV is invalid.");

const rawApiBaseUrl = process.env.API_BASE_URL?.trim();
if (!rawApiBaseUrl) throw new Error("API_BASE_URL is required.");
const apiBaseUrl = new URL(rawApiBaseUrl);
if (apiBaseUrl.origin !== rawApiBaseUrl || apiBaseUrl.username || apiBaseUrl.password
  || apiBaseUrl.pathname !== "/" || apiBaseUrl.search || apiBaseUrl.hash) {
  throw new Error("API_BASE_URL must be an exact origin without credentials, path, query, or fragment.");
}
if (environment !== "development" && apiBaseUrl.protocol !== "https:") {
  throw new Error("Nondevelopment API_BASE_URL requires HTTPS.");
}

const rawApiUpstreamUrl = process.env.API_UPSTREAM_URL?.trim();
const apiUpstreamUrl = rawApiUpstreamUrl ? new URL(rawApiUpstreamUrl) : null;
if (apiUpstreamUrl && (apiUpstreamUrl.origin !== rawApiUpstreamUrl
  || apiUpstreamUrl.username || apiUpstreamUrl.password || apiUpstreamUrl.pathname !== "/"
  || apiUpstreamUrl.search || apiUpstreamUrl.hash
  || (apiUpstreamUrl.protocol !== "http:" && apiUpstreamUrl.protocol !== "https:"))) {
  throw new Error("API_UPSTREAM_URL must be an exact HTTP(S) origin without credentials, path, query, or fragment.");
}
if (apiUpstreamUrl && environment !== "development" && apiUpstreamUrl.protocol !== "https:") {
  throw new Error("Nondevelopment API_UPSTREAM_URL requires HTTPS.");
}

const host = process.env.HOST?.trim() || "0.0.0.0";
const port = Number(process.env.PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT is invalid.");
const publicRoot = resolve(process.env.PUBLIC_ROOT?.trim() || "/app/public");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const rawPilotIdentities = process.env.PILOT_IDENTITIES_JSON?.trim();
let pilotIdentities = [];
if (rawPilotIdentities) {
  if (environment !== "development") throw new Error("PILOT_IDENTITIES_JSON is development-only.");
  let parsed;
  try {
    parsed = JSON.parse(rawPilotIdentities);
  } catch {
    throw new Error("PILOT_IDENTITIES_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 8) {
    throw new Error("PILOT_IDENTITIES_JSON must contain between one and eight profiles.");
  }
  pilotIdentities = parsed.map((profile) => {
    if (!profile || typeof profile !== "object"
      || typeof profile.displayName !== "string" || profile.displayName.trim().length < 1
      || profile.displayName.trim().length > 80
      || typeof profile.userId !== "string" || !uuidPattern.test(profile.userId)
      || typeof profile.organizationId !== "string" || !uuidPattern.test(profile.organizationId)) {
      throw new Error("PILOT_IDENTITIES_JSON contains an invalid profile.");
    }
    return {
      displayName: profile.displayName.trim(),
      userId: profile.userId.toLowerCase(),
      organizationId: profile.organizationId.toLowerCase(),
    };
  });
  if (new Set(pilotIdentities.map((profile) => profile.userId)).size !== pilotIdentities.length) {
    throw new Error("PILOT_IDENTITIES_JSON contains duplicate user IDs.");
  }
}
const runtimeConfiguration = `globalThis.__EIEP_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({
  apiBaseUrl: apiBaseUrl.origin,
  ...(pilotIdentities.length ? { pilotIdentities } : {}),
})});\n`;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function commonHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  response.setHeader("content-security-policy", `default-src 'none'; base-uri 'none'; connect-src ${apiBaseUrl.origin}; font-src 'self'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'`);
}

const hopByHopHeaders = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

function apiPath(pathname) {
  return pathname === "/health" || pathname === "/v1" || pathname.startsWith("/v1/");
}

function proxyApi(request, response, requestUrl) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiUpstreamUrl);
  const headers = Object.fromEntries(Object.entries(request.headers)
    .filter(([name, value]) => value !== undefined && name !== "host" && !hopByHopHeaders.has(name.toLowerCase())));
  headers["x-forwarded-host"] = request.headers.host ?? "";
  headers["x-forwarded-proto"] = request.headers["x-forwarded-proto"] ?? "https";

  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(target, { method: request.method, headers }, (upstreamResponse) => {
    const responseHeaders = Object.fromEntries(Object.entries(upstreamResponse.headers)
      .filter(([name, value]) => value !== undefined && !hopByHopHeaders.has(name.toLowerCase())));
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    upstreamResponse.pipe(response);
  });
  upstream.setTimeout(120_000, () => upstream.destroy(new Error("API upstream timed out.")));
  upstream.on("error", () => {
    if (response.headersSent) response.destroy();
    else {
      response.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "api_upstream_unavailable" }));
    }
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

async function existingFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.endsWith(".map")) return null;
  const candidate = resolve(publicRoot, `.${decoded}`);
  if (candidate !== publicRoot && !candidate.startsWith(`${publicRoot}${sep}`)) return null;
  try {
    const details = await stat(candidate);
    return details.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://runtime.invalid");
  if (apiUpstreamUrl && apiPath(requestUrl.pathname)) {
    proxyApi(request, response, requestUrl);
    return;
  }

  commonHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
    response.end();
    return;
  }
  if (requestUrl.pathname === "/healthz") {
    const body = JSON.stringify({ status: "ok", environment });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }
  if (requestUrl.pathname === "/runtime-config.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : runtimeConfiguration);
    return;
  }

  const requested = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const file = await existingFile(requested);
  const fallback = file ?? (requested.includes(".") ? null : await existingFile("/index.html"));
  if (!fallback) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : "Not found.");
    return;
  }
  const extension = extname(fallback).toLowerCase();
  const immutable = fallback.includes(`${sep}assets${sep}`) && /-[A-Za-z0-9_-]{6,}\./u.test(fallback);
  response.writeHead(200, {
    "content-type": contentTypes.get(extension) ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(fallback).pipe(response);
});

server.listen(port, host);
const shutdown = () => server.close((error) => {
  if (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
});
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
