import { eq } from "drizzle-orm";
import { drafts } from "../../../../db/schema";
import { identityServices } from "../../../../modules/auth/server";
import { localLoginAllowed } from "../../../../modules/auth/local";
import { domainUser } from "../../../../modules/users/identity";

export async function POST(request: Request) {
  if (!localLoginAllowed(request.headers)) return new Response(null, { status: 404 });
  const { db, auth } = identityServices();
  const result = await auth.api.localDevSignIn({ headers: request.headers, asResponse: true });
  if (!result.ok) return result;
  const { userId } = await result.json();
  const owner = await domainUser(db, userId);
  const demo = await db.select({ id: drafts.id }).from(drafts).where(eq(drafts.userId, owner.id)).limit(1);
  if (!demo.length) await db.insert(drafts).values({ userId: owner.id, caption: "Demo local" });
  const headers = new Headers({ location: "/drafts", "cache-control": "no-store" });
  for (const cookie of result.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

