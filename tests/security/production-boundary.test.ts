import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);

test("DEC-005 / NFR-SEC-002 / AC-01: active production paths exclude intake and training trees", async () => {
  const result = await execute(process.execPath, ["scripts/check-production-boundary.mjs"], {
    cwd: process.cwd(),
    windowsHide: true,
  });
  assert.match(result.stdout, /production boundary checks passed/u);
  assert.equal(result.stderr, "");
});
