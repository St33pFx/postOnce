import { PgBoss, fromDrizzle, type Job } from "pg-boss";
import { sql } from "drizzle-orm";
import { databaseConfig } from "../../config/env";

export const queues = {
  publish: "postonce-publish-attempt",
  reconcile: "postonce-reconcile-attempt",
  secondary: "postonce-secondary-operation",
} as const;

export type QueueTransaction = Parameters<typeof fromDrizzle>[0];
export interface PublishingQueue {
  enqueueAttempt(tx: QueueTransaction, attemptId: string): Promise<void>;
  enqueueReconciliation(tx: QueueTransaction, attemptId: string, delaySeconds?: number): Promise<void>;
  enqueueSecondary(tx: QueueTransaction, operationId: string): Promise<void>;
}

export function bossFromEnv(env: NodeJS.ProcessEnv = process.env, migrate = false, supervise = true) {
  const config = databaseConfig(env);
  return new PgBoss({ connectionString: config.url, ssl: config.ssl, schema: "postonce_jobs", migrate,
    createSchema: migrate, supervise, useListenNotify: true, max: 5, connectionTimeoutMillis: 5000 });
}

export async function prepareQueues(boss: PgBoss) {
  for (const name of Object.values(queues)) await boss.createQueue(name, { policy: "standard", retryLimit: 0, expireInSeconds: 300 });
}

export class PgBossPublishingQueue implements PublishingQueue {
  constructor(private readonly boss: PgBoss) {}
  private async send(tx: QueueTransaction, name: string, id: string, data: object, singletonKey: string, startAfter?: number) {
    const jobId = await this.boss.send(name, data, { id, retryLimit: 0, expireInSeconds: 300,
      deleteAfterSeconds: 60 * 60 * 24 * 30, singletonKey, startAfter, db: fromDrizzle(tx, sql) });
    // null means an equivalent queued/active singleton already exists.
    if (!jobId) return;
  }
  enqueueAttempt(tx: QueueTransaction, attemptId: string) { return this.send(tx, queues.publish, attemptId, { attemptId }, attemptId); }
  enqueueReconciliation(tx: QueueTransaction, attemptId: string, delaySeconds = 15) {
    return this.send(tx, queues.reconcile, crypto.randomUUID(), { attemptId }, attemptId, delaySeconds);
  }
  enqueueSecondary(tx: QueueTransaction, operationId: string) { return this.send(tx, queues.secondary, operationId, { operationId }, operationId); }
}

let sender: Promise<{ boss: PgBoss; queue: PgBossPublishingQueue }> | undefined;
export function publisherQueue() {
  return sender ??= (async () => {
    const boss = bossFromEnv(process.env, false, false);
    boss.on("error", () => console.error("Publishing queue error"));
    await boss.start();
    await prepareQueues(boss);
    return { boss, queue: new PgBossPublishingQueue(boss) };
  })();
}

export type AttemptJob = Job<{ attemptId: string }>;
export type SecondaryJob = Job<{ operationId: string }>;
