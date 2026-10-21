import { format, type FormatOptionsWithLanguage, type SqlLanguage } from "sql-formatter";

export const MAX_SQL_BYTES = 2 * 1024 * 1024;

export type SqlDialectId = "sql" | "postgresql" | "mysql" | "mariadb" | "sqlite" | "transactsql" | "bigquery" | "snowflake" | "plsql";
export type SqlCase = "preserve" | "upper" | "lower";
export type SqlIndentation = "2" | "4" | "tab";

export type SqlFormatterSettings = {
  indentation: SqlIndentation;
  keywordCase: SqlCase;
  dataTypeCase: SqlCase;
  functionCase: SqlCase;
  logicalOperatorNewline: "before" | "after";
  expressionWidth: number;
  linesBetweenQueries: 1 | 2;
  denseOperators: boolean;
};

export type SqlFormatSuccess = {
  ok: true;
  output: string;
  inputBytes: number;
  outputBytes: number;
};

export type SqlFormatFailure = {
  ok: false;
  code: "EMPTY_INPUT" | "INPUT_TOO_LARGE" | "FORMAT_ERROR";
  message: string;
  inputBytes: number;
  line?: number;
  column?: number;
};

export type SqlFormatResult = SqlFormatSuccess | SqlFormatFailure;

export const sqlDialects: ReadonlyArray<{ id: SqlDialectId; label: string }> = [
  { id: "sql", label: "Standard SQL" },
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "mariadb", label: "MariaDB" },
  { id: "sqlite", label: "SQLite" },
  { id: "transactsql", label: "SQL Server / T-SQL" },
  { id: "bigquery", label: "BigQuery" },
  { id: "snowflake", label: "Snowflake" },
  { id: "plsql", label: "Oracle PL/SQL" },
];

export const defaultSqlFormatterSettings: SqlFormatterSettings = {
  indentation: "2",
  keywordCase: "upper",
  dataTypeCase: "upper",
  functionCase: "upper",
  logicalOperatorNewline: "before",
  expressionWidth: 50,
  linesBetweenQueries: 1,
  denseOperators: false,
};

export function sqlByteSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function sqlLineCount(value: string) {
  return value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length;
}

function formatterOptions(dialect: SqlDialectId, settings: SqlFormatterSettings): FormatOptionsWithLanguage {
  return {
    language: dialect as SqlLanguage,
    tabWidth: settings.indentation === "4" ? 4 : 2,
    useTabs: settings.indentation === "tab",
    keywordCase: settings.keywordCase,
    dataTypeCase: settings.dataTypeCase,
    functionCase: settings.functionCase,
    logicalOperatorNewline: settings.logicalOperatorNewline,
    expressionWidth: Math.min(120, Math.max(20, settings.expressionWidth)),
    linesBetweenQueries: settings.linesBetweenQueries,
    denseOperators: settings.denseOperators,
  };
}

function errorLocation(message: string) {
  const match = message.match(/line\s+(\d+)[,\s]+column\s+(\d+)/i)
    ?? message.match(/line\s+(\d+)[^\d]+col(?:umn)?\s+(\d+)/i);
  return match ? { line: Number(match[1]), column: Number(match[2]) } : {};
}

function cleanErrorMessage(message: string) {
  const firstLine = message.split("\n").find((line) => line.trim())?.trim() ?? "SQL could not be formatted.";
  return firstLine.replace(/^Parse error:\s*/i, "").replace(/\s+/g, " ");
}

export function formatSql(input: string, dialect: SqlDialectId = "sql", settings: SqlFormatterSettings = defaultSqlFormatterSettings): SqlFormatResult {
  const inputBytes = sqlByteSize(input);
  if (!input.trim()) return { ok: false, code: "EMPTY_INPUT", message: "Enter SQL to format.", inputBytes };
  if (inputBytes > MAX_SQL_BYTES) return { ok: false, code: "INPUT_TOO_LARGE", message: "Input exceeds the 2 MB processing limit.", inputBytes };

  try {
    const output = format(input, formatterOptions(dialect, settings));
    return { ok: true, output, inputBytes, outputBytes: sqlByteSize(output) };
  } catch (caught) {
    const raw = caught instanceof Error ? caught.message : "SQL could not be formatted.";
    return { ok: false, code: "FORMAT_ERROR", message: cleanErrorMessage(raw), inputBytes, ...errorLocation(raw) };
  }
}

export function validateSqlFile(file: { name: string; type: string; size: number }) {
  if (file.size > MAX_SQL_BYTES) throw new Error("Choose a SQL file no larger than 2 MB.");
  if (!file.name.toLowerCase().endsWith(".sql")) throw new Error("Choose a .sql file.");
  const allowedTypes = new Set(["", "application/sql", "application/x-sql", "text/sql", "text/plain"]);
  if (!allowedTypes.has(file.type.toLowerCase())) throw new Error("The selected file type is not supported.");
  return true;
}

export function sqlDownloadFile() {
  return { name: "formatted.sql", type: "application/sql;charset=utf-8" } as const;
}
