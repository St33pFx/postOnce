import { test, expect } from "@playwright/test";

test("REQ-UI-008: login has no horizontal overflow on supported mobile width", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("REQ-UI-009: login primary action remains keyboard reachable", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("REQ-UI-010 / REQ-UI-011: reduced motion keeps content immediately available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.getByRole("heading")).toBeVisible();
  await expect(page.locator(".login-card")).toBeVisible();
});
