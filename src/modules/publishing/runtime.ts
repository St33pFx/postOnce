import { and, desc, eq } from "drizzle-orm";
import { connections, draftConnections } from "../../db/connections-schema";
import { media } from "../../db/media-schema";
import { platformPublishAttempt, publishBatch } from "../../db/publishing-schema";
import { drafts } from "../../db/schema";
import type { DB } from "../drafts/service";
import { storageFromEnv, type ObjectStorage } from "../media/storage";
import { resolvePublishableCover } from "../media/cover-resolution";
import { vaultFromEnv, type TokenVault } from "../connections/vault";
import { refreshAccessToken } from "../connections/oauth";
import { parseConfigurations } from "../platforms/configuration";
import { publishingAdapters, type PublishAdapter, type PublishAsset, type PublishInput, type PublishingTransport } from "./adapters";

export type ResolvedPublication = { adapter: PublishAdapter; input: PublishInput; thumbnail?: PublishAsset };
export type PublicationResolver = (attemptId: string) => Promise<ResolvedPublication>;

function asset(storage: ObjectStorage, row: typeof media.$inferSelect): PublishAsset {
  if (row.status !== "ready" || !row.mime) throw new Error("Media no disponible para publicar");
  return { size: row.size, mime: row.mime, stream: () => storage.read(row.objectKey), url: () => storage.signedRead(row.objectKey, row.mime!) };
}

export function productionResolver(db: DB, options: { storage?: ObjectStorage; vault?: TokenVault; http?: PublishingTransport } = {}): PublicationResolver {
  const adapters = publishingAdapters(options.http);
  return async attemptId => {
    const storage = options.storage ?? storageFromEnv(), vault = options.vault ?? vaultFromEnv(process.env);
    const [attempt] = await db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.id, attemptId));
    if (!attempt) throw new Error("Attempt no disponible");
    const [batch] = await db.select().from(publishBatch).where(eq(publishBatch.id, attempt.batchId));
    if (!batch) throw new Error("Batch no disponible");
    const [draft] = await db.select().from(drafts).where(and(eq(drafts.id, batch.draftId), eq(drafts.userId, batch.userId)));
    if (!draft?.videoId) throw new Error("Video no disponible");
    const config = parseConfigurations(draft.platformConfig)[attempt.platform];
    if (!config?.enabled) throw new Error("Configuración de plataforma no disponible");
    const [binding] = await db.select().from(draftConnections).where(and(eq(draftConnections.draftId, draft.id), eq(draftConnections.userId, batch.userId), eq(draftConnections.platform, attempt.platform)));
    if (!binding) throw new Error("Cuenta no disponible");
    const [connection] = await db.select().from(connections).where(and(eq(connections.id, binding.connectionId), eq(connections.userId, batch.userId), eq(connections.platform, attempt.platform)));
    if (!connection?.tokenEnvelope || connection.status !== "connected" || !connection.active) throw new Error("Cuenta no disponible");
    let tokens = vault.decrypt(connection.tokenEnvelope, connection);
    if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 5 * 60_000) {
      if (!tokens.refreshToken) {
        await db.update(connections).set({ status: "requires_reconnection", updatedAt: new Date() }).where(eq(connections.id, connection.id));
        throw new Error("Cuenta requiere reconexión");
      }
      try {
        const refreshed = await refreshAccessToken(connection.platform, tokens.refreshToken, options.http);
        tokens = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
        await db.update(connections).set({ tokenEnvelope: vault.encrypt(tokens, connection), expiresAt: refreshed.expiresAt ?? null, status: "connected", updatedAt: new Date() }).where(eq(connections.id, connection.id));
      } catch {
        await db.update(connections).set({ status: "requires_reconnection", updatedAt: new Date() }).where(eq(connections.id, connection.id));
        throw new Error("Cuenta requiere reconexión");
      }
    }
    const [video] = await db.select().from(media).where(and(eq(media.id, draft.videoId), eq(media.userId, batch.userId), eq(media.draftId, draft.id)));
    if (!video) throw new Error("Video no disponible");
    const rows = await db.select().from(media).where(and(eq(media.userId, batch.userId), eq(media.draftId, draft.id))).orderBy(desc(media.createdAt));
    const wantedCover = config.platform === "instagram" ? config.cover : undefined;
    const wantedThumbnail = config.platform === "youtube" ? config.thumbnail : undefined;
    const requestedKind = wantedCover ?? wantedThumbnail;
    const coverRow = wantedCover ? resolvePublishableCover(rows, draft.cover, requestedKind) : undefined;
    const thumbnailRow = config.platform === "youtube" ? resolvePublishableCover(rows, draft.cover, requestedKind) : undefined;
    return { adapter: adapters[attempt.platform], input: { token: tokens.accessToken, remoteAccountId: connection.remoteAccountId,
      caption: config.platform === "youtube" ? config.descriptionOverride ?? draft.caption ?? "" : config.override ?? draft.caption ?? "",
      config, video: asset(storage, video), cover: coverRow ? asset(storage, coverRow) : undefined },
      thumbnail: thumbnailRow ? asset(storage, thumbnailRow) : undefined };
  };
}
