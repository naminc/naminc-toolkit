import { expect, test } from "@playwright/test";

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
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
