import type { MediaMetadata } from "../media/model";
export type Platform = "instagram"|"tiktok"|"youtube";
export type Capability = { available:boolean; reason?:string; options?:string[] };
export type Account = { connected:boolean; eligible:boolean; scopes:string[]; displayName?:string; dynamic?:Record<string,unknown> };
export type PlatformConfig = { enabled:boolean; override?:string; cover?:"uploaded_image"|"frame"|"rendered_cover"; [key:string]:unknown };
export type Preflight = { platform:Platform; status:"Ready"|"NotReady"; reasons:string[]; refreshedAt:string };
export interface PlatformAdapter { readonly platform:Platform; account():Promise<Account>; capabilities(account:Account):Record<string,Capability>; validate(input:{caption:string; config:PlatformConfig; media:MediaMetadata|null; account:Account; capabilities:Record<string,Capability>}):Promise<Preflight>; }
const reason=(platform:Platform,reasons:string[]):Preflight=>({platform,status:reasons.length?"NotReady":"Ready",reasons,refreshedAt:new Date().toISOString()});
export function validatePlatform(platform:Platform,input:{caption:string;config:PlatformConfig;media:MediaMetadata|null;account:Account;capabilities:Record<string,Capability>}):Preflight {
 const {config,media,account,capabilities:c}=input,reasons:string[]=[];
 if(!account.connected) reasons.push("Cuenta no conectada"); else if(!account.eligible) reasons.push("Cuenta no elegible");
 if(!account.scopes.includes(platform==="instagram"?"instagram_basic":platform==="tiktok"?"video.publish":"youtube.upload")) reasons.push("Scopes insuficientes");
 if(!media) reasons.push("Video requerido");
 if(platform==="youtube") { const title=String(config.title??""); if(!title) reasons.push("Título obligatorio"); if([...title].length>100) reasons.push("Título supera 100 caracteres"); if(!config.privacy) reasons.push("Privacy obligatorio"); if(media && (!(media.width&&media.height) || media.duration===undefined || media.duration>180 || media.width/media.height<.5 || media.width/media.height>2)) reasons.push("Video no elegible como Short"); }
 if(platform==="tiktok") { if(!config.privacy) reasons.push("Privacy obligatorio"); if(c.privacy?.available===false) reasons.push("Privacy no disponible"); const max=Number(account.dynamic?.max_video_post_duration_sec??0); if(media?.duration && max && media.duration>max) reasons.push("Duration supera el límite actual"); if(config.cover && config.cover!=="frame") reasons.push("TikTok solo admite frame como cover"); }
 if(platform==="instagram" && config.cover && !["uploaded_image","frame","rendered_cover"].includes(config.cover)) reasons.push("Portada incompatible");
 return reason(platform,reasons);
}
export function globalPreflight(results:Preflight[]){ return {status:results.every(x=>x.status==="Ready")?"Ready":"NotReady" as const,reasons:results.flatMap(x=>x.reasons.map(r=>`${x.platform}: ${r}`))}; }
