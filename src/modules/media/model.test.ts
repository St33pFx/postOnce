import { describe, expect, it } from "vitest";
import { coverState, mediaLimits, terminalVideoRetention, uploadInput } from "./model";
describe("media policies",()=>{
  it("enforces decimal 2 GB / 25 MB boundaries without allocating huge fixtures",()=>{
    const limits=mediaLimits();expect(uploadInput("original_video",2_000_000_000,limits).size).toBe(2_000_000_000);
    expect(()=>uploadInput("original_video",2_000_000_001,limits)).toThrow();
    expect(uploadInput("uploaded_image",25_000_000,limits).size).toBe(25_000_000);
    expect(()=>uploadInput("uploaded_image",25_000_001,limits)).toThrow();
    for(const value of [-1,0,NaN,Infinity,"100"])expect(()=>uploadInput("original_video",value,limits)).toThrow();
    expect(()=>uploadInput("rendered_cover",1,limits)).toThrow();
  });
  it("has configurable limits and rejects invalid configuration",()=>{
    expect(mediaLimits({MEDIA_QUOTA_BYTES:"20"}).quota).toBe(20);expect(()=>mediaLimits({MEDIA_IMAGE_BYTES:"-1"})).toThrow();
  });
  it("validates one bounded editor state and future retention",()=>{
    const state={baseId:crypto.randomUUID(),text:"<script>not markup</script>",x:.5,y:.2,size:.05,style:"banner"};
    expect(coverState(state)).toEqual(state);expect(coverState(null)).toBeNull();
    for(const invalid of [{...state,x:NaN},{...state,size:20},{...state,style:"url(file:///secret)"},{...state,text:"x".repeat(301)}])expect(()=>coverState(invalid)).toThrow();
    expect(terminalVideoRetention(new Date(0)).getTime()).toBe(86_400_000);
  });
});
