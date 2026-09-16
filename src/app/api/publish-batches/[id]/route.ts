import { headers } from "next/headers";
import { identityServices, currentUser } from "../../../../modules/auth/server";
import { publishingService } from "../../../../modules/publishing/server";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { const u = await currentUser(await headers()); if (!u) return Response.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const { db } = identityServices(); return Response.json(await (await publishingService(db)).get(u.id, id), { headers: { "Cache-Control": "no-store" } }); } catch (e) { const status = typeof e === "object" && e && "status" in e ? Number(e.status) : 503; return Response.json({ error: e instanceof Error ? e.message : "Unavailable" }, { status, headers: { "Cache-Control": "no-store" } }); } }
