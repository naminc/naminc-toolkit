import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("home lists and filters tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Small tools for exact work." })).toBeVisible();
  const search = page.getByRole("textbox", { name: "Search developer tools" });
  await expect(search).toBeEditable();
  await search.fill("JWT");
  await expect(page.getByRole("link", { name: /JWT Decoder/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /JSON Formatter/ })).toBeHidden();
});

test("formats JSON", async ({ page }) => {
  await page.goto("/tools/json-formatter");
  const input = page.getByLabel("JSON input");
  await expect(input).toBeEditable();
  await input.fill('{"name":"Naminc"}');
  await page.getByRole("button", { name: "Format" }).click();
  await expect(page.getByLabel("JSON result")).toHaveValue('{\n  "name": "Naminc"\n}');
  await expect(page.getByText("Valid JSON, formatted successfully.")).toBeVisible();
});

test("decodes a JWT", async ({ page }) => {
  await page.goto("/tools/jwt-decoder");
  await page.getByRole("button", { name: "Use example" }).click();
  await expect(page.getByText('"name": "Naminc"')).toBeVisible();
  await expect(page.getByText(/does not verify the token signature/i)).toBeVisible();
});

test("converts a Unix timestamp", async ({ page }) => {
  await page.goto("/tools/timestamp-converter");
  await page.getByLabel("Unix timestamp (seconds)").fill("0");
  await page.getByRole("button", { name: "Convert" }).click();
  await expect(page.locator(".value-list code").filter({ hasText: "1970-01-01T00:00:00.000Z" })).toBeVisible();
});

test("tool pages expose privacy and SEO content", async ({ page }) => {
  await page.goto("/tools/base64");
  await expect(page.getByRole("heading", { level: 1, name: "Base64 Encoder & Decoder", exact: true })).toBeVisible();
  await expect(page.getByText("Local processing. Your data stays in this browser.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Common questions" })).toBeVisible();
});

test.describe("TOTP generator", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/tools/totp-generator");
  });

  test("loads with metadata and generates a sample code", async ({ page }) => {
    await expect(page).toHaveTitle(/TOTP Generator/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://naminc.tech/tools/totp-generator");
    await page.getByRole("button", { name: "Use example" }).click();
    await page.getByRole("button", { name: "Generate codes" }).click();
    await expect(page.getByLabel("Code for Account 1", { exact: true })).toContainText(/^\d{3} \d{3}$/);
    await expect(page.getByText("Your secrets are processed locally and never leave your browser.")).toBeVisible();
  });

  test("keeps valid rows when another line is invalid", async ({ page }) => {
    await page.getByLabel("TOTP secrets").fill("JBSWY3DPEHPK3PXP\nNOT-BASE32!");
    await page.getByRole("button", { name: "Generate codes" }).click();
    await expect(page.getByLabel("Code for Account 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Line 2")).toBeVisible();
    await expect(page.getByText(/outside the Base32 alphabet/)).toBeVisible();
  });

  test("copies codes without secrets and clears sensitive input", async ({ page }) => {
    const secret = "JBSWY3DPEHPK3PXP";
    await page.getByLabel("TOTP secrets").fill(`Demo: ${secret}`);
    await page.getByRole("button", { name: "Generate codes" }).click();
    await page.getByRole("button", { name: "Copy code for Demo" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\d{6}$/);
    await page.getByRole("button", { name: "Copy all" }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^Demo \| \d{6}$/);
    expect(copied).not.toContain(secret);
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByLabel("TOTP secrets")).toHaveValue("");
    await expect(page.getByText("0 valid")).toBeVisible();
  });

  test("parses otpauth settings and supports keyboard focus", async ({ page }) => {
    await page.getByLabel("TOTP secrets").fill("otpauth://totp/Naminc:demo?secret=JBSWY3DPEHPK3PXP&issuer=Naminc&algorithm=SHA256&digits=8&period=60");
    await page.getByRole("button", { name: "Generate codes" }).click();
    await expect(page.getByLabel("Code for demo", { exact: true })).toContainText(/^\d{4} \d{4}$/);
    await expect(page.locator(".totp-account span", { hasText: "Naminc" })).toBeVisible();
    await page.getByLabel("TOTP secrets").focus();
    await expect(page.getByLabel("TOTP secrets")).toBeFocused();
  });

  test("fits mobile and both themes without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Use example" }).click();
    await page.getByRole("button", { name: "Generate codes" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("button", { name: /theme/i }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe("API Client", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/tools/api-client");
  });

  test("loads SEO metadata and sends a GET request with duplicate-safe params", async ({ page }) => {
    await page.route("https://api.naminc.test/items?limit=2", async (route) => {
      await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "x-request-id", "content-type": "application/json", "x-request-id": "req-47" }, body: JSON.stringify({ items: ["alpha", "beta"] }) });
    });
    await expect(page).toHaveTitle("API Client & HTTP Request Tester | Naminc Tech Tools");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://naminc.tech/tools/api-client");
    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/items");
    await page.getByLabel("Parameter 1").fill("limit");
    await page.getByLabel("Value 1").fill("2");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("200 OK")).toBeVisible();
    await expect(page.locator(".api-response-content")).toContainText('"alpha"');
    await page.getByRole("tab", { name: "Headers", exact: true }).last().click();
    await expect(page.locator(".api-response-content")).toContainText("x-request-id: req-47");
  });

  test("sends POST JSON with headers and switches Pretty and Raw views", async ({ page }) => {
    let postedBody = "";
    let traceHeader = "";
    await page.route("https://api.naminc.test/items?source=browser", async (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type,x-trace" } });
        return;
      }
      postedBody = request.postData() ?? "";
      traceHeader = request.headers()["x-trace"] ?? "";
      await route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: '{"created":true}' });
    });
    await page.getByLabel("HTTP method").selectOption("POST");
    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/items");
    await page.getByLabel("Parameter 1").fill("source");
    await page.getByLabel("Value 1").fill("browser");
    await page.getByRole("tab", { name: "Headers", exact: true }).first().click();
    await page.getByLabel("Header 1").fill("X-Trace");
    await page.getByLabel("Value 1").fill("naminc-e2e");
    await page.getByRole("tab", { name: "Body", exact: true }).first().click();
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await page.getByRole("textbox", { name: "Request body", exact: true }).fill('{"name":"Naminc"}');
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("201 Created")).toBeVisible();
    expect(postedBody).toBe('{"name":"Naminc"}');
    expect(traceHeader).toBe("naminc-e2e");
    await expect(page.locator(".api-response-content")).toContainText('"created": true');
    await page.getByRole("button", { name: "Raw", exact: true }).click();
    await expect(page.locator(".api-response-content")).toHaveText('{"created":true}');
  });

  test("switches to opt-in Proxy mode and displays a mocked proxy response", async ({ page }) => {
    let proxyPayload: Record<string, unknown> = {};
    await page.route("**/api/http-proxy", async (route) => {
      proxyPayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json", "x-proxy-test": "visible" },
          contentType: "application/json",
          body: '{"proxied":true}',
          bodyEncoding: "text",
          responseTimeMs: 47,
          responseSize: 16,
          redirects: [{ status: 302, url: "https://api.naminc.test/final" }],
        }),
      });
    });
    await expect(page.getByText("Requests are sent directly from your browser to the target endpoint. CORS rules apply.")).toBeVisible();
    await page.getByRole("button", { name: "Proxy", exact: true }).click();
    await expect(page.getByText("Proxy mode sends the request through Naminc infrastructure. Do not use production credentials unless you trust this service.")).toBeVisible();
    await expect(page.getByText("Requests are sent directly from your browser to the target endpoint. CORS rules apply.")).toHaveCount(0);
    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/data");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("200 OK")).toBeVisible();
    await expect(page.locator(".api-response-content")).toContainText('"proxied": true');
    await expect(page.getByText("1 redirect", { exact: true })).toBeVisible();
    expect(proxyPayload).toMatchObject({ url: "https://api.naminc.test/data", method: "GET", body: null, timeoutMs: 15000 });
  });

  test("suggests Proxy mode after a Browser network failure without resending", async ({ page }) => {
    let proxyRequests = 0;
    await page.route("https://api.naminc.test/cors-blocked", async (route) => route.abort("failed"));
    await page.route("**/api/http-proxy", async (route) => {
      proxyRequests += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });

    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/cors-blocked");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("If the target does not allow browser CORS, you can try Proxy mode.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Switch to Proxy" }).click();

    await expect(page.getByRole("button", { name: "Proxy", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("https://api.naminc.test/cors-blocked");
    await expect(page.getByText("Proxy mode sends the request through Naminc infrastructure. Do not use production credentials unless you trust this service.")).toBeVisible();
    expect(proxyRequests).toBe(0);
  });

  test("shows blocked, rate-limit, and timeout proxy errors without clearing the request", async ({ page }) => {
    const errors = [
      { status: 403, code: "BLOCKED_TARGET", message: "Blocked." },
      { status: 429, code: "RATE_LIMITED", message: "Limited." },
      { status: 504, code: "TIMEOUT", message: "Timed out." },
    ];
    let requestIndex = 0;
    await page.route("**/api/http-proxy", async (route) => {
      const current = errors[requestIndex];
      requestIndex += 1;
      await route.fulfill({ status: current.status, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: current.code, message: current.message } }) });
    });
    await page.getByRole("button", { name: "Proxy", exact: true }).click();
    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/private-check");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Target blocked")).toBeVisible();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Rate limit reached")).toBeVisible();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Request timed out")).toBeVisible();
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("https://api.naminc.test/private-check");
  });

  test("copies and downloads a response without rendering HTML", async ({ page }) => {
    await page.route("https://api.naminc.test/html", async (route) => route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "text/html" }, body: "<script>window.__unsafe = true</script><h1>Text only</h1>" }));
    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/html");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".api-response-content")).toContainText("<script>");
    expect(await page.evaluate(() => (window as typeof window & { __unsafe?: boolean }).__unsafe)).toBeUndefined();
    await page.getByRole("button", { name: "Copy response body" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("<h1>Text only</h1>");
    await expect(page.getByRole("button", { name: "Download response body" })).toBeEnabled();
  });

  test("cancels requests and reports timeout separately", async ({ page }) => {
    await page.route("https://api.naminc.test/slow", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: "late" }).catch(() => undefined);
    });
    await page.getByLabel("Endpoint URL").fill("https://api.naminc.test/slow");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Request canceled.")).toBeVisible();
    await page.getByLabel("Request timeout in seconds").fill("1");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Request timed out before the endpoint responded.")).toBeVisible({ timeout: 4000 });
  });

  test("imports cURL, generates code, and clears credentials from memory", async ({ page }) => {
    await page.getByText("Import cURL", { exact: true }).click();
    await page.getByLabel("cURL command").fill("curl -X POST 'https://api.naminc.test/items' -H 'Content-Type: application/json' -H 'Authorization: Bearer test-token' -d '{\"ok\":true}'");
    await page.getByRole("button", { name: "Import request" }).click();
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("https://api.naminc.test/items");
    await expect(page.getByLabel("HTTP method")).toHaveValue("POST");
    await page.getByText("Generate code", { exact: true }).click();
    await expect(page.locator(".api-code-output")).toContainText("test-token");
    await page.getByRole("button", { name: "Node.js", exact: true }).click();
    await expect(page.locator(".api-code-output")).toContainText("AbortController");
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("");
    await page.reload();
    await expect(page.getByLabel("Endpoint URL")).toHaveValue("");
    await expect(page.locator("body")).not.toContainText("test-token");
  });

  test("supports keyboard focus, themes, and mobile width without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Endpoint URL").focus();
    await expect(page.getByLabel("Endpoint URL")).toBeFocused();
    await page.getByRole("button", { name: "Proxy", exact: true }).click();
    await expect(page.getByText("Proxy mode sends the request through Naminc infrastructure. Do not use production credentials unless you trust this service.", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("Color Converter", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/tools/color-converter");
  });

  test("loads metadata and converts typed color formats", async ({ page }) => {
    await expect(page).toHaveTitle("Color Converter & Picker | Naminc Tech Tools");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://naminc.tech/tools/color-converter");
    const input = page.getByLabel("Color value");
    await input.fill("#0099ff80");
    await input.press("Enter");
    await expect(page.locator(".color-value-row", { hasText: "RGB" })).toContainText("rgba(0, 153, 255, 0.502)");
    await expect(page.locator(".color-value-row", { hasText: "HSL" })).toContainText("hsla(204, 100%, 50%, 0.502)");

    await input.fill("rgb(255 0 0 / 25%)");
    await input.press("Enter");
    await expect(page.locator(".color-value-row", { hasText: "HEX with alpha" })).toContainText("#FF000040");
    await input.fill("rgb(300, 0, 0)");
    await expect(page.locator(".color-inline-error")).toContainText("Red must be between 0 and 255");
  });

  test("updates controls, copies output, checks contrast, and swaps colors", async ({ page }) => {
    await page.getByLabel("Native color picker").fill("#000000");
    await page.getByLabel("Alpha value").fill("50");
    await page.getByLabel("Alpha value").blur();
    await expect(page.locator(".color-value-row", { hasText: "HEX with alpha" })).toContainText("#00000080");
    await page.getByRole("button", { name: "Copy HEX with alpha" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("#00000080");

    await page.getByLabel("Contrast background").fill("#FFFFFF");
    await expect(page.locator(".contrast-score strong")).toContainText(":1");
    await expect(page.getByText("AA large", { exact: true }).locator(".." )).toContainText("Pass");
    await page.getByRole("button", { name: "Swap foreground and background" }).click();
    await expect(page.getByLabel("Contrast foreground")).toHaveValue("#FFFFFFFF");
  });

  test("samples a local image, keeps session history, and clears transient data", async ({ page }) => {
    const fixture = readFileSync(new URL("../fixtures/red-pixel.png.base64", import.meta.url), "utf8").trim();
    await page.getByRole("button", { name: "Pick from image" }).click();
    await page.getByLabel("Upload image").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: Buffer.from(fixture, "base64") });
    const canvas = page.getByLabel(/Image color sampling canvas/);
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 1, y: 1 } });
    await expect(page.getByText("#FF0000FF", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select #FF0000FF" })).toBeVisible();
    await canvas.press("ArrowRight");
    await expect(page.getByLabel("Image X coordinate")).toHaveValue("1");
    await page.getByRole("button", { name: "Remove image" }).click();
    await expect(canvas).toBeHidden();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByText("No colors selected in this session.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No colors selected in this session.")).toBeVisible();
    await expect(page.getByLabel("Color value")).toHaveValue("#426A9E");
  });

  test("supports keyboard focus, mobile width, and dark theme without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Color value").focus();
    await expect(page.getByLabel("Color value")).toBeFocused();
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("YAML and JSON Converter", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/tools/yaml-json-converter");
  });

  test("loads metadata and auto converts YAML including multiple documents", async ({ page }) => {
    await expect(page).toHaveTitle("YAML to JSON Converter & Formatter | Naminc Tech Tools");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://naminc.tech/tools/yaml-json-converter");
    await page.getByLabel("YAML input").fill("name: first\n---\nname: second\n");
    await expect(page.getByRole("textbox", { name: "JSON output", exact: true })).toHaveValue(/"name": "first"/);
    await expect(page.getByRole("textbox", { name: "JSON output", exact: true })).toHaveValue(/"name": "second"/);
    await expect(page.getByLabel("Conversion statistics")).toContainText("2 documents");
    await expect(page.getByText("Converted 2 YAML documents to JSON.")).toBeVisible();
  });

  test("converts JSON to YAML and swaps only a valid result", async ({ page }) => {
    await page.getByRole("button", { name: "JSON to YAML" }).click();
    await page.getByLabel("JSON input").fill('{"name":"Naminc","active":true}');
    await expect(page.getByRole("textbox", { name: "YAML output", exact: true })).toHaveValue(/name: Naminc/);
    await page.getByRole("button", { name: "Swap" }).click();
    await expect(page.getByRole("button", { name: "YAML to JSON" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "YAML input", exact: true })).toHaveValue(/name: Naminc/);
    await expect(page.getByRole("textbox", { name: "JSON output", exact: true })).toHaveValue(/"active":true/);
  });

  test("reports YAML and JSON errors with location in manual mode", async ({ page }) => {
    await page.getByText("Advanced settings", { exact: true }).click();
    await page.getByLabel("Auto convert").uncheck();
    await page.getByText("Advanced settings", { exact: true }).click();
    await page.getByLabel("YAML input").fill("name: one\nname: two\n");
    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.locator(".status-error")).toContainText("keys must be unique");
    await expect(page.locator(".status-error")).toContainText("Line 2, column 1");

    await page.getByRole("button", { name: "JSON to YAML" }).click();
    await page.getByLabel("JSON input").fill('{\n  "name": "Naminc",\n  broken\n}');
    await page.getByRole("button", { name: "Convert" }).click();
    await expect(page.locator(".status-error")).toContainText("Line 3");
    await expect(page.getByRole("textbox", { name: "YAML output", exact: true })).toHaveValue("");
  });

  test("uploads both formats, copies output, and downloads the correct extension", async ({ page }) => {
    const yamlFixture = readFileSync(new URL("../fixtures/sample.yaml", import.meta.url));
    const jsonFixture = readFileSync(new URL("../fixtures/sample.json", import.meta.url));
    const upload = page.getByLabel("Open YAML or JSON file");
    await upload.setInputFiles({ name: "sample.yaml", mimeType: "application/yaml", buffer: yamlFixture });
    await expect(page.getByRole("textbox", { name: "JSON output", exact: true })).toHaveValue(/"name": "naminc.tech"/);
    await page.getByRole("button", { name: "Copy JSON" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"naminc.tech"');
    const jsonDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect((await jsonDownload).suggestedFilename()).toBe("converted.json");

    await upload.setInputFiles({ name: "sample.json", mimeType: "application/json", buffer: jsonFixture });
    await expect(page.getByRole("button", { name: "JSON to YAML" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "YAML output", exact: true })).toHaveValue(/name: naminc.tech/);
    const yamlDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect((await yamlDownload).suggestedFilename()).toBe("converted.yaml");
  });

  test("formats comments, applies settings, clears memory, and fits both themes", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.getByLabel("YAML input").fill("# keep this\nroot:\n  child: value\n");
    await page.getByRole("button", { name: "Format input" }).click();
    await expect(page.getByRole("textbox", { name: "YAML input", exact: true })).toHaveValue(/# keep this/);
    await page.getByText("Advanced settings", { exact: true }).click();
    await page.getByLabel("JSON indentation").selectOption("4");
    await expect(page.getByRole("textbox", { name: "JSON output", exact: true })).toHaveValue(/\n    "root"/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("YAML input").focus();
    await expect(page.getByLabel("YAML input")).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByLabel("YAML input")).toHaveValue("");
    await page.getByRole("button", { name: "Use example" }).click();
    await expect(page.getByRole("textbox", { name: "YAML input", exact: true })).toHaveValue(/naminc\.tech/);
    await page.reload();
    await expect(page.getByLabel("YAML input")).toHaveValue("");
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("Cron Expression Parser", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/tools/cron-expression-parser");
  });

  test("loads metadata and parses a weekday schedule with ten runs", async ({ page }) => {
    await expect(page).toHaveTitle("Cron Expression Generator & Parser | Naminc Tech Tools");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://naminc.tech/tools/cron-expression-parser");
    await page.getByRole("textbox", { name: "Cron expression", exact: true }).fill("*/15 9-17 * * 1-5");
    await expect(page.getByText("Every 15 minutes, from 09:00 through 17:59, Monday through Friday.")).toBeVisible();
    await expect(page.locator(".cron-field-row")).toHaveCount(6);
    await expect(page.locator(".cron-run-row")).toHaveCount(10);
    await expect(page.getByLabel("Next runs")).toContainText("GMT");
  });

  test("reports invalid fields and requires explicit six-field mode", async ({ page }) => {
    await page.getByRole("textbox", { name: "Cron expression", exact: true }).fill("0 * * * * *");
    await page.locator(".cron-expression-bar").getByRole("button", { name: "Parse", exact: true }).click();
    await expect(page.locator(".status-error")).toContainText("Expected 5 fields but received 6.");
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toHaveValue("0 * * * * *");

    await page.getByRole("button", { name: "With seconds 6 fields" }).click();
    await expect(page.getByText("Expression parsed successfully.")).toBeVisible();
    await expect(page.locator(".cron-section-heading small")).toHaveText("With seconds 6 fields");
    await page.getByRole("textbox", { name: "Cron expression", exact: true }).fill("61 * * * * *");
    await page.locator(".cron-expression-bar").getByRole("button", { name: "Parse", exact: true }).click();
    await expect(page.getByLabel("Cron interpretation")).toContainText("Invalid expression");
  });

  test("builds presets and recalculates for an IANA timezone", async ({ page }) => {
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByLabel("Cron preset").selectOption({ label: "Every weekday at 09:00" });
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toHaveValue("0 9 * * 1-5");
    await page.getByLabel("Minute").selectOption("*/15");
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toHaveValue("*/15 9 * * 1-5");
    await page.getByLabel("Timezone").selectOption("Asia/Ho_Chi_Minh");
    await expect(page.locator(".cron-run-row")).toHaveCount(10);
    await expect(page.getByLabel("Next runs")).toContainText("Asia/Ho_Chi_Minh");
    await expect(page.getByText(/DST gaps are skipped/)).toBeVisible();
  });

  test("copies, downloads, clears memory, and fits mobile dark mode", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.getByRole("button", { name: "Use example" }).click();
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toHaveValue("*/15 9-17 * * 1-5");
    await page.getByRole("button", { name: "Copy expression" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("*/15 9-17 * * 1-5");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("cron-schedule.txt");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("textbox", { name: "Cron expression", exact: true }).focus();
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toHaveValue("");
    await page.getByRole("textbox", { name: "Cron expression", exact: true }).fill("@hourly");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Cron expression", exact: true })).toHaveValue("");
    expect(consoleErrors).toEqual([]);
  });
});
