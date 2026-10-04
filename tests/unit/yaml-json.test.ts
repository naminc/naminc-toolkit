import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  MAX_INPUT_BYTES,
  byteSize,
  convertJsonToYaml,
  convertYamlToJson,
  defaultConverterSettings,
  formatJson,
  formatYaml,
  outputFile,
  parseJson,
  validateInput,
  validateUpload,
} from "@/lib/yaml-json";

describe("YAML to JSON conversion", () => {
  it("converts objects, arrays, nested data, and scalar types", () => {
    const result = convertYamlToJson("name: Naminc\nactive: true\ncount: 2\nnothing: null\ntags:\n  - dev\n  - tools\nprofile:\n  site: naminc.tech\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.output)).toEqual({ name: "Naminc", active: true, count: 2, nothing: null, tags: ["dev", "tools"], profile: { site: "naminc.tech" } });
  });

  it("supports quoted, multiline, and Vietnamese strings", () => {
    const result = convertYamlToJson("quoted: '001'\nmessage: |\n  Xin chào\n  Naminc\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.output)).toEqual({ quoted: "001", message: "Xin chào\nNaminc\n" });
  });

  it("converts multiple documents into an ordered JSON array", () => {
    const result = convertYamlToJson("name: first\n---\nname: second\n");
    expect(result).toMatchObject({ ok: true, documentCount: 2 });
    if (result.ok) expect(JSON.parse(result.output)).toEqual([{ name: "first" }, { name: "second" }]);
  });

  it("resolves bounded anchors and aliases", () => {
    const result = convertYamlToJson("defaults: &defaults\n  enabled: true\ncopy: *defaults\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.output)).toEqual({ defaults: { enabled: true }, copy: { enabled: true } });
  });

  it("rejects invalid YAML and duplicate keys with location", () => {
    expect(convertYamlToJson("items: [one\n")).toMatchObject({ ok: false, code: "INVALID_YAML", line: 2 });
    expect(convertYamlToJson("name: one\nname: two\n")).toMatchObject({ ok: false, code: "DUPLICATE_KEY", line: 2, column: 1 });
  });

  it("rejects custom tags, excessive aliases, and circular aliases", () => {
    expect(convertYamlToJson("value: !unsafe payload\n")).toMatchObject({ ok: false, code: "CUSTOM_TAG" });
    const aliases = Array.from({ length: 24 }, () => "*item").join(", ");
    expect(convertYamlToJson(`item: &item [1, 2]\nitems: [${aliases}]\n`)).toMatchObject({ ok: false, code: "ALIAS_LIMIT" });
    expect(convertYamlToJson("loop: &loop [*loop]\n")).toMatchObject({ ok: false, code: "CIRCULAR_VALUE" });
  });

  it("rejects unsafe integers, NaN, and Infinity", () => {
    expect(convertYamlToJson("value: 9007199254740993\n")).toMatchObject({ ok: false, code: "UNSAFE_NUMBER" });
    expect(convertYamlToJson("value: .nan\n")).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
    expect(convertYamlToJson("value: .inf\n")).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
  });

  it("reports empty and oversized input", () => {
    expect(convertYamlToJson("  \n")).toMatchObject({ ok: false, code: "EMPTY_INPUT" });
    expect(convertYamlToJson("x".repeat(MAX_INPUT_BYTES + 1))).toMatchObject({ ok: false, code: "INPUT_TOO_LARGE" });
  });
});

describe("JSON to YAML conversion", () => {
  it("converts JSON objects, arrays, primitives, and Unicode", () => {
    const input = '{"name":"Naminc","message":"Xin chào","active":true,"items":[1,null]}';
    const result = convertJsonToYaml(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(parse(result.output)).toEqual(JSON.parse(input));
  });

  it("reports invalid JSON with line and column", () => {
    const result = convertJsonToYaml('{\n  "name": "Naminc",\n  broken\n}');
    expect(result).toMatchObject({ ok: false, code: "INVALID_JSON", line: 3 });
  });

  it("supports YAML indent, line width, quote style, and sorted keys", () => {
    const settings = { ...defaultConverterSettings, yamlIndent: 4 as const, yamlLineWidth: 40, quoteStyle: "single" as const, sortKeys: true };
    const result = convertJsonToYaml('{"z":{"b":2,"a":1},"a":"hello world"}', settings);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parse(result.output) as { a: string; z: Record<string, number> };
      expect(Object.keys(parsed)).toEqual(["a", "z"]);
      expect(Object.keys(parsed.z)).toEqual(["a", "b"]);
      expect(result.output).toMatch(/ {4}'?a'?: 1/);
      expect(result.output).toContain("'hello world'");
    }
  });
});

describe("formatting and validation", () => {
  it("formats JSON with two spaces, four spaces, and compact output", () => {
    const two = formatJson('{"a":{"b":1}}');
    const four = formatJson('{"a":{"b":1}}', { ...defaultConverterSettings, jsonIndent: 4 });
    const compact = formatJson('{ "a": 1 }', { ...defaultConverterSettings, compactJson: true });
    expect(two.ok && two.output).toContain('\n  "a"');
    expect(four.ok && four.output).toContain('\n    "a"');
    expect(compact.ok && compact.output).toBe('{"a":1}');
  });

  it("formats YAML while preserving comments", () => {
    const result = formatYaml("# service name\nname: Naminc # inline\nitems: [one, two]\n", { ...defaultConverterSettings, yamlIndent: 4 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain("# service name");
      expect(result.output).toContain("# inline");
    }
  });

  it("validates without returning converted content", () => {
    expect(validateInput("name: Naminc", "yaml-to-json")).toMatchObject({ ok: true, output: "", outputBytes: 0 });
    expect(validateInput('{"name":"Naminc"}', "json-to-yaml")).toMatchObject({ ok: true, output: "", outputBytes: 0 });
  });

  it("parses JSON through a structured parser", () => {
    expect(parseJson("[true, null, 3]")).toEqual([true, null, 3]);
    expect(() => parseJson("undefined")).toThrow(/Unexpected token|not valid JSON/i);
  });
});

describe("file and byte utilities", () => {
  it("validates supported file extensions, MIME types, and limits", () => {
    expect(validateUpload({ name: "config.yaml", type: "application/yaml", size: 20 })).toBe("yaml-to-json");
    expect(validateUpload({ name: "data.json", type: "application/json", size: 20 })).toBe("json-to-yaml");
    expect(() => validateUpload({ name: "config.txt", type: "text/plain", size: 20 })).toThrow(/yaml, .yml, or .json/);
    expect(() => validateUpload({ name: "config.yaml", type: "image/png", size: 20 })).toThrow(/type/);
    expect(() => validateUpload({ name: "config.yaml", type: "application/yaml", size: MAX_INPUT_BYTES + 1 })).toThrow(/2 MB/);
  });

  it("provides safe output names and MIME types", () => {
    expect(outputFile("yaml-to-json")).toEqual({ name: "converted.json", type: "application/json" });
    expect(outputFile("json-to-yaml")).toEqual({ name: "converted.yaml", type: "application/yaml" });
  });

  it("counts UTF-8 bytes rather than UTF-16 code units", () => {
    expect(byteSize("Naminc")).toBe(6);
    expect(byteSize("Việt")).toBeGreaterThan("Việt".length);
  });
});
