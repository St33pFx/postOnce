import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { media } from "../../db/media-schema";
import { connections, draftConnections } from "../../db/connections-schema";
import { TokenVault } from "../connections/vault";
import { ConnectionService } from "../connections/service";
import { DraftService, type DB } from "../drafts/service";
import { preflight } from "./preflight";
import type { Platform } from "./contract";
import type { Transport } from "./clients";
const pg=new PGlite(), embedded=drizzle(pg,{schema}), db=embedded as unknown as DB;
const vault=new TokenVault({test:Buffer.alloc(32,7)},"test"), grants=new ConnectionService(db,vault), drafts=new DraftService(db);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const external:Transport=vi.fn(async url=>{
 const path=String(url);
 if(path.includes("/me/permissions"))return json({data:[{permission:"instagram_basic",status:"granted"},{permission:"instagram_content_publish",status:"granted"}]});
 if(path.includes("graph.facebook.com"))return json({id:"ig",username:"Instagram",account_type:"BUSINESS"});
 if(path.includes("tokeninfo"))return json({expires_in:3600,scope:"https://www.googleapis.com/auth/youtube.upload"});
 if(path.includes("youtube/v3"))return json({items:[{id:"yt",snippet:{title:"YouTube"}}]});
 if(path.includes("/user/info/"))return json({data:{user:{open_id:"tt"}},error:{code:"ok"}});
 return json({data:{creator_nickname:"TikTok",privacy_level_options:["SELF_ONLY"],comment_disabled:false,duet_disabled:true,stitch_disabled:true,max_video_post_duration_sec:20},error:{code:"ok"}});
});
beforeAll(()=>migrate(embedded,{migrationsFolder:"src/db/migrations"}));afterAll(()=>pg.close());
async function fixture(){
 const [user]=await embedded.insert(schema.postonceUsers).values({}).returning();
 const draft=await drafts.create(user.id);
 const [video]=await embedded.insert(media).values({userId:user.id,draftId:draft.id,kind:"original_video",objectKey:crypto.randomUUID(),status:"ready",size:100,reservedBytes:100,partSize:16,metadata:{width:1080,height:1920,duration:30,container:"mp4",videoCodec:"h264"}}).returning();
 await embedded.update(schema.drafts).set({videoId:video.id,caption:"shared",platformConfig:{instagram:{platform:"instagram",enabled:true,override:"IG text"},tiktok:{platform:"tiktok",enabled:true,privacy:"SELF_ONLY",override:"TT text"},youtube:{platform:"youtube",enabled:true,title:"Specific",privacy:"private",madeForKids:false,containsSyntheticMedia:false,descriptionOverride:"YT text"}}}).where(eq(schema.drafts.id,draft.id));
 const ids={} as Record<Platform,string>;
 for(const [platform,remoteAccountId] of [["instagram","ig"],["tiktok","tt"],["youtube","yt"]] as const){
  const id=await grants.acceptGrant(user.id,{platform,remoteAccountId,scopes:platform === "tiktok" ? ["video.publish"] : [],eligible:true,tokens:{accessToken:`secret-${platform}`},expiresAt:new Date(Date.now()+3600000)});
  ids[platform]=id;await grants.confirmBinding(user.id,draft.id,platform,id,1);await embedded.update(draftConnections).set({requiresRevalidation:false}).where(eq(draftConnections.draftId,draft.id));
 }
 return {user,draft,ids};
}
describe("preflight with DB, encrypted tokens and HTTP-only doubles",()=>{
 it("returns Instagram Ready / TikTok NotReady / YouTube Ready and effective values",async()=>{
  const f=await fixture(), r=await preflight(db,f.user.id,f.draft.id,undefined,{vault,http:external});
  expect(r.results.map(x=>x.status)).toEqual(["Ready","NotReady","Ready"]);expect(r.global.ready).toBe(false);
  expect(r.results.map(x=>x.effective?.text)).toEqual(["IG text","TT text","YT text"]);
  expect(r.results[1].capabilities?.privacy.options).toEqual(["SELF_ONLY"]);
  expect(r.results[1].status).toBe("NotReady");
  expect(JSON.stringify(r)).not.toContain("secret-");
  expect(external).toHaveBeenCalledWith(expect.stringContaining("creator_info"),expect.objectContaining({headers:expect.objectContaining({Authorization:"Bearer secret-tiktok"})}));
 });
 it("rejects other user's draft before any HTTP and no destinations is NotReady",async()=>{
  const a=await fixture(),b=await fixture();const http=vi.fn(external);
  await expect(preflight(db,b.user.id,a.draft.id,undefined,{vault,http})).rejects.toMatchObject({status:404});expect(http).not.toHaveBeenCalled();
  await embedded.update(schema.drafts).set({platformConfig:{}}).where(eq(schema.drafts.id,a.draft.id));expect((await preflight(db,a.user.id,a.draft.id,undefined,{vault,http})).global.ready).toBe(false);
 });
 it.each(["token_missing","token_expired","token_invalid","account_disconnected","binding_stale"])("blocks %s",async code=>{
  const f=await fixture();
  const patch=code==="token_missing"?{tokenEnvelope:null}:code==="token_expired"?{expiresAt:new Date(0)}:code==="token_invalid"?{tokenEnvelope:"broken"}:code==="account_disconnected"?{status:"disconnected" as const}:{revision:2};
  await embedded.update(connections).set(patch).where(eq(connections.id,f.ids.instagram));
  const r=await preflight(db,f.user.id,f.draft.id,undefined,{vault,http:external});expect(r.results[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({code})]));
 });
 it("never retargets a draft to a replacement account",async()=>{
  const f=await fixture();await embedded.update(draftConnections).set({requiresRevalidation:false}).where(eq(draftConnections.draftId,f.draft.id));await grants.acceptGrant(f.user.id,{platform:"instagram",remoteAccountId:"replacement",eligible:true,scopes:[],tokens:{accessToken:"new"}});await embedded.update(draftConnections).set({requiresRevalidation:false}).where(eq(draftConnections.draftId,f.draft.id));
  const r=await preflight(db,f.user.id,f.draft.id,undefined,{vault,http:external});expect(r.results[0].issues[0].code).toBe("account_changed");
 });
 it("requires binding and refuses a binding belonging to another user in SQL",async()=>{
  const f=await fixture(),b=await fixture();await embedded.delete(draftConnections).where(eq(draftConnections.draftId,f.draft.id));
  expect((await preflight(db,f.user.id,f.draft.id,undefined,{vault,http:external})).results[0].issues[0].code).toBe("binding_missing");
  await expect(embedded.insert(draftConnections).values({draftId:f.draft.id,userId:f.user.id,platform:"instagram",connectionId:b.ids.instagram,confirmedRevision:1})).rejects.toThrow();
 });
 it("refreshes each time and propagates provider failure",async()=>{
  const f=await fixture();const http:Transport=vi.fn(async()=>json({},403));
  const r=await preflight(db,f.user.id,f.draft.id,undefined,{vault,http});expect(r.results.every(x=>x.issues[0].code==="insufficient_scopes")).toBe(true);expect(http).toHaveBeenCalledTimes(3);
 });
});


