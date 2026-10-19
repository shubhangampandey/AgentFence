import { test, expect } from "@playwright/test";
test("compiled frontend renders the authenticated workspace and lazy decision graph", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Enter as security operator" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  await page.goto("http://localhost:4173/app/overview");
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  await expect(page.getByText("Invalid Date", { exact: true })).toHaveCount(0);
  await expect(page.locator("#main > div")).toHaveCSS("opacity", "1");
  if (!isMobile)
    await page.screenshot({ path: "docs/screenshots/overview-production.png" });
  await page.locator(".row-link").first().click();
  await page.getByRole("button", { name: "Show decision graph" }).click();
  await expect(page.locator(".react-flow")).toBeVisible();
  expect(errors).toEqual([]);
});
