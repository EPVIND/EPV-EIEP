import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

type JsonSchema = Record<string, unknown>;

const repositoryRoot = resolve(".");
const apiConfigPath = resolve(repositoryRoot, "services/api/tsconfig.json");
const serverPath = resolve(repositoryRoot, "services/api/src/server.ts");
const outputPath = resolve(repositoryRoot, "services/api/src/generated-route-schemas.ts");

const config = ts.readConfigFile(apiConfigPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(apiConfigPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length > 0) {
  throw new Error(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
}
const checker = program.getTypeChecker();
const source = program.getSourceFile(serverPath);
if (!source) throw new Error("The API server source is missing from its TypeScript project.");

function uniqueSchemas(schemas: readonly JsonSchema[]): JsonSchema[] {
  const byValue = new Map<string, JsonSchema>();
  for (const schema of schemas) byValue.set(JSON.stringify(schema), schema);
  return [...byValue.values()];
}

function propertyOrder(left: ts.Symbol, right: ts.Symbol): number {
  const location = (property: ts.Symbol) => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (!declaration) return { file: "", position: Number.MAX_SAFE_INTEGER };
    return {
      file: declaration.getSourceFile().fileName.replaceAll("\\", "/").toLowerCase(),
      position: declaration.getStart(),
    };
  };
  const leftLocation = location(left);
  const rightLocation = location(right);
  return leftLocation.file.localeCompare(rightLocation.file)
    || leftLocation.position - rightLocation.position
    || left.getName().localeCompare(right.getName());
}

function schemaFor(type: ts.Type, stack = new Set<ts.Type>()): JsonSchema {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return {};
  if (type.flags & ts.TypeFlags.StringLiteral) return { type: "string", enum: [(type as ts.StringLiteralType).value] };
  if (type.flags & ts.TypeFlags.NumberLiteral) return { type: "number", enum: [(type as ts.NumberLiteralType).value] };
  if (type.flags & ts.TypeFlags.BooleanLiteral) return { type: "boolean" };
  if (type.flags & ts.TypeFlags.StringLike) return { type: "string" };
  if (type.flags & ts.TypeFlags.NumberLike) return { type: "number" };
  if (type.flags & ts.TypeFlags.BooleanLike) return { type: "boolean" };
  if (type.flags & ts.TypeFlags.BigIntLike) return { type: "string", pattern: "^-?\\d+$" };
  if (type.flags & ts.TypeFlags.Null) return { nullable: true };

  if (type.isUnion()) {
    const defined = type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined));
    const nullable = defined.some((member) => Boolean(member.flags & ts.TypeFlags.Null));
    const members = defined.filter((member) => !(member.flags & ts.TypeFlags.Null));
    const literalValues = members.every((member) => Boolean(member.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)));
    if (literalValues) {
      const values = members.map((member) => member.flags & ts.TypeFlags.StringLiteral
        ? (member as ts.StringLiteralType).value : (member as ts.NumberLiteralType).value);
      const valueType = values.every((value) => typeof value === "string") ? "string" : "number";
      return { type: valueType, enum: values, ...(nullable ? { nullable: true } : {}) };
    }
    const variants = uniqueSchemas(members.map((member) => schemaFor(member, new Set(stack))));
    if (variants.length === 0) return nullable ? { nullable: true } : {};
    if (variants.length === 1) return { ...variants[0], ...(nullable ? { nullable: true } : {}) };
    return { oneOf: variants, ...(nullable ? { nullable: true } : {}) };
  }
  // Intersections used by route bodies (for example `Omit<T, "date"> &
  // { date: string }`) are a single closed JSON object at runtime. Emitting each
  // member as an `allOf` object with `additionalProperties: false` makes every
  // member reject the other member's fields. Let the object branch below ask the
  // TypeScript checker for the intersection's combined property set instead.

  const symbolName = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
  if (symbolName === "Date") return { type: "string", format: "date-time" };
  if (checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference).map((member) => schemaFor(member, new Set(stack)));
    return { type: "array", minItems: elements.length, maxItems: elements.length, items: { oneOf: uniqueSchemas(elements) } };
  }
  if (checker.isArrayType(type) || symbolName === "Array" || symbolName === "ReadonlyArray") {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0];
    return { type: "array", items: element ? schemaFor(element, new Set(stack)) : {} };
  }
  if (stack.has(type)) return {};
  stack.add(type);
  const stringIndex = type.getStringIndexType();
  if (stringIndex) {
    stack.delete(type);
    return { type: "object", additionalProperties: schemaFor(stringIndex, new Set(stack)) };
  }
  if (type.flags & ts.TypeFlags.Object) {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const property of checker.getPropertiesOfType(type).sort(propertyOrder)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? source;
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
      properties[property.getName()] = schemaFor(propertyType, new Set(stack));
      const optional = Boolean(property.flags & ts.SymbolFlags.Optional)
        || (propertyType.isUnion() && propertyType.types.some((member) => Boolean(member.flags & ts.TypeFlags.Undefined)));
      if (!optional) required.push(property.getName());
    }
    stack.delete(type);
    return {
      type: "object", additionalProperties: false, properties,
      ...(required.length > 0 ? { required: required.sort() } : {}),
    };
  }
  stack.delete(type);
  return {};
}

function memberType(container: ts.Type, name: string): ts.Type | null {
  const member = container.getProperty(name);
  if (!member) return null;
  const declaration = member.valueDeclaration ?? member.declarations?.[0] ?? source;
  return checker.getTypeOfSymbolAtLocation(member, declaration);
}

const routeSchemas: Record<string, JsonSchema> = {};
function visit(node: ts.Node): void {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const receiver = node.expression.expression;
    const method = node.expression.name.text.toLowerCase();
    const urlNode = node.arguments[0];
    if (ts.isIdentifier(receiver) && receiver.text === "server"
      && ["get", "post", "put", "patch", "delete"].includes(method)
      && urlNode && ts.isStringLiteralLike(urlNode) && urlNode.text.startsWith("/v1")) {
      const schema: JsonSchema = {};
      const routeTypeNode = node.typeArguments?.[0];
      if (routeTypeNode) {
        const routeType = checker.getTypeFromTypeNode(routeTypeNode);
        const body = memberType(routeType, "Body");
        const params = memberType(routeType, "Params");
        const querystring = memberType(routeType, "Querystring");
        if (body) schema.body = schemaFor(body);
        if (params) schema.params = schemaFor(params);
        if (querystring) schema.querystring = schemaFor(querystring);
      }
      if (!schema.params) {
        const names = [...urlNode.text.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu)].map((match) => match[1]);
        if (names.length > 0) {
          schema.params = {
            type: "object", additionalProperties: false, required: names,
            properties: Object.fromEntries(names.map((name) => [name, { type: "string", minLength: 1 }])),
          };
        }
      }
      routeSchemas[`${method.toUpperCase()} ${urlNode.text}`] = schema;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);

const ordered = Object.fromEntries(Object.entries(routeSchemas).sort(([left], [right]) => left.localeCompare(right)));
const rendered = `// Generated by scripts/generate-route-schemas.ts. Do not edit manually.\n`
  + `export const generatedRouteSchemas: Readonly<Record<string, Readonly<Record<string, unknown>>>> = ${JSON.stringify(ordered, null, 2)};\n`;
if (process.argv.includes("--check")) {
  const published = await readFile(outputPath, "utf8").catch(() => "");
  if (published !== rendered) throw new Error("Generated API route schemas are stale; run pnpm route-schemas:generate.");
  process.stdout.write(`Generated route schemas match ${Object.keys(ordered).length} active v1 routes.\n`);
} else {
  await writeFile(outputPath, rendered, "utf8");
  process.stdout.write(`Generated runtime schemas for ${Object.keys(ordered).length} active v1 routes.\n`);
}
