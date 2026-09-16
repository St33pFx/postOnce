import { and, eq, ne, sql, or, isNull, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { media } from "../../db/media-schema";
import { postonceUsers } from "../../db/schema";
import { DraftService, type DB } from "../drafts/service";
import { coverState, DomainError, mediaLimits, uploadInput, uuid, type Recipe } from "./model";
import type { ObjectStorage } from "./storage";
export type Asset = typeof media.$inferSelect;
export function publicAsset(row: Asset) {
  const { id, draftId, kind, status, size, mime, checksum, metadata, recipe, error, partSize, createdAt, updatedAt } = row;
  return { id, draftId, kind, status, size, mime, checksum, metadata, recipe, error, partSize, createdAt, updatedAt };
}
export class MediaService {
  constructor(public db: DB, public storage: ObjectStorage, public limits = mediaLimits(process.env)) {}
  async get(userId: string, id: string, includeDeletedDraft = false) {
    if (!uuid(id)) throw new DomainError(404, "Media no disponible");
    const [row] = await this.db.select().from(media).where(and(eq(media.id, id), eq(media.userId, userId)));
    if (!row || row.status === "deleted") throw new DomainError(404, "Media no disponible");
    if (!includeDeletedDraft) await new DraftService(this.db).get(userId, row.draftId);
    return row;
  }
  async list(userId: string, draftId: string) {
    await new DraftService(this.db).get(userId, draftId);
    return (await this.db.select().from(media).where(and(eq(media.userId, userId), eq(media.draftId, draftId), ne(media.status, "deleted")))).map(publicAsset);
  }
  async usage(userId: string) {
    const [result] = await this.db.select({ total: sql<string>`coalesce(sum(${media.reservedBytes}), 0)` }).from(media).where(eq(media.userId, userId));
    return { used: Number(result.total), limit: this.limits.quota };
  }
  async reserve(userId: string, draftId: string, kind: Asset["kind"], bytes: number, recipe?: Recipe) {
    return this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const draft = await new DraftService(tx as unknown as DB).get(userId, draftId);
      if (draft.lockedAt) throw new DomainError(409, "Draft bloqueado");
      const { used } = await new MediaService(tx as unknown as DB, this.storage, this.limits).usage(userId);
      if (used + bytes > this.limits.quota) throw new DomainError(413, "Cuota de media insuficiente");
      const id = randomUUID();
      return (await tx.insert(media).values({ id, userId, draftId, kind, size: bytes, reservedBytes: bytes,
        objectKey: `media/${userId}/${id}`, status: recipe ? "uploaded" : "initiating", recipe,
        partSize: this.limits.part, uploadExpiresAt: recipe ? null : new Date(Date.now() + 72 * 3600_000) }).returning())[0];
    });
  }
  async start(userId: string, draftId: string, kind: unknown, size: unknown) {
    const input = uploadInput(kind, size, this.limits);
    const row = await this.reserve(userId, draftId, input.kind, input.size);
    try {
      const uploadId = await this.storage.begin(row.objectKey);
      const [updated] = await this.db.update(media).set({ uploadId, status: "uploading", updatedAt: new Date() })
        .where(and(eq(media.id, row.id), eq(media.status, "initiating"))).returning();
      if (!updated) { await this.storage.abort(row.objectKey, uploadId); throw new DomainError(409, "Upload cancelado"); }
      return publicAsset(updated);
    } catch { await this.db.update(media).set({ status: "failed", error: "No se pudo iniciar el upload" }).where(and(eq(media.id, row.id), eq(media.status, "initiating"))); throw new DomainError(503, "Storage no disponible"); }
  }
  async sign(userId: string, id: string, number: number, checksum: string) {
    const row = await this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const row = await new MediaService(tx as unknown as DB, this.storage, this.limits).get(userId, id);
      if (row.status !== "uploading" || !row.uploadId || row.uploadExpiresAt! <= new Date() || (row.leaseUntil && row.leaseUntil > new Date())) throw new DomainError(409, "Upload no disponible; cancela e inicia otro");
      if (!Number.isInteger(number) || number < 1 || number > Math.ceil(row.size / row.partSize) || !/^[A-Za-z0-9+/]{43}=$/.test(checksum)) throw new DomainError(400, "Parte inválida");
      const previous = row.parts[number];
      if (previous && previous.checksum !== checksum) throw new DomainError(409, "El archivo no coincide con el upload original");
      await tx.update(media).set({ parts: { ...row.parts, [number]: previous ?? { checksum } }, updatedAt: new Date() }).where(eq(media.id, id));
      return row;
    });
    return { url: await this.storage.signPart(row.objectKey, row.uploadId!, number, Math.min(row.partSize, row.size - (number - 1) * row.partSize), checksum) };
  }
  async acknowledge(userId: string, id: string, number: number, etag: string) {
    await this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const row = await new MediaService(tx as unknown as DB, this.storage, this.limits).get(userId, id);
      if (row.status !== "uploading" || !row.parts[number] || typeof etag !== "string" || etag.length > 150) throw new DomainError(400, "Parte inválida");
      await tx.update(media).set({ parts: { ...row.parts, [number]: { ...row.parts[number], etag } }, updatedAt: new Date() }).where(eq(media.id, id));
    });
  }
  async progress(userId: string, id: string) {
    const row = await this.get(userId, id);
    if (row.status !== "uploading" || !row.uploadId) return { parts: [] };
    return { parts: await this.storage.parts(row.objectKey, row.uploadId) };
  }
  async finish(userId: string, id: string) {
    const row = await this.get(userId, id);
    if (["uploaded", "processing", "ready"].includes(row.status)) return publicAsset(row);
    if (row.status !== "uploading" || !row.uploadId) throw new DomainError(409, "Upload no disponible");
    const operationId = randomUUID();
    const [claim] = await this.db.update(media).set({ operationId, leaseUntil: new Date(Date.now()+this.limits.lease) })
      .where(and(eq(media.id,id),eq(media.status,"uploading"),or(isNull(media.leaseUntil),lt(media.leaseUntil,new Date())))).returning();
    if (!claim) throw new DomainError(409,"Finalización en curso; reintenta más tarde");
    try {
    // Retry completion after a lost response: HEAD on the unique, server-generated key.
    let exists = false;
    try { exists = (await this.storage.head(row.objectKey)) === row.size; } catch { /* Not completed yet. */ }
    if (!exists) {
      const parts = (await this.storage.parts(row.objectKey, row.uploadId)).sort((a,b) => a.number-b.number);
      if (parts.length !== Math.ceil(row.size / row.partSize) || parts.some((p,i) => p.number !== i+1 ||
        p.size !== Math.min(row.partSize, row.size - i*row.partSize) || row.parts[p.number]?.etag !== p.etag)) throw new DomainError(409, "Upload incompleto o tamaño incorrecto");
      await this.storage.complete(row.objectKey, row.uploadId, parts);
    }
    if (await this.storage.head(row.objectKey) !== row.size) throw new DomainError(413, "Tamaño de objeto incorrecto");
    const [updated] = await this.db.update(media).set({ status: "uploaded", leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(media.id, id), eq(media.status, "uploading"),eq(media.operationId,operationId))).returning();
    if (!updated) throw new DomainError(409, "Upload cambió");
    return publicAsset(updated);
    } finally {
      await this.db.update(media).set({leaseUntil:null}).where(and(eq(media.id,id),eq(media.operationId,operationId)));
      const latest=await this.get(userId,id,true);
      if (["deleting","abandoned"].includes(latest.status)) await this.cleanup(userId,id);
    }
  }
  async derive(userId: string, draftId: string, kind: "extracted_frame" | "rendered_cover" | "thumbnail", recipe: Recipe) {
    if (kind === "rendered_cover") {
      const cover=coverState(recipe.cover);
      if (!cover || cover.baseId!==recipe.sourceId) throw new DomainError(400,"Portada inválida");
      recipe={sourceId:recipe.sourceId,cover};
    }
    const source = await this.get(userId, recipe.sourceId);
    if (source.draftId !== draftId || source.status !== "ready") throw new DomainError(400, "Fuente no disponible");
    if (kind === "extracted_frame" && (source.kind !== "original_video" || !Number.isFinite(recipe.seconds) || recipe.seconds! < 0 || recipe.seconds! >= source.metadata!.duration!)) throw new DomainError(400, "Frame inválido");
    if (kind !== "extracted_frame" && !["uploaded_image", "extracted_frame", "rendered_cover"].includes(source.kind)) throw new DomainError(400, "Imagen no disponible");
    return publicAsset(await this.reserve(userId, draftId, kind, this.limits.image, recipe));
  }
  async url(userId: string, id: string) {
    const row = await this.get(userId, id);
    if (row.status !== "ready" || !row.mime) throw new DomainError(409, "Media todavía no validada");
    return { url: await this.storage.signedRead(row.objectKey, row.mime), expiresIn: this.limits.signedSeconds };
  }
  async cancel(userId: string, id: string) {
    const row = await this.get(userId, id);
    if (row.status === "ready") throw new DomainError(409, "Elimina el draft para borrar media validada");
    await this.db.update(media).set({ status: "abandoned", deleteAfter: new Date(), updatedAt: new Date() }).where(eq(media.id, id));
    await this.cleanup(userId, id);
  }
  async cleanup(userId: string, id: string) {
    const row = await this.get(userId, id, true);
    if (!["deleting", "abandoned"].includes(row.status)) throw new DomainError(409, "Media no eliminable");
    if (row.leaseUntil && row.leaseUntil > new Date()) return false; // Processor will finish/clean before releasing reservation.
    if (row.uploadId) await this.storage.abort(row.objectKey, row.uploadId);
    await this.storage.remove(row.objectKey);
    await this.db.update(media).set({ status: "deleted", reservedBytes: 0, parts: {}, uploadId: null, updatedAt: new Date() }).where(eq(media.id, id));
    return true;
  }
}
