import "server-only";
import { createDb } from "../../db";
import { authConfig } from "../../config/auth";
import { createAuth } from "./factory";
import { domainUser } from "../users/identity";

let services: ReturnType<typeof initialize> | undefined;
function initialize() {
  const config = authConfig(process.env);
  const { db } = createDb();
  return { db, auth: createAuth(db, config), origin: config.baseURL };
}
export function identityServices() { return services ??= initialize(); }
export async function currentUser(headers: Headers) {
  const { auth, db } = identityServices();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return domainUser(db, session.user.id);
}
