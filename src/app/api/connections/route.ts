import { currentUser, identityServices } from "../../../modules/auth/server";
import { and, eq } from "drizzle-orm";
import { connections } from "../../../db/connections-schema";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await identityServices().db.select({ id: connections.id, platform: connections.platform,
      remoteAccountId: connections.remoteAccountId, displayName: connections.displayName,
      status: connections.status, expiresAt: connections.expiresAt, scopes: connections.scopes,
      revision: connections.revision }).from(connections)
      .where(and(eq(connections.userId, user.id), eq(connections.active, true)));
    return Response.json(rows.map((row) => ({ ...row, status: row.status === "connected" && row.expiresAt &&
      row.expiresAt <= new Date() ? "requires_reconnection" : row.status })), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Service unavailable" }, { status: 503 }); }
}
