import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

export function localLoginAllowed(headers: Headers, env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "development" || env.POSTONCE_DEV_LOGIN !== "1") return false;
  try {
    const base = new URL(env.BETTER_AUTH_URL!);
    return base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname) &&
      headers.get("host") === base.host && headers.get("origin") === base.origin &&
      !["cross-site"].includes(headers.get("sec-fetch-site") ?? "");
  } catch { return false; }
}

export const localLoginPlugin = {
  id: "postonce-local-login",
  endpoints: {
    // No HTTP path: callable only by the guarded /api/dev/login server route.
    localDevSignIn: createAuthEndpoint({ method: "POST", requireHeaders: true }, async ctx => {
      if (!localLoginAllowed(ctx.headers)) throw new APIError("NOT_FOUND");
      const adapter = ctx.context.internalAdapter;
      const email = "local-dev@postonce.test";
      let user = (await adapter.findUserByEmail(email))?.user;
      if (!user) {
        try {
          user = await adapter.createUser({ name: "PostOnce Local Dev", email, emailVerified: true }, { method: "email" });
        } catch (error) {
          user = (await adapter.findUserByEmail(email))?.user;
          if (!user) throw error;
        }
      }
      const session = await adapter.createSession(user.id);
      if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
      await setSessionCookie(ctx, { session, user });
      return ctx.json({ userId: user.id });
    }),
  },
};
