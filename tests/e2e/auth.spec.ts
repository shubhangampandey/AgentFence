import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../apps/api/src/db.js";

const emails: string[] = [];
test.afterAll(async () => {
  await expect(async () => {
    const users = await db.user.findMany({
      where: { email: { in: emails } },
      include: { memberships: true },
    });
    await db.workspace.deleteMany({
      where: {
        id: {
          in: users.flatMap((user) =>
            user.memberships.map((membership) => membership.workspaceId),
          ),
        },
      },
    });
    await db.user.deleteMany({ where: { email: { in: emails } } });
  }).toPass({ timeout: 25000, intervals: [1500] });
  await db.$disconnect();
});

test("register, keep a session after reload, sign out and sign back in", async ({
  page,
  isMobile,
}) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = "Browser-only-registration-test-2026!";
  emails.push(email);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Browser Registration");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  if (isMobile)
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.locator(".user-control").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(email.toUpperCase());
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Control starts here." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
