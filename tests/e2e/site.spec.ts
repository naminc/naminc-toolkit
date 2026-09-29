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
