import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, identityServices } from "../../modules/auth/server";
import { LogoutButton } from "./logout-button";
import { connections, draftConnections } from "../../db/connections-schema";
import { and, eq } from "drizzle-orm";
import { platforms } from "../../modules/platforms/domain";
import { ConfirmAccountButton, DisconnectButton } from "./connection-controls";

export const dynamic = "force-dynamic";
export default async function Account() {
  const requestHeaders = await headers();
  let user;
  try { user = await currentUser(requestHeaders); } catch { redirect("/login"); }
  if (!user) redirect("/login");
  const profile = await identityServices().auth.api.getSession({ headers: requestHeaders });
  const db = identityServices().db;
  const accounts = await db.select({ id: connections.id, platform: connections.platform, displayName: connections.displayName,
    remoteAccountId: connections.remoteAccountId, status: connections.status, expiresAt: connections.expiresAt,
    revision: connections.revision }).from(connections).where(and(eq(connections.userId, user.id), eq(connections.active, true)));
  const bindings = await db.select({ draftId: draftConnections.draftId, platform: draftConnections.platform,
    oldRemoteAccountId: connections.remoteAccountId }).from(draftConnections)
    .innerJoin(connections, eq(connections.id, draftConnections.connectionId))
    .where(and(eq(draftConnections.userId, user.id), eq(draftConnections.requiresConfirmation, true)));
  const labels = { disconnected: "Desconectada", connected: "Conectada", requires_reconnection: "Requiere reconexión", ineligible: "No elegible" };
  const descriptions = { instagram: "Conecta una cuenta profesional para publicar Reels.", tiktok: "Conecta TikTok para publicar con tus preferencias de privacidad.", youtube: "Conecta tu canal para publicar videos y miniaturas." };
  const titles = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
  return <main className="app-shell"><header className="page-header"><div><p className="eyebrow">POSTONCE / CUENTA</p><h1>Cuenta</h1><p className="lede">Administra tus conexiones de publicación.</p></div><nav className="top-nav"><Link href="/drafts">Drafts</Link><Link className="active" href="/account">Cuenta</Link></nav></header>
    <section className="profile-card"><div className="avatar">{profile?.user.name?.slice(0,1).toUpperCase() ?? "P"}</div><div><p className="eyebrow">PERFIL</p><h2>{profile?.user.name ?? "Tu cuenta"}</h2><p>{profile?.user.email ?? "Sesión iniciada con Google"}</p></div></section>
    <section className="connections-section"><div className="section-heading"><div><p className="eyebrow">CANALES</p><h2>Cuentas conectadas</h2></div><Link className="button secondary" href="/drafts">Volver a drafts</Link></div><div className="connection-grid">{platforms.map((platform) => {
      const account = accounts.find((row) => row.platform === platform);
      const status = account?.status === "connected" && account.expiresAt && account.expiresAt <= new Date()
        ? "requires_reconnection" : account?.status ?? "disconnected";
      return <article className="connection-card" key={platform}><div className="connection-card-head"><div className={`platform-mark ${platform}`}>{platform.slice(0,1).toUpperCase()}</div><div><h3>{titles[platform]}</h3><p>{descriptions[platform]}</p></div><span className={`status-badge ${status}`}>{labels[status]}</span></div>
        {account && <p className="connection-identity">{account.displayName ?? account.remoteAccountId}</p>}
        <div className="connection-actions">{(!account || status !== "connected") && <Link className="button primary" href={`/api/connections/${platform}/start`}>{status === "requires_reconnection" ? "Reconectar" : `Conectar ${titles[platform]}`}</Link>}
        {account && status !== "disconnected" && <DisconnectButton id={account.id} />}</div>
        {account && status === "connected" && bindings.filter((row) => row.platform === platform).map((binding) =>
          <div className="connection-warning" key={binding.draftId}><p>Esta cuenta cambió para un draft y requiere confirmación.</p>
            <ConfirmAccountButton draftId={binding.draftId} platform={platform} connectionId={account.id} revision={account.revision} />
          </div>)}
      </article>;
    })}</div></section><LogoutButton /></main>;
}
