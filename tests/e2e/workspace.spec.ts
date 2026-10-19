import { test, expect } from "@playwright/test";
import { db, locked } from "../../apps/api/src/db.js";
import { appendAudit } from "../../apps/api/src/audit.js";
test.beforeEach(async () => {
  await locked("northstar", async (tx) => {
    await tx.resource.update({
      where: { id: "invoice_002" },
      data: {
        version: { increment: 1 },
        data: {
          vendor: "Meridian Cloud",
          amount: 2400,
          currency: "USD",
          status: "OPEN",
          synthetic: true,
        },
      },
    });
    await appendAudit(tx, "northstar", "E2E_FIXTURE_RESET", "browser-test", {
      invoiceId: "invoice_002",
      synthetic: true,
    });
  });
});
test.afterAll(async () => db.$disconnect());
test("public pages, operator gateway, approvals, evidence, and responsive navigation", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every action. Verified." }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/landing-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Enter the demo workspace" }).click();
  await page
    .getByRole("button", { name: "Enter as security operator" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/overview-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
  await expect(page.getByText("Invalid Date", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Open gateway" }).click();
  await expect(
    page.getByRole("heading", { name: "Intent in. Decision out." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Evaluate preview" }).click();
  await expect(page.getByText("Preview only · no execution")).toBeVisible();
  await page.getByRole("button", { name: "Execute request" }).click();
  await expect(page.locator(".result-panel .badge")).toHaveText("executed");
  await page
    .getByLabel("Scenario", { exact: true })
    .selectOption("bulk-export");
  await page.getByRole("button", { name: "Execute request" }).click();
  await expect(page.locator(".result-panel .badge")).toHaveText("denied");
  await page.getByLabel("Scenario", { exact: true }).selectOption("approval");
  await page.getByRole("button", { name: "Execute request" }).click();
  await expect(page.locator(".result-panel .badge")).toHaveText(
    "approval required",
  );
  await page.screenshot({
    path: `test-results/playground-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Investigations", exact: true }).click();
  await page.getByRole("button", { name: "Verify audit chain" }).click();
  await expect(
    page.getByText("Audit chain verified", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Search pages").fill("Agents");
  await expect(page.getByLabel("Search pages")).toBeFocused();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Agents, with boundaries." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Register agent" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const [route, title] of [
    ["policies", "Policy is the authority."],
    ["connectors", "Tools, behind the fence."],
    ["analytics", "Read the signal."],
    ["developer", "One boundary. A clear contract."],
    ["settings", "The controls behind the control plane."],
    ["lab", "Test the boundary."],
    ["approvals", "A second set of eyes."],
  ]) {
    if (isMobile)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page.locator(`nav a[href="/app/${route}"]`).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/login");
  await page.getByRole("button", { name: "Approver access" }).click();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  if (isMobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Approval center", exact: true })
    .click();
  await page.locator(".approval-card").first().click();
  await expect(
    page.getByRole("button", { name: "Approve & execute" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Approve & execute" }).click();
  await expect(page.locator(".approval-review-top .badge")).toHaveText(
    "executed",
  );
  expect(errors).toEqual([]);
});
