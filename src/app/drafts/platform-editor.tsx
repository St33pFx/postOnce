"use client";
import { useEffect, useState } from "react";
import type { PlatformConfiguration, Platform } from "../../modules/platforms/contract";
import type { PlatformConfigurations } from "../../modules/platforms/configuration";
import type { preflight } from "../../modules/platforms/preflight";
import { api } from "./client-api";
type Result = Awaited<ReturnType<typeof preflight>>;
type Connection = {id:string;platform:Platform;remoteAccountId:string;displayName:string|null;status:string;revision:number};
export function PlatformEditor({draftId,caption,config,onChange,save}:{draftId:string;caption:string;config:PlatformConfigurations;onChange:(c:PlatformConfigurations)=>void;save:()=>Promise<void>}) {
 const [accounts,setAccounts]=useState<Connection[]>([]),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[stale,setStale]=useState(false);
 useEffect(()=>{let live=true;void api<Connection[]>("/api/connections").then(v=>{if(live)setAccounts(v);}).catch(()=>{if(live)setError("No se pudieron cargar las cuentas");});return()=>{live=false;};},[draftId]);
 function change(c:PlatformConfiguration){onChange({...config,[c.platform]:c});setStale(true);}
 async function run(){setBusy(true);setError("");try{await save();setResult(await api<Result>(`/api/drafts/${draftId}/preflight`,"POST",{}));setStale(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function bind(c:Connection){setBusy(true);setError("");try{await save();await api("/api/connections/confirm","POST",{draftId,platform:c.platform,connectionId:c.id,revision:c.revision});setResult(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section aria-label="Configuración de plataformas"><h2>Destinos y preflight</h2><p>Confirma la cuenta de cada destino y actualiza las capacidades antes de configurar TikTok.</p>
  {(["instagram","tiktok","youtube"] as const).map(platform=>{
   const c:PlatformConfiguration=config[platform]??(platform==="youtube"?{platform,enabled:false,title:""}:{platform,enabled:false});
   const account=accounts.find(a=>a.platform===platform),r=result?.results.find(x=>x.platform===platform);
   const override=c.platform==="youtube"?c.descriptionOverride:c.override;
   const textLabel=c.platform==="youtube"?"Descripción":"Caption";
   const setOverride=(value:string|undefined)=>change(c.platform==="youtube"?{...c,descriptionOverride:value}:{...c,override:value});
   return <fieldset key={platform} aria-label={platform} disabled={busy}>
    <legend>{platform}</legend><label><input type="checkbox" checked={c.enabled} onChange={e=>change({...c,enabled:e.target.checked})}/>Seleccionar {platform}</label>
    <p>Cuenta: {account?.displayName??account?.remoteAccountId??"Sin cuenta conectada"} · {account?.status??"disconnected"}</p>
    {account&&<><p>Identidad: {account.remoteAccountId}</p><button type="button" disabled={account.status!=="connected"} onClick={()=>void bind(account)}>Confirmar cuenta para {platform}</button></>}
    {c.enabled&&<>
     <p>{textLabel} general heredado: {caption||"(vacío)"}</p>
     <label><input type="checkbox" checked={override!==undefined} onChange={e=>setOverride(e.target.checked?caption:undefined)}/>Usar override de {platform}</label>
     {override!==undefined&&<label>{textLabel} específico de {platform}<textarea value={override} maxLength={20000} onChange={e=>setOverride(e.target.value)}/></label>}
     <p>Valor efectivo: {override??caption}</p>
     {c.platform==="instagram"&&<label>Compartir Reel en feed<select value={c.shareToFeed===undefined?"":String(c.shareToFeed)} onChange={e=>change({...c,shareToFeed:e.target.value===""?undefined:e.target.value==="true"})}><option value="">Sin elegir</option><option value="true">Sí</option><option value="false">No</option></select></label>}
     {c.platform==="tiktok"&&<>
      <p>Las opciones se obtienen al ejecutar preflight; no se elige privacidad automáticamente.</p>
      <label>Privacidad de TikTok<select value={c.privacy??""} disabled={!r?.capabilities?.privacy.available} onChange={e=>change({...c,privacy:e.target.value||undefined})}><option value="">Seleccionar</option>{r?.capabilities?.privacy.options?.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
      {(["allowComments","allowDuet","allowStitch"] as const).map((key,index)=><label key={key}><input type="checkbox" disabled={!r?.capabilities?.[["comments","duet","stitch"][index]].available} checked={c[key]===true} onChange={e=>change({...c,[key]:e.target.checked})}/>{["Permitir comentarios","Permitir Duet","Permitir Stitch"][index]}</label>)}
      <label>Contenido generado por IA<select value={c.isAigc===undefined?"":String(c.isAigc)} onChange={e=>change({...c,isAigc:e.target.value===""?undefined:e.target.value==="true"})}><option value="">Sin declarar</option><option value="false">No</option><option value="true">Sí</option></select></label>
     </>}
     {c.platform==="youtube"&&<>
      <label>Título de YouTube<input value={c.title} onChange={e=>change({...c,title:e.target.value})}/></label>
      <label>Privacidad de YouTube<select value={c.privacy??""} onChange={e=>change({...c,privacy:e.target.value===""?undefined:e.target.value as "public"|"private"|"unlisted"})}><option value="">Seleccionar</option><option value="public">Público</option><option value="private">Privado</option><option value="unlisted">No listado</option></select></label>
      {(["madeForKids","containsSyntheticMedia"] as const).map((key,index)=><label key={key}>{["Contenido para niños","Contenido sintético alterado"][index]}<select value={c[key]===undefined?"":String(c[key])} onChange={e=>change({...c,[key]:e.target.value===""?undefined:e.target.value==="true"})}><option value="">Seleccionar</option><option value="false">No</option><option value="true">Sí</option></select></label>)}
     </>}
     {r&&<div aria-label={`Resultado ${platform}`}><strong>{stale?"Revalidación requerida":r.status}</strong><p>{r.account?.displayName}</p><ul>{r.issues.map((reason,i)=><li key={i}>{reason.code}: {reason.message}</li>)}</ul><dl>{Object.entries(r.capabilities??{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value.available?"Disponible":"No disponible"}{value.options?`: ${value.options.join(", ")}`:""}</dd></div>)}</dl></div>}
    </>}
   </fieldset>;
  })}
  <button type="button" disabled={busy} onClick={()=>void run()}>Ejecutar preflight</button>
  {result&&<p aria-label="Resultado global">Global: {stale?"Revalidación requerida":result.global.ready?"Ready":"NotReady"}</p>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
