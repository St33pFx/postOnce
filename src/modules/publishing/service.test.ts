import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Readable } from "node:stream";
import * as schema from "../../db/schema";
import { platformPublishAttempt, publishBatch } from "../../db/publishing-schema";
import type { PublishingQueue, QueueTransaction } from "../../infrastructure/jobs/publishing";
import { PublishingService, type Platform } from "./service";
import type { PublicationResolver } from "./runtime";
import type { PublishAdapter, PublishOutcome, RemoteState } from "./adapters";

const pg = new PGlite(), embedded = drizzle(pg, { schema }), db = embedded as unknown as NodePgDatabase<typeof schema>;
class Queue implements PublishingQueue {
  attempts:string[]=[];reconciliations:string[]=[];secondaries:string[]=[];
  async enqueueAttempt(_tx:QueueTransaction,id:string){this.attempts.push(id);}
  async enqueueReconciliation(_tx:QueueTransaction,id:string){this.reconciliations.push(id);}
  async enqueueSecondary(_tx:QueueTransaction,id:string){this.secondaries.push(id);}
}
const outcomes:Record<Platform,PublishOutcome>={instagram:{status:"Published",remoteId:"ig-post"},tiktok:{status:"Failed",errorCode:"rejected",errorMessage:"Rejected"},youtube:{status:"UnknownOutcome",errorCode:"lost",errorMessage:"Lost"}};
const reconciled:Record<Platform,RemoteState>={instagram:{status:"Published",remoteId:"ig-post"},tiktok:{status:"Failed",errorCode:"rejected"},youtube:{status:"Published",remoteId:"yt-video"}};
let secondaryFails=false;
class Adapter implements PublishAdapter {
  constructor(readonly platform:Platform){}
  async publish(_input:never,events:Parameters<PublishAdapter["publish"]>[1]){await events.creation(`${this.platform}-creation`,"created");return outcomes[this.platform];}
  async reconcile(){return reconciled[this.platform];}
  async secondary(){if(secondaryFails)throw new Error("thumbnail failed");return {remoteId:"thumbnail"};}
}
const resolver:PublicationResolver=async id=>{const [row]=await embedded.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.id,id));const config=row.platform==="youtube"?{platform:"youtube" as const,enabled:true,title:"Title",privacy:"private" as const}:row.platform==="tiktok"?{platform:"tiktok" as const,enabled:true,privacy:"SELF_ONLY" as const}:{platform:"instagram" as const,enabled:true};return {adapter:new Adapter(row.platform),input:{token:"test",remoteAccountId:"account",caption:"caption",config,video:{size:1,mime:"video/mp4",stream:async()=>Readable.from("x"),url:async()=>"https://media.test/video"}}};};
const ready=(version=1,selected:Platform[]=["instagram","tiktok","youtube"])=>({results:selected.map(platform=>({platform,status:"Ready",reasons:[],issues:[]})),global:{ready:true,status:"Ready",reasons:[]},draftVersion:version}) as never;
beforeAll(()=>migrate(embedded,{migrationsFolder:"src/db/migrations"}));afterAll(()=>pg.close());
beforeEach(()=>{secondaryFails=false;});
async function fixture(caption="draft") {const [user]=await embedded.insert(schema.postonceUsers).values({}).returning();const [draft]=await embedded.insert(schema.drafts).values({userId:user.id,caption,platformConfig:{instagram:{platform:"instagram",enabled:true},tiktok:{platform:"tiktok",enabled:true},youtube:{platform:"youtube",enabled:true,title:"Title",privacy:"private"}}}).returning();return {user,draft};}

describe("durable publishing orchestration",()=>{
  it("reruns server preflight and blocks NotReady before creating a batch",async()=>{
    const f=await fixture(),queue=new Queue(),run=vi.fn(async()=>({results:[{platform:"instagram",status:"NotReady",reasons:["bad"],issues:[]}],global:{ready:false,status:"NotReady",reasons:["bad"]},draftVersion:1}) as never);
    const service=new PublishingService(db,queue,resolver,run);
    await expect(service.start(f.user.id,f.draft.id)).rejects.toMatchObject({status:409});expect(run).toHaveBeenCalledOnce();expect(await embedded.select().from(publishBatch)).toHaveLength(0);expect(queue.attempts).toHaveLength(0);
  });
  it("enqueues atomically and the database allows one active batch per user",async()=>{
    const f=await fixture(),other=await embedded.insert(schema.drafts).values({userId:f.user.id,caption:"other"}).returning(),queue=new Queue(),service=new PublishingService(db,queue,resolver,async()=>ready());
    const created=await service.start(f.user.id,f.draft.id);expect(created.attempts).toHaveLength(3);expect(queue.attempts).toHaveLength(3);
    await expect(service.start(f.user.id,other[0].id)).rejects.toMatchObject({status:409});
  });
  it("persists independent success, failure and unknown outcomes with immediate remote references",async()=>{
    const f=await fixture(),queue=new Queue(),service=new PublishingService(db,queue,resolver,async()=>ready());const created=await service.start(f.user.id,f.draft.id);
    for(const attempt of created.attempts)await service.processAttempt(attempt.id);
    const persisted=await service.get(f.user.id,created.id),byPlatform=Object.fromEntries(persisted.attempts.map(a=>[a.platform,a]));
    expect(byPlatform.instagram).toMatchObject({status:"Published",remoteCreationId:"instagram-creation",remoteId:"ig-post"});
    expect(byPlatform.tiktok).toMatchObject({status:"Failed",remoteCreationId:"tiktok-creation",errorCode:"rejected"});
    expect(byPlatform.youtube).toMatchObject({status:"UnknownOutcome",remoteCreationId:"youtube-creation",errorCode:"lost"});
    expect(persisted.batch.status).toBe("UnknownOutcome");
  });
  it("never blind-retries UnknownOutcome and reconciles only through the adapter",async()=>{
    const f=await fixture(),queue=new Queue(),service=new PublishingService(db,queue,resolver,async()=>ready(1,["youtube"]));const created=await service.start(f.user.id,f.draft.id),attempt=created.attempts[0];await service.processAttempt(attempt.id);
    await expect(service.retry(f.user.id,attempt.id)).rejects.toMatchObject({status:409});await service.reconcile(f.user.id,attempt.id);expect(queue.reconciliations.at(-1)).toBe(attempt.id);
    await service.reconcileAttempt(attempt.id);expect((await service.get(f.user.id,created.id)).attempts[0]).toMatchObject({status:"Published",remoteId:"yt-video"});
  });
  it("retries only the failed platform, preserves attempt history and prevents successful duplicate versions",async()=>{
    const f=await fixture(),queue=new Queue(),service=new PublishingService(db,queue,resolver,async()=>ready(1,["tiktok"]));const created=await service.start(f.user.id,f.draft.id),attempt=created.attempts[0];await service.processAttempt(attempt.id);
    outcomes.tiktok={status:"Published",remoteId:"tt-post"};const retry=await service.retry(f.user.id,attempt.id);expect(retry.attemptNumber).toBe(2);await service.processAttempt(retry.id);
    const persisted=await new PublishingService(db,queue,resolver,async()=>ready(1,["tiktok"])).get(f.user.id,created.id);expect(persisted.attempts.map(a=>a.status)).toEqual(["Failed","Published"]);
    await expect(service.start(f.user.id,f.draft.id)).rejects.toMatchObject({status:409});outcomes.tiktok={status:"Failed",errorCode:"rejected",errorMessage:"Rejected"};
  });
  it("REQ-PC-014: does not enqueue a YouTube thumbnail secondary operation",async()=>{
    const f=await fixture(),queue=new Queue();outcomes.youtube={status:"Published",remoteId:"yt-video"};const service=new PublishingService(db,queue,resolver,async()=>ready(1,["youtube"]));const created=await service.start(f.user.id,f.draft.id);await service.processAttempt(created.attempts[0].id);
    const view=await service.get(f.user.id,created.id);expect(view.secondaryOperations).toHaveLength(0);expect(queue.secondaries).toHaveLength(0);outcomes.youtube={status:"UnknownOutcome",errorCode:"lost",errorMessage:"Lost"};
  });
  it("enforces batch ownership for reads and actions",async()=>{
    const owner=await fixture(),other=await fixture(),queue=new Queue(),service=new PublishingService(db,queue,resolver,async()=>ready(1,["tiktok"]));const created=await service.start(owner.user.id,owner.draft.id);
    await expect(service.get(other.user.id,created.id)).rejects.toMatchObject({status:404});await expect(service.retry(other.user.id,created.attempts[0].id)).rejects.toMatchObject({status:404});
  });
});
