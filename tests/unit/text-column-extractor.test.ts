import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_TEXT_BYTES,
  PREVIEW_COLUMN_LIMIT,
  PREVIEW_ROW_LIMIT,
  decodeCustomDelimiter,
  defaultExtractorSettings,
  displayDelimiter,
  extractTextColumns,
  extractionDownloadFile,
  parseColumnSelection,
  parseCsvRows,
  parseLiteralRows,
  physicalLineCount,
  resolveInputDelimiter,
  textByteSize,
  validateTextFile,
  type ExtractorSettings,
} from "@/lib/text-column-extractor";

function settings(overrides: Partial<ExtractorSettings> = {}): ExtractorSettings {
  return { ...defaultExtractorSettings, ...overrides };
}

function successfulOutput(input: string, overrides: Partial<ExtractorSettings> = {}) {
  const result = extractTextColumns(input, settings(overrides));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("delimiter handling", () => {
  it.each([
    ["pipe", "|", "a|b|c"],
    ["comma", ",", "a,b,c"],
    ["colon", ":", "a:b:c"],
    ["semicolon", ";", "a;b;c"],
    ["tab", "\t", "a\tb\tc"],
    ["space", " ", "a b c"],
  ] as const)("extracts using the %s preset", (preset, delimiter, input) => {
    const result = successfulOutput(input, { inputDelimiter: preset, columnSelection: "1,3" });
    expect(result.output).toBe(`a${delimiter}c`);
  });

  it("supports multi-character, regex-significant, and Unicode literal delimiters", () => {
    expect(successfulOutput("a::b::c", { inputDelimiter: "custom", customInputDelimiter: "::" }).output).toBe("a::c");
    expect(successfulOutput("a.*b.*c", { inputDelimiter: "custom", customInputDelimiter: ".*" }).output).toBe("a.*c");
    expect(successfulOutput("xin§chao§ban", { inputDelimiter: "custom", customInputDelimiter: "§" }).output).toBe("xin§ban");
  });

  it("decodes custom tab and escaped backslash representations", () => {
    expect(decodeCustomDelimiter("\\t")).toBe("\t");
    expect(decodeCustomDelimiter("\\\\")).toBe("\\");
    expect(resolveInputDelimiter("custom", "\\t")).toBe("\t");
    expect(displayDelimiter("\t")).toBe("Tab");
  });

  it("rejects empty, newline, and oversized delimiters", () => {
    expect(extractTextColumns("a|b", settings({ inputDelimiter: "custom", customInputDelimiter: "" }))).toMatchObject({ ok: false, code: "EMPTY_DELIMITER" });
    expect(extractTextColumns("a|b", settings({ inputDelimiter: "custom", customInputDelimiter: "\n" }))).toMatchObject({ ok: false, code: "INVALID_DELIMITER" });
    expect(extractTextColumns("a|b", settings({ inputDelimiter: "custom", customInputDelimiter: "x".repeat(33) }))).toMatchObject({ ok: false, code: "INVALID_DELIMITER" });
  });

  it("parses literal rows without interpreting quotes", () => {
    const rows = parseLiteralRows('alpha|"one|two"|omega', "|");
    expect(rows[0].fields).toEqual(["alpha", '"one', 'two"', "omega"]);
  });
});

describe("column selection", () => {
  it.each([
    ["1", [1]],
    ["1,3", [1, 3]],
    ["3,1", [3, 1]],
    ["1-3", [1, 2, 3]],
    ["1,3-5", [1, 3, 4, 5]],
    ["1,3,1,2-3", [1, 3, 2]],
  ])("parses %s", (source, expected) => {
    expect(parseColumnSelection(source as string)).toEqual(expected);
  });

  it.each(["0", "-1", "1.5", "1,,3", "3-1", "one", "1-"])("rejects invalid selection %s", (source) => {
    expect(() => parseColumnSelection(source)).toThrow();
  });

  it("rejects excessive column positions and ranges", () => {
    expect(() => parseColumnSelection("1001")).toThrow(/cannot exceed/);
    expect(() => parseColumnSelection("1-101")).toThrow(/no more than/);
  });

  it("extracts one, multiple, reordered, and ranged columns", () => {
    const input = "a|b|c|d";
    expect(successfulOutput(input, { columnSelection: "1" }).output).toBe("a");
    expect(successfulOutput(input, { columnSelection: "1,3" }).output).toBe("a|c");
    expect(successfulOutput(input, { columnSelection: "3,1" }).output).toBe("c|a");
    expect(successfulOutput(input, { columnSelection: "2-4" }).output).toBe("b|c|d");
  });
});

describe("row transformation", () => {
  const incomplete = "a|b|c\nd|e\nf|g|h";

  it("keeps missing columns as empty values by default", () => {
    const result = successfulOutput(incomplete);
    expect(result.output).toBe("a|c\nd|\nf|h");
    expect(result.missingRows).toBe(1);
    expect(result.missingLineNumbers).toEqual([2]);
  });

  it("skips incomplete rows", () => {
    expect(successfulOutput(incomplete, { missingColumnStrategy: "skip" }).output).toBe("a|c\nf|h");
  });

  it("preserves the exact original incomplete row", () => {
    expect(successfulOutput(incomplete, { missingColumnStrategy: "original", trimValues: false }).output).toBe("a|c\nd|e\nf|h");
  });

  it("reports incomplete rows without exposing their contents", () => {
    const secret = "public|value|ok\nprivate-secret|short";
    const result = extractTextColumns(secret, settings({ missingColumnStrategy: "error" }));
    expect(result).toMatchObject({ ok: false, code: "MISSING_COLUMNS", line: 2, missingRows: 1 });
    if (!result.ok) expect(result.message).not.toContain("private-secret");
  });

  it("keeps or skips blank rows", () => {
    expect(successfulOutput("a|b|c\n\nd|e|f", { skipEmptyRows: true }).output).toBe("a|c\nd|f");
    expect(successfulOutput("a|b|c\n\nd|e|f", { skipEmptyRows: false }).output).toBe("a|c\n|\nd|f");
  });

  it("trims only when requested and preserves Unicode", () => {
    expect(successfulOutput(" Việt Nam | giữa | Xin chào ", { trimValues: true }).output).toBe("Việt Nam|Xin chào");
    expect(successfulOutput(" Việt Nam | giữa | Xin chào ", { trimValues: false }).output).toBe(" Việt Nam | Xin chào ");
  });

  it("preserves row order and removes duplicates when enabled", () => {
    const result = successfulOutput("b|x|2\na|x|1\nb|x|2", { removeDuplicates: true });
    expect(result.output).toBe("b|2\na|1");
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("removes selected empty columns only when configured", () => {
    expect(successfulOutput("a||c", { columnSelection: "1-3", keepEmptyColumns: true }).output).toBe("a||c");
    expect(successfulOutput("a||c", { columnSelection: "1-3", keepEmptyColumns: false }).output).toBe("a|c");
  });

  it("changes the output delimiter and safely quotes ambiguous values", () => {
    expect(successfulOutput("a|b|c", { outputDelimiter: "comma" }).output).toBe("a,c");
    expect(successfulOutput('a|b|"c,d"', { parsingMode: "csv", outputDelimiter: "comma" }).output).toBe('a,"c,d"');
  });

  it("preserves, forces LF, and forces CRLF line endings", () => {
    const input = "a|b|c\r\nd|e|f";
    expect(successfulOutput(input, { lineEnding: "preserve" }).output).toBe("a|c\r\nd|f");
    expect(successfulOutput(input, { lineEnding: "lf" }).output).toBe("a|c\nd|f");
    expect(successfulOutput("a|b|c\nd|e|f", { lineEnding: "crlf" }).output).toBe("a|c\r\nd|f");
  });
});

describe("CSV-compatible parsing", () => {
  it("keeps delimiters inside quotes and decodes escaped quotes", () => {
    const result = successfulOutput('alpha,"example, value","said ""hello"""', { parsingMode: "csv", inputDelimiter: "comma", outputDelimiter: "pipe", columnSelection: "2,3" });
    expect(result.output).toBe('example, value|"said ""hello"""');
  });

  it("supports line breaks inside quoted fields", () => {
    const result = successfulOutput('alpha,"line one\nline two",A1\nbravo,plain,B2', { parsingMode: "csv", inputDelimiter: "comma", outputDelimiter: "pipe", columnSelection: "1,2" });
    expect(result.output).toBe('alpha|"line one\nline two"\nbravo|plain');
    expect(result.parsedRows).toBe(2);
    expect(result.inputLines).toBe(3);
  });

  it("reports an unclosed quote with a record number", () => {
    expect(extractTextColumns('alpha,"unfinished', settings({ parsingMode: "csv", inputDelimiter: "comma" }))).toMatchObject({ ok: false, code: "UNTERMINATED_QUOTE", line: 1 });
  });

  it("requires a one-character CSV delimiter", () => {
    expect(extractTextColumns("a::b::c", settings({ parsingMode: "csv", inputDelimiter: "custom", customInputDelimiter: "::" }))).toMatchObject({ ok: false, code: "CSV_DELIMITER" });
  });

  it("retains raw CSV records for the keep-original strategy", () => {
    const rows = parseCsvRows('alpha,"one,two"\r\nbravo,short', ",");
    expect(rows[0].raw).toBe('alpha,"one,two"');
    expect(rows[1].raw).toBe("bravo,short");
    const result = successfulOutput('alpha,"one,two",A1\nbravo,short', { parsingMode: "csv", inputDelimiter: "comma", outputDelimiter: "pipe", missingColumnStrategy: "original" });
    expect(result.output).toContain("bravo,short");
  });
});

describe("limits, preview, files, and privacy", () => {
  it("reports empty and oversized input", () => {
    expect(extractTextColumns(" \n ")).toMatchObject({ ok: false, code: "EMPTY_INPUT" });
    expect(extractTextColumns("x".repeat(MAX_TEXT_BYTES + 1))).toMatchObject({ ok: false, code: "INPUT_TOO_LARGE" });
  });

  it("limits preview rows and columns without limiting extraction", () => {
    const row = Array.from({ length: PREVIEW_COLUMN_LIMIT + 3 }, (_, index) => `c${index + 1}`).join("|");
    const input = Array.from({ length: PREVIEW_ROW_LIMIT + 4 }, () => row).join("\n");
    const result = successfulOutput(input, { columnSelection: "1,21", removeDuplicates: false });
    expect(result.previewRows).toHaveLength(PREVIEW_ROW_LIMIT);
    expect(result.previewColumns).toBe(PREVIEW_COLUMN_LIMIT);
    expect(result.outputRows).toBe(PREVIEW_ROW_LIMIT + 4);
    expect(result.previewTruncated).toBe(true);
  });

  it("counts physical lines and UTF-8 bytes", () => {
    expect(physicalLineCount("a\r\nb\nc")).toBe(3);
    expect(textByteSize("Naminc")).toBe(6);
    expect(textByteSize("Việt")).toBeGreaterThan(4);
  });

  it("validates supported text files and returns delimiter suggestions", () => {
    expect(validateTextFile({ name: "rows.txt", type: "text/plain", size: 100 }).suggestion).toBeNull();
    expect(validateTextFile({ name: "rows.csv", type: "text/csv", size: 100 }).suggestion).toBe("comma");
    expect(validateTextFile({ name: "rows.tsv", type: "text/tab-separated-values", size: 100 }).suggestion).toBe("tab");
    expect(validateTextFile({ name: "rows.log", type: "text/x-log", size: 100 }).extension).toBe(".log");
    expect(() => validateTextFile({ name: "rows.json", type: "application/json", size: 100 })).toThrow(/\.txt/);
    expect(() => validateTextFile({ name: "rows.txt", type: "application/json", size: 100 })).toThrow(/not supported/);
    expect(() => validateTextFile({ name: "rows.txt", type: "text/plain", size: MAX_TEXT_BYTES + 1 })).toThrow(/2 MB/);
  });

  it("chooses download names and MIME types from the output delimiter", () => {
    expect(extractionDownloadFile(",")).toEqual({ name: "extracted-columns.csv", type: "text/csv;charset=utf-8" });
    expect(extractionDownloadFile("\t")).toEqual({ name: "extracted-columns.tsv", type: "text/tab-separated-values;charset=utf-8" });
    expect(extractionDownloadFile("|")).toEqual({ name: "extracted-columns.txt", type: "text/plain;charset=utf-8" });
  });

  it("does not use browser storage, URL state, network APIs, logging, or execution APIs", () => {
    const component = readFileSync(new URL("../../components/tools/text-column-extractor-tool.tsx", import.meta.url), "utf8");
    const logic = readFileSync(new URL("../../lib/text-column-extractor.ts", import.meta.url), "utf8");
    const source = `${component}\n${logic}`;
    for (const forbidden of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "URLSearchParams", "location.hash", "fetch(", "console.", "dangerouslySetInnerHTML", "eval(", "new Function(", "use server"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
