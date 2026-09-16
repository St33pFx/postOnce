import "server-only";
import type { DB } from "../drafts/service";
import { publisherQueue } from "../../infrastructure/jobs/publishing";
import { productionResolver } from "./runtime";
import { PublishingService } from "./service";

export async function publishingService(db: DB) {
  const { queue } = await publisherQueue();
  return new PublishingService(db, queue, productionResolver(db));
}
