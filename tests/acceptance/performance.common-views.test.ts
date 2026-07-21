import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { FoundationService, InMemoryFoundationStore, createEmptyMemoryState } from "@eiep/api";
import type { ProjectRecord } from "@eiep/shared-types";
import { assignment, completeReadiness, context, scope } from "../helpers/foundation-fixture.js";

interface PerformanceProfile {
  readonly dataset: { readonly projectCount: number };
  readonly measurements: {
    readonly minimumSamples: number;
    readonly projectListP95Milliseconds: number;
    readonly projectDetailP95Milliseconds: number;
  };
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

test("NFR-PER-002 / AC-10: common scoped project views stay inside the local provisional regression budget", async () => {
  const profile = JSON.parse(await readFile(
    join(process.cwd(), "config", "performance", "local-provisional.json"), "utf8",
  )) as PerformanceProfile;
  const state = createEmptyMemoryState();
  const timestamp = new Date("2026-07-21T11:00:00.000Z");
  for (let index = 0; index < profile.dataset.projectCount; index += 1) {
    const id = `performance-project-${String(index).padStart(6, "0")}`;
    const project: ProjectRecord = {
      id, businessScopeOrganizationId: "org-epv", number: `PERF-${String(index).padStart(6, "0")}`,
      name: `Controlled project ${index}`, customerOrganizationId: "org-customer", facilityId: "facility-1",
      timeZone: "UTC", state: "active", readiness: completeReadiness, version: 1,
      createdAt: timestamp, createdBy: "performance-fixture", updatedAt: timestamp, updatedBy: "performance-fixture",
    };
    state.projects.set(id, project);
  }
  const store = new InMemoryFoundationStore(state);
  const service = new FoundationService(store, () => timestamp);
  const reader = context("performance-reader", "standard");
  const assignments = [assignment("performance-read", reader.userId, ["project.read"], scope())];
  await service.listProjects(reader, assignments);

  const listDurations: number[] = [];
  const detailDurations: number[] = [];
  for (let sample = 0; sample < profile.measurements.minimumSamples; sample += 1) {
    let started = performance.now();
    const projects = await service.listProjects(reader, assignments);
    listDurations.push(performance.now() - started);
    assert.equal(projects.length, profile.dataset.projectCount);
    started = performance.now();
    const detail = await store.transaction((transaction) => transaction.projectById("performance-project-001000"));
    detailDurations.push(performance.now() - started);
    assert.equal(detail?.number, "PERF-001000");
  }

  assert.ok(
    percentile95(listDurations) <= profile.measurements.projectListP95Milliseconds,
    `project list p95 ${percentile95(listDurations).toFixed(2)}ms exceeded provisional budget`,
  );
  assert.ok(
    percentile95(detailDurations) <= profile.measurements.projectDetailP95Milliseconds,
    `project detail p95 ${percentile95(detailDurations).toFixed(2)}ms exceeded provisional budget`,
  );
});
