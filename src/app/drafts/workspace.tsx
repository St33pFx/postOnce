"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Autosave, type SaveStatus } from "../../modules/drafts/autosave";
import type { CoverState, MediaMetadata } from "../../modules/media/model";
import { PlatformEditor } from "./platform-editor";
import { parseConfigurations, type PlatformConfigurations } from "../../modules/platforms/configuration";
import { api, uploadFile } from "./client-api";
import { PublishingPanel } from "./publishing-panel";
type Draft={id:string;caption:string|null;version:number;videoId:string|null;cover:CoverState|null;updatedAt:string};
type Asset={id:string;kind:string;status:string;size:number;partSize:number;metadata:MediaMetadata|null;recipe:{sourceId:string}|null;error:string|null};
type Editable={caption:string;videoId:string|null;cover:CoverState|null;platformConfig:PlatformConfigurations};
type Open={draft:Draft & {platformConfig?:PlatformConfigurations};assets:Asset[];usage:{used:number;limit:number};limits:{video:number;image:number}};
const labels:Record<SaveStatus,string>={saved:"Guardado en el servidor",pending:"Cambios pendientes",saving:"Guardando…",conflict:"Conflicto: existe otra versión",error:"No se pudo guardar"};
const assetLabels:Record<string,string>={initiating:"Iniciando upload",uploading:"Upload pendiente",uploaded:"Pendiente de validación",processing:"Procesando…",ready:"Validado",failed:"Falló la validación",abandoned:"Cancelado; limpieza pendiente",deleting:"Eliminación pendiente"};
const bytes=(n:number)=>`${(n/1_000_000).toFixed(1)} MB`;
export function DraftWorkspace(){
  const [list,setList]=useState<Draft[]>([]),[open,setOpen]=useState<Open|null>(null);
  const [edit,setEdit]=useState<Editable>({caption:"",videoId:null,cover:null,platformConfig:{}});
  const [status,setStatus]=useState<SaveStatus>("saved"),[error,setError]=useState("");
  const [urls,setUrls]=useState<Record<string,string>>({}),[seconds,setSeconds]=useState(0);
  const [upload,setUpload]=useState<{id:string;bytes:number;total:number}|null>(null);
  const [busy,setBusy]=useState(false);
  const saver=useRef<Autosave<Editable>|null>(null),controller=useRef<AbortController|null>(null);
  const [previewWidth,setPreviewWidth]=useState(320);
  const preview=useRef<HTMLDivElement>(null);
  const latest=useRef(edit); latest.current=edit;
  const listDrafts=async()=>setList(await api<Draft[]>("/api/drafts"));
  useEffect(()=>{void listDrafts().catch(e=>setError(e.message));return()=>{saver.current?.dispose();controller.current?.abort();};},[]);
  useEffect(()=>{
    const handler=(e:BeforeUnloadEvent)=>{if(saver.current?.status!=="saved"||controller.current){e.preventDefault();}};
    window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);
  },[]);
  useEffect(()=>{
    if(!open)return;
    let live=true;
    const refresh=async()=>{
      try{
        const next=await api<Open>(`/api/drafts/${open.draft.id}`);
        if(!live)return;
        saver.current?.externalVersion(next.draft.version);
        setOpen(next);
        const signed:Record<string,string>={};
        for(const asset of next.assets.filter(a=>a.status==="ready")){
          if(asset.id===latest.current.videoId||asset.id===latest.current.cover?.baseId||asset.kind==="rendered_cover"||asset.kind==="thumbnail"){
            signed[asset.id]=(await api<{url:string}>(`/api/media/${asset.id}/url`)).url;
          }
        }
        if(live)setUrls(signed);
      }catch(e){if(live)setError((e as Error).message);}
    };
    void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{live=false;clearInterval(timer);};
  },[open?.draft.id]); // Asset polling never overwrites local editor data.
  useEffect(()=>{
    if(!preview.current)return;
    const observer=new ResizeObserver(entries=>setPreviewWidth(entries[0].contentRect.width));
    observer.observe(preview.current);return()=>observer.disconnect();
  },[edit.cover?.baseId]);
  async function select(id:string,discard=false){
    if(!discard){await saver.current?.flush();if(saver.current&&saver.current.status!=="saved"&&!window.confirm("Hay cambios sin guardar. ¿Descartarlos y abrir otro draft?"))return;}
    const data=await api<Open>(`/api/drafts/${id}`);
    saver.current?.dispose();setOpen(data);setEdit({caption:data.draft.caption??"",videoId:data.draft.videoId,cover:data.draft.cover,platformConfig:parseConfigurations(data.draft.platformConfig??{})});setStatus("saved");setError("");setUrls({});
    saver.current=new Autosave(data.draft.version,async(value,version)=>{
      const saved=await api<Draft>(`/api/drafts/${id}`,"PATCH",{...value,version});void listDrafts();return saved;
    },setStatus);
  }
  function change(value:Editable){setEdit(value);saver.current?.edit(value);}
  function coverChange(patch:Partial<CoverState>){if(latest.current.cover)change({...latest.current,cover:{...latest.current.cover,...patch}});}
  async function action(work:()=>Promise<void>){setError("");setBusy(true);try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function refresh(){if(open)setOpen(await api<Open>(`/api/drafts/${open.draft.id}`));}
  async function startUpload(file:File,kind:string,resume?:Asset){
    if(!open)return;
    const asset=resume??await api<Asset>("/api/media","POST",{draftId:open.draft.id,kind,size:file.size});
    const abort=new AbortController();controller.current=abort;setUpload({id:asset.id,bytes:0,total:file.size});
    try{await uploadFile(file,asset,n=>setUpload({id:asset.id,bytes:n,total:file.size}),abort.signal);await api(`/api/media/${asset.id}/process`,"POST");}
    finally{controller.current=null;setUpload(null);await refresh();}
  }
  async function derive(kind:string,sourceId:string,cover?:CoverState){
    if(!open)return;
    await saver.current?.flush();if(saver.current?.status!=="saved")throw new Error("Guarda o resuelve el conflicto antes de generar media");
    const asset=await api<Asset>("/api/media","POST",{draftId:open.draft.id,kind,sourceId,seconds,cover});
    await refresh();await api(`/api/media/${asset.id}/process`,"POST");
  }
  async function saveForServerAction(){await saver.current?.flush();if(saver.current?.status!=="saved")throw new Error("Guarda o resuelve el conflicto antes de continuar");}
  const base=open?.assets.find(a=>a.id===edit.cover?.baseId);
  const video=open?.assets.find(a=>a.id===edit.videoId);
  return <main className="draft-workspace"><nav><Link href="/account">Cuenta</Link><span>Drafts y media</span></nav>
    <h1>Tus drafts</h1><p>El trabajo marcado como guardado está disponible al iniciar sesión en otro dispositivo.</p>
    <button disabled={busy||!!upload} onClick={()=>void action(async()=>{await saver.current?.flush();if(saver.current&&saver.current.status!=="saved")throw new Error("Resuelve los cambios pendientes primero");const d=await api<Draft>("/api/drafts","POST");await listDrafts();await select(d.id);})}>Crear draft</button>
    <div className="draft-layout"><aside aria-label="Tus drafts"><ul>{list.map(d=><li key={d.id}><button disabled={!!upload||busy} aria-current={open?.draft.id===d.id} onClick={()=>void action(()=>select(d.id))}>{d.caption?.slice(0,50)||"Draft sin caption"}<small>{new Date(d.updatedAt).toLocaleString()}</small></button></li>)}</ul></aside>
    {open&&<article><h2>Editar draft</h2><p role="status" aria-live="polite">{labels[status]}</p>
      {status==="conflict"&&<div className="notice"><p>Tu texto local sigue en el editor. Revisa la versión del servidor y copia lo que quieras conservar antes de cargarla.</p><blockquote>{open.draft.caption||"Sin caption"}</blockquote>
        <button onClick={()=>{if(window.confirm("¿Descartar los cambios locales y cargar la versión del servidor?"))void action(()=>select(open.draft.id,true));}}>Cargar versión del servidor</button></div>}
      {status==="error"&&<button onClick={()=>void saver.current?.flush()}>Reintentar guardado</button>}
      <label>Caption general<textarea maxLength={20000} value={edit.caption} onChange={e=>change({...edit,caption:e.target.value})}/></label>
      <PlatformEditor key={open.draft.id} draftId={open.draft.id} caption={edit.caption} config={edit.platformConfig} onChange={platformConfig=>change({...edit,platformConfig})} save={saveForServerAction}/>
      <PublishingPanel draftId={open.draft.id} save={saveForServerAction}/>
      <button onClick={()=>void saver.current?.flush()}>Guardar ahora</button>
      <p>Media activa y reservada: {bytes(open.usage.used)} de {bytes(open.usage.limit)}.</p>
      <section><h2>Video e imágenes</h2><p>MP4/MOV hasta {bytes(open.limits.video)}. JPEG/PNG/WebP hasta {bytes(open.limits.image)}. El archivo pasa una validación antes de poder seleccionarlo.</p>
        <label>Subir video<input disabled={busy||!!upload} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,"original_video"));e.target.value="";}}/></label>
        <label>Subir imagen<input disabled={busy||!!upload} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,"uploaded_image"));e.target.value="";}}/></label>
        {upload&&<div><progress max={upload.total} value={upload.bytes}/><p>{bytes(upload.bytes)} / {bytes(upload.total)} transferidos</p><button onClick={()=>controller.current?.abort()}>Pausar upload</button></div>}
        <ul className="asset-list">{open.assets.map(a=><li key={a.id}><strong>{a.kind}</strong> · {assetLabels[a.status]??a.status} · {bytes(a.size)}
          {a.metadata&&<small>{a.metadata.width} × {a.metadata.height}{a.metadata.duration?` · ${a.metadata.duration.toFixed(2)} s · ${a.metadata.videoCodec}`:""}</small>}
          {a.error&&<p>{a.error}</p>}
          {a.status==="uploading"&&<label>Reanudar con el mismo archivo<input disabled={busy||!!upload} type="file" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,a.kind,a));e.target.value="";}}/></label>}
          {["uploaded","failed","processing"].includes(a.status)&&<button disabled={busy} onClick={()=>void action(async()=>{await api(`/api/media/${a.id}/process`,"POST");await refresh();})}>Validar / reintentar</button>}
          {!["ready","deleting","abandoned"].includes(a.status)&&<button disabled={busy||!!upload} onClick={()=>void action(async()=>{await api(`/api/media/${a.id}/cancel`,"POST");await refresh();})}>Cancelar upload</button>}
          {a.status==="ready"&&a.kind==="original_video"&&<button disabled={edit.videoId===a.id} onClick={()=>{const oldBase=open.assets.find(x=>x.id===edit.cover?.baseId);change({...edit,videoId:a.id,cover:oldBase?.kind==="extracted_frame"?null:edit.cover});}}>Usar este video</button>}
          {a.status==="ready"&&["uploaded_image","extracted_frame"].includes(a.kind)&&<button disabled={a.kind==="extracted_frame"&&a.recipe?.sourceId!==edit.videoId} onClick={()=>change({...edit,cover:{baseId:a.id,text:"",x:.5,y:.5,size:.07,style:"banner"}})}>Usar como portada</button>}
          {a.status==="ready"&&["uploaded_image","extracted_frame","rendered_cover"].includes(a.kind)&&<button disabled={busy} onClick={()=>void action(()=>derive("thumbnail",a.id))}>Crear thumbnail</button>}
          {urls[a.id]&&["rendered_cover","thumbnail"].includes(a.kind)&&<a href={urls[a.id]} target="_blank" rel="noreferrer">Abrir imagen generada</a>}
        </li>)}</ul>
        {video&&<div>{urls[video.id]&&<video controls playsInline src={urls[video.id]} onTimeUpdate={e=>setSeconds(e.currentTarget.currentTime)}/>}
          <label>Segundo del frame<input type="number" min="0" max={video.metadata?.duration??0} step="0.1" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label>
          <button disabled={busy} onClick={()=>void action(()=>derive("extracted_frame",video.id))}>Extraer este frame</button></div>}
      </section>
      {edit.cover&&base&&<section><h2>Portada general</h2><p>Un bloque de texto. Arrástralo con mouse o touch; también puedes usar los controles de posición. Genera la portada para revisar el resultado final.</p>
        <div className="cover-preview" ref={preview} style={{aspectRatio:`${base.metadata?.width??1}/${base.metadata?.height??1}`}}>
          {urls[base.id]&&<Image unoptimized src={urls[base.id]} width={base.metadata?.width??1} height={base.metadata?.height??1} alt="Imagen base de la portada"/>}
          {edit.cover.text&&<div className={`cover-text ${edit.cover.style}`} style={{left:`${edit.cover.x*100}%`,top:`${edit.cover.y*100}%`,transform:`translate(-${edit.cover.x*100}%,-${edit.cover.y*100}%)`,fontSize:previewWidth*edit.cover.size}}
            onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId)||!preview.current)return;const rect=preview.current.getBoundingClientRect();const block=e.currentTarget.getBoundingClientRect();coverChange({x:Math.max(0,Math.min(1,(e.clientX-rect.left-block.width/2)/Math.max(1,rect.width-block.width))),y:Math.max(0,Math.min(1,(e.clientY-rect.top-block.height/2)/Math.max(1,rect.height-block.height)))});}}>{edit.cover.text}</div>}
        </div>
        <label>Texto de portada<textarea maxLength={300} value={edit.cover.text} onChange={e=>coverChange({text:e.target.value})}/></label>
        <label>Tamaño<input type="range" min=".02" max=".15" step=".005" value={edit.cover.size} onChange={e=>coverChange({size:Number(e.target.value)})}/></label>
        <label>Posición horizontal<input type="range" min="0" max="1" step=".01" value={edit.cover.x} onChange={e=>coverChange({x:Number(e.target.value)})}/></label>
        <label>Posición vertical<input type="range" min="0" max="1" step=".01" value={edit.cover.y} onChange={e=>coverChange({y:Number(e.target.value)})}/></label>
        <label htmlFor="cover-style">Estilo</label><select id="cover-style" value={edit.cover.style} onChange={e=>coverChange({style:e.target.value as CoverState["style"]})}><option value="light">Texto claro</option><option value="dark">Texto oscuro</option><option value="banner">Fondo oscuro</option></select>
        <button onClick={()=>coverChange({text:""})}>Eliminar texto</button><button disabled={busy||status==="conflict"} onClick={()=>void action(()=>derive("rendered_cover",edit.cover!.baseId,edit.cover!))}>Generar portada</button>
      </section>}
      <section><button disabled={busy||!!upload} onClick={()=>{if(window.confirm("¿Eliminar este draft y sus archivos? Esta acción no se puede deshacer."))void action(async()=>{
        await saver.current?.flush();if(saver.current?.status!=="saved")throw new Error("Resuelve el conflicto antes de eliminar");
        const result=await api<{cleanupPending:boolean}>(`/api/drafts/${open.draft.id}`,"DELETE",{version:saver.current.version});saver.current.dispose();saver.current=null;setOpen(null);await listDrafts();if(result.cleanupPending)setError("Draft eliminado. Queda limpieza de archivos pendiente en el servidor.");
      });}}>Eliminar draft y media</button></section>
    </article>}</div>{error&&<p role="alert" className="notice">{error}</p>}
  </main>;
}
