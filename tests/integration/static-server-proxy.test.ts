import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to resolve test server port.");
  return address.port;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function waitForHealth(origin: string, child: ChildProcess, stderr: () => string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Static server exited early: ${stderr()}`);
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.ok) return;
    } catch { /* startup race */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Static server did not become healthy: ${stderr()}`);
}

test("browser server proxies only governed API paths to an internal origin", async (context) => {
  const received: Array<{ method: string; url: string; body: string; userId?: string }> = [];
  const upstream = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        url: request.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
        ...(typeof request.headers["x-eiep-user-id"] === "string"
          ? { userId: request.headers["x-eiep-user-id"] } : {}),
      });
      response.writeHead(request.url?.startsWith("/v1/") ? 201 : 200, {
        "content-type": "application/json; charset=utf-8",
        "x-correlation-id": "proxy-test",
      });
      response.end(JSON.stringify({ upstream: true }));
    });
  });
  const upstreamPort = await listen(upstream);
  const publicPort = await availablePort();
  const publicRoot = await mkdtemp(join(tmpdir(), "eiep-static-proxy-"));
  await writeFile(join(publicRoot, "index.html"), "<!doctype html><title>EIEP</title>", "utf8");

  let stderr = "";
  const child = spawn(process.execPath, [resolve("containers/static-server.mjs")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      EIEP_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(publicPort),
      PUBLIC_ROOT: publicRoot,
      API_BASE_URL: `http://127.0.0.1:${publicPort}`,
      API_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
  context.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
    }
    await new Promise<void>((resolveClose) => upstream.close(() => resolveClose()));
    await rm(publicRoot, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${publicPort}`;
  await waitForHealth(origin, child, () => stderr);

  const health = await fetch(`${origin}/health?detail=pilot`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-correlation-id"), "proxy-test");
  assert.deepEqual(await health.json(), { upstream: true });

  const mutation = await fetch(`${origin}/v1/proxy-test`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-eiep-user-id": "pilot-user" },
    body: JSON.stringify({ controlled: true }),
  });
  assert.equal(mutation.status, 201);
  assert.equal(await mutation.text(), JSON.stringify({ upstream: true }));
  assert.deepEqual(received, [
    { method: "GET", url: "/health?detail=pilot", body: "" },
    { method: "POST", url: "/v1/proxy-test", body: JSON.stringify({ controlled: true }), userId: "pilot-user" },
  ]);

  const metrics = await fetch(`${origin}/metrics`);
  assert.equal(metrics.status, 200);
  assert.match(await metrics.text(), /<title>EIEP<\/title>/u);
  assert.equal(received.length, 2);
});
