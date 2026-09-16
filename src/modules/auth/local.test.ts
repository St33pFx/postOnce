import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createAuth } from "./factory";
import { localLoginAllowed } from "./local";
import { authConfig } from "../../config/auth";
import * as schema from "../../db/schema";

const env = { NODE_ENV: "development", POSTONCE_DEV_LOGIN: "1", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "local-test-secret-at-least-32-characters" };
const headers = new Headers({ host: "localhost:3000", origin: env.BETTER_AUTH_URL });
const pg = new PGlite();
const db = drizzle(pg, { schema });
const auth = createAuth(db as unknown as Parameters<typeof createAuth>[0], authConfig(env));
beforeAll(() => migrate(db, { migrationsFolder: "src/db/migrations" }));
afterAll(() => pg.close());
afterEach(() => vi.unstubAllEnvs());

describe("local Better Auth login", () => {
  it("fails closed outside explicit same-origin loopback development", () => {
    expect(localLoginAllowed(headers, env)).toBe(true);
    for (const override of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, { POSTONCE_DEV_LOGIN: "0" }, { BETTER_AUTH_URL: "https://public.example" }]) {
      expect(localLoginAllowed(headers, { ...env, ...override })).toBe(false);
    }
    for (const origin of ["", "null", "http://localhost:4000", "https://evil.test"]) {
      expect(localLoginAllowed(new Headers({ host: "localhost:3000", origin }), env)).toBe(false);
    }
  });
  it("uses Better Auth signed sessions, reuses identity, and supports logout", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const first = await auth.api.localDevSignIn({ headers, asResponse: true });
    expect(first.status).toBe(200);
    const cookie = first.headers.getSetCookie().find(c => c.startsWith("better-auth.session_token="))!.split(";")[0];
    expect(first.headers.get("set-cookie")).toMatch(/HttpOnly/);
    const loggedIn = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(loggedIn?.user.name).toBe("PostOnce Local Dev");
    const second = await auth.api.localDevSignIn({ headers, asResponse: true });
    expect((await second.json()).userId).toBe(loggedIn?.user.id);
    expect(await db.select().from(schema.user)).toHaveLength(1);
    await auth.api.signOut({ headers: new Headers({ cookie, origin: env.BETTER_AUTH_URL }) });
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
  it("does not expose the server-only endpoint through Better Auth HTTP", async () => {
    const response = await auth.handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/local-dev-sign-in`, { method: "POST", headers }));
    expect(response.status).toBe(404);
  });
});
