import {
  LineCounter,
  parseAllDocuments,
  stringify,
  type Document,
  type ToStringOptions,
  type YAMLError,
} from "yaml";

export type ConversionDirection = "yaml-to-json" | "json-to-yaml";
export type QuoteStyle = "plain" | "single" | "double";

export type ConverterSettings = {
  jsonIndent: 2 | 4;
  yamlIndent: 2 | 4;
  yamlLineWidth: number;
  quoteStyle: QuoteStyle;
  sortKeys: boolean;
  compactJson: boolean;
};

export type ConversionSuccess = {
  ok: true;
  output: string;
  documentCount: number;
  inputBytes: number;
  outputBytes: number;
};

export type ConversionFailure = {
  ok: false;
  code: ConverterErrorCode;
  message: string;
  inputBytes: number;
  line?: number;
  column?: number;
  document?: number;
};

export type ConversionResult = ConversionSuccess | ConversionFailure;
export type ConverterErrorCode = "EMPTY_INPUT" | "INPUT_TOO_LARGE" | "INVALID_YAML" | "DUPLICATE_KEY" | "CUSTOM_TAG" | "ALIAS_LIMIT" | "UNSAFE_NUMBER" | "UNSUPPORTED_VALUE" | "CIRCULAR_VALUE" | "INVALID_JSON";

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_ALIAS_COUNT = 20;

export const defaultConverterSettings: ConverterSettings = {
  jsonIndent: 2,
  yamlIndent: 2,
  yamlLineWidth: 100,
  quoteStyle: "plain",
  sortKeys: false,
  compactJson: false,
};

export class ConverterError extends Error {
  constructor(
    public readonly code: ConverterErrorCode,
    message: string,
    public readonly location: { line?: number; column?: number; document?: number } = {},
  ) {
    super(message);
    this.name = "ConverterError";
  }
}

export function byteSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function requireInput(input: string) {
  const inputBytes = byteSize(input);
  if (!input.trim()) throw new ConverterError("EMPTY_INPUT", "Enter YAML or JSON to continue.");
  if (inputBytes > MAX_INPUT_BYTES) throw new ConverterError("INPUT_TOO_LARGE", "Input exceeds the 2 MB processing limit.");
  return inputBytes;
}

function cleanYamlMessage(message: string) {
  return message.split(/\s+at line \d+/)[0].trim().replace(/\s+/g, " ");
}

function yamlError(error: YAMLError, document: number) {
  const position = error.linePos?.[0];
  const code: ConverterErrorCode = error.code === "DUPLICATE_KEY" ? "DUPLICATE_KEY" : error.code === "TAG_RESOLVE_FAILED" ? "CUSTOM_TAG" : "INVALID_YAML";
  const message = code === "DUPLICATE_KEY"
    ? "YAML mapping keys must be unique."
    : code === "CUSTOM_TAG"
      ? "Custom and unresolved YAML tags are not supported."
      : cleanYamlMessage(error.message) || "YAML could not be parsed.";
  return new ConverterError(code, message, { line: position?.line, column: position?.col, document });
}

function parseYamlDocuments(input: string) {
  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(input, {
    version: "1.2",
    schema: "core",
    customTags: [],
    resolveKnownTags: false,
    merge: false,
    uniqueKeys: true,
    stringKeys: true,
    intAsBigInt: true,
    strict: true,
    prettyErrors: true,
    lineCounter,
    logLevel: "silent",
  });
  if (documents.length === 0) throw new ConverterError("EMPTY_INPUT", "Enter YAML to continue.");
  documents.forEach((document, index) => {
    const issue = document.errors[0] ?? document.warnings[0];
    if (issue) throw yamlError(issue, index + 1);
  });
  return documents;
}

function normalizeForJson(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new ConverterError("UNSAFE_NUMBER", "An integer exceeds JavaScript's safe integer range and cannot be represented accurately in JSON.");
    }
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ConverterError("UNSUPPORTED_VALUE", "NaN and Infinity are not valid JSON values.");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new ConverterError("UNSAFE_NUMBER", "An integer exceeds JavaScript's safe integer range and cannot be represented accurately in JSON.");
    return value;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    throw new ConverterError("UNSUPPORTED_VALUE", "The input contains a value that JSON cannot represent.");
  }
  if (typeof value !== "object") throw new ConverterError("UNSUPPORTED_VALUE", "The input contains an unsupported value.");
  if (ancestors.has(value)) throw new ConverterError("CIRCULAR_VALUE", "The input contains a circular alias that JSON cannot represent.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeForJson(item, ancestors));
    if (value instanceof Map) {
      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, item] of value.entries()) {
        if (typeof key !== "string") throw new ConverterError("UNSUPPORTED_VALUE", "YAML mapping keys must be strings before conversion to JSON.");
        output[key] = normalizeForJson(item, ancestors);
      }
      return output;
    }
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) output[key] = normalizeForJson(item, ancestors);
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function documentToJsonValue(document: Document.Parsed, index: number) {
  try {
    return normalizeForJson(document.toJS({ mapAsMap: true, maxAliasCount: MAX_ALIAS_COUNT }));
  } catch (caught) {
    if (caught instanceof ConverterError) throw new ConverterError(caught.code, caught.message, { ...caught.location, document: index + 1 });
    const message = caught instanceof Error ? caught.message : "YAML aliases could not be resolved.";
    if (/alias count|resource exhaustion/i.test(message)) throw new ConverterError("ALIAS_LIMIT", `YAML document ${index + 1} exceeds the safe alias expansion limit.`, { document: index + 1 });
    throw new ConverterError("INVALID_YAML", `YAML document ${index + 1} could not be converted.`, { document: index + 1 });
  }
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) output[key] = sortedValue((value as Record<string, unknown>)[key]);
    return output;
  }
  return value;
}

function jsonLocation(input: string, message: string) {
  const explicit = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (explicit) return { line: Number(explicit[1]), column: Number(explicit[2]) };
  const offsetMatch = message.match(/position\s+(\d+)/i);
  if (!offsetMatch) return {};
  const offset = Math.min(input.length, Number(offsetMatch[1]));
  const lines = input.slice(0, offset).split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

export function parseJson(input: string) {
  requireInput(input);
  try {
    return JSON.parse(input) as unknown;
  } catch (caught) {
    const raw = caught instanceof Error ? caught.message : "JSON could not be parsed.";
    const location = jsonLocation(input, raw);
    const message = raw.replace(/\s+at position\s+\d+.*$/i, "").replace(/\s+at line\s+\d+.*$/i, "");
    throw new ConverterError("INVALID_JSON", message || "JSON could not be parsed.", location);
  }
}

function success(output: string, inputBytes: number, documentCount: number): ConversionSuccess {
  return { ok: true, output, documentCount, inputBytes, outputBytes: byteSize(output) };
}

function failure(caught: unknown, input: string): ConversionFailure {
  const error = caught instanceof ConverterError ? caught : new ConverterError("UNSUPPORTED_VALUE", "The input could not be converted.");
  return { ok: false, code: error.code, message: error.message, inputBytes: byteSize(input), line: error.location.line, column: error.location.column, document: error.location.document };
}

export function convertYamlToJson(input: string, settings: ConverterSettings = defaultConverterSettings): ConversionResult {
  try {
    const inputBytes = requireInput(input);
    const documents = parseYamlDocuments(input);
    const values = documents.map(documentToJsonValue);
    const value = values.length === 1 ? values[0] : values;
    const selected = settings.sortKeys ? sortedValue(value) : value;
    const output = JSON.stringify(selected, null, settings.compactJson ? 0 : settings.jsonIndent);
    if (output === undefined) throw new ConverterError("UNSUPPORTED_VALUE", "The YAML root value cannot be represented in JSON.");
    return success(output, inputBytes, documents.length);
  } catch (caught) {
    return failure(caught, input);
  }
}

function yamlStringOptions(settings: ConverterSettings): ToStringOptions {
  return {
    indent: settings.yamlIndent,
    lineWidth: settings.yamlLineWidth,
    defaultStringType: settings.quoteStyle === "single" ? "QUOTE_SINGLE" : settings.quoteStyle === "double" ? "QUOTE_DOUBLE" : "PLAIN",
    singleQuote: settings.quoteStyle === "single" ? true : settings.quoteStyle === "double" ? false : null,
  };
}

export function convertJsonToYaml(input: string, settings: ConverterSettings = defaultConverterSettings): ConversionResult {
  try {
    const inputBytes = requireInput(input);
    const parsed = parseJson(input);
    const selected = settings.sortKeys ? sortedValue(parsed) : parsed;
    const output = stringify(selected, {
      version: "1.2",
      schema: "core",
      customTags: [],
      resolveKnownTags: false,
      merge: false,
      aliasDuplicateObjects: false,
      ...yamlStringOptions(settings),
    });
    return success(output, inputBytes, 1);
  } catch (caught) {
    return failure(caught, input);
  }
}

export function formatYaml(input: string, settings: ConverterSettings = defaultConverterSettings): ConversionResult {
  try {
    const inputBytes = requireInput(input);
    const documents = parseYamlDocuments(input);
    documents.forEach(documentToJsonValue);
    const output = documents.map((document) => document.toString(yamlStringOptions(settings))).join("---\n");
    return success(output, inputBytes, documents.length);
  } catch (caught) {
    return failure(caught, input);
  }
}

export function formatJson(input: string, settings: ConverterSettings = defaultConverterSettings): ConversionResult {
  try {
    const inputBytes = requireInput(input);
    const parsed = parseJson(input);
    const selected = settings.sortKeys ? sortedValue(parsed) : parsed;
    const output = JSON.stringify(selected, null, settings.compactJson ? 0 : settings.jsonIndent);
    return success(output, inputBytes, 1);
  } catch (caught) {
    return failure(caught, input);
  }
}

export function validateInput(input: string, direction: ConversionDirection): ConversionResult {
  if (direction === "yaml-to-json") {
    const result = convertYamlToJson(input);
    return result.ok ? { ...result, output: "", outputBytes: 0 } : result;
  }
  const result = formatJson(input);
  return result.ok ? { ...result, output: "", outputBytes: 0 } : result;
}

export function convertInput(input: string, direction: ConversionDirection, settings: ConverterSettings = defaultConverterSettings) {
  return direction === "yaml-to-json" ? convertYamlToJson(input, settings) : convertJsonToYaml(input, settings);
}

export function formatInput(input: string, direction: ConversionDirection, settings: ConverterSettings = defaultConverterSettings) {
  return direction === "yaml-to-json" ? formatYaml(input, settings) : formatJson(input, settings);
}

export function validateUpload(file: { name: string; type: string; size: number }) {
  if (file.size > MAX_INPUT_BYTES) throw new ConverterError("INPUT_TOO_LARGE", "Choose a YAML or JSON file no larger than 2 MB.");
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (![".yaml", ".yml", ".json"].includes(extension)) throw new ConverterError("UNSUPPORTED_VALUE", "Choose a .yaml, .yml, or .json file.");
  const allowedTypes = new Set(["", "application/json", "application/yaml", "application/x-yaml", "text/yaml", "text/x-yaml", "text/plain"]);
  if (!allowedTypes.has(file.type.toLowerCase())) throw new ConverterError("UNSUPPORTED_VALUE", "The selected file type is not supported.");
  return extension === ".json" ? "json-to-yaml" as const : "yaml-to-json" as const;
}

export function outputFile(direction: ConversionDirection) {
  return direction === "yaml-to-json"
    ? { name: "converted.json", type: "application/json" }
    : { name: "converted.yaml", type: "application/yaml" };
}
