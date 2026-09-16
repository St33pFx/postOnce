import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createConnection } from "../../../../db/connection";
import { drafts, postonceUsers, user, session } from "../../../../db/schema";

function enabled(request: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.POSTONCE_DEV_LOGIN !== "1") return false;
  const host = request.headers.get("host")?.split(":")[0];
  const origin = request.headers.get("origin");
  let originHost = host; try { if (origin) originHost = new URL(origin).hostname; } catch { originHost = ""; }
  return [host, originHost].every((v) => v === "localhost" || v === "127.0.0.1");
}

export async function POST(request: Request) {
  if (!enabled(request)) return new Response(null, { status: 404 });
  const { db, pool } = createConnection();
  try {
    const now = new Date(); const id = "local-dev-user";
    await db.insert(user).values({ id, name: "PostOnce Local Dev", email: "local-dev@postonce.test", emailVerified: true }).onConflictDoUpdate({ target: user.id, set: { name: "PostOnce Local Dev", updatedAt: now } });
    const [existing] = await db.select().from(postonceUsers).where(eq(postonceUsers.authUserId, id));
    const owner = existing ?? (await db.insert(postonceUsers).values({ authUserId: id }).returning())[0];
    const demo = await db.select().from(drafts).where(eq(drafts.userId, owner.id));
    if (!demo.length) await db.insert(drafts).values({ userId: owner.id, caption: "Demo local" });
    const token = randomUUID() + randomUUID();
    await db.insert(session).values({ id: randomUUID(), token, userId: id, expiresAt: new Date(Date.now() + 7 * 86400000), ipAddress: "127.0.0.1", userAgent: "PostOnce local development" });
    (await cookies()).set("better-auth.session_token", token, { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 7 * 86400 });
    return Response.redirect(new URL("/drafts", request.url), 303);
  } finally { await pool.end(); }
}

