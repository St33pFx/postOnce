import { identityServices } from "../../../../modules/auth/server";
import { authRequest } from "../../../../modules/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Expose only the V1 web redirect login/session/logout surface. No token retrieval,
// linking, password or arbitrary provider endpoints are exposed to the browser.
async function handle(request: Request) {
  try { return await authRequest(request, identityServices()); }
  catch { return Response.json({ error: "Authentication unavailable" }, { status: 503 }); }
}
export const GET = handle;
export const POST = handle;
