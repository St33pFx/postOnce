import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "../../modules/auth/server";
import { DraftWorkspace } from "./workspace";
export const dynamic = "force-dynamic";
export default async function DraftsPage() {
  let user;
  try { user = await currentUser(await headers()); } catch { redirect("/login"); }
  if (!user) redirect("/login");
  return <DraftWorkspace />;
}
