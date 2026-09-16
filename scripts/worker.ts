import "./load-env";
import { createConnection } from "../src/db/connection";
import { bossFromEnv, PgBossPublishingQueue, prepareQueues } from "../src/infrastructure/jobs/publishing";
import { PublishingService } from "../src/modules/publishing/service";
import { productionResolver } from "../src/modules/publishing/runtime";
import { registerPublishingWorkers } from "../src/worker/publishing-worker";

const { db, pool } = createConnection();
const boss = bossFromEnv(process.env, false);
boss.on("error", () => console.error("Publishing worker queue error"));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await boss.stop({ graceful: true });
  await pool.end();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

try {
  await boss.start();
  await prepareQueues(boss);
  const service = new PublishingService(db, new PgBossPublishingQueue(boss), productionResolver(db));
  await registerPublishingWorkers(boss, service);
  console.log("PostOnce publishing worker ready.");
  await new Promise<void>(resolve => {
    const timer = setInterval(() => { if (stopping) { clearInterval(timer); resolve(); } }, 250);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Publishing worker failed");
  process.exitCode = 1;
  await stop();
}
