# Naminc Tech Tools

Free, focused developer utilities with local-first processing and explicit network boundaries.

**Live site:** [naminc.tech](https://naminc.tech)

Naminc Tech Tools is a collection of practical tools for developers and IT professionals. Each tool has a dedicated, indexable page with useful documentation, examples, related tools, and structured metadata.

## Tools

| Category | Tool | What it does |
| --- | --- | --- |
| Developer | [API Client](https://naminc.tech/tools/api-client) | Send direct browser requests or use the protected opt-in HTTP proxy. |
| Developer | [Color Converter](https://naminc.tech/tools/color-converter) | Convert HEX, RGB, HSL, and OKLCH, check contrast, or sample a local image. |
| Data | [JSON Formatter](https://naminc.tech/tools/json-formatter) | Format, minify, validate, upload, and download JSON. |
| Security | [JWT Decoder](https://naminc.tech/tools/jwt-decoder) | Inspect JWT headers, claims, and readable time fields without verifying the signature. |
| Security | [TOTP Generator](https://naminc.tech/tools/totp-generator) | Generate RFC 6238 authenticator codes from Base32 secrets or `otpauth://` URIs. |
| Encoding | [Base64 Encoder & Decoder](https://naminc.tech/tools/base64) | Encode and decode UTF-8 text or local files. |
| Data | [Unix Timestamp Converter](https://naminc.tech/tools/timestamp-converter) | Convert Unix seconds, milliseconds, local dates, UTC, and ISO 8601 values. |
| Developer | [UUID v4 Generator](https://naminc.tech/tools/uuid-generator) | Generate one or many cryptographically random UUIDs. |
| Encoding | [URL Encoder & Decoder](https://naminc.tech/tools/url-encoder) | Encode and decode URL components. |
| Security | [Hash Generator](https://naminc.tech/tools/hash-generator) | Generate SHA-256, SHA-384, and SHA-512 digests with Web Crypto. |
| Developer | [Regular Expression Tester](https://naminc.tech/tools/regex-tester) | Test JavaScript regular expressions, matches, and capture groups. |

## Principles

- **Private by default:** tool inputs are processed in the browser whenever possible.
- **No tracking by default:** the project does not include analytics, advertising, or cookie tracking.
- **No sensitive persistence:** tokens, secrets, and tool inputs are not written to browser storage.
- **Fast and indexable:** suitable pages are statically generated with route-specific metadata.
- **Accessible:** keyboard navigation, visible focus states, semantic status messages, and responsive layouts are part of the UI.
- **Useful content:** every tool includes instructions, examples, FAQs, and related links instead of a thin utility page.

Local processing protects data from being submitted to this application. It cannot protect data from a compromised browser, an untrusted device, or a malicious browser extension. Treat JWTs and TOTP secrets as credentials.

## Tech Stack

- [Next.js](https://nextjs.org/) with App Router
- TypeScript
- Tailwind CSS v4
- React 19
- Geist Sans and Geist Mono
- Lucide Icons
- MDX for technical notes
- Vitest for unit tests
- Playwright for browser tests

## Getting Started

### Requirements

- Node.js 20 or newer
- npm

### Install and run

From the repository root:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local development uses an in-memory proxy rate limiter. Production fails closed until durable rate limiting is configured.

### Proxy mode environment

Copy the variable names from `.env.example` into Vercel Project Settings. Do not commit real values.

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | REST URL for the shared Upstash Redis database. |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only token for the Upstash Redis database. |
| `PROXY_RATE_LIMIT_SALT` | Long random secret used to HMAC client IPs before rate-limit storage. |

Proxy mode allows 20 requests per minute for each hashed client IP. It returns `503` in production if Redis or the salt is unavailable. Browser mode continues to work without these variables.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Create an optimized production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint with Next.js rules. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run all Vitest unit tests once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:e2e` | Build the site and run Playwright tests on desktop and mobile projects. |

Install the Chromium browser used by Playwright before the first E2E run:

```bash
npx playwright install chromium
```

Run the complete verification sequence with:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Project Structure

```text
app/
  api/http-proxy/        Node.js Route Handler for protected Proxy mode
  notes/                 MDX technical notes and notes index
  tools/[slug]/          Shared statically generated tool route
  layout.tsx             Global metadata, navigation, and WebSite schema
  robots.ts              Generated robots.txt
  sitemap.ts             Generated sitemap.xml
components/
  tools/                 Interactive client-side tool workspaces
  tool-workspace.tsx     Maps registry slugs to tool components
  tool-ui.tsx            Shared controls and status components
lib/
  site.ts                Brand, domain, and entity configuration
  tools.ts               Central tool registry and SEO content
  tool-utils.ts          Shared conversion logic
  api-client.ts          Browser HTTP request, cURL, and code generation logic
  http-proxy-types.ts    Shared proxy request and response contracts
  server/                SSRF validation, pinned transport, rate limiting, and handler
  totp.ts                Base32, otpauth, and RFC 6238 implementation
tests/
  unit/                  Vitest conversion and RFC test vectors
  e2e/                   Playwright workflows for desktop and mobile
```

## Adding a Tool

The central registry in [`lib/tools.ts`](./lib/tools.ts) drives the directory, search, metadata, sitemap, FAQs, examples, and related-tool navigation.

1. Add a complete tool definition to `lib/tools.ts`.
2. Create the interactive client component in `components/tools/`.
3. Register the component in `components/tool-workspace.tsx`.
4. Add its Lucide icon to `components/icons.tsx` if the icon is not already registered.
5. Keep reusable conversion logic in `lib/` so it can be unit tested without rendering React.
6. Add Vitest coverage for important transformations and Playwright coverage for the primary workflow.
7. Run lint, typecheck, unit tests, E2E tests, and the production build.

Do not send tool input to a server unless the feature explicitly requires it and the privacy documentation is updated accordingly.

## Technical Notes

Articles live under `app/notes/` as MDX routes. The current notes cover:

- [How to read a Unix timestamp](https://naminc.tech/notes/how-to-read-unix-timestamps)
- [JWT decoding vs. verification](https://naminc.tech/notes/jwt-decoding-vs-verification)

Each article can include route metadata, a table of contents, reading time, code examples, and links to relevant tools.

## SEO

The project includes:

- Route-specific titles and descriptions
- Canonical URLs on `naminc.tech`
- Open Graph and Twitter metadata
- Generated `sitemap.xml` and `robots.txt`
- `WebSite`, `WebApplication`, `BreadcrumbList`, `FAQPage`, and profile structured data where applicable
- Static generation for tool pages and public content
- Internal links generated from the tool registry

Naminc is linked as the same entity across:

- [naminc.tech](https://naminc.tech)
- [naminc.dev](https://naminc.dev)
- [naminc.io](https://naminc.io)

## Deploying to Vercel

The project can be deployed without a `vercel.json` file. Vercel detects Next.js and uses the repository scripts automatically.

### Vercel Dashboard

1. Import the Git repository into Vercel.
2. Keep the framework preset set to **Next.js**.
3. Keep the default install and build commands.
4. Deploy the project.
5. Add `naminc.tech` under **Project Settings > Domains** and configure the requested DNS records.
6. Create an Upstash Redis database and configure the three Proxy mode variables listed above.

### Proxy security model

Proxy mode is opt-in. It accepts only HTTP and HTTPS on ports 80 and 443, rejects URL credentials and obfuscated hosts, resolves and validates every DNS answer, and pins each connection to a validated public IP. Redirects are processed manually and validated again, with a maximum of three hops. Private, loopback, link-local, multicast, reserved, IPv4-mapped private, and cloud metadata addresses are blocked.

Request bodies are limited to 1 MB and responses to 2 MB. The route limits header count and bytes, strips hop-by-hop and forwarding headers, never forwards cookies, never returns `Set-Cookie`, caps execution at 15 seconds, and aborts the upstream socket when the client request is canceled. Authorization may be forwarded to the target but is removed on cross-origin redirects.

The application does not intentionally log target URLs, headers, credentials, or bodies. Vercel, Upstash, network providers, and target APIs may process operational metadata under their own policies.

### Vercel CLI

```bash
npx vercel
```

Use `npx vercel --prod` for a production deployment after the project is linked.

## Brand

Naminc Tech Tools is part of Naminc's web presence. The website uses the `naminc.tech` wordmark and links to [naminc.dev](https://naminc.dev) and [naminc.io](https://naminc.io) for entity consistency.
