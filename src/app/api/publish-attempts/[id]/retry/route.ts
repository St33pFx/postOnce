import { headers } from "next/headers";
import { currentUser, identityServices } from "../../../../../modules/auth/server";
import { publishingService } from "../../../../../modules/publishing/server";
export const runtime = "nodejs";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await currentUser(await headers()); if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const { db } = identityServices(); return Response.json(await (await publishingService(db)).retry(user.id, id), { status: 202, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 503; return Response.json({ error: error instanceof Error ? error.message : "Retry unavailable" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
