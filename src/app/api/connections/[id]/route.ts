import { currentUser, identityServices } from "../../../../modules/auth/server";
import { ConnectionService } from "../../../../modules/connections/service";
import { vaultFromEnv } from "../../../../modules/connections/vault";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const services = identityServices();
    if (request.headers.get("origin") !== services.origin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const user = await currentUser(request.headers);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
    try { await new ConnectionService(services.db, vaultFromEnv(process.env)).disconnect(user.id, id); }
    catch { return Response.json({ error: "Resource unavailable" }, { status: 404 }); }
    return new Response(null, { status: 204 });
  } catch { return Response.json({ error: "Service unavailable" }, { status: 503 }); }
}
