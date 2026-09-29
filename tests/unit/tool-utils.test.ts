import { describe, expect, it } from "vitest";
import { dateToTimestamps, decodeBase64, encodeBase64, parseJwt, timestampToDate, transformJson } from "@/lib/tool-utils";

describe("JSON utilities", () => {
  it("formats and minifies valid JSON", () => {
    expect(transformJson('{"name":"Naminc"}', "format")).toEqual({ ok: true, value: '{\n  "name": "Naminc"\n}' });
    expect(transformJson('{ "active": true }', "minify")).toEqual({ ok: true, value: '{"active":true}' });
  });

  it("returns a useful error for invalid JSON", () => {
    const result = transformJson('{"name":}', "format");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(5);
  });
});

describe("Base64 utilities", () => {
  it("round trips UTF-8 text", () => {
    const value = "Naminc tiếng Việt ✓";
    expect(decodeBase64(encodeBase64(value))).toBe(value);
  });
});

describe("JWT utilities", () => {
  it("decodes JSON header and payload", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0IiwibmFtZSI6Ik5hbWluYyJ9.signature";
    expect(parseJwt(token).payload).toMatchObject({ sub: "1234", name: "Naminc" });
  });

  it("requires three token parts", () => {
    expect(() => parseJwt("only.two")).toThrow(/three/);
  });
});

describe("timestamp utilities", () => {
  it("converts seconds and milliseconds to the same instant", () => {
    expect(timestampToDate("1727000000", "seconds").getTime()).toBe(timestampToDate("1727000000000", "milliseconds").getTime());
  });

  it("converts a date to both Unix units", () => {
    expect(dateToTimestamps("1970-01-01T00:00:01.000Z")).toEqual({ seconds: 1, milliseconds: 1000, iso: "1970-01-01T00:00:01.000Z" });
  });
});
