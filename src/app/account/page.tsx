import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, identityServices } from "../../modules/auth/server";
import { LogoutButton } from "./logout-button";
import { connections, draftConnections } from "../../db/connections-schema";
import { and, eq } from "drizzle-orm";
import { platforms } from "../../modules/platforms/domain";
import { ConfirmAccountButton, DisconnectButton } from "./connection-controls";

export const dynamic = "force-dynamic";
export default async function Account() {
  let user;
  try { user = await currentUser(await headers()); } catch { redirect("/login"); }
  if (!user) redirect("/login");
  const db = identityServices().db;
  const accounts = await db.select({ id: connections.id, platform: connections.platform, displayName: connections.displayName,
    remoteAccountId: connections.remoteAccountId, status: connections.status, expiresAt: connections.expiresAt,
    revision: connections.revision }).from(connections).where(and(eq(connections.userId, user.id), eq(connections.active, true)));
  const bindings = await db.select({ draftId: draftConnections.draftId, platform: draftConnections.platform,
    oldRemoteAccountId: connections.remoteAccountId }).from(draftConnections)
    .innerJoin(connections, eq(connections.id, draftConnections.connectionId))
    .where(and(eq(draftConnections.userId, user.id), eq(draftConnections.requiresConfirmation, true)));
  const labels = { disconnected: "Desconectada", connected: "Conectada", requires_reconnection: "Requiere reconexión", ineligible: "No elegible" };
  return <main><h1>Tu cuenta de PostOnce</h1><p>Sesión iniciada.</p>
    <p>Las conexiones de Instagram, TikTok y YouTube son independientes de este login.
      Sus adapters OAuth todavía no están disponibles; no se simula ninguna conexión.</p>
    {platforms.map((platform) => {
      const account = accounts.find((row) => row.platform === platform);
      const status = account?.status === "connected" && account.expiresAt && account.expiresAt <= new Date()
        ? "requires_reconnection" : account?.status ?? "disconnected";
      return <section key={platform}><h2>{platform}</h2><p>{labels[status]}</p>
        {account && <p>{account.displayName ?? account.remoteAccountId} · {account.remoteAccountId}</p>}
        <p>Conectar/reconectar no está disponible hasta integrar el OAuth real de esta plataforma.</p>
        {account && status !== "disconnected" && <DisconnectButton id={account.id} />}
        {account && status === "connected" && bindings.filter((row) => row.platform === platform).map((binding) =>
          <div key={binding.draftId}><p>Draft {binding.draftId}: cuenta anterior {binding.oldRemoteAccountId};
            cuenta propuesta {account.remoteAccountId}. Requiere confirmación y revalidación.</p>
            <ConfirmAccountButton draftId={binding.draftId} platform={platform} connectionId={account.id} revision={account.revision} />
          </div>)}
      </section>;
    })}
    <LogoutButton /></main>;
}
