import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/auth-schema";
import { authConfig } from "../../config/auth";

export function createAuth(db: NodePgDatabase<typeof import("../../db/schema")>, config: ReturnType<typeof authConfig>) {
  return betterAuth({
    appName: "PostOnce",
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    socialProviders: {
      google: { clientId: config.clientId, clientSecret: config.clientSecret,
        scope: ["openid", "email", "profile"], disableDefaultScope: true,
        accessType: "online", includeGrantedScopes: false },
    },
    emailAndPassword: { enabled: false },
    trustedOrigins: [config.baseURL],
    account: { encryptOAuthTokens: true, storeStateStrategy: "database",
      storeAccountCookie: false, accountLinking: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: config.secure, disableCSRFCheck: false, disableOriginCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: config.secure } },
    // OIDC tokens are needed for login verification, not for operating any API.
    // Discard them on persistence rather than retaining unnecessary Google grants.
    databaseHooks: { account: {
      create: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null } }) },
      update: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null } }) },
    } },
    logger: { disabled: true },
  });
}
