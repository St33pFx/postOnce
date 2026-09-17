import { cookies } from "next/headers";
import { currentUser, identityServices } from "../../../../../modules/auth/server";
import { platforms, type Platform } from "../../../../../modules/platforms/domain";
import { consumeOAuthState, exchange, oauthCookieName } from "../../../../../modules/connections/oauth";
import { ConnectionService } from "../../../../../modules/connections/service";
import { vaultFromEnv } from "../../../../../modules/connections/vault";

export const dynamic = "force-dynamic";
function safeErrorMessage(error: unknown) {
  // Only application-defined messages may reach logs; transport/DB errors can contain secrets.
  const safeMessages = ["Session required", "OAuth state missing", "OAuth state invalid", "Authorization denied",
    "OAuth unavailable", "Invalid OAuth response", "OAuth provider rejected the request"];
  return error instanceof Error && safeMessages.includes(error.message) ? error.message : "OAuth callback failed";
}
export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  const { key: platform } = await context.params;
  const origin = identityServices().origin;
  if (!platforms.includes(platform as Platform)) {
    console.error("OAuth connection callback failed", { platform: "unknown", stage: "validate-platform", message: "Unsupported platform" });
    return Response.redirect(new URL("/account?connection=error", origin));
  }
  const platformName = platform as Platform, url = new URL(request.url), cookieJar = await cookies(), cookieName = oauthCookieName(platformName), saved = cookieJar.get(cookieName)?.value;
  cookieJar.set(cookieName, "", { maxAge: 0, path: `/api/connections/${platformName}` });
  let stage = "session";
  try {
    const user = await currentUser(request.headers); if (!user) throw new Error("Session required");
    stage = "state";
    const verifier = consumeOAuthState(saved, url.searchParams.get("state") ?? "", platformName, user.id), code = url.searchParams.get("code");
    stage = "authorization";
    if (!code || url.searchParams.get("error")) throw new Error("Authorization denied");
    stage = "exchange";
    const grant = await exchange(platformName, code, verifier, `${origin}/api/connections/${platformName}/callback`);
    stage = "persist";
    await new ConnectionService(identityServices().db, vaultFromEnv(process.env)).acceptGrant(user.id, grant);
    return Response.redirect(new URL("/account?connection=connected", origin));
  } catch (error) {
    console.error("OAuth connection callback failed", { platform: platformName, stage, message: safeErrorMessage(error) });
    return Response.redirect(new URL(`/account?connection=${encodeURIComponent(platformName)}-error`, origin));
  }
}
