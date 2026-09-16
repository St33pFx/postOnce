import "./load-env";
import { bossFromEnv, prepareQueues } from "../src/infrastructure/jobs/publishing";

const boss = bossFromEnv(process.env, true, false);
boss.on("error", () => console.error("Job schema migration error"));
try {
  await boss.start();
  await prepareQueues(boss);
  console.log("pg-boss schema and publishing queues are ready.");
} finally { await boss.stop({ graceful: true }); }
