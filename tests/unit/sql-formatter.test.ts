import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_SQL_BYTES,
  defaultSqlFormatterSettings,
  formatSql,
  sqlByteSize,
  sqlDialects,
  sqlDownloadFile,
  sqlLineCount,
  validateSqlFile,
  type SqlDialectId,
} from "@/lib/sql-formatter";

function output(input: string, dialect: SqlDialectId = "sql") {
  const result = formatSql(input, dialect);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.output;
}

describe("SQL formatter adapter", () => {
  it("rejects empty and oversized input before formatting", () => {
    expect(formatSql(" \n ")).toMatchObject({ ok: false, code: "EMPTY_INPUT" });
    expect(formatSql("x".repeat(MAX_SQL_BYTES + 1))).toMatchObject({ ok: false, code: "INPUT_TOO_LARGE" });
  });

  it.each(sqlDialects)("formats SQL using $label", ({ id }) => {
    const result = formatSql("select id,name from users where active=true", id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toMatch(/SELECT|select/);
  });

  it("formats SELECT, JOIN, subquery, CTE, CASE, and window functions", () => {
    expect(output("select id,name from users")).toContain("FROM\n  users");
    expect(output("select u.id from users u left join teams t on t.id=u.team_id")).toContain("LEFT JOIN");
    expect(output("select * from users where id in (select user_id from admins)")).toContain("SELECT\n      user_id");
    expect(output("with active as (select id from users where active=true) select * from active")).toMatch(/WITH\s+active AS/);
    expect(output("select case when active=true then 'yes' else 'no' end as state from users")).toContain("CASE");
    expect(output("select row_number() over (partition by team_id order by id) as position from users")).toContain("OVER");
  });

  it("formats INSERT, UPDATE, DELETE, DDL, transactions, and multiple statements", () => {
    const statements = "begin; insert into users(id,name) values(1,'Naminc'); update users set name='N' where id=1; delete from users where id=2; create table teams(id integer); alter table teams add name varchar(80); drop table teams; commit;";
    const formatted = output(statements);
    expect(formatted).toContain("INSERT INTO");
    expect(formatted).toContain("UPDATE users");
    expect(formatted).toContain("CREATE TABLE");
    expect(formatted).toContain("COMMIT;");
  });

  it("preserves comments, string literals, semicolons, escaped quotes, and quoted identifiers", () => {
    const input = "-- keep line\nselect 'a;b' as value, 'it''s fine' as note, \"User Name\" from users;\n/* keep block */";
    const formatted = output(input, "postgresql");
    expect(formatted).toContain("-- keep line");
    expect(formatted).toContain("/* keep block */");
    expect(formatted).toContain("'a;b'");
    expect(formatted).toContain("'it''s fine'");
    expect(formatted).toContain('"User Name"');
  });

  it("preserves named and dialect-supported positional placeholders", () => {
    const postgres = output("select * from users where name=:name and id=$1", "postgresql");
    const mysql = output("select * from users where name=? and id=?", "mysql");
    expect(postgres).toContain(":name");
    expect(postgres).toContain("$1");
    expect(mysql.match(/\?/g)).toHaveLength(2);
  });

  it("applies uppercase, lowercase, and preserve keyword settings", () => {
    const upper = formatSql("select id from users", "sql", { ...defaultSqlFormatterSettings, keywordCase: "upper" });
    const lower = formatSql("SELECT id FROM users", "sql", { ...defaultSqlFormatterSettings, keywordCase: "lower" });
    const preserve = formatSql("SeLeCt id FrOm users", "sql", { ...defaultSqlFormatterSettings, keywordCase: "preserve" });
    expect(upper.ok && upper.output).toContain("SELECT");
    expect(lower.ok && lower.output).toContain("select");
    expect(preserve.ok && preserve.output).toContain("SeLeCt");
  });

  it("applies two spaces, four spaces, and tabs", () => {
    const query = "select id,name from users";
    const two = formatSql(query, "sql", { ...defaultSqlFormatterSettings, indentation: "2" });
    const four = formatSql(query, "sql", { ...defaultSqlFormatterSettings, indentation: "4" });
    const tabs = formatSql(query, "sql", { ...defaultSqlFormatterSettings, indentation: "tab" });
    expect(two.ok && two.output).toContain("\n  id");
    expect(four.ok && four.output).toContain("\n    id");
    expect(tabs.ok && tabs.output).toContain("\n\tid");
  });

  it("applies logical operator position, statement spacing, and dense operators", () => {
    const input = "select * from users where a = 1 and b = 2; select 1;";
    const after = formatSql(input, "sql", { ...defaultSqlFormatterSettings, logicalOperatorNewline: "after", linesBetweenQueries: 2, denseOperators: true });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.output).toMatch(/AND\n/);
      expect(after.output).toMatch(/;\n\n\nSELECT/);
      expect(after.output).toContain("a=1");
    }
  });

  it("returns a normalized formatter error with line and column", () => {
    expect(formatSql("select 'unterminated", "sql")).toMatchObject({ ok: false, code: "FORMAT_ERROR", line: 1, column: 8 });
  });

  it("reports UTF-8 byte size and line count accurately", () => {
    expect(sqlByteSize("Naminc")).toBe(6);
    expect(sqlByteSize("Việt")).toBeGreaterThan(4);
    expect(sqlLineCount("SELECT 1;\nSELECT 2;")).toBe(2);
    expect(sqlLineCount("")).toBe(0);
  });
});

describe("SQL file handling", () => {
  it("accepts supported SQL files and rejects extension, MIME, and size violations", () => {
    expect(validateSqlFile({ name: "query.sql", type: "application/sql", size: 120 })).toBe(true);
    expect(validateSqlFile({ name: "query.sql", type: "text/plain", size: 120 })).toBe(true);
    expect(() => validateSqlFile({ name: "query.txt", type: "text/plain", size: 120 })).toThrow(/\.sql/);
    expect(() => validateSqlFile({ name: "query.sql", type: "application/json", size: 120 })).toThrow(/not supported/);
    expect(() => validateSqlFile({ name: "query.sql", type: "application/sql", size: MAX_SQL_BYTES + 1 })).toThrow(/2 MB/);
  });

  it("uses the required download filename and SQL MIME type", () => {
    expect(sqlDownloadFile()).toEqual({ name: "formatted.sql", type: "application/sql;charset=utf-8" });
  });

  it("does not use URLs, storage, server actions, logging, or network APIs", () => {
    const component = readFileSync(new URL("../../components/tools/sql-formatter-tool.tsx", import.meta.url), "utf8");
    const adapter = readFileSync(new URL("../../lib/sql-formatter.ts", import.meta.url), "utf8");
    const source = `${component}\n${adapter}`;
    for (const forbidden of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "use server", "fetch(", "console.", "URLSearchParams", "location.hash"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
