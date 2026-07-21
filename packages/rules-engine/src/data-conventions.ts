export type UnitDimension =
  | "count"
  | "length"
  | "area"
  | "volume"
  | "mass"
  | "time"
  | "temperature"
  | "pressure"
  | "force"
  | "ratio";

export interface UnitDefinition {
  readonly code: string;
  readonly symbol: string;
  readonly dimension: UnitDimension;
  readonly maximumScale: number;
}

const definitions: readonly UnitDefinition[] = [
  { code: "EA", symbol: "ea", dimension: "count", maximumScale: 8 },
  { code: "SET", symbol: "set", dimension: "count", maximumScale: 8 },
  { code: "LOT", symbol: "lot", dimension: "count", maximumScale: 8 },
  { code: "MM", symbol: "mm", dimension: "length", maximumScale: 8 },
  { code: "CM", symbol: "cm", dimension: "length", maximumScale: 8 },
  { code: "M", symbol: "m", dimension: "length", maximumScale: 8 },
  { code: "IN", symbol: "in", dimension: "length", maximumScale: 8 },
  { code: "FT", symbol: "ft", dimension: "length", maximumScale: 8 },
  { code: "YD", symbol: "yd", dimension: "length", maximumScale: 8 },
  { code: "MM2", symbol: "mm²", dimension: "area", maximumScale: 8 },
  { code: "M2", symbol: "m²", dimension: "area", maximumScale: 8 },
  { code: "IN2", symbol: "in²", dimension: "area", maximumScale: 8 },
  { code: "FT2", symbol: "ft²", dimension: "area", maximumScale: 8 },
  { code: "MM3", symbol: "mm³", dimension: "volume", maximumScale: 8 },
  { code: "M3", symbol: "m³", dimension: "volume", maximumScale: 8 },
  { code: "IN3", symbol: "in³", dimension: "volume", maximumScale: 8 },
  { code: "FT3", symbol: "ft³", dimension: "volume", maximumScale: 8 },
  { code: "ML", symbol: "mL", dimension: "volume", maximumScale: 8 },
  { code: "L", symbol: "L", dimension: "volume", maximumScale: 8 },
  { code: "GAL", symbol: "gal", dimension: "volume", maximumScale: 8 },
  { code: "G", symbol: "g", dimension: "mass", maximumScale: 8 },
  { code: "KG", symbol: "kg", dimension: "mass", maximumScale: 8 },
  { code: "T", symbol: "t", dimension: "mass", maximumScale: 8 },
  { code: "OZ", symbol: "oz", dimension: "mass", maximumScale: 8 },
  { code: "LB", symbol: "lb", dimension: "mass", maximumScale: 8 },
  { code: "S", symbol: "s", dimension: "time", maximumScale: 8 },
  { code: "MIN", symbol: "min", dimension: "time", maximumScale: 8 },
  { code: "HR", symbol: "h", dimension: "time", maximumScale: 8 },
  { code: "DAY", symbol: "d", dimension: "time", maximumScale: 8 },
  { code: "DEG_C", symbol: "°C", dimension: "temperature", maximumScale: 8 },
  { code: "DEG_F", symbol: "°F", dimension: "temperature", maximumScale: 8 },
  { code: "KPA", symbol: "kPa", dimension: "pressure", maximumScale: 8 },
  { code: "MPA", symbol: "MPa", dimension: "pressure", maximumScale: 8 },
  { code: "PSI", symbol: "psi", dimension: "pressure", maximumScale: 8 },
  { code: "N", symbol: "N", dimension: "force", maximumScale: 8 },
  { code: "KN", symbol: "kN", dimension: "force", maximumScale: 8 },
  { code: "LBF", symbol: "lbf", dimension: "force", maximumScale: 8 },
  { code: "PCT", symbol: "%", dimension: "ratio", maximumScale: 8 },
] as const;

const definitionByCode = new Map(definitions.map((definition) => [definition.code, definition]));

export const standardUnitDefinitions = definitions;

export function unitDefinition(value: string): UnitDefinition | null {
  return definitionByCode.get(value.trim().toUpperCase()) ?? null;
}

export interface ControlledDecimal {
  readonly canonical: string;
  readonly coefficient: bigint;
  readonly scale: number;
}

export function parseControlledDecimal(
  value: string,
  options: { readonly allowZero?: boolean; readonly maximumScale?: number; readonly maximumIntegerDigits?: number } = {},
): ControlledDecimal | null {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(normalized);
  if (!match) return null;
  const integer = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (integer.length > (options.maximumIntegerDigits ?? 16) || fraction.length > (options.maximumScale ?? 8)) return null;
  const coefficient = BigInt(`${integer}${fraction}`);
  if (!options.allowZero && coefficient === 0n) return null;
  return { canonical: normalized, coefficient, scale: fraction.length };
}

export function canonicalTimeZone(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: normalized }).resolvedOptions().timeZone;
    return canonical === "Etc/UTC" ? "UTC" : canonical;
  } catch {
    return null;
  }
}

export function canonicalUtcTimestamp(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (typeof value === "string" && date.toISOString() !== value) return null;
  return date.toISOString();
}

export function normalizeCodeListValue(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_.-]{0,63}$/u.test(normalized) ? normalized : null;
}
