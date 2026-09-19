import { test, expect } from "@playwright/test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection } from "../../src/db/connection";

test.beforeAll(async () => {
  const { db, pool } = createConnection();
  try { await migrate(db, { migrationsFolder: "src/db/migrations" }); }
  finally { await pool.end(); }
});

test("local login emits a real persistent session without Google OAuth", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Iniciar sesión", exact: true }).click();
  const login = page.waitForResponse(r => r.url().endsWith("/api/dev/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Entrar en modo local" }).click();
  const response = await login;
  expect(response.status()).toBe(303);
  await expect(page).toHaveURL(/\/drafts$/);
  const cookiesAfterLogin = await context.cookies();
  const sessionAfterLogin = cookiesAfterLogin.find(c => c.name === "better-auth.session_token");
  expect(sessionAfterLogin).toBeTruthy();
  expect(sessionAfterLogin?.httpOnly).toBe(true);
  expect(sessionAfterLogin?.sameSite).toBe("Lax");
  expect((await page.reload())?.status()).toBe(200);
  expect((await page.goto("/account"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Tu cuenta de PostOnce" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir mis drafts" }).click();
  await expect(page).toHaveURL(/\/drafts$/);
  expect((await context.request.get("/drafts", { maxRedirects: 0 })).status()).toBe(200);
  const cookies = await context.cookies();
  const session = cookies.find(c => c.name === "better-auth.session_token");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  expect(session?.expires).toBeGreaterThan(Date.now() / 1000);
});
