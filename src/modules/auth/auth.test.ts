import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuth } from "./factory";
import { domainUser } from "../users/identity";
import * as schema from "../../db/schema";
import { createHmac } from "node:crypto";
import { authRequest } from "./http";

const pg = new PGlite();
const embedded = drizzle(pg, { schema });
// Both are PostgreSQL dialects; production uses node-postgres and CI checks TCP too.
const db = embedded as unknown as NodePgDatabase<typeof schema>;
const config = { baseURL: "https://postonce.test", secret: "test-only-secret-32-characters-long-123", clientId: "test-client",
  clientSecret: "test-client-secret", secure: true };
const auth = createAuth(db, config);
beforeAll(async () => migrate(embedded, { migrationsFolder: "src/db/migrations" }));
afterAll(async () => pg.close());

describe("real Better Auth with test database", () => {
  it("requests only login scopes with state and rejects untrusted callback/origin", async () => {
    const response = await auth.handler(new Request(`${config.baseURL}/api/auth/sign-in/social`, {
      method: "POST", headers: { "content-type": "application/json", origin: config.baseURL },
      body: JSON.stringify({ provider: "google", callbackURL: `${config.baseURL}/account` }),
    }));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    const redirect = new URL(url);
    expect(redirect.hostname).toBe("accounts.google.com");
    expect(new Set(redirect.searchParams.get("scope")?.split(" "))).toEqual(new Set(["openid", "email", "profile"]));
    expect(redirect.searchParams.get("state")).toBeTruthy();
    expect(redirect.searchParams.get("code_challenge")).toBeTruthy();
    expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
    expect(redirect.searchParams.get("access_type")).toBe("online");
    expect(redirect.searchParams.get("include_granted_scopes")).not.toBe("true");
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    for (const bad of [{ origin: "https://evil.test", callbackURL: `${config.baseURL}/account` },
      { origin: config.baseURL, callbackURL: "https://evil.test/steal" }]) {
      const result = await auth.handler(new Request(`${config.baseURL}/api/auth/sign-in/social`, {
        method: "POST", headers: { "content-type": "application/json", origin: bad.origin, cookie: "csrf-test=1" },
        body: JSON.stringify({ provider: "google", callbackURL: bad.callbackURL }),
      }));
      expect(result.status).toBe(403);
    }
  });
  it("rejects callback with absent/forged state without a token exchange", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await auth.handler(new Request(`${config.baseURL}/api/auth/callback/google?code=forged&state=wrong`));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).not.toContain("/account");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("persists identity across sessions/devices and deletes login grants", async () => {
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser({ name: "Alice", email: "alice@example.test", emailVerified: true }, { method: "oauth", oauth: { providerId: "google" } });
    const a = await domainUser(db, user.id);
    const b = await domainUser(db, user.id);
    expect(a.id).toBe(b.id);
    await context.internalAdapter.createAccount({ providerId: "google", accountId: "google-alice", userId: user.id,
      accessToken: "never-store-access", refreshToken: "never-store-refresh", idToken: "never-store-id" });
    const stored = await embedded.select().from(schema.account);
    expect(stored[0].accessToken).toBeNull(); expect(stored[0].idToken).toBeNull(); expect(stored[0].refreshToken).toBeNull();
    const sessionA = await context.internalAdapter.createSession(user.id);
    const sessionB = await context.internalAdapter.createSession(user.id);
    expect(sessionA.token).not.toBe(sessionB.token);
    expect(sessionA.userId).toBe(sessionB.userId);
  });
  it("rejects unsigned cookies and expired sessions", async () => {
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
    expect(await auth.api.getSession({ headers: new Headers({ cookie: "better-auth.session_token=forged" }) })).toBeNull();
    const context = await auth.$context;
    const user = await context.internalAdapter.findUserByEmail("alice@example.test");
    const session = await context.internalAdapter.createSession(user!.user.id);
    await context.internalAdapter.updateSession(session.token, { expiresAt: new Date(0) });
    const found = await context.internalAdapter.findSession(session.token);
    expect(found?.session.expiresAt.getTime()).toBeLessThan(Date.now());
    const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
    const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
  it("validates signed persistent sessions and logout invalidates the current device only", async () => {
    const context = await auth.$context;
    const user = await context.internalAdapter.findUserByEmail("alice@example.test");
    const session = await context.internalAdapter.createSession(user!.user.id);
    const other = await context.internalAdapter.createSession(user!.user.id);
    const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
    const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
    const before = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(before?.user.id).toBe(user!.user.id);
    const result = await authRequest(new Request(`${config.baseURL}/api/auth/sign-out`, {
      method: "POST", headers: { origin: config.baseURL, cookie },
    }), { auth, origin: config.baseURL });
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    expect(await context.internalAdapter.findSession(other.token)).not.toBeNull();
  });
  it("blocks extra providers, token endpoints, scope injection and first-login CSRF", async () => {
    const services = { auth, origin: config.baseURL };
    for (const body of [{ provider: "github" }, { provider: "google", scopes: ["youtube"] },
      { provider: "google", idToken: { token: "untrusted" } }, null]) {
      const result = await authRequest(new Request(`${config.baseURL}/api/auth/sign-in/social`, {
        method: "POST", headers: { origin: config.baseURL, "content-type": "application/json" }, body: JSON.stringify(body),
      }), services);
      expect(result.status).toBe(400);
    }
    for (const origin of ["https://evil.test", "null", ""]) {
      const result = await authRequest(new Request(`${config.baseURL}/api/auth/sign-in/social`, {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ provider: "google" }),
      }), services);
      expect(result.status).toBe(403);
    }
    expect((await authRequest(new Request(`${config.baseURL}/api/auth/get-access-token`), services)).status).toBe(404);
  });
});
