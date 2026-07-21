import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalTimeZone,
  canonicalUtcTimestamp,
  normalizeCodeListValue,
  parseControlledDecimal,
  standardUnitDefinitions,
  unitDefinition,
} from "@eiep/rules-engine";

test("NFR-DAT-003 / AC-04-06: time zones and timestamps have canonical storage forms", () => {
  assert.equal(canonicalTimeZone("America/Denver"), "America/Denver");
  assert.equal(canonicalTimeZone("UTC"), "UTC");
  assert.equal(canonicalTimeZone("Not/AZone"), null);
  assert.equal(canonicalUtcTimestamp("2026-07-20T12:34:56.000Z"), "2026-07-20T12:34:56.000Z");
  assert.equal(canonicalUtcTimestamp("2026-07-20T06:34:56-06:00"), null);
});

test("NFR-DAT-003 / AC-05-06: unit quantities use a controlled code and bounded exact decimal", () => {
  assert.ok(standardUnitDefinitions.length >= 30);
  assert.equal(unitDefinition(" ft ")?.code, "FT");
  assert.equal(unitDefinition("customer-unit"), null);
  assert.deepEqual(parseControlledDecimal("12.500", { maximumScale: 8 }), {
    canonical: "12.500", coefficient: 12500n, scale: 3,
  });
  assert.equal(parseControlledDecimal("1e3"), null);
  assert.equal(parseControlledDecimal("1.123456789", { maximumScale: 8 }), null);
  assert.equal(parseControlledDecimal("0"), null);
});

test("NFR-DAT-003 / AC-04: controlled code-list identifiers normalize without accepting free text", () => {
  assert.equal(normalizeCodeListValue(" weld_method.gtaW "), "WELD_METHOD.GTAW");
  assert.equal(normalizeCodeListValue("contains spaces"), null);
  assert.equal(normalizeCodeListValue(""), null);
});
