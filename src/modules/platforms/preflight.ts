import { and, eq, isNull } from "drizzle-orm";
import { connections, draftConnections } from "../../db/connections-schema";
import { media } from "../../db/media-schema";
import { drafts } from "../../db/schema";
import type { DB } from "../drafts/service";
import { coverNeedsRender, DomainError, uuid } from "../media/model";
import { resolvePublishableCover } from "../media/cover-resolution";
import { adapterRegistry, globalPreflight, type Preflight, type PlatformConfiguration, type Account, type CoverAsset } from "./contract";
import { parseConfigurations, effectiveConfiguration } from "./configuration";
import { createRefreshClient } from "./http";
import { RefreshError, type Transport } from "./clients";
import { type TokenVault, vaultFromEnv } from "../connections/vault";

export type Reason = { code: string; message: string };
export type DestinationResult = Preflight & { issues: Reason[]; effective?: ReturnType<typeof effectiveConfiguration> };
export async function preflight(db: DB, userId: string, draftId: string, selected?: PlatformConfiguration[],
  options: { vault?: TokenVault; http?: Transport } = {}) {
  if (!uuid(draftId)) throw new DomainError(404, "Draft no disponible");
  const [draft] = await db.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId), isNull(drafts.deletedAt)));
  if (!draft) throw new DomainError(404, "Draft no disponible");
  // Persisted configuration is authoritative; caller selection is only supported for older callers.
  const configs = selected ? selected.map(c => parseConfigurations({ [c.platform]: c })[c.platform]!) : Object.values(parseConfigurations(draft.platformConfig));
  const [video] = draft.videoId ? await db.select().from(media).where(and(eq(media.id, draft.videoId), eq(media.userId, userId), eq(media.draftId, draftId), eq(media.status, "ready"))) : [];
  const refresh = createRefreshClient(options.http);
  const results: DestinationResult[] = [];
  for (const config of configs.filter(c => c.enabled).sort((a,b) => ["instagram","tiktok","youtube"].indexOf(a.platform)-["instagram","tiktok","youtube"].indexOf(b.platform))) {
    const issues: Reason[] = [];
    const fail = (code: string) => { issues.push({ code, message: code }); };
    let account: Account = { connected: false, eligible: false, scopes: [] };
    const [binding] = await db.select().from(draftConnections).where(and(eq(draftConnections.userId, userId), eq(draftConnections.draftId, draftId), eq(draftConnections.platform, config.platform)));
    if (!binding) fail("binding_missing");
    else {
      const [connection] = await db.select().from(connections).where(and(eq(connections.id, binding.connectionId), eq(connections.userId, userId), eq(connections.platform, config.platform)));
      if (!connection) fail("account_unavailable");
      else {
        account = { connected: connection.status === "connected", eligible: false, scopes: [], displayName: connection.displayName ?? undefined, remoteAccountId: connection.remoteAccountId };
        if (binding.requiresRevalidation) fail("binding_requires_revalidation");
        else if (!connection.active || binding.requiresConfirmation) fail("account_changed");
        else if (binding.confirmedRevision !== connection.revision) fail("binding_stale");
        else if (connection.status === "disconnected") fail("account_disconnected");
        else if (connection.expiresAt && connection.expiresAt <= new Date()) fail("token_expired");
        else if (connection.status === "requires_reconnection") fail("token_invalid");
        else if (connection.status !== "connected") fail("account_unavailable");
        else if (!connection.tokenEnvelope) fail("token_missing");
        else if (config.platform === "tiktok" && !connection.scopes.includes("video.publish")) fail("video.publish_missing");
        else {
          try {
            const vault = options.vault ?? vaultFromEnv(process.env);
            let token: string;
            try { token = vault.decrypt(connection.tokenEnvelope, connection).accessToken; }
            catch { throw new RefreshError("token_invalid"); }
            account = await refresh.refresh(config.platform, token, connection.remoteAccountId);
            // Detect account changes during external requests; never reuse an old confirmation.
            const [current] = await db.select().from(connections).where(and(eq(connections.id, connection.id), eq(connections.userId, userId)));
            const [currentBinding] = await db.select().from(draftConnections).where(eq(draftConnections.id, binding.id));
            if (!current?.active || current.status !== "connected" || current.revision !== connection.revision ||
                currentBinding?.connectionId !== connection.id || currentBinding.confirmedRevision !== binding.confirmedRevision || currentBinding.requiresConfirmation) fail("binding_stale");
          } catch (error) { fail(error instanceof RefreshError ? error.code : "integration_unavailable"); }
        }
      }
    }
    const adapter = adapterRegistry[config.platform], capabilities = adapter.capabilities(account);
    const wantedKind = config.platform === "tiktok" ? config.cover : config.platform === "instagram" ? config.cover : config.thumbnail;
    const coverRows = draft.cover?.baseId ? await db.select().from(media).where(and(eq(media.userId, userId), eq(media.draftId, draftId), eq(media.status, "ready"))) : [];
    const resolvedCover = (config.platform === "youtube" || config.platform === "instagram") ? resolvePublishableCover(coverRows, draft.cover, wantedKind) : undefined;
    if ((config.platform === "youtube" || config.platform === "instagram") && coverNeedsRender(draft.cover) && !resolvedCover) fail("cover_render_required");
    const [coverAsset] = resolvedCover ? [resolvedCover] : wantedKind ? await db.select().from(media).where(and(eq(media.userId, userId), eq(media.draftId, draftId), draft.cover?.baseId ? eq(media.id, draft.cover.baseId) : eq(media.kind, wantedKind as typeof media.$inferSelect.kind))) : [];
    const effective = effectiveConfiguration(draft.caption ?? "", config);
    const input = { caption: effective.text, media: video?.metadata ?? null, account, capabilities, draftId, videoId: draft?.videoId ?? undefined,
      coverAsset: coverAsset ? { id: coverAsset.id, draftId: coverAsset.draftId, status: coverAsset.status, kind: coverAsset.kind, sourceVideoId: coverAsset.recipe?.sourceId } as CoverAsset : undefined };
    let validation: Preflight;
    switch (config.platform) {
      case "instagram": validation = adapterRegistry.instagram.validate({ ...input, config: { ...config, override: effective.text } }); break;
      case "tiktok": validation = adapterRegistry.tiktok.validate({ ...input, config: { ...config, override: effective.text } }); break;
      case "youtube": validation = adapterRegistry.youtube.validate({ ...input, config: { ...config, descriptionOverride: effective.text } }); break;
    }
    issues.push(...validation.reasons.map(message => ({ code: "validation_failed", message })));
    results.push({ ...validation, status: issues.length ? "NotReady" : "Ready", reasons: issues.map(r => r.message), issues, effective });
  }
  const [currentDraft] = await db.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)));
  if (!currentDraft || currentDraft.deletedAt || currentDraft.version !== draft.version) throw new DomainError(409, "El draft cambió durante preflight");
  return { results, global: { ...globalPreflight(results), ready: results.length > 0 && results.every(r => r.status === "Ready") }, draftVersion: draft.version };
}

