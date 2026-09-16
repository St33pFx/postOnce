import { NextResponse } from "next/server";
import { currentUser, identityServices } from "../../../../../modules/auth/server";
import { platforms, type Platform } from "../../../../../modules/platforms/domain";
import { authorizeUrl, createOAuthState, oauthCookieName } from "../../../../../modules/connections/oauth";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ platform: string }> }) {
  try {
    const { platform } = await context.params;
    if (!platforms.includes(platform as Platform)) return Response.json({ error: "Platform not found" }, { status: 404 });
    const user = await currentUser(request.headers); if (!user) return Response.redirect(new URL("/login", request.url));
    const origin = identityServices().origin, redirectUri = `${origin}/api/connections/${platform}/callback`, state = createOAuthState(platform as Platform, user.id);
    const response = NextResponse.redirect(authorizeUrl(platform as Platform, redirectUri, state.state, state.challenge));
    response.cookies.set(oauthCookieName(platform as Platform), state.value, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: `/api/connections/${platform}`, maxAge: 600 });
    return response;
  } catch { return Response.json({ error: "OAuth unavailable" }, { status: 503 }); }
}
