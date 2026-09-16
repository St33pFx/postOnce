import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { InstagramPublisher, ProviderError, TikTokPublisher, YouTubePublisher, type PersistEvents, type PublishAsset } from "./adapters";

const json=(body:unknown,status=200,headers?:HeadersInit)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json",...headers}});
const video:PublishAsset={size:10,mime:"video/mp4",stream:async()=>Readable.from(Buffer.from("0123456789")),url:async()=>"https://media.example/video.mp4?signature=test"};
function events(){const calls:string[]=[];const value:PersistEvents={creation:async(id,stage)=>{calls.push(`creation:${id}:${stage}`);},remote:async(id,stage)=>{calls.push(`remote:${id}:${stage}`);},stage:async stage=>{calls.push(`stage:${stage}`);}};return {calls,value};}

describe("official platform publishing clients with injected HTTP",()=>{
  it("publishes Instagram only after container FINISHED and persists both remote IDs",async()=>{
    const http=vi.fn<typeof fetch>().mockResolvedValueOnce(json({id:"container-1"})).mockResolvedValueOnce(json({status_code:"FINISHED",status:"Ready"})).mockResolvedValueOnce(json({id:"media-1"}));
    const e=events(),out=await new InstagramPublisher(http).publish({token:"token",remoteAccountId:"ig-user",caption:"caption",config:{platform:"instagram",enabled:true,shareToFeed:true},video},e.value);
    expect(out).toMatchObject({status:"Published",remoteId:"media-1"});expect(e.calls).toEqual(["stage:container-requested","creation:container-1:container-created","stage:publish-requested","remote:media-1:published"]);
    expect(http.mock.calls[0][0]).toContain("/ig-user/media");expect(String(http.mock.calls[0][1]?.body)).toContain("video_url=");expect(http.mock.calls[2][0]).toContain("media_publish");
  });
  it("reconciles Instagram PUBLISHED without repeating media_publish",async()=>{
    const http=vi.fn<typeof fetch>().mockResolvedValue(json({status_code:"PUBLISHED"})),e=events();const out=await new InstagramPublisher(http).reconcile({token:"t",remoteAccountId:"ig",caption:"",config:{platform:"instagram",enabled:true},video,remoteCreationId:"container",remoteId:null,stage:"publish-requested"},e.value);
    expect(out.status).toBe("Published");expect(http).toHaveBeenCalledOnce();expect(e.calls).toEqual([]);
  });
  it("uses TikTok Direct Post PULL_FROM_URL and reconciles complete, failed and unknown states",async()=>{
    const http=vi.fn<typeof fetch>().mockResolvedValueOnce(json({data:{publish_id:"publish-1"},error:{code:"ok"}})).mockResolvedValueOnce(json({data:{status:"PUBLISH_COMPLETE",publicaly_available_post_id:["post-1"]},error:{code:"ok"}})).mockResolvedValueOnce(json({data:{status:"FAILED",fail_reason:"spam_risk"},error:{code:"ok"}})).mockResolvedValueOnce(json({data:{status:"SOMETHING_NEW"},error:{code:"ok"}}));
    const client=new TikTokPublisher(http),e=events(),input={token:"token",remoteAccountId:"tt",caption:"caption",config:{platform:"tiktok" as const,enabled:true,privacy:"SELF_ONLY" as const},video};
    expect(await client.publish(input,e.value)).toMatchObject({status:"Publishing"});expect(e.calls.at(-1)).toBe("creation:publish-1:post-initialized");expect(String(http.mock.calls[0][1]?.body)).toContain("PULL_FROM_URL");
    expect(await client.reconcile({...input,remoteCreationId:"publish-1",remoteId:null,stage:"post-initialized"})).toMatchObject({status:"Published",remoteId:"post-1"});
    expect((await client.reconcile({...input,remoteCreationId:"publish-1",remoteId:null})).status).toBe("Failed");
    expect((await client.reconcile({...input,remoteCreationId:"publish-1",remoteId:null})).status).toBe("UnknownOutcome");
  });
  it("uploads YouTube resumably, persists video ID, reconciles processing and sets thumbnail independently",async()=>{
    const http=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null,{status:200,headers:{location:"https://upload.youtube.test/session"}})).mockResolvedValueOnce(json({id:"video-1"})).mockResolvedValueOnce(json({items:[{id:"video-1",processingDetails:{processingStatus:"processing",processingProgress:{partsTotal:4,partsProcessed:2}}}]})).mockResolvedValueOnce(json({items:[{id:"video-1"}]}));
    const client=new YouTubePublisher(http),e=events(),input={token:"token",remoteAccountId:"channel",caption:"description",config:{platform:"youtube" as const,enabled:true,title:"Title",privacy:"private" as const,madeForKids:false,containsSyntheticMedia:false},video};
    expect(await client.publish(input,e.value)).toMatchObject({status:"Publishing",remoteId:"video-1"});expect(e.calls).toContain("remote:video-1:video-created");expect(http.mock.calls[1][0]).toBe("https://upload.youtube.test/session");
    expect(await client.reconcile({...input,remoteCreationId:null,remoteId:"video-1"})).toMatchObject({status:"Publishing",progress:50});
    expect(await client.secondary!({...input,remoteId:"video-1",asset:video})).toEqual({remoteId:"video-1"});expect(http.mock.calls[3][0]).toContain("thumbnails/set");
  });
  it("classifies definitive provider rejection separately from an uncertain network outcome",async()=>{
    const rejected=new InstagramPublisher(vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:400})));
    await expect(rejected.publish({token:"t",remoteAccountId:"ig",caption:"",config:{platform:"instagram",enabled:true},video},events().value)).rejects.toMatchObject({definitive:true,code:"provider_http_400"});
    const uncertain=new TikTokPublisher(vi.fn<typeof fetch>().mockRejectedValue(new Error("secret transport detail")));
    await expect(uncertain.publish({token:"t",remoteAccountId:"tt",caption:"",config:{platform:"tiktok",enabled:true,privacy:"SELF_ONLY"},video},events().value)).rejects.toEqual(expect.objectContaining<Partial<ProviderError>>({definitive:false,code:"provider_network_error"}));
  });
});
