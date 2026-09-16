import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../drafts/service";
import { drafts, postonceUsers } from "../../db/schema";
import { platformPublishAttempt, publishBatch, secondaryOperation } from "../../db/publishing-schema";
import { preflight } from "../platforms/preflight";
import { DomainError } from "../media/model";
import type { PublishingQueue, QueueTransaction } from "../../infrastructure/jobs/publishing";
import { ProviderError, type PersistEvents, type PublishOutcome, type RemoteState } from "./adapters";
import type { PublicationResolver, ResolvedPublication } from "./runtime";

export const platforms = ["instagram", "tiktok", "youtube"] as const;
export type Platform = typeof platforms[number];
type PreflightResult = Awaited<ReturnType<typeof preflight>>;
type PreflightRunner = (userId: string, draftId: string) => Promise<PreflightResult>;
const terminal = ["Published", "PublishedWithWarning", "Failed", "UnknownOutcome"] as const;

export class PublishingService {
  constructor(private readonly db: DB, private readonly queue: PublishingQueue, private readonly resolve: PublicationResolver,
    private readonly runPreflight: PreflightRunner = (userId, draftId) => preflight(db, userId, draftId)) {}

  async start(userId: string, draftId: string) {
    const checked = await this.runPreflight(userId, draftId);
    if (!checked.global.ready) throw new DomainError(409, "El preflight no está Ready");
    const selected = checked.results.filter(result => result.status === "Ready").map(result => result.platform);
    if (!selected.length) throw new DomainError(409, "Selecciona al menos una plataforma");
    try {
      return await this.db.transaction(async tx => {
        await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
        const [draft] = await tx.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId), isNull(drafts.deletedAt)));
        if (!draft || draft.version !== checked.draftVersion || draft.lockedAt) throw new DomainError(409, "El draft cambió después del preflight");
        const [sameVersion] = await tx.select({ id: publishBatch.id }).from(publishBatch).where(and(eq(publishBatch.draftId, draftId), eq(publishBatch.userId, userId), eq(publishBatch.draftVersion, draft.version))).limit(1);
        if (sameVersion) throw new DomainError(409, "Esta versión del draft ya tiene historial; usa retry individual o crea una nueva versión");
        const [batch] = await tx.insert(publishBatch).values({ userId, draftId, draftVersion: draft.version }).returning();
        const attempts = await tx.insert(platformPublishAttempt).values(selected.map(platform => ({ batchId: batch.id, platform }))).returning();
        await tx.update(drafts).set({ lockedAt: new Date(), updatedAt: new Date() }).where(eq(drafts.id, draftId));
        for (const attempt of attempts) await this.queue.enqueueAttempt(tx as unknown as QueueTransaction, attempt.id);
        return { ...batch, attempts };
      });
    } catch (error) {
      if ((error as { code?: string; cause?: { code?: string } }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") throw new DomainError(409, "Ya existe un batch activo para este usuario");
      throw error;
    }
  }

  async get(userId: string, batchId: string) {
    const [batch] = await this.db.select().from(publishBatch).where(and(eq(publishBatch.id, batchId), eq(publishBatch.userId, userId)));
    if (!batch) throw new DomainError(404, "Batch no disponible");
    const attempts = await this.db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.batchId, batch.id)).orderBy(asc(platformPublishAttempt.createdAt));
    const secondaries = attempts.length ? await this.db.select().from(secondaryOperation).where(inArray(secondaryOperation.attemptId, attempts.map(a => a.id))).orderBy(asc(secondaryOperation.createdAt)) : [];
    return { batch, attempts, secondaryOperations: secondaries };
  }

  async latestForDraft(userId: string, draftId: string) {
    const [batch] = await this.db.select().from(publishBatch).where(and(eq(publishBatch.userId, userId), eq(publishBatch.draftId, draftId))).orderBy(desc(publishBatch.createdAt)).limit(1);
    return batch ? this.get(userId, batch.id) : null;
  }

  async retry(userId: string, attemptId: string) {
    return this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const [attempt] = await tx.select({ attempt: platformPublishAttempt, batch: publishBatch }).from(platformPublishAttempt)
        .innerJoin(publishBatch, eq(publishBatch.id, platformPublishAttempt.batchId))
        .where(and(eq(platformPublishAttempt.id, attemptId), eq(publishBatch.userId, userId)));
      if (!attempt) throw new DomainError(404, "Attempt no disponible");
      const history = await tx.select().from(platformPublishAttempt).where(and(eq(platformPublishAttempt.batchId, attempt.batch.id), eq(platformPublishAttempt.platform, attempt.attempt.platform))).orderBy(desc(platformPublishAttempt.attemptNumber));
      if (history[0]?.id !== attemptId || attempt.attempt.status !== "Failed" || history.some(row => ["Published", "PublishedWithWarning", "UnknownOutcome", "Publishing", "Pending"].includes(row.status))) {
        throw new DomainError(409, "Solo el último attempt fallido admite retry individual");
      }
      const [created] = await tx.insert(platformPublishAttempt).values({ batchId: attempt.batch.id, platform: attempt.attempt.platform,
        attemptNumber: attempt.attempt.attemptNumber + 1 }).returning();
      await tx.update(publishBatch).set({ status: "Pending", completedAt: null, updatedAt: new Date() }).where(eq(publishBatch.id, attempt.batch.id));
      await tx.update(drafts).set({ lockedAt: new Date() }).where(eq(drafts.id, attempt.batch.draftId));
      await this.queue.enqueueAttempt(tx as unknown as QueueTransaction, created.id);
      return created;
    });
  }

  async reconcile(userId: string, attemptId: string) {
    return this.db.transaction(async tx => {
      const [attempt] = await tx.select({ id: platformPublishAttempt.id, status: platformPublishAttempt.status }).from(platformPublishAttempt)
        .innerJoin(publishBatch, eq(publishBatch.id, platformPublishAttempt.batchId))
        .where(and(eq(platformPublishAttempt.id, attemptId), eq(publishBatch.userId, userId))).for("update");
      if (!attempt) throw new DomainError(404, "Attempt no disponible");
      if (!(["UnknownOutcome", "Publishing"] as string[]).includes(attempt.status)) throw new DomainError(409, "Este attempt no requiere reconciliación");
      await this.queue.enqueueReconciliation(tx as unknown as QueueTransaction, attempt.id, 0);
      return { accepted: true };
    });
  }

  async retrySecondary(userId: string, operationId: string) {
    return this.db.transaction(async tx => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const [row] = await tx.select({ operation: secondaryOperation, attempt: platformPublishAttempt, batch: publishBatch }).from(secondaryOperation)
        .innerJoin(platformPublishAttempt, eq(platformPublishAttempt.id, secondaryOperation.attemptId))
        .innerJoin(publishBatch, eq(publishBatch.id, platformPublishAttempt.batchId))
        .where(and(eq(secondaryOperation.id, operationId), eq(publishBatch.userId, userId)));
      if (!row || row.operation.status !== "Failed" || row.attempt.status !== "PublishedWithWarning") throw new DomainError(409, "Operación secundaria no reintentable");
      const [latest] = await tx.select().from(secondaryOperation).where(and(eq(secondaryOperation.attemptId, row.attempt.id), eq(secondaryOperation.kind, row.operation.kind))).orderBy(desc(secondaryOperation.attemptNumber)).limit(1);
      if (latest.id !== operationId) throw new DomainError(409, "Solo la última operación fallida admite retry");
      const [created] = await tx.insert(secondaryOperation).values({ attemptId: row.attempt.id, kind: row.operation.kind, attemptNumber: row.operation.attemptNumber + 1 }).returning();
      await tx.update(platformPublishAttempt).set({ status: "Published", updatedAt: new Date() }).where(eq(platformPublishAttempt.id, row.attempt.id));
      await tx.update(publishBatch).set({ status: "Publishing", completedAt: null, updatedAt: new Date() }).where(eq(publishBatch.id, row.batch.id));
      await tx.update(drafts).set({ lockedAt: new Date() }).where(eq(drafts.id, row.batch.draftId));
      await this.queue.enqueueSecondary(tx as unknown as QueueTransaction, created.id);
      return created;
    });
  }

  private events(attemptId: string): PersistEvents {
    const update = async (patch: Partial<typeof platformPublishAttempt.$inferInsert>, stage: string) => {
      const [current] = await this.db.select({ metadata: platformPublishAttempt.metadata }).from(platformPublishAttempt).where(eq(platformPublishAttempt.id, attemptId));
      await this.db.update(platformPublishAttempt).set({ ...patch, metadata: { ...(current?.metadata ?? {}), stage }, updatedAt: new Date() }).where(eq(platformPublishAttempt.id, attemptId));
    };
    return { creation: (id, stage) => update({ remoteCreationId: id }, stage), remote: (id, stage) => update({ remoteId: id }, stage), stage: stage => update({}, stage) };
  }

  async processAttempt(attemptId: string) {
    const [claimed] = await this.db.update(platformPublishAttempt).set({ status: "Publishing", requestStartedAt: new Date(), startedAt: new Date(), errorCode: null,
      errorMessage: null, updatedAt: new Date() }).where(and(eq(platformPublishAttempt.id, attemptId), eq(platformPublishAttempt.status, "Pending"))).returning();
    if (!claimed) {
      const [existing] = await this.db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.id, attemptId));
      if (existing && (existing.status === "Publishing" || existing.status === "UnknownOutcome")) await this.reconcileAttempt(attemptId);
      return;
    }
    let resolved: ResolvedPublication | undefined;
    try {
      resolved = await this.resolve(attemptId);
      const outcome = await resolved.adapter.publish(resolved.input, this.events(attemptId));
      await this.settle(attemptId, outcome, resolved);
    } catch (error) {
      const provider = error instanceof ProviderError ? error : undefined;
      await this.settle(attemptId, { status: provider?.definitive ? "Failed" : provider ? "UnknownOutcome" : "Failed",
        errorCode: provider?.code ?? "configuration_unavailable", errorMessage: provider?.message ?? "No se pudo preparar la publicación" }, resolved);
    }
  }

  async reconcileAttempt(attemptId: string) {
    const [attempt] = await this.db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.id, attemptId));
    if (!attempt || !["Publishing", "UnknownOutcome"].includes(attempt.status)) return;
    let resolved: ResolvedPublication | undefined;
    try {
      resolved = await this.resolve(attemptId);
      const outcome = await resolved.adapter.reconcile({ ...resolved.input, remoteCreationId: attempt.remoteCreationId,
        remoteId: attempt.remoteId, stage: attempt.metadata.stage }, this.events(attemptId));
      await this.settle(attemptId, outcome, resolved);
    } catch (error) {
      const provider = error instanceof ProviderError ? error : undefined;
      await this.settle(attemptId, { status: provider?.definitive ? "Failed" : "UnknownOutcome", errorCode: provider?.code ?? "reconciliation_unavailable",
        errorMessage: provider?.message ?? "No se pudo reconciliar con el proveedor" }, resolved);
    }
  }

  private async settle(attemptId: string, outcome: PublishOutcome | RemoteState, resolved?: ResolvedPublication) {
    const now = new Date(), done = terminal.includes(outcome.status as typeof terminal[number]);
    await this.db.update(platformPublishAttempt).set({ status: outcome.status, remoteId: outcome.remoteId, progress: outcome.progress,
      errorCode: outcome.errorCode ?? null, errorMessage: outcome.errorMessage ?? null,
      metadata: sql`coalesce(${platformPublishAttempt.metadata}, '{}'::jsonb) || ${JSON.stringify({ providerStatus: outcome.providerStatus })}::jsonb`,
      completedAt: done ? now : null, updatedAt: now }).where(eq(platformPublishAttempt.id, attemptId));
    if (outcome.status === "Publishing") {
      await this.db.transaction(tx => this.queue.enqueueReconciliation(tx as unknown as QueueTransaction, attemptId));
    } else if (outcome.status === "Published" && resolved?.thumbnail) {
      await this.db.transaction(async tx => {
        const existing = await tx.select({ id: secondaryOperation.id }).from(secondaryOperation).where(and(eq(secondaryOperation.attemptId, attemptId), eq(secondaryOperation.kind, "youtube_thumbnail")));
        if (!existing.length) {
          const [operation] = await tx.insert(secondaryOperation).values({ attemptId, kind: "youtube_thumbnail" }).returning();
          await this.queue.enqueueSecondary(tx as unknown as QueueTransaction, operation.id);
        }
      });
    }
    await this.refreshBatchForAttempt(attemptId);
  }

  async processSecondary(operationId: string) {
    const [operation] = await this.db.update(secondaryOperation).set({ status: "Publishing", requestStartedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(secondaryOperation.id, operationId), eq(secondaryOperation.status, "Pending"))).returning();
    if (!operation) return;
    const [attempt] = await this.db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.id, operation.attemptId));
    if (!attempt?.remoteId) return this.failSecondary(operation, "missing_remote_reference", "El video publicado no tiene referencia remota");
    try {
      const resolved = await this.resolve(attempt.id);
      if (!resolved.thumbnail || !resolved.adapter.secondary) return this.failSecondary(operation, "secondary_unsupported", "La operación secundaria no está disponible");
      const result = await resolved.adapter.secondary({ ...resolved.input, remoteId: attempt.remoteId, asset: resolved.thumbnail });
      await this.db.update(secondaryOperation).set({ status: "Published", remoteId: result.remoteId, completedAt: new Date(), updatedAt: new Date() }).where(eq(secondaryOperation.id, operation.id));
      await this.refreshBatchForAttempt(attempt.id);
    } catch (error) {
      const provider = error instanceof ProviderError ? error : undefined;
      await this.failSecondary(operation, provider?.code ?? "secondary_failed", provider?.message ?? "Falló la operación secundaria");
    }
  }

  private async failSecondary(operation: typeof secondaryOperation.$inferSelect, code: string, message: string) {
    await this.db.update(secondaryOperation).set({ status: "Failed", errorCode: code, errorMessage: message, completedAt: new Date(), updatedAt: new Date() }).where(eq(secondaryOperation.id, operation.id));
    await this.db.update(platformPublishAttempt).set({ status: "PublishedWithWarning", updatedAt: new Date() }).where(eq(platformPublishAttempt.id, operation.attemptId));
    await this.refreshBatchForAttempt(operation.attemptId);
  }

  async recoverUnfinished() {
    const attempts = await this.db.select({ id: platformPublishAttempt.id }).from(platformPublishAttempt).where(eq(platformPublishAttempt.status, "Publishing"));
    for (const attempt of attempts) await this.db.transaction(tx => this.queue.enqueueReconciliation(tx as unknown as QueueTransaction, attempt.id, 0));
  }

  private async refreshBatchForAttempt(attemptId: string) {
    const [attempt] = await this.db.select({ batchId: platformPublishAttempt.batchId }).from(platformPublishAttempt).where(eq(platformPublishAttempt.id, attemptId));
    if (!attempt) return;
    const attempts = await this.db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.batchId, attempt.batchId)).orderBy(asc(platformPublishAttempt.attemptNumber));
    const latest = new Map<Platform, typeof attempts[number]>();
    for (const row of attempts) latest.set(row.platform, row);
    const values = [...latest.values()];
    const operations = values.length ? await this.db.select().from(secondaryOperation).where(inArray(secondaryOperation.attemptId, values.map(v => v.id))).orderBy(asc(secondaryOperation.attemptNumber)) : [];
    const latestSecondary = new Map<string, typeof operations[number]>();
    for (const operation of operations) latestSecondary.set(`${operation.attemptId}:${operation.kind}`, operation);
    let status: typeof publishBatch.$inferSelect.status;
    if (values.some(v => v.status === "Pending")) status = "Pending";
    else if (values.some(v => v.status === "Publishing") || [...latestSecondary.values()].some(v => ["Pending", "Publishing"].includes(v.status))) status = "Publishing";
    else if (values.some(v => v.status === "UnknownOutcome")) status = "UnknownOutcome";
    else if (values.some(v => v.status === "Failed")) status = "Failed";
    else if (values.some(v => v.status === "PublishedWithWarning") || [...latestSecondary.values()].some(v => v.status === "Failed")) status = "PublishedWithWarning";
    else status = "Published";
    const finished = terminal.includes(status as typeof terminal[number]);
    const [batch] = await this.db.update(publishBatch).set({ status, completedAt: finished ? new Date() : null, updatedAt: new Date() }).where(eq(publishBatch.id, attempt.batchId)).returning();
    if (batch) await this.db.update(drafts).set({ lockedAt: finished ? null : new Date(), updatedAt: new Date() }).where(eq(drafts.id, batch.draftId));
  }
}
