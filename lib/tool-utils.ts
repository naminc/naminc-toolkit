export type JsonResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function transformJson(input: string, mode: "format" | "minify"): JsonResult {
  try {
    const parsed: unknown = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed, null, mode === "format" ? 2 : 0) };
  } catch (error) {
    return { ok: false, error: describeJsonError(error) };
  }
}

export function describeJsonError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Invalid JSON";
  const position = message.match(/position\s+(\d+)/i)?.[1];
  return position ? `${message} (near character ${Number(position) + 1})` : message;
}

export function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string): string {
  const normalized = value.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function decodeBase64UrlJson(value: string): unknown {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(decodeBase64(padded));
}

export function parseJwt(token: string): { header: unknown; payload: Record<string, unknown> } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("A JWT must contain three dot-separated parts.");
  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("JWT payload must be a JSON object.");
  return { header, payload: payload as Record<string, unknown> };
}

export function timestampToDate(value: string, unit: "seconds" | "milliseconds"): Date {
  if (!value.trim()) throw new Error("Enter a timestamp.");
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error("Timestamp must be a finite number.");
  const date = new Date(unit === "seconds" ? numeric * 1000 : numeric);
  if (Number.isNaN(date.getTime())) throw new Error("Timestamp is outside the supported date range.");
  return date;
}

export function dateToTimestamps(value: string): { seconds: number; milliseconds: number; iso: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time.");
  return { seconds: Math.floor(date.getTime() / 1000), milliseconds: date.getTime(), iso: date.toISOString() };
}
