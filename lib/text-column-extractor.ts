import Papa from "papaparse";

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_SELECTED_COLUMNS = 100;
export const MAX_COLUMN_INDEX = 1000;
export const PREVIEW_ROW_LIMIT = 100;
export const PREVIEW_COLUMN_LIMIT = 20;
export const ERROR_LINE_LIMIT = 10;

export type ParsingMode = "literal" | "csv";
export type InputDelimiterPreset = "pipe" | "comma" | "colon" | "semicolon" | "tab" | "space" | "custom";
export type OutputDelimiterPreset = "same" | InputDelimiterPreset;
export type MissingColumnStrategy = "empty" | "skip" | "original" | "error";
export type LineEndingOption = "preserve" | "lf" | "crlf";

export type ExtractorSettings = {
  parsingMode: ParsingMode;
  inputDelimiter: InputDelimiterPreset;
  customInputDelimiter: string;
  columnSelection: string;
  outputDelimiter: OutputDelimiterPreset;
  customOutputDelimiter: string;
  missingColumnStrategy: MissingColumnStrategy;
  trimValues: boolean;
  skipEmptyRows: boolean;
  removeDuplicates: boolean;
  keepEmptyColumns: boolean;
  lineEnding: LineEndingOption;
};

export type PreviewRow = {
  rowNumber: number;
  fields: string[];
  missingSelectedColumn: boolean;
};

export type ExtractionSuccess = {
  ok: true;
  output: string;
  inputBytes: number;
  outputBytes: number;
  inputLines: number;
  parsedRows: number;
  outputRows: number;
  maxColumns: number;
  selectedColumns: number[];
  missingRows: number;
  missingLineNumbers: number[];
  duplicatesRemoved: number;
  previewRows: PreviewRow[];
  previewColumns: number;
  previewTruncated: boolean;
  outputLineEnding: "LF" | "CRLF";
};

export type ExtractorErrorCode = "EMPTY_INPUT" | "INPUT_TOO_LARGE" | "EMPTY_DELIMITER" | "INVALID_DELIMITER" | "INVALID_COLUMNS" | "COLUMN_LIMIT" | "CSV_DELIMITER" | "UNTERMINATED_QUOTE" | "CSV_PARSE_ERROR" | "MISSING_COLUMNS";

export type ExtractionFailure = {
  ok: false;
  code: ExtractorErrorCode;
  message: string;
  inputBytes: number;
  line?: number;
  missingRows?: number;
  missingLineNumbers?: number[];
};

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

type ParsedRow = {
  fields: string[];
  raw: string;
  rowNumber: number;
};

export const defaultExtractorSettings: ExtractorSettings = {
  parsingMode: "literal",
  inputDelimiter: "pipe",
  customInputDelimiter: "",
  columnSelection: "1,3",
  outputDelimiter: "same",
  customOutputDelimiter: "",
  missingColumnStrategy: "empty",
  trimValues: true,
  skipEmptyRows: true,
  removeDuplicates: false,
  keepEmptyColumns: true,
  lineEnding: "preserve",
};

const delimiterValues: Record<Exclude<InputDelimiterPreset, "custom">, string> = {
  pipe: "|",
  comma: ",",
  colon: ":",
  semicolon: ";",
  tab: "\t",
  space: " ",
};

export function textByteSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function physicalLineCount(value: string) {
  return value.length === 0 ? 0 : value.split(/\r\n|\n|\r/).length;
}

export function decodeCustomDelimiter(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === "\\" && next === "t") {
      output += "\t";
      index += 1;
    } else if (character === "\\" && next === "\\") {
      output += "\\";
      index += 1;
    } else {
      output += character;
    }
  }
  return output;
}

export function resolveInputDelimiter(preset: InputDelimiterPreset, custom: string) {
  const delimiter = preset === "custom" ? decodeCustomDelimiter(custom) : delimiterValues[preset];
  validateDelimiter(delimiter);
  return delimiter;
}

export function resolveOutputDelimiter(preset: OutputDelimiterPreset, custom: string, inputDelimiter: string) {
  if (preset === "same") return inputDelimiter;
  return resolveInputDelimiter(preset, custom);
}

export function displayDelimiter(delimiter: string) {
  if (delimiter === "\t") return "Tab";
  if (delimiter === " ") return "Space";
  return delimiter;
}

function validateDelimiter(delimiter: string) {
  if (delimiter.length === 0) throw extractionError("EMPTY_DELIMITER", "Enter a delimiter to continue.");
  if (delimiter.length > 32) throw extractionError("INVALID_DELIMITER", "Delimiter must contain 32 characters or fewer.");
  if (/[\r\n]/.test(delimiter)) throw extractionError("INVALID_DELIMITER", "Delimiter cannot contain a line break.");
}

export function parseColumnSelection(value: string) {
  const source = value.trim();
  if (!source) throw extractionError("INVALID_COLUMNS", "Enter at least one column position.");
  const selected: number[] = [];
  const seen = new Set<number>();
  const parts = source.split(",");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) throw extractionError("INVALID_COLUMNS", "Column selection contains an empty item.");
    const range = part.match(/^(\d+)-(\d+)$/);
    const single = part.match(/^\d+$/);
    if (!range && !single) throw extractionError("INVALID_COLUMNS", "Use positive column numbers such as 1,3 or 1-3.");
    const start = Number(range?.[1] ?? part);
    const end = Number(range?.[2] ?? part);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1) {
      throw extractionError("INVALID_COLUMNS", "Column positions start at 1.");
    }
    if (start > end) throw extractionError("INVALID_COLUMNS", "Column ranges must run from a lower position to a higher position.");
    if (end > MAX_COLUMN_INDEX) throw extractionError("COLUMN_LIMIT", `Column positions cannot exceed ${MAX_COLUMN_INDEX}.`);
    if (end - start + 1 > MAX_SELECTED_COLUMNS) throw extractionError("COLUMN_LIMIT", `Select no more than ${MAX_SELECTED_COLUMNS} columns.`);
    for (let column = start; column <= end; column += 1) {
      if (!seen.has(column)) {
        seen.add(column);
        selected.push(column);
        if (selected.length > MAX_SELECTED_COLUMNS) throw extractionError("COLUMN_LIMIT", `Select no more than ${MAX_SELECTED_COLUMNS} columns.`);
      }
    }
  }
  return selected;
}

function extractionError(code: ExtractorErrorCode, message: string, line?: number) {
  return Object.assign(new Error(message), { code, line });
}

function stripOneLineEnding(value: string) {
  return value.replace(/(?:\r\n|\n|\r)$/, "");
}

export function parseLiteralRows(input: string, delimiter: string): ParsedRow[] {
  validateDelimiter(delimiter);
  return input.split(/\r\n|\n|\r/).map((raw, index) => ({ fields: raw.split(delimiter), raw, rowNumber: index + 1 }));
}

export function parseCsvRows(input: string, delimiter: string): ParsedRow[] {
  validateDelimiter(delimiter);
  if (Array.from(delimiter).length !== 1) throw extractionError("CSV_DELIMITER", "CSV-compatible mode requires a one-character delimiter.");
  const rows: ParsedRow[] = [];
  const errors: Papa.ParseError[] = [];
  let previousCursor = 0;

  Papa.parse<string[]>(input, {
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    dynamicTyping: false,
    skipEmptyLines: false,
    step(result) {
      errors.push(...result.errors);
      const raw = stripOneLineEnding(input.slice(previousCursor, result.meta.cursor));
      rows.push({ fields: result.data.map((field) => String(field)), raw, rowNumber: rows.length + 1 });
      previousCursor = result.meta.cursor;
    },
  });

  const error = errors[0];
  if (error) {
    const line = typeof error.row === "number" ? error.row + 1 : undefined;
    const code = error.code === "MissingQuotes" ? "UNTERMINATED_QUOTE" : "CSV_PARSE_ERROR";
    const message = code === "UNTERMINATED_QUOTE" ? "A quoted field is not closed." : "CSV-compatible input could not be parsed.";
    throw extractionError(code, message, line);
  }
  return rows;
}

function detectedLineEnding(input: string) {
  const first = input.match(/\r\n|\n|\r/)?.[0];
  return first === "\r\n" ? "\r\n" : "\n";
}

function outputLineEnding(input: string, option: LineEndingOption) {
  if (option === "crlf") return "\r\n";
  if (option === "lf") return "\n";
  return detectedLineEnding(input);
}

function serializeValue(value: string, delimiter: string) {
  if (!value.includes(delimiter) && !/["\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function failure(input: string, caught: unknown): ExtractionFailure {
  const error = caught instanceof Error ? caught as Error & { code?: ExtractorErrorCode; line?: number } : extractionError("CSV_PARSE_ERROR", "The text could not be processed.");
  return {
    ok: false,
    code: error.code ?? "CSV_PARSE_ERROR",
    message: error.message || "The text could not be processed.",
    inputBytes: textByteSize(input),
    line: error.line,
  };
}

export function extractTextColumns(input: string, settings: ExtractorSettings = defaultExtractorSettings): ExtractionResult {
  const inputBytes = textByteSize(input);
  if (!input.trim()) return { ok: false, code: "EMPTY_INPUT", message: "Enter delimited text to continue.", inputBytes };
  if (inputBytes > MAX_TEXT_BYTES) return { ok: false, code: "INPUT_TOO_LARGE", message: "Input exceeds the 2 MB processing limit.", inputBytes };

  try {
    const inputDelimiter = resolveInputDelimiter(settings.inputDelimiter, settings.customInputDelimiter);
    const selectedColumns = parseColumnSelection(settings.columnSelection);
    const selectedIndexes = selectedColumns.map((column) => column - 1);
    const delimiter = resolveOutputDelimiter(settings.outputDelimiter, settings.customOutputDelimiter, inputDelimiter);
    const rows = settings.parsingMode === "csv" ? parseCsvRows(input, inputDelimiter) : parseLiteralRows(input, inputDelimiter);
    const maxColumns = rows.reduce((maximum, row) => Math.max(maximum, row.fields.length), 0);
    const missingLineNumbers: number[] = [];
    let missingRows = 0;
    let duplicatesRemoved = 0;
    const transformed: string[] = [];
    const seenRows = new Set<string>();

    for (const row of rows) {
      if (settings.skipEmptyRows && row.raw.length === 0) continue;
      const missing = selectedIndexes.some((index) => index >= row.fields.length);
      if (missing) {
        missingRows += 1;
        if (missingLineNumbers.length < ERROR_LINE_LIMIT) missingLineNumbers.push(row.rowNumber);
        if (settings.missingColumnStrategy === "skip") continue;
        if (settings.missingColumnStrategy === "error") continue;
      }

      let outputRow: string;
      if (missing && settings.missingColumnStrategy === "original") {
        outputRow = row.raw;
      } else {
        let values = selectedIndexes.map((index) => row.fields[index] ?? "");
        if (settings.trimValues) values = values.map((value) => value.trim());
        if (!settings.keepEmptyColumns) values = values.filter((value) => value.length > 0);
        outputRow = values.map((value) => serializeValue(value, delimiter)).join(delimiter);
      }

      if (settings.removeDuplicates && seenRows.has(outputRow)) {
        duplicatesRemoved += 1;
        continue;
      }
      seenRows.add(outputRow);
      transformed.push(outputRow);
    }

    if (settings.missingColumnStrategy === "error" && missingRows > 0) {
      return {
        ok: false,
        code: "MISSING_COLUMNS",
        message: `${missingRows} row${missingRows === 1 ? " does" : "s do"} not contain every selected column.`,
        inputBytes,
        line: missingLineNumbers[0],
        missingRows,
        missingLineNumbers,
      };
    }

    const lineEnding = outputLineEnding(input, settings.lineEnding);
    const output = transformed.join(lineEnding);
    const previewRows = rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => ({
      rowNumber: row.rowNumber,
      fields: row.fields.slice(0, PREVIEW_COLUMN_LIMIT),
      missingSelectedColumn: selectedIndexes.some((index) => index >= row.fields.length),
    }));

    return {
      ok: true,
      output,
      inputBytes,
      outputBytes: textByteSize(output),
      inputLines: physicalLineCount(input),
      parsedRows: rows.length,
      outputRows: transformed.length,
      maxColumns,
      selectedColumns,
      missingRows,
      missingLineNumbers,
      duplicatesRemoved,
      previewRows,
      previewColumns: Math.min(maxColumns, PREVIEW_COLUMN_LIMIT),
      previewTruncated: rows.length > PREVIEW_ROW_LIMIT || maxColumns > PREVIEW_COLUMN_LIMIT,
      outputLineEnding: lineEnding === "\r\n" ? "CRLF" : "LF",
    };
  } catch (caught) {
    return failure(input, caught);
  }
}

export function validateTextFile(file: { name: string; type: string; size: number }) {
  if (file.size > MAX_TEXT_BYTES) throw new Error("Choose a text file no larger than 2 MB.");
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (![".txt", ".csv", ".tsv", ".log"].includes(extension)) throw new Error("Choose a .txt, .csv, .tsv, or .log file.");
  const allowedTypes = new Set(["", "text/plain", "text/csv", "application/csv", "text/tab-separated-values", "text/x-log"]);
  if (!allowedTypes.has(file.type.toLowerCase())) throw new Error("The selected file type is not supported.");
  return { extension, suggestion: extension === ".csv" ? "comma" as const : extension === ".tsv" ? "tab" as const : null };
}

export function extractionDownloadFile(outputDelimiter: string) {
  if (outputDelimiter === ",") return { name: "extracted-columns.csv", type: "text/csv;charset=utf-8" } as const;
  if (outputDelimiter === "\t") return { name: "extracted-columns.tsv", type: "text/tab-separated-values;charset=utf-8" } as const;
  return { name: "extracted-columns.txt", type: "text/plain;charset=utf-8" } as const;
}
