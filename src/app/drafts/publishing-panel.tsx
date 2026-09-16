"use client";
import { useEffect, useState } from "react";
import { api } from "./client-api";

type Status = "Pending" | "Publishing" | "Published" | "Failed" | "UnknownOutcome" | "PublishedWithWarning";
type Attempt = { id:string;platform:string;status:Status;attemptNumber:number;remoteId:string|null;progress:number|null;errorCode:string|null;errorMessage:string|null;metadata:{providerStatus?:string};createdAt:string };
type Secondary = { id:string;attemptId:string;kind:string;status:Status;attemptNumber:number;errorCode:string|null;errorMessage:string|null };
type View = { batch:{id:string;status:Status;createdAt:string;updatedAt:string};attempts:Attempt[];secondaryOperations:Secondary[] };
const labels:Record<Status,string>={Pending:"Pendiente",Publishing:"Publicando",Published:"Publicado",Failed:"Falló",UnknownOutcome:"Resultado desconocido",PublishedWithWarning:"Publicado con advertencia"};

export function PublishingPanel({draftId,save}:{draftId:string;save:()=>Promise<void>}) {
  const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function refresh(){setView(await api<View|null>(`/api/drafts/${draftId}/publish`));}
  useEffect(()=>{let live=true;const load=async()=>{try{const next=await api<View|null>(`/api/drafts/${draftId}/publish`);if(live)setView(next);}catch(e){if(live)setError((e as Error).message);}};void load();const timer=setInterval(()=>void load(),3000);return()=>{live=false;clearInterval(timer);};},[draftId]);
  async function action(work:()=>Promise<unknown>){setBusy(true);setError("");try{await work();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const latest=new Map<string,Attempt>();for(const attempt of view?.attempts??[])latest.set(attempt.platform,attempt);
  return <section aria-label="Publicación durable"><h2>Publicación</h2>
    <p>El servidor repite el preflight al iniciar. El worker continúa aunque cierres el navegador.</p>
    <button type="button" disabled={busy||view?.batch.status==="Pending"||view?.batch.status==="Publishing"} onClick={()=>void action(async()=>{await save();setView(await api<View>(`/api/drafts/${draftId}/publish`,"POST",{}));})}>Publicar destinos Ready</button>
    {view&&<div aria-live="polite"><p><strong>Batch: {labels[view.batch.status]}</strong></p><div className="publish-grid">
      {[...latest.values()].map(attempt=><article className="publish-card" key={attempt.id} aria-label={`Publicación ${attempt.platform}`}>
        <h3>{attempt.platform}</h3><p>{labels[attempt.status]} · intento {attempt.attemptNumber}</p>
        {attempt.metadata.providerStatus&&<p>Proveedor: {attempt.metadata.providerStatus}</p>}
        {attempt.progress!==null&&<><progress max="100" value={attempt.progress}/><p>{attempt.progress}%</p></>}
        {attempt.remoteId&&<p>Referencia remota: {attempt.remoteId}</p>}
        {attempt.errorMessage&&<p className="notice">{attempt.errorCode}: {attempt.errorMessage}</p>}
        {attempt.status==="Failed"&&<button disabled={busy} onClick={()=>void action(()=>api(`/api/publish-attempts/${attempt.id}/retry`,"POST",{}))}>Retry {attempt.platform}</button>}
        {attempt.status==="UnknownOutcome"&&<><p>No se publicará otra vez sin evidencia remota.</p><button disabled={busy} onClick={()=>void action(()=>api(`/api/publish-attempts/${attempt.id}/reconcile`,"POST",{}))}>Reconciliar</button></>}
        {view.secondaryOperations.filter(operation=>operation.attemptId===attempt.id).map(operation=><div key={operation.id} className="secondary-operation"><p>Thumbnail: {labels[operation.status]} · intento {operation.attemptNumber}</p>{operation.errorMessage&&<p>{operation.errorMessage}</p>}{operation.status==="Failed"&&<button disabled={busy} onClick={()=>void action(()=>api(`/api/secondary-operations/${operation.id}/retry`,"POST",{}))}>Retry thumbnail</button>}</div>)}
      </article>)}
    </div></div>}
    {error&&<p role="alert" className="notice">{error}</p>}
  </section>;
}
