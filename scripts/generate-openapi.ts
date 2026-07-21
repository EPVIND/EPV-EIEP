import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DevelopmentAuthenticator,
  FoundationService,
  InMemoryFoundationStore,
  OperationalService,
  buildServer,
} from "@eiep/api";

const contractPath = resolve("docs/02-architecture/openapi-v1.json");
const store = new InMemoryFoundationStore();
const server = await buildServer({
  service: new FoundationService(store),
  operations: new OperationalService(store),
  store,
  authenticator: new DevelopmentAuthenticator(),
  environment: "contract-generation",
  trainingBanner: false,
  allowedOrigins: [],
});

try {
  await server.ready();
  const rendered = `${JSON.stringify(server.swagger(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const published = await readFile(contractPath, "utf8").catch(() => "");
    if (published !== rendered) {
      throw new Error("Published OpenAPI contract is stale; run pnpm openapi:generate and review the diff.");
    }
    process.stdout.write("OpenAPI v1 contract matches the active API routes.\n");
  } else {
    await writeFile(contractPath, rendered, "utf8");
    process.stdout.write(`Published ${contractPath}.\n`);
  }
} finally {
  await server.close();
}
