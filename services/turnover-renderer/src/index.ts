import { createHash } from "node:crypto";
import type { TurnoverManifestEntry, TurnoverPackageVersionRecord } from "@eiep/shared-types";
import { chromium, type BrowserType } from "playwright";

export const turnoverRendererVersion = "eiep-turnover-playwright/1";
export const turnoverTemplateVersion = "eiep-turnover-template/1";
export const turnoverConfigurationVersion = "eiep-turnover-config/1";

export interface TurnoverRenderInput {
  readonly version: TurnoverPackageVersionRecord;
  readonly priorVersion?: TurnoverPackageVersionRecord;
  readonly projectNumber: string;
  readonly projectName: string;
  readonly packageCode: string;
  readonly boundaryCode: string;
  readonly boundaryName: string;
}

export interface TurnoverDelta {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

export interface TurnoverRenderArtifacts {
  readonly artifactPrefix: string;
  readonly pdf: Uint8Array;
  readonly manifestJson: Uint8Array;
  readonly manifestCsv: Uint8Array;
  readonly generationLogJson: Uint8Array;
  readonly hashes: {
    readonly pdfSha256: string;
    readonly manifestJsonSha256: string;
    readonly manifestCsvSha256: string;
    readonly generationLogSha256: string;
  };
  readonly delta: TurnoverDelta;
  readonly rendererVersion: string;
  readonly templateVersion: string;
  readonly preservationConformance: "not_claimed";
}

export interface TurnoverGenerationArtifactHashes {
  readonly pdfSha256: string;
  readonly manifestJsonSha256: string;
  readonly manifestCsvSha256: string;
}

function digest(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createTurnoverGenerationLog(
  version: TurnoverPackageVersionRecord,
  hashes: TurnoverGenerationArtifactHashes,
): Uint8Array {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: "eiep.turnover-generation-log.v1",
    packageVersionId: version.id,
    generatedAtUtc: version.generatedAt.toISOString(),
    generatedBy: version.generatedBy,
    rendererVersion: turnoverRendererVersion,
    templateVersion: turnoverTemplateVersion,
    configurationVersion: turnoverConfigurationVersion,
    networkAccess: "blocked",
    activeScript: "disabled",
    preservationConformance: "not_claimed",
    artifacts: hashes,
  }, null, 2)}\n`, "utf8");
}

function required(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sourceKey(entry: TurnoverManifestEntry): string {
  return `${entry.sourceType}:${entry.sourceId}`;
}

function deltaBetween(
  prior: TurnoverPackageVersionRecord | undefined,
  current: TurnoverPackageVersionRecord,
): TurnoverDelta {
  if (!prior) return { added: current.manifest.map(sourceKey).sort(), removed: [], changed: [] };
  if (prior.packageId !== current.packageId || prior.projectId !== current.projectId || prior.versionNumber >= current.versionNumber) {
    throw new Error("The prior turnover version is not a valid predecessor.");
  }
  const left = new Map(prior.manifest.map((entry) => [sourceKey(entry), entry.canonicalSha256]));
  const right = new Map(current.manifest.map((entry) => [sourceKey(entry), entry.canonicalSha256]));
  return {
    added: [...right.keys()].filter((key) => !left.has(key)).sort(),
    removed: [...left.keys()].filter((key) => !right.has(key)).sort(),
    changed: [...right.keys()].filter((key) => left.has(key) && left.get(key) !== right.get(key)).sort(),
  };
}

function validateVersion(version: TurnoverPackageVersionRecord): void {
  required(version.id, "Turnover package version ID");
  required(version.packageId, "Turnover package ID");
  required(version.projectId, "Project ID");
  required(version.recipientScope, "Recipient scope");
  required(version.generatedBy, "Generator actor");
  if (!Number.isInteger(version.versionNumber) || version.versionNumber < 1) {
    throw new Error("Turnover package version number is invalid.");
  }
  if (!Number.isFinite(version.generatedAt.getTime())) throw new Error("Turnover generation time is invalid.");
  if (version.manifest.length > 10_000) throw new Error("Turnover manifest exceeds the renderer item policy.");
  if (digest(JSON.stringify(version.manifest)) !== version.manifestSha256) {
    throw new Error("Turnover manifest hash verification failed.");
  }
  const acceptedStates: Readonly<Record<TurnoverManifestEntry["sourceType"], readonly string[]>> = {
    material: ["released", "issued"], pmi: ["accepted"], ncr: ["closed"],
    punch: ["closed", "transferred"], document_revision: ["released"],
  };
  const names = new Set<string>();
  let totalBytes = 0;
  for (const entry of version.manifest) {
    if (!acceptedStates[entry.sourceType].includes(entry.sourceState)) {
      throw new Error(`Turnover source ${sourceKey(entry)} is not in an accepted state.`);
    }
    if (!/^[A-Za-z0-9_-]+\.json$/u.test(entry.filename) || names.has(entry.filename)) {
      throw new Error("Turnover source filenames must be unique controlled JSON names.");
    }
    names.add(entry.filename);
    const size = Buffer.byteLength(entry.canonicalJson, "utf8");
    if (size !== entry.sizeBytes || digest(entry.canonicalJson) !== entry.canonicalSha256) {
      throw new Error(`Turnover source ${sourceKey(entry)} failed snapshot verification.`);
    }
    totalBytes += size;
  }
  if (totalBytes > 512 * 1024 * 1024) throw new Error("Turnover snapshots exceed the renderer byte policy.");
}

function structuredManifest(input: TurnoverRenderInput, delta: TurnoverDelta) {
  const { version } = input;
  return {
    schemaVersion: "eiep.turnover-manifest.v1",
    packageVersionId: version.id,
    packageId: version.packageId,
    projectId: version.projectId,
    projectNumber: required(input.projectNumber, "Project number"),
    projectName: required(input.projectName, "Project name"),
    packageCode: required(input.packageCode, "Package code"),
    boundaryCode: required(input.boundaryCode, "Boundary code"),
    boundaryName: required(input.boundaryName, "Boundary name"),
    versionNumber: version.versionNumber,
    recipientScope: version.recipientScope,
    generatedAtUtc: version.generatedAt.toISOString(),
    generatedBy: version.generatedBy,
    rendererVersion: turnoverRendererVersion,
    templateVersion: turnoverTemplateVersion,
    configurationVersion: turnoverConfigurationVersion,
    preservationConformance: "not_claimed",
    sourceManifestSha256: version.manifestSha256,
    delta,
    entries: version.manifest,
  } as const;
}

function buildCsv(version: TurnoverPackageVersionRecord): string {
  const headings = [
    "source_type", "source_id", "source_version", "source_state", "filename",
    "size_bytes", "sha256", "inclusion_reason", "recipient_scope",
  ];
  const rows = version.manifest.map((entry) => [
    entry.sourceType, entry.sourceId, entry.sourceVersion, entry.sourceState, entry.filename,
    entry.sizeBytes, entry.canonicalSha256, entry.inclusionReason, version.recipientScope,
  ]);
  return `${[headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function deltaList(label: string, values: readonly string[]): string {
  const visible = values.slice(0, 8);
  const remainder = values.length - visible.length;
  const content = values.length > 0
    ? `<ul>${visible.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>${remainder > 0 ? `<p class="muted">Plus ${remainder} additional entries in the companion JSON manifest.</p>` : ""}`
    : '<p class="muted">None</p>';
  return `<section class="delta"><h3>${escapeHtml(label)} (${values.length})</h3>${content}</section>`;
}

function buildHtml(input: TurnoverRenderInput, delta: TurnoverDelta): string {
  const { version } = input;
  const chunkSize = 15;
  const manifestPages = Array.from({ length: Math.ceil(version.manifest.length / chunkSize) }, (_, pageIndex) => {
    const offset = pageIndex * chunkSize;
    const entries = version.manifest.slice(offset, offset + chunkSize);
    const rows = entries.map((entry, localIndex) => `<tr>
      <td>${offset + localIndex + 1}</td><td>${escapeHtml(entry.sourceType.replaceAll("_", " "))}</td>
      <td><strong>${escapeHtml(entry.sourceId)}</strong><br><span class="muted">version ${entry.sourceVersion}</span></td>
      <td>${escapeHtml(entry.sourceState)}</td><td>${escapeHtml(entry.inclusionReason.replaceAll("_", " "))}</td>
      <td class="number">${entry.sizeBytes.toLocaleString("en-US")}</td>
      <td class="hash">${escapeHtml(entry.canonicalSha256)}</td>
    </tr>`).join("");
    const heading = pageIndex === 0 ? "<h2>Controlled source manifest</h2>" : "<h2>Controlled source manifest - continued</h2>";
    const note = pageIndex === Math.ceil(version.manifest.length / chunkSize) - 1
      ? '<p class="footnote">Exact canonical JSON snapshots are retained in the companion JSON artifact. The CSV artifact provides a tabular interchange view.</p>'
      : "";
    return `<section class="manifest-page">${heading}<table aria-label="Controlled source manifest">
      <thead><tr><th>#</th><th>Type</th><th>Source / version</th><th>State</th><th>Inclusion reason</th><th>Bytes</th><th>Canonical SHA-256</th></tr></thead>
      <tbody>${rows}</tbody></table>${note}</section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(input.packageCode)} turnover package version ${version.versionNumber}</title>
  <style>
    @page { size: Letter; margin: .72in .55in .68in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font: 9.5pt/1.42 Arial, Helvetica, sans-serif; }
    h1,h2,h3 { color: #133d60; page-break-after: avoid; }
    h1 { margin: 0 0 12px; font-size: 26pt; line-height: 1.12; letter-spacing: -.3px; }
    h2 { margin: 0 0 12px; padding-bottom: 5px; border-bottom: 2px solid #2e7898; font-size: 17pt; }
    h3 { margin: 0 0 5px; font-size: 10.5pt; }
    .cover { min-height: 8.1in; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
    .eyebrow { color: #2e7898; font-size: 9pt; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; }
    .subtitle { margin: 0 0 28px; color: #526277; font-size: 13pt; }
    .notice { margin: 22px 0; padding: 10px 12px; border-left: 4px solid #d08d2f; background: #fff7e9; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; border: 1px solid #c8d4dc; background: #c8d4dc; }
    .fact { min-height: 54px; padding: 10px 12px; background: white; }
    .fact span { display: block; color: #607184; font-size: 7.5pt; letter-spacing: .6px; text-transform: uppercase; }
    .fact strong { display: block; margin-top: 3px; overflow-wrap: anywhere; }
    .integrity { padding: 13px 15px; background: #133d60; color: white; }
    .integrity strong { display: block; margin-bottom: 4px; }
    .integrity code { font: 7.5pt "Courier New", monospace; overflow-wrap: anywhere; }
    .delta-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 20px; }
    .delta { min-height: 64px; padding: 9px; border: 1px solid #ccd6de; }
    .delta ul { margin: 4px 0 0; padding-left: 16px; font-size: 8pt; overflow-wrap: anywhere; }
    .muted { color: #627386; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; } tr { page-break-inside: avoid; }
    th { padding: 6px 5px; background: #133d60; color: white; text-align: left; font-size: 7.4pt; }
    td { padding: 6px 5px; border-bottom: 1px solid #d8e0e6; vertical-align: top; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) { background: #f5f8fa; }
    th:nth-child(1),td:nth-child(1){width:4%} th:nth-child(2),td:nth-child(2){width:12%}
    th:nth-child(3),td:nth-child(3){width:22%} th:nth-child(4),td:nth-child(4){width:10%}
    th:nth-child(5),td:nth-child(5){width:18%} th:nth-child(6),td:nth-child(6){width:9%}
    th:nth-child(7),td:nth-child(7){width:25%}
    .number { text-align: right; } .hash { font: 6.8pt "Courier New",monospace; word-break: break-all; }
    .manifest-page { page-break-before: always; } .footnote { margin-top: 14px; color: #5a6b7c; font-size: 8pt; }
  </style></head><body>
  <main class="cover"><div><p class="eyebrow">EPV Industrial Enterprise Platform</p><h1>Turnover package</h1>
    <p class="subtitle">${escapeHtml(input.packageCode)} - version ${version.versionNumber}</p>
    <div class="notice"><strong>Preservation status:</strong> Searchable PDF generated for controlled review. PDF/A conformance is not claimed.</div>
    <div class="facts">
      <div class="fact"><span>Project</span><strong>${escapeHtml(input.projectNumber)} - ${escapeHtml(input.projectName)}</strong></div>
      <div class="fact"><span>Completion boundary</span><strong>${escapeHtml(input.boundaryCode)} - ${escapeHtml(input.boundaryName)}</strong></div>
      <div class="fact"><span>Recipient scope</span><strong>${escapeHtml(version.recipientScope)}</strong></div>
      <div class="fact"><span>Generated UTC</span><strong>${escapeHtml(version.generatedAt.toISOString())}</strong></div>
      <div class="fact"><span>Generated by</span><strong>${escapeHtml(version.generatedBy)}</strong></div>
      <div class="fact"><span>Controlled sources</span><strong>${version.manifest.length.toLocaleString("en-US")}</strong></div>
      <div class="fact"><span>Renderer</span><strong>${turnoverRendererVersion}</strong></div>
      <div class="fact"><span>Template/configuration</span><strong>${turnoverTemplateVersion}<br>${turnoverConfigurationVersion}</strong></div>
    </div></div><div class="integrity"><strong>Source manifest SHA-256</strong><code>${version.manifestSha256}</code></div>
  </main>
  <section><h2>Version delta</h2><div class="delta-grid">${deltaList("Added", delta.added)}${deltaList("Removed", delta.removed)}${deltaList("Changed", delta.changed)}</div>
    <p class="footnote">Delta keys use source type and stable source ID. A changed item has the same key and a different canonical SHA-256 digest.</p></section>
  ${manifestPages}</body></html>`;
}

export class TurnoverPdfRenderer {
  public constructor(private readonly browserType: BrowserType = chromium) {}

  public async render(input: TurnoverRenderInput): Promise<TurnoverRenderArtifacts> {
    validateVersion(input.version);
    if (input.priorVersion) validateVersion(input.priorVersion);
    const delta = deltaBetween(input.priorVersion, input.version);
    const manifestJsonText = `${JSON.stringify(structuredManifest(input, delta), null, 2)}\n`;
    const manifestCsvText = buildCsv(input.version);
    const browser = await this.browserType.launch({
      headless: true,
      args: ["--disable-background-networking", "--disable-extensions", "--disable-sync", "--no-first-run"],
    });
    let chromiumPdf: Uint8Array;
    try {
      const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
      await context.route("**/*", async (route) => route.abort("blockedbyclient"));
      const page = await context.newPage();
      await page.setContent(buildHtml(input, delta), { waitUntil: "domcontentloaded" });
      chromiumPdf = await page.pdf({
        format: "Letter", printBackground: true, displayHeaderFooter: true, preferCSSPageSize: true,
        headerTemplate: '<div style="width:100%;font:7px Arial;color:#64748b;padding:0 30px">EIEP controlled turnover package</div>',
        footerTemplate: '<div style="width:100%;font:7px Arial;color:#64748b;padding:0 30px;text-align:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: { top: ".72in", right: ".55in", bottom: ".68in", left: ".55in" },
      });
      await context.close();
    } finally {
      await browser.close();
    }
    const pdf = chromiumPdf;
    const manifestJson = Buffer.from(manifestJsonText, "utf8");
    const manifestCsv = Buffer.from(manifestCsvText, "utf8");
    const pdfSha256 = digest(pdf);
    const manifestJsonSha256 = digest(manifestJson);
    const manifestCsvSha256 = digest(manifestCsv);
    const generationLogJson = createTurnoverGenerationLog(input.version, {
      pdfSha256, manifestJsonSha256, manifestCsvSha256,
    });
    return {
      artifactPrefix: `${input.version.packageId}/version-${String(input.version.versionNumber).padStart(4, "0")}`,
      pdf, manifestJson, manifestCsv, generationLogJson,
      hashes: { pdfSha256, manifestJsonSha256, manifestCsvSha256, generationLogSha256: digest(generationLogJson) },
      delta,
      rendererVersion: turnoverRendererVersion,
      templateVersion: turnoverTemplateVersion,
      preservationConformance: "not_claimed",
    };
  }
}
