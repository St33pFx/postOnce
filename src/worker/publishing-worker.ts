import type { PgBoss, Job } from "pg-boss";
import { queues, type AttemptJob, type SecondaryJob } from "../infrastructure/jobs/publishing";
import type { PublishingService } from "../modules/publishing/service";

export async function registerPublishingWorkers(boss: PgBoss, service: PublishingService) {
  await service.recoverUnfinished();
  const registrations = await Promise.all([
    boss.work<{ attemptId: string }>(queues.publish, { batchSize: 1, localConcurrency: 3 }, async (jobs: Job<{attemptId:string}>[]) => {
      for (const job of jobs as AttemptJob[]) await service.processAttempt(job.data.attemptId);
    }),
    boss.work<{ attemptId: string }>(queues.reconcile, { batchSize: 1, localConcurrency: 3 }, async (jobs: Job<{attemptId:string}>[]) => {
      for (const job of jobs as AttemptJob[]) await service.reconcileAttempt(job.data.attemptId);
    }),
    boss.work<{ operationId: string }>(queues.secondary, { batchSize: 1, localConcurrency: 2 }, async (jobs: Job<{operationId:string}>[]) => {
      for (const job of jobs as SecondaryJob[]) await service.processSecondary(job.data.operationId);
    }),
  ]);
  return registrations;
}
