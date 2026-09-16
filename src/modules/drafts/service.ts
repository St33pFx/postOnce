import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drafts, postonceUsers } from "../../db/schema";
import { media } from "../../db/media-schema";
import { coverState, DomainError, uuid } from "../media/model";
export type DB = NodePgDatabase<typeof import("../../db/schema")>;
export class DraftService {
  constructor(public db: DB) {}
  async list(userId: string) {
    return this.db.select().from(drafts).where(and(eq(drafts.userId, userId), isNull(drafts.deletedAt))).orderBy(desc(drafts.updatedAt));
  }
  async create(userId: string) { return (await this.db.insert(drafts).values({ userId, caption: "" }).returning())[0]; }
  async get(userId: string, id: string) {
    if (!uuid(id)) throw new DomainError(404, "Draft no disponible");
    const [row] = await this.db.select().from(drafts).where(and(eq(drafts.id, id), eq(drafts.userId, userId), isNull(drafts.deletedAt)));
    if (!row) throw new DomainError(404, "Draft no disponible");
    return row;
  }
  async update(userId: string, id: string, version: number, input: { caption: string; videoId: string | null; cover: unknown; platformConfig?: Record<string, unknown> }) {
    if (typeof input.caption !== "string" || input.caption.length > 20_000 || (input.videoId !== null && !uuid(input.videoId))) throw new DomainError(400, "Draft inválido");
    const cover = coverState(input.cover);
    return this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const before = await new DraftService(tx as unknown as DB).get(userId, id);
      if (before.lockedAt || before.version !== version) throw new DomainError(409, "El draft cambió. Revisa la versión del servidor.");
      for (const [assetId, video] of [[input.videoId, true], [cover?.baseId, false]] as const) {
        if (!assetId) continue;
        const [asset] = await tx.select().from(media).where(and(eq(media.id, assetId), eq(media.userId, userId), eq(media.draftId, id), eq(media.status, "ready")));
        if (!asset || (video ? asset.kind !== "original_video" : !["uploaded_image", "extracted_frame"].includes(asset.kind))) throw new DomainError(400, "Media no disponible");
        if (!video && asset.kind === "extracted_frame" && asset.recipe?.sourceId !== input.videoId) throw new DomainError(409, "Selecciona una portada del video actual");
      }
      return (await tx.update(drafts).set({ caption: input.caption, videoId: input.videoId, cover, platformConfig: input.platformConfig ?? before.platformConfig,
        version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, id)).returning())[0];
    });
  }
  async remove(userId: string, id: string, version: number) {
    return this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const row = await new DraftService(tx as unknown as DB).get(userId, id);
      if (row.lockedAt || row.version !== version) throw new DomainError(409, "El draft cambió o no permite eliminación");
      await tx.update(drafts).set({ deletedAt: new Date(), caption: null, cover: null, videoId: null, version: sql`${drafts.version}+1`, updatedAt: new Date() }).where(eq(drafts.id, id));
      await tx.update(media).set({ status: "deleting", deleteAfter: new Date(), updatedAt: new Date() }).where(and(eq(media.userId, userId), eq(media.draftId, id)));
    });
  }
}
