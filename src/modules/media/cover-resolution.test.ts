import { describe, expect, it } from "vitest";
import { resolvePublishableCover } from "./cover-resolution";
import type { CoverState } from "./model";

const baseId="11111111-1111-4111-8111-111111111111", renderedId="22222222-2222-4222-8222-222222222222";
const cover:CoverState={baseId,text:"pruebitaaas",x:.5,y:.5,size:.07,style:"banner"};
const rows=(recipeCover:CoverState|null=null)=>[
  {id:baseId,kind:"extracted_frame",status:"ready",recipe:null},
  {id:renderedId,kind:"rendered_cover",status:"ready",recipe:recipeCover?{sourceId:baseId,cover:recipeCover}:null},
];

describe("cover publication resolution",()=>{
  it("REQ-PC-014: rejects a stale render when CoverState changes",()=>{
    const stale={...cover,text:"old"};
    expect(resolvePublishableCover(rows(stale),cover)).toBeUndefined();
  });
  it("keeps the selected raw frame for an unedited cover",()=>{
    expect(resolvePublishableCover(rows(),{...cover,text:""})?.id).toBe(baseId);
  });
});
