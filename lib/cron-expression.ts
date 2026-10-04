import { Cron } from "croner";

export type CronSyntaxMode = "five" | "six";
export type CronTimeZone = "local" | string;

export type CronField = {
  name: string;
  value: string;
  meaning: string;
};

export type CronRun = {
  date: Date;
  local: string;
  utc: string;
  iso: string;
  relative: string;
};

export type CronAnalysis = {
  ok: true;
  expression: string;
  normalizedExpression: string;
  syntaxLabel: "Standard 5 fields" | "With seconds 6 fields";
  summary: string;
  fields: CronField[];
  runs: CronRun[];
  timezoneLabel: string;
  dstWarning: string | null;
};

export type CronAnalysisError = {
  ok: false;
  expression: string;
  message: string;
  field?: string;
};

export type CronResult = CronAnalysis | CronAnalysisError;

export const MAX_NEXT_RUNS = 20;
export const DEFAULT_NEXT_RUNS = 10;

export const cronTimeZones = [
  "UTC",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

export const cronPresets = [
  { label: "Every minute", five: "* * * * *", six: "0 * * * * *" },
  { label: "Every 5 minutes", five: "*/5 * * * *", six: "0 */5 * * * *" },
  { label: "Every hour", five: "0 * * * *", six: "0 0 * * * *" },
  { label: "Every day at midnight", five: "0 0 * * *", six: "0 0 0 * * *" },
  { label: "Every weekday at 09:00", five: "0 9 * * 1-5", six: "0 0 9 * * 1-5" },
  { label: "Every Sunday", five: "0 0 * * 0", six: "0 0 0 * * 0" },
  { label: "First day of every month", five: "0 0 1 * *", six: "0 0 0 1 * *" },
] as const;

const macros: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const monthNames: Record<string, string> = {
  JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June",
  JUL: "July", AUG: "August", SEP: "September", OCT: "October", NOV: "November", DEC: "December",
};

const weekdayNames: Record<string, string> = {
  "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday", "7": "Sunday",
  SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

const pluralUnits: Record<string, string> = {
  Second: "seconds",
  Minute: "minutes",
  Hour: "hours",
  "Day of month": "days of the month",
  Month: "months",
  "Day of week": "days of the week",
};

function normalizeInput(expression: string) {
  return expression.trim().replace(/\s+/g, " ");
}

function resolveMacro(expression: string, mode: CronSyntaxMode) {
  const macro = expression.toLowerCase();
  if (!macro.startsWith("@")) return expression;
  if (mode === "six") throw new Error("Macros are available only in Standard 5 fields mode.");
  const resolved = macros[macro];
  if (!resolved) throw new Error("This cron macro is not supported.");
  return resolved;
}

function assertPortableSyntax(parts: string[], mode: CronSyntaxMode) {
  const expected = mode === "five" ? 5 : 6;
  if (parts.length !== expected) throw new Error(`Expected ${expected} fields but received ${parts.length}.`);
  const offset = mode === "six" ? 1 : 0;
  if (/[LW]/i.test(parts[2 + offset])) throw new Error("L and W day-of-month modifiers are not supported in this tool.");
  if (/[L#+?]/i.test(parts[4 + offset])) throw new Error("Advanced day-of-week modifiers are not supported in this tool.");
  for (const part of parts) {
    if (!/^[A-Za-z0-9*,/-]+$/.test(part)) throw new Error("Only wildcard, list, range, and step syntax is supported.");
  }
}

function displayValue(value: string, field: string) {
  const upper = value.toUpperCase();
  if (field === "Month") return monthNames[upper] ?? value;
  if (field === "Day of week") return weekdayNames[upper] ?? value;
  return value;
}

export function explainCronField(value: string, field: string) {
  const unit = pluralUnits[field] ?? field.toLowerCase();
  if (value === "*") return `Every ${unit.replace(/^days of the /, "day of the ").replace(/s$/, "")}`;
  const step = value.match(/^\*\/(\d+)$/);
  if (step) return `Every ${step[1]} ${unit}`;
  const steppedRange = value.match(/^([^/]+)\/(\d+)$/);
  if (steppedRange) {
    const [start, end] = steppedRange[1].split("-");
    return `Every ${steppedRange[2]} ${unit} from ${displayValue(start, field)} through ${displayValue(end, field)}`;
  }
  if (value.includes(",")) return `On ${value.split(",").map((item) => displayValue(item, field)).join(", ")}`;
  if (value.includes("-")) {
    const [start, end] = value.split("-");
    return `From ${displayValue(start, field)} through ${displayValue(end, field)}`;
  }
  return `At ${displayValue(value, field)}`;
}

function twoDigits(value: string) {
  return /^\d+$/.test(value) ? value.padStart(2, "0") : value;
}

export function describeCron(parts: string[], mode: CronSyntaxMode) {
  const values = mode === "six" ? parts.slice(1) : parts;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = values;
  const second = mode === "six" ? parts[0] : "0";
  const suffix = mode === "six" && second !== "0" ? ` at second ${second}` : "";

  if (minute === "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `Every minute${suffix}.`;
  if (/^\*\/\d+$/.test(minute) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `Every ${minute.slice(2)} minutes${suffix}.`;
  if (/^\*\/\d+$/.test(minute) && /^\d+-\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    const [start, end] = hour.split("-");
    return `Every ${minute.slice(2)} minutes, from ${twoDigits(start)}:00 through ${twoDigits(end)}:59, Monday through Friday${suffix}.`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") return `Every weekday at ${twoDigits(hour)}:${twoDigits(minute)}${suffix}.`;
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `Every day at ${twoDigits(hour)}:${twoDigits(minute)}${suffix}.`;
  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `At the start of every hour${suffix}.`;

  const fieldNames = ["Minute", "Hour", "Day of month", "Month", "Day of week"];
  const details = values.map((value, index) => explainCronField(value, fieldNames[index])).join("; ");
  return `${details}${suffix}.`;
}

function inferErrorField(message: string) {
  const names = ["second", "minute", "hour", "day of month", "month", "day of week"];
  return names.find((name) => message.toLowerCase().includes(name));
}

function assertTimeZone(timezone: CronTimeZone) {
  if (timezone === "local") return;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error("Choose a valid IANA timezone.");
  }
}

export function relativeTime(target: Date, now: Date) {
  const milliseconds = target.getTime() - now.getTime();
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `in ${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function formatInTimeZone(date: Date, timezone: CronTimeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    ...(timezone === "local" ? {} : { timeZone: timezone }),
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

function enumerateMatchingRuns(job: Cron, count: number, now: Date) {
  const dates: Date[] = [];
  let cursor = now;
  const maxAttempts = Math.max(40, count * 8);
  for (let attempt = 0; attempt < maxAttempts && dates.length < count; attempt += 1) {
    const next = job.nextRun(cursor);
    if (!next) break;
    cursor = next;
    if (job.match(next)) dates.push(next);
  }
  return dates;
}

export function analyzeCron(
  expression: string,
  mode: CronSyntaxMode,
  timezone: CronTimeZone = "local",
  now = new Date(),
  runCount = DEFAULT_NEXT_RUNS,
): CronResult {
  const normalizedInput = normalizeInput(expression);
  if (!normalizedInput) return { ok: false, expression, message: "Enter a cron expression to continue." };

  let job: Cron | null = null;
  try {
    assertTimeZone(timezone);
    const normalizedExpression = resolveMacro(normalizedInput, mode);
    const parts = normalizedExpression.split(" ");
    assertPortableSyntax(parts, mode);
    job = new Cron(normalizedExpression, {
      paused: true,
      timezone: timezone === "local" ? undefined : timezone,
      mode: mode === "five" ? "5-part" : "6-part",
      domAndDow: false,
      sloppyRanges: false,
    });
    const count = Math.max(1, Math.min(MAX_NEXT_RUNS, Math.floor(runCount)));
    const dates = enumerateMatchingRuns(job, count, now);
    const fieldNames = mode === "five"
      ? ["Minute", "Hour", "Day of month", "Month", "Day of week"]
      : ["Second", "Minute", "Hour", "Day of month", "Month", "Day of week"];
    return {
      ok: true,
      expression: normalizedInput,
      normalizedExpression,
      syntaxLabel: mode === "five" ? "Standard 5 fields" : "With seconds 6 fields",
      summary: describeCron(parts, mode),
      fields: parts.map((value, index) => ({ name: fieldNames[index], value, meaning: explainCronField(value, fieldNames[index]) })),
      runs: dates.map((date) => ({
        date,
        local: formatInTimeZone(date, timezone),
        utc: date.toUTCString(),
        iso: date.toISOString(),
        relative: relativeTime(date, now),
      })),
      timezoneLabel: timezone === "local" ? "Browser local timezone" : timezone,
      dstWarning: timezone === "UTC" ? null : "IANA timezone rules apply. Times in DST gaps are skipped; overlaps run once at the first occurrence.",
    };
  } catch (caught) {
    const raw = caught instanceof Error ? caught.message : "The cron expression is not valid.";
    const message = raw.replace(/^CronPattern: /, "");
    return { ok: false, expression, message, field: inferErrorField(message) };
  } finally {
    job?.stop();
  }
}

export type CronBuilder = {
  second: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};

export const defaultCronBuilder: CronBuilder = {
  second: "0",
  minute: "*/5",
  hour: "*",
  dayOfMonth: "*",
  month: "*",
  dayOfWeek: "*",
};

export function buildCronExpression(builder: CronBuilder, mode: CronSyntaxMode) {
  const standard = [builder.minute, builder.hour, builder.dayOfMonth, builder.month, builder.dayOfWeek];
  return (mode === "six" ? [builder.second, ...standard] : standard).join(" ");
}

export function cronDownloadText(result: CronAnalysis) {
  const rows = [
    `Cron expression: ${result.expression}`,
    `Syntax: ${result.syntaxLabel}`,
    `Timezone: ${result.timezoneLabel}`,
    `Description: ${result.summary}`,
    "",
    "Next runs:",
    ...result.runs.map((run, index) => `${index + 1}. ${run.local} | ${run.iso}`),
  ];
  return rows.join("\n");
}
