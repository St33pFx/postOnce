import { describe, expect, it, vi } from "vitest";
import { InstagramClient, TikTokClient, YouTubeClient, type Transport } from "./clients";
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status});
const transport=(...values:Response[]):Transport=>vi.fn(async()=>values.shift()??response(500,{}));
const identity={data:{user:{open_id:"tt1"}},error:{code:"ok"}};
const creator={data:{creator_nickname:"Creator",privacy_level_options:["SELF_ONLY"],comment_disabled:false,duet_disabled:true,stitch_disabled:false,max_video_post_duration_sec:90},error:{code:"ok"}};
describe("platform external clients",()=>{
 it("parses dynamic Creator Info with real request method and authorization",async()=>{
  const http=transport(response(200,identity),response(200,creator));
  const a=await new TikTokClient(http).refresh("test-token","tt1");
  expect(a.maxVideoPostDurationSec).toBe(90);expect(a.duetDisabled).toBe(true);expect(a.privacyOptions).toEqual(["SELF_ONLY"]);
  expect(http).toHaveBeenLastCalledWith("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",expect.objectContaining({method:"POST",headers:expect.objectContaining({Authorization:"Bearer test-token"})}));
 });
 it.each([401,403])("rejects HTTP %s",async status=>{
  await expect(new InstagramClient(transport(response(status,{}))).refresh("t","ig")).rejects.toMatchObject({code:status===401?"token_invalid":"insufficient_scopes"});
 });
 it("rejects expired Google token",async()=>{
  await expect(new YouTubeClient(transport(response(200,{expires_in:0,scope:"x"}))).refresh("t","yt")).rejects.toMatchObject({code:"token_expired"});
 });
 it.each([new Error("network test-token"),new DOMException("timeout","TimeoutError")])("redacts network/timeout failures",async error=>{
  const http:Transport=vi.fn(async()=>{throw error;});
  await expect(new TikTokClient(http).refresh("test-token","tt1")).rejects.toMatchObject({code:"integration_unavailable",message:"integration_unavailable"});
 });
 it.each([{}, {data:{},error:{code:"ok"}}, {...creator,data:{...creator.data,comment_disabled:"false"}}, {...creator,data:{...creator.data,max_video_post_duration_sec:0}}])("rejects malformed Creator Info",async value=>{
  await expect(new TikTokClient(transport(response(200,identity),response(200,value))).refresh("t","tt1")).rejects.toMatchObject({code:"invalid_payload"});
 });
 it("rejects provider errors in HTTP 200",async()=>{
  await expect(new TikTokClient(transport(response(200,identity),response(200,{error:{code:"scope_not_authorized"}}))).refresh("t","tt1")).rejects.toMatchObject({code:"creator_info_forbidden"});
 });
 it("validates Instagram permissions and professional identity",async()=>{
  const http=transport(response(200,{data:[{permission:"instagram_basic",status:"granted"},{permission:"instagram_content_publish",status:"granted"}]}),response(200,{id:"ig",username:"owner",account_type:"BUSINESS"}));
  expect((await new InstagramClient(http).refresh("t","ig")).scopes).toContain("instagram_content_publish");
 });
 it("does not infer publishing permission from basic permission",async()=>{
  await expect(new InstagramClient(transport(response(200,{data:[{permission:"instagram_basic",status:"granted"}]}))).refresh("t","ig")).rejects.toMatchObject({code:"insufficient_scopes"});
 });
 it("validates YouTube grant and bound channel",async()=>{
  const http=transport(response(200,{expires_in:3600,scope:"https://www.googleapis.com/auth/youtube.upload"}),response(200,{items:[{id:"yt",snippet:{title:"Channel"}}]}));
  expect((await new YouTubeClient(http).refresh("t","yt")).displayName).toBe("Channel");
 });
 it("rejects changed TikTok identity before Creator Info",async()=>{
  await expect(new TikTokClient(transport(response(200,identity))).refresh("t","other")).rejects.toMatchObject({code:"identity_changed"});
 });
});

