import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
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

const host = process.env.HOST?.trim() || "0.0.0.0";
const port = Number(process.env.PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT is invalid.");
const publicRoot = resolve(process.env.PUBLIC_ROOT?.trim() || "/app/public");
const runtimeConfiguration = `globalThis.__EIEP_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({ apiBaseUrl: apiBaseUrl.origin })});\n`;
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
  commonHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
    response.end();
    return;
  }
  const requestUrl = new URL(request.url ?? "/", "http://runtime.invalid");
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
