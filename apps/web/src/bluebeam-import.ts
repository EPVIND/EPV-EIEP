export type BluebeamEvidenceStatus = "open" | "resolved_claim" | "closed_claim" | "unknown";

export interface BluebeamSourceItemDraft {
  readonly providerItemId: string;
  readonly providerDocumentId: string;
  readonly parentProviderItemId: string | null;
  readonly itemType: "markup" | "comment" | "reply" | "status";
  readonly pageNumber: number;
  readonly region: null;
  readonly authorProviderId: string;
  readonly providerStatusCode: string;
  readonly subject: string;
  readonly body: string;
  readonly appearance: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly unsupportedContentCodes: readonly string[];
}

export interface BluebeamExportAnalysis {
  readonly format: "csv" | "xml" | "json";
  readonly sourceFilename: string;
  readonly sourceVersion: string;
  readonly items: readonly BluebeamSourceItemDraft[];
  readonly providerDocumentIds: readonly string[];
  readonly providerAuthorIds: readonly string[];
  readonly providerStatusCodes: readonly string[];
  readonly diagnostics: readonly string[];
}

type Row = Readonly<Record<string, string>>;

const aliases = {
  itemId: ["id", "markup id", "markupid", "record id", "recordid", "annotation id"],
  document: ["file name", "filename", "document", "document name", "drawing", "source file"],
  page: ["page index", "pageindex", "page number", "pagenumber", "page", "page label"],
  author: ["author", "creator", "created by", "createdby"],
  status: ["status", "markup status", "markupstatus"],
  subject: ["subject", "type", "markup type", "markuptype"],
  body: ["comments", "comment", "notes", "note", "contents", "description"],
  created: ["created", "creation date", "creationdate", "date created"],
  updated: ["modified", "modified date", "modifieddate", "updated", "date modified"],
  color: ["color", "colour", "appearance"],
} as const;

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/gu, " ").replace(/\s+/gu, " ");
}

function rowValue(row: Row, candidates: readonly string[]): string {
  const entries = new Map(Object.entries(row).map(([key, value]) => [normalizedKey(key), value.trim()]));
  for (const candidate of candidates) {
    const value = entries.get(candidate);
    if (value) return value;
  }
  return "";
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function safeId(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, 240);
  return normalized || fallback;
}

function pageNumber(value: string): number {
  const match = value.match(/\d+/u);
  const parsed = Number(match?.[0] ?? 1);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function timestamp(value: string, fallback: Date): string {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function statusSuggestion(value: string): BluebeamEvidenceStatus {
  const status = value.trim().toLocaleLowerCase();
  if (/(accept|approv|closed|complete|done)/u.test(status)) return "closed_claim";
  if (/(resolve|address|respond)/u.test(status)) return "resolved_claim";
  if (/(open|pending|active|unresolved)/u.test(status)) return "open";
  return "unknown";
}

function parseCsv(text: string): readonly Row[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The Bluebeam CSV contains an unterminated quoted value.");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  const headers = records.shift()?.map((value) => value.trim()) ?? [];
  if (headers.length < 2) throw new Error("The Bluebeam CSV must contain a header row.");
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function xmlRows(text: string): readonly Row[] {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw new Error("DTD and entity declarations are not accepted.");
  if (typeof DOMParser === "undefined") throw new Error("XML parsing is not available in this browser.");
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The Bluebeam XML is not well formed.");
  const candidates = [...document.querySelectorAll("Markup, markup, Row, row, Record, record")];
  const elements = candidates.length > 0
    ? candidates
    : [...document.documentElement.children].filter((element) => element.children.length > 0);
  return elements.map((element) => {
    const values: Record<string, string> = {};
    for (const attribute of [...element.attributes]) values[attribute.name] = attribute.value;
    for (const child of [...element.children]) values[child.localName] = child.textContent?.trim() ?? "";
    return values;
  }).filter((row) => Object.keys(row).length > 0);
}

function jsonRows(text: string): readonly Row[] {
  const parsed = JSON.parse(text) as unknown;
  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null;
  if (!candidate) throw new Error("The JSON export must be an array or an object with an items array.");
  return candidate.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Every JSON item must be an object.");
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, child === null || child === undefined ? "" : String(child)]));
  });
}

function formatFor(filename: string, mediaType: string): "csv" | "xml" | "json" {
  const extension = filename.toLocaleLowerCase().split(".").pop();
  if (extension === "csv" || mediaType.includes("csv")) return "csv";
  if (extension === "xml" || mediaType.includes("xml")) return "xml";
  if (extension === "json" || mediaType.includes("json")) return "json";
  throw new Error("Choose a Bluebeam Markups List CSV or XML export (or an EIEP JSON adapter export).");
}

function toItems(rows: readonly Row[], filename: string, fallback: Date): readonly BluebeamSourceItemDraft[] {
  const fallbackDocument = filename.replace(/\.(csv|xml|json)$/iu, "") || "BLUEBEAM-DOCUMENT";
  return rows.map((row, index) => {
    const subject = rowValue(row, aliases.subject) || "Bluebeam markup";
    const createdAt = timestamp(rowValue(row, aliases.created), fallback);
    const updatedAt = timestamp(rowValue(row, aliases.updated), new Date(createdAt));
    return {
      providerItemId: safeId(rowValue(row, aliases.itemId), `BB-${String(index + 1).padStart(5, "0")}`),
      providerDocumentId: safeId(rowValue(row, aliases.document), fallbackDocument),
      parentProviderItemId: null,
      itemType: "markup",
      pageNumber: pageNumber(rowValue(row, aliases.page)),
      region: null,
      authorProviderId: safeId(rowValue(row, aliases.author), "UNMAPPED-AUTHOR"),
      providerStatusCode: safeId(rowValue(row, aliases.status), "Unspecified"),
      subject: subject.slice(0, 1_000),
      body: rowValue(row, aliases.body).slice(0, 20_000),
      appearance: rowValue(row, aliases.color).slice(0, 20_000) || null,
      createdAt,
      updatedAt,
      unsupportedContentCodes: [],
    };
  });
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function analyzeBluebeamExport(file: File): Promise<BluebeamExportAnalysis> {
  if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error("The Bluebeam export must be between 1 byte and 25 MiB.");
  const format = formatFor(file.name, file.type);
  const text = await file.text();
  const rows = format === "csv" ? parseCsv(text) : format === "xml" ? xmlRows(text) : jsonRows(text);
  if (rows.length < 1 || rows.length > 5_000) throw new Error("The Bluebeam export must contain 1 through 5,000 markup rows.");
  const fallback = new Date(file.lastModified || Date.now());
  const items = toItems(rows, file.name, fallback);
  const diagnostics: string[] = [];
  if (items.some((item) => item.authorProviderId === "UNMAPPED-AUTHOR")) diagnostics.push("One or more rows did not contain a Bluebeam author.");
  if (items.some((item) => item.providerStatusCode === "Unspecified")) diagnostics.push("One or more rows did not contain a Bluebeam status.");
  return {
    format,
    sourceFilename: file.name,
    sourceVersion: items.map((item) => item.updatedAt).sort().at(-1) ?? fallback.toISOString(),
    items,
    providerDocumentIds: unique(items.map((item) => item.providerDocumentId)),
    providerAuthorIds: unique(items.map((item) => item.authorProviderId)),
    providerStatusCodes: unique(items.map((item) => item.providerStatusCode)),
    diagnostics,
  };
}

export function suggestedEvidenceStatus(value: string): BluebeamEvidenceStatus {
  return statusSuggestion(value);
}
