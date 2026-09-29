import { describe, expect, it } from "vitest";
import {
  counterToBytes,
  decodeBase32,
  formatTotpCopy,
  generateTotp,
  getTotpCountdown,
  parseTotpLine,
  type TotpAlgorithm,
  type TotpEntry,
} from "@/lib/totp";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let output = "";
  let buffer = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += ALPHABET[(buffer >> bitCount) & 31];
      buffer &= (1 << bitCount) - 1;
    }
  }
  if (bitCount) output += ALPHABET[(buffer << (5 - bitCount)) & 31];
  return output;
}

function entry(secret: string, algorithm: TotpAlgorithm, period = 30): TotpEntry {
  return { secret: encodeBase32(secret), algorithm, digits: 8, period, label: "RFC test", lineNumber: 1 };
}

describe("Base32 decoding", () => {
  it("decodes lowercase, whitespace, and valid padding", () => {
    expect(new TextDecoder().decode(decodeBase32("mzxw 6ytb oi======"))).toBe("foobar");
  });

  it("rejects invalid characters, lengths, padding, and trailing bits", () => {
    expect(() => decodeBase32("AB10")).toThrow(/alphabet/);
    expect(() => decodeBase32("ABC")).toThrow(/length/);
    expect(() => decodeBase32("MZXW6YTBOI=====")).toThrow(/padding/);
    expect(() => decodeBase32("MZ")).toThrow(/trailing/);
  });
});

describe("TOTP input parsing", () => {
  it("parses a labeled Base32 secret using advanced defaults", () => {
    expect(parseTotpLine("GitHub: jbsw y3dp ehpk 3pxp", 2, { algorithm: "SHA-256", digits: 8, period: 45 })).toMatchObject({
      label: "GitHub",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA-256",
      digits: 8,
      period: 45,
      lineNumber: 2,
    });
  });

  it("parses otpauth parameters and separates issuer from account label", () => {
    const parsed = parseTotpLine("otpauth://totp/Naminc%20Tech:demo%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Naminc%20Tech&algorithm=SHA256&digits=8&period=60", 1);
    expect(parsed).toMatchObject({ issuer: "Naminc Tech", label: "demo@example.com", algorithm: "SHA-256", digits: 8, period: 60 });
  });

  it("rejects HOTP URIs", () => {
    expect(() => parseTotpLine("otpauth://hotp/demo?secret=JBSWY3DPEHPK3PXP&counter=1", 1)).toThrow(/HOTP/);
  });
});

describe("RFC 6238 generation", () => {
  const vectors = [
    { seconds: 59, sha1: "94287082", sha256: "46119246", sha512: "90693936" },
    { seconds: 1111111109, sha1: "07081804", sha256: "68084774", sha512: "25091201" },
    { seconds: 1111111111, sha1: "14050471", sha256: "67062674", sha512: "99943326" },
    { seconds: 1234567890, sha1: "89005924", sha256: "91819424", sha512: "93441116" },
    { seconds: 2000000000, sha1: "69279037", sha256: "90698825", sha512: "38618901" },
    { seconds: 20000000000, sha1: "65353130", sha256: "77737706", sha512: "47863826" },
  ];
  const secrets = {
    "SHA-1": "12345678901234567890",
    "SHA-256": "12345678901234567890123456789012",
    "SHA-512": "1234567890123456789012345678901234567890123456789012345678901234",
  } as const;

  for (const vector of vectors) {
    it(`matches all algorithms at ${vector.seconds}`, async () => {
      await expect(generateTotp(entry(secrets["SHA-1"], "SHA-1"), vector.seconds * 1000)).resolves.toMatchObject({ code: vector.sha1 });
      await expect(generateTotp(entry(secrets["SHA-256"], "SHA-256"), vector.seconds * 1000)).resolves.toMatchObject({ code: vector.sha256 });
      await expect(generateTotp(entry(secrets["SHA-512"], "SHA-512"), vector.seconds * 1000)).resolves.toMatchObject({ code: vector.sha512 });
    });
  }

  it("supports six digits and a custom period", async () => {
    const custom = { ...entry(secrets["SHA-1"], "SHA-1", 60), digits: 6 as const };
    await expect(generateTotp(custom, 59_000)).resolves.toMatchObject({ code: "755224", window: 0 });
  });

  it("serializes an unsigned 64-bit counter in big-endian order", () => {
    expect(Array.from(counterToBytes(BigInt("0x0102030405060708")))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("TOTP presentation helpers", () => {
  it("calculates countdown values around a period boundary", () => {
    expect(getTotpCountdown(29_999, 30)).toMatchObject({ remainingSeconds: 1, window: 0 });
    expect(getTotpCountdown(30_000, 30)).toEqual({ remainingSeconds: 30, progress: 0, window: 1 });
    expect(getTotpCountdown(30_001, 30)).toMatchObject({ remainingSeconds: 30, window: 1 });
  });

  it("formats copy output without including the secret", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const output = formatTotpCopy([{ label: "demo", issuer: "Naminc", algorithm: "SHA-1", digits: 6, period: 30, lineNumber: 1, code: "123456", window: 1 }]);
    expect(output).toBe("Naminc: demo | 123456");
    expect(output).not.toContain(secret);
  });
});
