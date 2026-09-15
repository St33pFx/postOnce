import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { postonceUsers } from "../../db/schema";

/** Called only with the identity returned by a validated Better Auth session. */
export async function domainUser(db: NodePgDatabase<typeof import("../../db/schema")>, authUserId: string) {
  await db.insert(postonceUsers).values({ authUserId }).onConflictDoNothing({ target: postonceUsers.authUserId });
  const [user] = await db.select().from(postonceUsers).where(eq(postonceUsers.authUserId, authUserId));
  if (!user) throw new Error("Identity unavailable");
  return user;
}
