import "./load-env";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { storageFromEnv } from "../src/modules/media/storage";

const storage = storageFromEnv();
try {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      await storage.client.send(new ListBucketsCommand({}), { abortSignal: AbortSignal.timeout(3_000) });
      break;
    } catch {
      if (Date.now() >= deadline) throw new Error("SeaweedFS S3 did not become healthy within 120 seconds. Check local credentials and Docker logs.");
      await new Promise(resolve => setTimeout(resolve, 1_000));
    }
  }
  console.log("SeaweedFS S3 is healthy and authenticated.");
} finally { storage.client.destroy(); }
