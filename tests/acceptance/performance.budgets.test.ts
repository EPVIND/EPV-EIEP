import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

interface PerformanceProfile {
  readonly profileVersion: number;
  readonly profileKind: string;
  readonly productionAccepted: boolean;
  readonly rationale: string;
  readonly dataset: { readonly projectCount: number; readonly concurrentUsers: number; readonly networkProfile: string };
  readonly measurements: {
    readonly minimumSamples: number;
    readonly projectListP95Milliseconds: number;
    readonly projectDetailP95Milliseconds: number;
  };
}

test("NFR-PER-001 / AC-10: performance guard is explicit, reproducible, and cannot masquerade as an approved pilot budget", async () => {
  const profile = JSON.parse(await readFile(
    join(process.cwd(), "config", "performance", "local-provisional.json"), "utf8",
  )) as PerformanceProfile;
  assert.equal(profile.profileVersion, 1);
  assert.equal(profile.profileKind, "local-provisional-regression-guard");
  assert.equal(profile.productionAccepted, false);
  assert.match(profile.rationale, /pending approved pilot devices/u);
  assert.ok(profile.dataset.projectCount >= 2_000);
  assert.equal(profile.dataset.concurrentUsers, 1);
  assert.equal(profile.dataset.networkProfile, "in-process-no-network");
  assert.ok(profile.measurements.minimumSamples >= 15);
  assert.ok(profile.measurements.projectListP95Milliseconds > profile.measurements.projectDetailP95Milliseconds);
});
