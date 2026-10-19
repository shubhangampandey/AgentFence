import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel:
    process.env.PLAYWRIGHT_CHANNEL ??
    (process.platform === "win32" ? "chrome" : "chromium"),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:5173/login");
  await page
    .getByRole("button", { name: "Enter as security operator" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible({ timeout: 15000 });
  // Login uses the configured development origin; the production bundle is then inspected through read-only routes.
  await page.goto("http://localhost:4173/app/overview");
  await expect(page.getByRole("heading", { name: "Control starts here." }))
    .toBeVisible({ timeout: 15000 })
    .catch(async (error) => {
      console.error("Production page errors", errors);
      console.error(
        "Visible page",
        (await page.locator("body").innerText()).slice(0, 1000),
      );
      throw error;
    });
  await expect(page.getByText("Invalid Date", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect(page.locator("#main > div")).toHaveCSS("opacity", "1");
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/overview-production.png" });
  console.log(
    "Production frontend bundle: real session, API reads, module execution, and screenshot passed.",
  );
} finally {
  await browser.close();
}
