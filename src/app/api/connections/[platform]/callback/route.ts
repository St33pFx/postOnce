import { cookies } from "next/headers";
import { currentUser, identityServices } from "../../../../../modules/auth/server";
import { platforms, type Platform } from "../../../../../modules/platforms/domain";
import { consumeOAuthState, exchange, oauthCookieName } from "../../../../../modules/connections/oauth";
import { ConnectionService } from "../../../../../modules/connections/service";
import { vaultFromEnv } from "../../../../../modules/connections/vault";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params;
  if (!platforms.includes(platform as Platform)) return Response.redirect(new URL("/account?connection=error", request.url));
  const platformName = platform as Platform, url = new URL(request.url), cookieJar = await cookies(), cookieName = oauthCookieName(platformName), saved = cookieJar.get(cookieName)?.value;
  cookieJar.set(cookieName, "", { maxAge: 0, path: `/api/connections/${platformName}` });
  try {
    const user = await currentUser(request.headers); if (!user) throw new Error("Session required");
    const verifier = consumeOAuthState(saved, url.searchParams.get("state") ?? "", platformName, user.id), code = url.searchParams.get("code");
    if (!code || url.searchParams.get("error")) throw new Error("Authorization denied");
    const origin = identityServices().origin, grant = await exchange(platformName, code, verifier, `${origin}/api/connections/${platformName}/callback`);
    await new ConnectionService(identityServices().db, vaultFromEnv(process.env)).acceptGrant(user.id, grant);
    return Response.redirect(new URL("/account?connection=connected", request.url));
  } catch { return Response.redirect(new URL(`/account?connection=${encodeURIComponent(platformName)}-error`, request.url)); }
}
