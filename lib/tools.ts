export type ToolCategory = "Data" | "Encoding" | "Security" | "Developer";

export type ToolDefinition = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: ToolCategory;
  icon: string;
  keywords: string[];
  relatedTools: string[];
  popular?: boolean;
  howTo: string[];
  example: { input: string; output: string };
  faqs: { question: string; answer: string }[];
  sections?: { title: string; body: string }[];
};

export const tools: ToolDefinition[] = [
  {
    slug: "json-formatter",
    name: "JSON Formatter",
    shortDescription: "Format, minify, and validate JSON with clear errors.",
    description: "Clean up compact JSON, minify formatted data, and catch syntax errors before data reaches your application.",
    category: "Data",
    icon: "Braces",
    keywords: ["json formatter", "json validator", "json minifier"],
    relatedTools: ["jwt-decoder", "base64", "url-encoder"],
    popular: true,
    howTo: ["Paste JSON or open a .json file.", "Choose Format, Minify, or Validate.", "Copy or download the valid result."],
    example: { input: "{\"name\":\"Naminc\",\"active\":true}", output: "{\n  \"name\": \"Naminc\",\n  \"active\": true\n}" },
    faqs: [
      { question: "Does this JSON formatter upload my data?", answer: "No. Parsing, formatting, and file handling run locally in your browser." },
      { question: "What JSON errors can it find?", answer: "It reports standard JSON syntax errors such as missing commas, invalid quotes, and incomplete values." },
    ],
  },
  {
    slug: "jwt-decoder",
    name: "JWT Decoder",
    shortDescription: "Inspect JWT headers, claims, and expiration times locally.",
    description: "Decode the readable parts of a JSON Web Token and inspect common time claims without sending the token to a server.",
    category: "Security",
    icon: "KeyRound",
    keywords: ["jwt decoder", "jwt claims", "token decoder"],
    relatedTools: ["base64", "timestamp-converter", "json-formatter"],
    popular: true,
    howTo: ["Paste a JWT into the input.", "Review its decoded header and payload.", "Check exp and iat timestamps, then verify the signature in your application."],
    example: { input: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0IiwibmFtZSI6Ik5hbWluYyJ9.signature", output: "Header and payload JSON, plus readable time claims when present." },
    faqs: [
      { question: "Does decoding verify a JWT signature?", answer: "No. Decoding only reads Base64URL data. Trust a token only after your server verifies its signature and claims." },
      { question: "Is my token transmitted anywhere?", answer: "No. The token is decoded inside your browser and is never stored by this site." },
    ],
  },
  {
    slug: "totp-generator",
    name: "TOTP Generator",
    shortDescription: "Generate 2FA authenticator codes from Base32 secrets locally.",
    description: "Generate time-based one-time passwords from Base32 secrets or otpauth URIs without sending credentials outside your browser.",
    category: "Security",
    icon: "TimerReset",
    keywords: ["TOTP generator", "2FA code generator", "authenticator code generator", "RFC 6238", "Google Authenticator", "Base32 TOTP"],
    relatedTools: ["hash-generator", "base64", "timestamp-converter"],
    popular: true,
    howTo: ["Enter one Base32 secret or otpauth TOTP URI per line.", "Review any line-specific errors, then generate the current codes.", "Copy individual codes or a labeled list before the current period expires."],
    example: { input: "Naminc demo: JBSWY3DPEHPK3PXP", output: "Naminc demo | 6-digit code that changes every 30 seconds" },
    sections: [
      { title: "How TOTP works", body: "TOTP combines a shared secret with the current time window and signs that counter with HMAC. Both the authenticator and the service can independently calculate the same short-lived code." },
      { title: "TOTP and HOTP", body: "TOTP advances with time, commonly every 30 seconds. HOTP advances with an event counter instead. This tool accepts TOTP entries only and rejects otpauth HOTP URIs." },
      { title: "Protect the shared secret", body: "Anyone who obtains a TOTP secret can generate future codes. Use this tool only on a trusted device, avoid real credentials on shared computers, and clear the page when finished." },
    ],
    faqs: [
      { question: "Does this TOTP generator upload my secret?", answer: "No. Parsing and HMAC generation run locally with the browser Web Crypto API. Secrets are not stored after you leave or reload the page." },
      { question: "Is it compatible with authenticator apps?", answer: "It follows RFC 6238 and supports SHA-1, SHA-256, SHA-512, 6 or 8 digits, and custom periods supplied by compatible otpauth URIs." },
      { question: "Why does my code differ from my authenticator?", answer: "Check the device clock, secret, algorithm, digit count, and period. Even a small clock difference near a period boundary can briefly show a different code." },
      { question: "Can this tool verify that a 2FA code is accepted?", answer: "No. It calculates a code from the supplied secret and time. Only the service that owns the account can verify whether a code is accepted." },
    ],
  },
  {
    slug: "base64",
    name: "Base64 Encoder & Decoder",
    shortDescription: "Encode UTF-8 text or files and decode Base64 safely.",
    description: "Convert Unicode text and local files to Base64, or decode Base64 back into readable UTF-8 text.",
    category: "Encoding",
    icon: "Binary",
    keywords: ["base64 encoder", "base64 decoder", "file base64"],
    relatedTools: ["url-encoder", "jwt-decoder", "hash-generator"],
    popular: true,
    howTo: ["Choose Encode or Decode.", "Enter UTF-8 text, Base64, or select a local file.", "Copy the converted value."],
    example: { input: "Naminc ✓", output: "TmFtaW5jIOKckw==" },
    faqs: [
      { question: "Is Base64 encryption?", answer: "No. Base64 is a reversible encoding and provides no confidentiality." },
      { question: "Does it support Vietnamese text?", answer: "Yes. Text is converted through UTF-8 so Vietnamese and other Unicode characters are preserved." },
    ],
  },
  {
    slug: "timestamp-converter",
    name: "Unix Timestamp Converter",
    shortDescription: "Convert Unix seconds or milliseconds to readable dates.",
    description: "Translate Unix timestamps into local, UTC, and ISO 8601 dates, or turn a date into seconds and milliseconds.",
    category: "Data",
    icon: "Clock3",
    keywords: ["unix timestamp converter", "epoch converter", "iso date"],
    relatedTools: ["jwt-decoder", "json-formatter", "uuid-generator"],
    popular: true,
    howTo: ["Select timestamp or date input.", "Enter a value and choose seconds or milliseconds.", "Read or copy the converted formats."],
    example: { input: "0 seconds", output: "1970-01-01T00:00:00.000Z" },
    faqs: [
      { question: "What is a Unix timestamp?", answer: "It counts elapsed seconds or milliseconds since 1970-01-01 00:00:00 UTC." },
      { question: "Why are local and UTC times different?", answer: "They represent the same instant using different time zones." },
    ],
  },
  {
    slug: "uuid-generator",
    name: "UUID v4 Generator",
    shortDescription: "Generate one or many cryptographically random UUIDs.",
    description: "Create standards-shaped UUID version 4 identifiers using the browser's cryptographically secure random generator.",
    category: "Developer",
    icon: "Fingerprint",
    keywords: ["uuid generator", "uuid v4", "guid generator"],
    relatedTools: ["hash-generator", "json-formatter", "timestamp-converter"],
    howTo: ["Choose how many UUIDs you need.", "Generate a fresh list.", "Copy one identifier or the full list."],
    example: { input: "Generate 1 UUID", output: "f47ac10b-58cc-4372-a567-0e02b2c3d479" },
    faqs: [
      { question: "Are these UUIDs secure?", answer: "They use crypto.randomUUID(), backed by the browser's cryptographically secure random source." },
      { question: "Can two generated UUIDs collide?", answer: "A collision is theoretically possible but extraordinarily unlikely for correctly generated UUID v4 values." },
    ],
  },
  {
    slug: "url-encoder",
    name: "URL Encoder & Decoder",
    shortDescription: "Encode or decode URL components without leaving the page.",
    description: "Escape text for safe use inside a URL component or decode percent-encoded values into readable text.",
    category: "Encoding",
    icon: "Link2",
    keywords: ["url encoder", "url decoder", "percent encoding"],
    relatedTools: ["base64", "json-formatter", "hash-generator"],
    howTo: ["Choose Encode or Decode.", "Paste a value into the input.", "Copy the converted URL component."],
    example: { input: "Naminc tools & notes", output: "Naminc%20tools%20%26%20notes" },
    faqs: [
      { question: "Does this encode a full URL?", answer: "It uses component encoding, which is intended for query values and path segments rather than an entire URL at once." },
      { question: "What does %20 mean?", answer: "%20 is the percent-encoded representation of a space byte in a URL." },
    ],
  },
  {
    slug: "hash-generator",
    name: "Hash Generator",
    shortDescription: "Create SHA-256, SHA-384, or SHA-512 hashes locally.",
    description: "Generate modern SHA-2 digests from UTF-8 text with the Web Crypto API, without uploading the input.",
    category: "Security",
    icon: "ShieldCheck",
    keywords: ["sha256 generator", "hash generator", "sha512"],
    relatedTools: ["base64", "uuid-generator", "url-encoder"],
    howTo: ["Select a SHA-2 algorithm.", "Enter the text to hash.", "Copy the hexadecimal digest."],
    example: { input: "Naminc", output: "A deterministic hexadecimal digest for the chosen algorithm." },
    faqs: [
      { question: "Can a hash be decrypted?", answer: "A cryptographic hash is one-way, but weak or reused inputs may still be guessed with dictionary or brute-force attacks." },
      { question: "Should I hash passwords with SHA-256?", answer: "No. Password storage should use a slow, salted password hashing function such as Argon2id, scrypt, or bcrypt." },
    ],
  },
  {
    slug: "regex-tester",
    name: "Regular Expression Tester",
    shortDescription: "Test JavaScript regex patterns, flags, matches, and groups.",
    description: "Explore JavaScript regular expressions against sample text and inspect matches and capture groups with a bounded execution time.",
    category: "Developer",
    icon: "Regex",
    keywords: ["regex tester", "javascript regex", "regular expression"],
    relatedTools: ["json-formatter", "url-encoder", "base64"],
    howTo: ["Enter a JavaScript regex pattern and flags.", "Paste the text you want to inspect.", "Review highlighted matches and capture groups."],
    example: { input: "Pattern: \\b\\w+@\\w+\\.\\w+\\b", output: "Matches email-like values in the test text." },
    faqs: [
      { question: "Which regex flavor does this use?", answer: "It uses the JavaScript RegExp syntax supported by your browser." },
      { question: "Can a regular expression freeze a page?", answer: "Some patterns cause catastrophic backtracking. This tester runs matching in a worker with a short timeout to reduce that risk." },
    ],
  },
];

export const toolMap = new Map(tools.map((tool) => [tool.slug, tool]));

export const categories: ToolCategory[] = ["Data", "Encoding", "Security", "Developer"];
