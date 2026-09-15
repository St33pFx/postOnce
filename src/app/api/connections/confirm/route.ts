import { currentUser, identityServices } from "../../../../modules/auth/server";
import { ConnectionService } from "../../../../modules/connections/service";
import { vaultFromEnv } from "../../../../modules/connections/vault";
import { platforms } from "../../../../modules/platforms/domain";

export async function POST(request: Request) {
  try {
    const services = identityServices();
    if (request.headers.get("origin") !== services.origin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const user = await currentUser(request.headers);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    let body;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    if (!body || !platforms.includes(body.platform) || !Number.isInteger(body.revision) || body.revision < 1 ||
      ![body.draftId, body.connectionId].every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    try {
      await new ConnectionService(services.db, vaultFromEnv(process.env)).confirmBinding(user.id,
        body.draftId, body.platform, body.connectionId, body.revision);
    } catch { return Response.json({ error: "Resource unavailable or changed" }, { status: 409 }); }
    return new Response(null, { status: 204 });
  } catch { return Response.json({ error: "Service unavailable" }, { status: 503 }); }
}
