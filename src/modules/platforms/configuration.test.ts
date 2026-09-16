import { describe, it, expect } from "vitest";
import { strictConfiguration, parseConfigurations, effectiveConfiguration } from "./configuration";
describe("strict platform configuration",()=>{
 it.each([
  {platform:"instagram",enabled:"true"},
  {platform:"instagram",enabled:true,shareToFeed:"false"},
  {platform:"youtube",enabled:true,title:42},
  {platform:"youtube",enabled:true,privacy:"friends"},
  {platform:"tiktok",enabled:true,allowDuet:1},
  {platform:"tiktok",enabled:true,privacy:"public"},
  {platform:"tiktok",enabled:true,cover:"uploaded_image"},
  {platform:"instagram",enabled:true,captionLimit:NaN},
  {platform:"instagram",enabled:true,captionLimit:Infinity},
  {platform:"youtube",enabled:true,thumbnail:"arbitrary"},
  {platform:"youtube",enabled:true,descriptionOverride:[]},
 ])("rejects invalid fields without coercion: %j",value=>expect(()=>strictConfiguration(value)).toThrow());
 it("keeps empty YouTube title and never inherits it",()=>{const config=strictConfiguration({platform:"youtube",enabled:true});const resolved=effectiveConfiguration("shared",config);expect(resolved.config).toMatchObject({title:""});expect(resolved.text).toBe("shared");});
 it.each(["instagram","tiktok","youtube"])("resolves %s inheritance and explicit empty override",platform=>{
  const config=strictConfiguration({platform,enabled:true});expect(effectiveConfiguration("shared",config).text).toBe("shared");
  const specific=strictConfiguration({platform,enabled:true,[platform==="youtube"?"descriptionOverride":"override"]:""});expect(effectiveConfiguration("shared",specific)).toMatchObject({text:"",inherited:false});
 });
 it("preserves deselected configuration and rejects mismatched discriminator",()=>{
  const config=parseConfigurations({instagram:{platform:"instagram",enabled:false,override:"keep"}});expect(config.instagram?.override).toBe("keep");
  expect(()=>parseConfigurations({instagram:{platform:"tiktok",enabled:true}})).toThrow();
 });
});
