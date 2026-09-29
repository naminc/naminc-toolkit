export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export type TotpDefaults = {
  algorithm: TotpAlgorithm;
  digits: 6 | 8;
  period: number;
};

export type TotpEntry = TotpDefaults & {
  label: string;
  issuer?: string;
  secret: string;
  lineNumber: number;
};

export type TotpCode = Omit<TotpEntry, "secret"> & {
  code: string;
  window: number;
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULTS: TotpDefaults = { algorithm: "SHA-1", digits: 6, period: 30 };

export function normalizeBase32(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

export function decodeBase32(value: string): Uint8Array {
  const normalized = normalizeBase32(value);
  if (!normalized) throw new Error("Secret is empty.");
  if (normalized.length > 4096) throw new Error("Secret is too long.");
  if (!/^[A-Z2-7]+=*$/.test(normalized)) throw new Error("Secret contains characters outside the Base32 alphabet.");

  const paddingIndex = normalized.indexOf("=");
  const body = paddingIndex === -1 ? normalized : normalized.slice(0, paddingIndex);
  const padding = paddingIndex === -1 ? "" : normalized.slice(paddingIndex);
  const remainder = body.length % 8;
  const expectedPadding: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };

  if (!(remainder in expectedPadding)) throw new Error("Secret has an invalid Base32 length.");
  if (padding && (normalized.length % 8 !== 0 || padding.length !== expectedPadding[remainder])) {
    throw new Error("Secret has invalid Base32 padding.");
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;
  for (const character of body) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((buffer >> bitCount) & 0xff);
      buffer &= (1 << bitCount) - 1;
    }
  }

  if (bitCount > 0 && buffer !== 0) throw new Error("Secret has non-zero trailing Base32 bits.");
  if (!bytes.length) throw new Error("Secret is too short.");
  return Uint8Array.from(bytes);
}

function parseAlgorithm(value: string | null, fallback: TotpAlgorithm): TotpAlgorithm {
  if (!value) return fallback;
  const normalized = value.toUpperCase().replace("SHA1", "SHA-1").replace("SHA256", "SHA-256").replace("SHA512", "SHA-512");
  if (normalized === "SHA-1" || normalized === "SHA-256" || normalized === "SHA-512") return normalized;
  throw new Error("Algorithm must be SHA-1, SHA-256, or SHA-512.");
}

function parseDigits(value: string | null, fallback: 6 | 8): 6 | 8 {
  if (!value) return fallback;
  if (value === "6" || value === "8") return Number(value) as 6 | 8;
  throw new Error("Digits must be 6 or 8.");
}

function parsePeriod(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const period = Number(value);
  if (!Number.isInteger(period) || period < 1 || period > 300) throw new Error("Period must be an integer from 1 to 300 seconds.");
  return period;
}

export function parseTotpLine(line: string, lineNumber: number, defaults: TotpDefaults = DEFAULTS): TotpEntry {
  const value = line.trim();
  if (!value) throw new Error("Line is empty.");

  if (value.toLowerCase().startsWith("otpauth://")) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("The otpauth URI is malformed.");
    }
    if (url.hostname.toLowerCase() !== "totp") throw new Error("Only otpauth TOTP URIs are supported. HOTP is not accepted.");

    const secret = url.searchParams.get("secret")?.trim() ?? "";
    decodeBase32(secret);
    const rawLabel = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
    const separator = rawLabel.indexOf(":");
    const labelIssuer = separator >= 0 ? rawLabel.slice(0, separator).trim() : "";
    const accountLabel = separator >= 0 ? rawLabel.slice(separator + 1).trim() : rawLabel;
    const issuer = url.searchParams.get("issuer")?.trim() || labelIssuer || undefined;

    return {
      secret: normalizeBase32(secret).replace(/=+$/, ""),
      label: accountLabel || `Account ${lineNumber}`,
      issuer,
      algorithm: parseAlgorithm(url.searchParams.get("algorithm"), defaults.algorithm),
      digits: parseDigits(url.searchParams.get("digits"), defaults.digits),
      period: parsePeriod(url.searchParams.get("period"), defaults.period),
      lineNumber,
    };
  }

  const labeled = value.match(/^([^:]+):\s*([A-Za-z2-7=\s]+)$/);
  const label = labeled?.[1].trim() || `Account ${lineNumber}`;
  const secret = labeled?.[2] ?? value;
  decodeBase32(secret);
  return { ...defaults, label, secret: normalizeBase32(secret).replace(/=+$/, ""), lineNumber };
}

export function counterToBytes(counter: bigint): Uint8Array {
  if (counter < 0n || counter > 0xffffffffffffffffn) throw new Error("Counter must fit in an unsigned 64-bit integer.");
  const bytes = new Uint8Array(8);
  let value = counter;
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

export function dynamicTruncate(hmac: ArrayBuffer | Uint8Array, digits: 6 | 8): string {
  const bytes = hmac instanceof Uint8Array ? hmac : new Uint8Array(hmac);
  const offset = bytes[bytes.length - 1] & 0x0f;
  const binary = ((bytes[offset] & 0x7f) << 24)
    | ((bytes[offset + 1] & 0xff) << 16)
    | ((bytes[offset + 2] & 0xff) << 8)
    | (bytes[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export async function generateTotp(entry: TotpEntry, timestampMs = Date.now()): Promise<TotpCode> {
  const window = Math.floor(timestampMs / 1000 / entry.period);
  const secretBytes = decodeBase32(entry.secret);
  const keyData = secretBytes.buffer.slice(secretBytes.byteOffset, secretBytes.byteOffset + secretBytes.byteLength) as ArrayBuffer;
  const counterBytes = counterToBytes(BigInt(window));
  const counterData = counterBytes.buffer.slice(counterBytes.byteOffset, counterBytes.byteOffset + counterBytes.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: entry.algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, counterData);
  const { secret: _secret, ...publicEntry } = entry;
  void _secret;
  return { ...publicEntry, code: dynamicTruncate(signature, entry.digits), window };
}

export function getTotpCountdown(timestampMs: number, period: number): { remainingSeconds: number; progress: number; window: number } {
  const periodMs = period * 1000;
  const elapsed = ((timestampMs % periodMs) + periodMs) % periodMs;
  return {
    remainingSeconds: Math.ceil((periodMs - elapsed) / 1000),
    progress: elapsed / periodMs,
    window: Math.floor(timestampMs / periodMs),
  };
}

export function formatTotpCopy(codes: TotpCode[]): string {
  return codes.map((item) => `${item.issuer ? `${item.issuer}: ` : ""}${item.label} | ${item.code}`).join("\n");
}
