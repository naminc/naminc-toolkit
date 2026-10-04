import { describe, expect, it } from "vitest";
import {
  analyzeCron,
  buildCronExpression,
  cronDownloadText,
  defaultCronBuilder,
  describeCron,
  relativeTime,
} from "@/lib/cron-expression";

const now = new Date("2025-01-02T00:00:00.000Z");

describe("cron expression logic", () => {
  it("parses wildcards and returns a bounded next-run list", () => {
    const result = analyzeCron("* * * * *", "five", "UTC", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.runs).toHaveLength(10);
    expect(result.runs[0].iso).toBe("2025-01-02T00:01:00.000Z");
    expect(result.summary).toBe("Every minute.");
  });

  it("parses lists, ranges, steps, and weekday schedules", () => {
    expect(analyzeCron("0,15,30,45 9-17 * * 1-5", "five", "UTC", now).ok).toBe(true);
    const result = analyzeCron("*/15 9-17 * * 1-5", "five", "UTC", now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toBe("Every 15 minutes, from 09:00 through 17:59, Monday through Friday.");
  });

  it("supports month and weekday names case-insensitively", () => {
    const result = analyzeCron("0 9 * jan mon", "five", "UTC", now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.at(-1)?.meaning).toContain("Monday");
  });

  it.each(["@yearly", "@annually", "@monthly", "@weekly", "@daily", "@midnight", "@hourly"])("supports the %s macro", (macro) => {
    expect(analyzeCron(macro, "five", "UTC", now).ok).toBe(true);
  });

  it("rejects invalid field counts without guessing", () => {
    expect(analyzeCron("0 * * * * *", "five", "UTC", now)).toMatchObject({ ok: false, message: "Expected 5 fields but received 6." });
    expect(analyzeCron("* * * * *", "six", "UTC", now)).toMatchObject({ ok: false, message: "Expected 6 fields but received 5." });
  });

  it.each([
    ["61 * * * *", "minute"],
    ["0 24 * * *", "hour"],
    ["0 0 32 * *", "day"],
    ["0 0 * 13 *", "month"],
    ["0 0 * * 8", "week"],
  ])("rejects an invalid field in %s", (expression, fieldFragment) => {
    const result = analyzeCron(expression, "five", "UTC", now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(`${result.field} ${result.message}`.toLowerCase()).toContain(fieldFragment);
  });

  it("rejects reversed ranges and unsupported advanced modifiers", () => {
    expect(analyzeCron("10-5 * * * *", "five", "UTC", now).ok).toBe(false);
    expect(analyzeCron("0 0 L * *", "five", "UTC", now)).toMatchObject({ ok: false, message: expect.stringContaining("L and W") });
    expect(analyzeCron("0 0 * * MON#2", "five", "UTC", now)).toMatchObject({ ok: false, message: expect.stringContaining("Advanced") });
  });

  it("parses six fields only in explicit seconds mode", () => {
    const result = analyzeCron("30 */5 * * * *", "six", "UTC", now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.syntaxLabel).toBe("With seconds 6 fields");
      expect(result.runs[0].iso).toBe("2025-01-02T00:00:30.000Z");
    }
  });

  it("rejects macros in six-field mode", () => {
    expect(analyzeCron("@hourly", "six", "UTC", now)).toMatchObject({ ok: false, message: expect.stringContaining("Standard 5 fields") });
  });

  it("calculates runs in an IANA timezone", () => {
    const result = analyzeCron("0 9 * * *", "five", "Asia/Ho_Chi_Minh", now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runs[0].iso).toBe("2025-01-02T02:00:00.000Z");
  });

  it("skips a nonexistent DST spring-forward time", () => {
    const result = analyzeCron("30 2 * * *", "five", "America/New_York", new Date("2025-03-08T00:00:00.000Z"), 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runs.map((run) => run.iso)).toEqual([
      "2025-03-08T07:30:00.000Z",
      "2025-03-10T06:30:00.000Z",
      "2025-03-11T06:30:00.000Z",
    ]);
  });

  it("runs once at the first occurrence of a DST overlap", () => {
    const result = analyzeCron("30 1 * * *", "five", "America/New_York", new Date("2025-11-01T00:00:00.000Z"), 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runs.map((run) => run.iso)).toEqual([
      "2025-11-01T05:30:00.000Z",
      "2025-11-02T05:30:00.000Z",
      "2025-11-03T06:30:00.000Z",
    ]);
  });

  it("uses Vixie OR semantics for day-of-month and day-of-week", () => {
    const result = analyzeCron("0 0 1 * MON", "five", "UTC", now, 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runs[0].iso).toBe("2025-01-06T00:00:00.000Z");
  });

  it("builds five- and six-field expressions from controls", () => {
    expect(buildCronExpression(defaultCronBuilder, "five")).toBe("*/5 * * * *");
    expect(buildCronExpression(defaultCronBuilder, "six")).toBe("0 */5 * * * *");
  });

  it("limits next-run enumeration", () => {
    const result = analyzeCron("* * * * *", "five", "UTC", now, 500);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runs).toHaveLength(20);
  });

  it("formats relative time from a fixed reference", () => {
    expect(relativeTime(new Date(now.getTime() + 90 * 60_000), now)).toBe("in 2 hours");
  });

  it("keeps download output limited to expression and calculated runs", () => {
    const result = analyzeCron("0 9 * * 1-5", "five", "UTC", now, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = cronDownloadText(result);
    expect(output).toContain("Cron expression: 0 9 * * 1-5");
    expect(output).toContain("Next runs:");
  });

  it("produces the required weekday description", () => {
    expect(describeCron(["*/15", "9-17", "*", "*", "1-5"], "five")).toContain("Monday through Friday");
  });
});
