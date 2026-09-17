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
import { ThemeToggle } from "../theme-toggle";
import { mergeAssetUrls } from "./url-cache";

type Draft = { id:string; caption:string|null; version:number; videoId:string|null; cover:CoverState|null; updatedAt:string };
type Asset = { id:string; kind:string; status:string; size:number; partSize:number; metadata:MediaMetadata|null; recipe:{sourceId:string}|null; error:string|null };
type Editable = { caption:string; videoId:string|null; cover:CoverState|null; platformConfig:PlatformConfigurations };
type Open = { draft:Draft & {platformConfig?:PlatformConfigurations}; assets:Asset[]; usage:{used:number;limit:number}; limits:{video:number;image:number} };
const labels:Record<SaveStatus,string> = {saved:"Guardado en el servidor",pending:"Cambios pendientes",saving:"Guardando…",conflict:"Conflicto: existe otra versión",error:"No se pudo guardar"};
const assetLabels:Record<string,string> = {initiating:"Iniciando upload",uploading:"Subiendo…",uploaded:"Pendiente de validación",processing:"Validando…",ready:"Listo",failed:"No se pudo validar",abandoned:"Cancelado",deleting:"Eliminando…"};
const bytes = (n:number) => `${(n/1_000_000).toFixed(1)} MB`;
const defaultCover = (baseId:string):CoverState => ({baseId,text:"",x:.5,y:.5,size:.07,style:"banner"});

export function DraftWorkspace() {
  const [list,setList] = useState<Draft[]>([]), [open,setOpen] = useState<Open|null>(null);
  const [edit,setEdit] = useState<Editable>({caption:"",videoId:null,cover:null,platformConfig:{}});
  const [status,setStatus] = useState<SaveStatus>("saved"), [error,setError] = useState("");
  const [urls,setUrls] = useState<Record<string,string>>({}), [seconds,setSeconds] = useState(0);
  const [upload,setUpload] = useState<{id:string;bytes:number;total:number}|null>(null), [busy,setBusy] = useState(false);
  const [coverEditing,setCoverEditing] = useState(false), [frameOpen,setFrameOpen] = useState(false);
  const saver = useRef<Autosave<Editable>|null>(null), controller = useRef<AbortController|null>(null);
  const latest = useRef(edit); latest.current = edit;
  const signed = useRef<Record<string,{url:string;expiresAt:number}>>({});
  const knownStatus = useRef(new Map<string,string>());
  const playbackTime = useRef(0), activeVideoRef = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLDivElement>(null), [previewWidth,setPreviewWidth] = useState(320);

  const listDrafts = async() => setList(await api<Draft[]>("/api/drafts"));
  useEffect(() => { void listDrafts().catch(e=>setError(e.message)); return()=>{saver.current?.dispose();controller.current?.abort();}; },[]);
  useEffect(() => { const handler=(e:BeforeUnloadEvent)=>{if(saver.current?.status!=="saved"||controller.current)e.preventDefault();}; window.addEventListener("beforeunload",handler); return()=>window.removeEventListener("beforeunload",handler); },[]);

  async function refreshOpen(id:string, liveRef?:{current:boolean}) {
    const next = await api<Open>(`/api/drafts/${id}`);
    if (liveRef && !liveRef.current) return;
    saver.current?.externalVersion(next.draft.version);
    setOpen(next);
    const required = next.assets.filter(a=>a.status==="ready" && (a.id===latest.current.videoId || a.id===latest.current.cover?.baseId || ["rendered_cover","thumbnail"].includes(a.kind)));
    const fetched:Record<string,string> = {}, renewed = new Set<string>();
    for (const asset of required) {
      const cached = signed.current[asset.id];
      if (!cached || cached.expiresAt <= Date.now()+15_000) {
        const result = await api<{url:string;expiresIn?:number}>(`/api/media/${asset.id}/url`);
        signed.current[asset.id] = {url:result.url,expiresAt:Date.now()+(result.expiresIn??120)*1000};
        renewed.add(asset.id);
      }
      fetched[asset.id] = signed.current[asset.id].url;
    }
    const ids = new Set(next.assets.map(a=>a.id));
    setUrls(previous => mergeAssetUrls(previous,fetched,ids,renewed));
    for (const asset of next.assets) {
      const previous = knownStatus.current.get(asset.id);
      knownStatus.current.set(asset.id,asset.status);
      if (asset.status!=="ready" || previous==="ready") continue;
      if (asset.kind==="original_video" && asset.id!==latest.current.videoId) {
        const oldCover = latest.current.cover;
        change({...latest.current,videoId:asset.id,cover:oldCover && next.assets.find(a=>a.id===oldCover.baseId)?.kind==="extracted_frame" ? null : oldCover});
      }
      if (asset.kind==="uploaded_image" && asset.id!==latest.current.cover?.baseId) change({...latest.current,cover:defaultCover(asset.id)});
      if (asset.kind==="extracted_frame" && asset.id!==latest.current.cover?.baseId) change({...latest.current,cover:defaultCover(asset.id)});
    }
  }
  useEffect(() => {
    if (!open) return;
    const live = {current:true};
    void refreshOpen(open.draft.id,live).catch(e=>{if(live.current)setError(e.message);});
    const timer = setInterval(()=>void refreshOpen(open.draft.id,live).catch(e=>{if(live.current)setError(e.message);}),5000);
    return()=>{live.current=false;clearInterval(timer);};
  },[open?.draft.id]);
  useEffect(() => { if (!preview.current) return; const observer=new ResizeObserver(entries=>setPreviewWidth(entries[0].contentRect.width)); observer.observe(preview.current); return()=>observer.disconnect(); },[edit.cover?.baseId,coverEditing]);
  useEffect(() => { playbackTime.current=0; },[edit.videoId]);

  async function select(id:string,discard=false) {
    if (!discard) { await saver.current?.flush(); if (saver.current&&saver.current.status!=="saved"&&!window.confirm("Hay cambios sin guardar. ¿Descartarlos y abrir otro draft?")) return; }
    const data=await api<Open>(`/api/drafts/${id}`); saver.current?.dispose(); setOpen(data); setEdit({caption:data.draft.caption??"",videoId:data.draft.videoId,cover:data.draft.cover,platformConfig:parseConfigurations(data.draft.platformConfig??{})}); setStatus("saved");setError("");setUrls({});signed.current={};knownStatus.current=new Map(data.assets.map(a=>[a.id,a.status]));setCoverEditing(false);setFrameOpen(false);
    saver.current=new Autosave(data.draft.version,async(value,version)=>{const saved=await api<Draft>(`/api/drafts/${id}`,"PATCH",{...value,version});void listDrafts();return saved;},setStatus);
  }
  function change(value:Editable) { setEdit(value); saver.current?.edit(value); }
  function coverChange(patch:Partial<CoverState>) { if(latest.current.cover)change({...latest.current,cover:{...latest.current.cover,...patch}}); }
  async function action(work:()=>Promise<void>) { setError("");setBusy(true);try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  async function startUpload(file:File,kind:string,resume?:Asset) { if(!open)return; const asset=resume??await api<Asset>("/api/media","POST",{draftId:open.draft.id,kind,size:file.size}); const abort=new AbortController();controller.current=abort;setUpload({id:asset.id,bytes:0,total:file.size}); try{await uploadFile(file,asset,n=>setUpload({id:asset.id,bytes:n,total:file.size}),abort.signal);await api(`/api/media/${asset.id}/process`,"POST");} finally{controller.current=null;setUpload(null);await refreshOpen(open.draft.id);} }
  async function derive(kind:string,sourceId:string,cover?:CoverState) { if(!open)return; await saver.current?.flush();if(saver.current?.status!=="saved")throw new Error("Guarda o resuelve el conflicto antes de generar media"); const asset=await api<Asset>("/api/media","POST",{draftId:open.draft.id,kind,sourceId,seconds,cover}); await api(`/api/media/${asset.id}/process`,"POST"); await refreshOpen(open.draft.id); }
  async function saveForServerAction(){await saver.current?.flush();if(saver.current?.status!=="saved")throw new Error("Guarda o resuelve el conflicto antes de continuar");}
  const base=open?.assets.find(a=>a.id===edit.cover?.baseId), video=open?.assets.find(a=>a.id===edit.videoId);
  const activeVideo=video?.status==="ready";
  return <main className="draft-workspace">
    <nav className="top-nav"><Link href="/drafts" className="active">Drafts</Link><Link href="/account">Cuenta</Link><span className="nav-spacer"/><ThemeToggle/></nav>
    <header className="page-header"><div><p className="eyebrow">POSTONCE / DRAFTS</p><h1>Tus publicaciones</h1><p className="lede">Prepara una idea, revisa tus destinos y publícala cuando todo esté listo.</p></div><button disabled={busy||!!upload} onClick={()=>void action(async()=>{await saver.current?.flush();if(saver.current&&saver.current.status!=="saved")throw new Error("Resuelve los cambios pendientes primero");const d=await api<Draft>("/api/drafts","POST");await listDrafts();await select(d.id);})}>Nueva publicación</button></header>
    <div className="draft-layout"><aside aria-label="Tus drafts"><ul>{list.map(d=><li key={d.id}><button disabled={!!upload||busy} aria-current={open?.draft.id===d.id} onClick={()=>void action(()=>select(d.id))}>{d.caption?.slice(0,50)||"Draft sin caption"}<small>{new Date(d.updatedAt).toLocaleString()}</small></button></li>)}</ul></aside>
    {open&&<article className="editor-column"><div className="editor-heading"><div><p className="eyebrow">EDITOR</p><h2>Editar publicación</h2></div><span role="status" aria-live="polite" className={`save-state ${status}`}>{labels[status]}</span></div>
      {status==="conflict"&&<div className="notice"><p>Tu texto local sigue en el editor. Revisa la versión del servidor antes de cargarla.</p><blockquote>{open.draft.caption||"Sin caption"}</blockquote><button onClick={()=>{if(window.confirm("¿Descartar los cambios locales y cargar la versión del servidor?"))void action(()=>select(open.draft.id,true));}}>Cargar versión del servidor</button></div>}
      {status==="error"&&<button className="secondary" onClick={()=>void saver.current?.flush()}>Reintentar guardado</button>}
      <section className="editor-section intro-section"><label htmlFor="caption">Título o caption<textarea id="caption" aria-label="Caption general" maxLength={20000} value={edit.caption} onChange={e=>change({...edit,caption:e.target.value})}/></label></section>
      <section className="editor-section" aria-labelledby="video-heading"><div className="section-heading"><div><p className="eyebrow">01</p><h2 id="video-heading">Video</h2></div>{activeVideo&&<span className="status-chip">Video seleccionado</span>}</div>
        {activeVideo&&video?<div className="selected-media"><div className="media-preview">{urls[video.id]?<video ref={activeVideoRef} controls playsInline src={urls[video.id]} data-testid="active-video" onTimeUpdate={e=>{playbackTime.current=e.currentTarget.currentTime;}} onLoadedMetadata={e=>{if(playbackTime.current>0&&e.currentTarget.duration>playbackTime.current)e.currentTarget.currentTime=playbackTime.current;}}/>:<div className="media-placeholder">Preparando preview…</div>}</div><div className="media-details"><strong>{video.metadata?.container?.toUpperCase()||"Video"} original</strong><p>{bytes(video.size)}{video.metadata?.duration?` · ${video.metadata.duration.toFixed(1)} s`:""}{video.metadata?.width?` · ${video.metadata.width} × ${video.metadata.height}`:""}</p><label className="replace-control"><span>Reemplazar video</span><input aria-label="Reemplazar video" disabled={busy||!!upload} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,"original_video"));e.target.value="";}}/></label></div></div>:<div className="empty-media"><p>Aún no hay video. Súbelo para seleccionarlo automáticamente.</p><label className="button primary upload-inline">Seleccionar video<input aria-label="Subir video" disabled={busy||!!upload} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,"original_video"));e.target.value="";}}/></label></div>}
        {upload&&<div className="upload-progress"><progress max={upload.total} value={upload.bytes}/><span>{bytes(upload.bytes)} / {bytes(upload.total)}</span><button className="secondary" onClick={()=>controller.current?.abort()}>Pausar</button></div>}
      </section>
      <section className="editor-section" aria-labelledby="cover-heading"><div className="section-heading"><div><p className="eyebrow">02</p><h2 id="cover-heading">Portada</h2></div>{base&&<span className="status-chip">Portada seleccionada</span>}</div>
        {base&&edit.cover?<div className="selected-media cover-media"><div className="cover-thumb">{urls[base.id]?<Image unoptimized src={urls[base.id]} width={base.metadata?.width??1} height={base.metadata?.height??1} alt="Portada seleccionada"/>:<div className="media-placeholder">Preparando preview…</div>}</div><div className="media-details"><strong>{base.kind==="extracted_frame"?"Frame del video":"Imagen original"}</strong><p>{bytes(base.size)}{base.metadata?.width?` · ${base.metadata.width} × ${base.metadata.height}`:""}</p><div className="inline-actions"><button className="secondary" onClick={()=>setCoverEditing(v=>!v)}>{coverEditing?"Cerrar editor":"Editar portada"}</button><label className="replace-control"><span>Reemplazar portada</span><input aria-label="Reemplazar portada" disabled={busy||!!upload} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,"uploaded_image"));e.target.value="";}}/></label></div></div></div>:<div className="empty-media"><p>Sube una imagen para usarla como portada general.</p><label className="button primary upload-inline">Seleccionar imagen<input aria-label="Subir imagen" disabled={busy||!!upload} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,"uploaded_image"));e.target.value="";}}/></label></div>}
        {activeVideo&&<div className="cover-tools"><button className="text-button" onClick={()=>setFrameOpen(v=>!v)}>{frameOpen?"Cerrar selector":"Elegir frame del video"}</button>{frameOpen&&<div className="frame-tool"><p>Busca un momento del video y úsalo como portada.</p>{urls[video!.id]&&<video controls playsInline src={urls[video!.id]} onTimeUpdate={e=>setSeconds(e.currentTarget.currentTime)}/>}<label>Segundo actual<input type="number" min="0" max={video?.metadata?.duration??0} step="0.1" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label><button disabled={busy||!video} onClick={()=>void action(async()=>{await derive("extracted_frame",video!.id);setFrameOpen(false);})}>Usar este frame como portada</button></div>}
          {edit.cover&&base&&coverEditing&&<div className="cover-editor"><div className="cover-preview" ref={preview} style={{aspectRatio:`${base.metadata?.width??1}/${base.metadata?.height??1}`}}>{urls[base.id]&&<Image unoptimized src={urls[base.id]} width={base.metadata?.width??1} height={base.metadata?.height??1} alt="Preview editable de portada"/>}{edit.cover.text&&<div className={`cover-text ${edit.cover.style}`} style={{left:`${edit.cover.x*100}%`,top:`${edit.cover.y*100}%`,transform:`translate(-${edit.cover.x*100}%,-${edit.cover.y*100}%)`,fontSize:previewWidth*edit.cover.size}} onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId)||!preview.current)return;const rect=preview.current.getBoundingClientRect(),block=e.currentTarget.getBoundingClientRect();coverChange({x:Math.max(0,Math.min(1,(e.clientX-rect.left-block.width/2)/Math.max(1,rect.width-block.width))),y:Math.max(0,Math.min(1,(e.clientY-rect.top-block.height/2)/Math.max(1,rect.height-block.height)))})}}>{edit.cover.text}</div>}</div><label>Texto de portada<textarea maxLength={300} value={edit.cover.text} onChange={e=>coverChange({text:e.target.value})}/></label><label>Tamaño<input type="range" min=".02" max=".15" step=".005" value={edit.cover.size} onChange={e=>coverChange({size:Number(e.target.value)})}/></label><label>Posición horizontal<input type="range" min="0" max="1" step=".01" value={edit.cover.x} onChange={e=>coverChange({x:Number(e.target.value)})}/></label><label>Posición vertical<input type="range" min="0" max="1" step=".01" value={edit.cover.y} onChange={e=>coverChange({y:Number(e.target.value)})}/></label><label htmlFor="cover-style">Estilo<select id="cover-style" value={edit.cover.style} onChange={e=>coverChange({style:e.target.value as CoverState["style"]})}><option value="light">Texto claro</option><option value="dark">Texto oscuro</option><option value="banner">Fondo oscuro</option></select></label><div className="inline-actions"><button className="secondary" onClick={()=>coverChange({text:""})}>Eliminar texto</button><button disabled={busy||status==="conflict"} onClick={()=>void action(()=>derive("rendered_cover",edit.cover!.baseId,edit.cover!))}>Generar portada renderizada</button></div></div>}\n          </div>}</div>}\n      </section>
      <PlatformEditor key={open.draft.id} draftId={open.draft.id} caption={edit.caption} config={edit.platformConfig} onChange={platformConfig=>change({...edit,platformConfig})} save={saveForServerAction}/>
      <PublishingPanel draftId={open.draft.id} save={saveForServerAction}/>
      <section className="editor-section editor-footer"><button className="secondary" onClick={()=>void saver.current?.flush()}>Guardar ahora</button><span>Media: {bytes(open.usage.used)} de {bytes(open.usage.limit)}</span><details><summary>Ver media técnica</summary><ul className="asset-list">{open.assets.map(a=><li key={a.id}><strong>{a.kind}</strong> · {assetLabels[a.status]??a.status} · {bytes(a.size)}{a.metadata&&<small>{a.metadata.width} × {a.metadata.height}{a.metadata.duration?` · ${a.metadata.duration.toFixed(2)} s`:""}</small>}{a.error&&<p>{a.error}</p>}{a.status==="uploading"&&<label>Reanudar upload<input disabled={busy||!!upload} type="file" onChange={e=>{const f=e.target.files?.[0];if(f)void action(()=>startUpload(f,a.kind,a));e.target.value="";}}/></label>}{["uploaded","failed","processing"].includes(a.status)&&<button className="secondary" disabled={busy} onClick={()=>void action(async()=>{await api(`/api/media/${a.id}/process`,"POST");await refreshOpen(open.draft.id);})}>Validar / reintentar</button>}{!["ready","deleting","abandoned"].includes(a.status)&&<button className="secondary" disabled={busy||!!upload} onClick={()=>void action(async()=>{await api(`/api/media/${a.id}/cancel`,"POST");await refreshOpen(open.draft.id);})}>Cancelar upload</button>}</li>)}</ul></details></section>
      <section className="editor-section danger-zone"><button className="danger" disabled={busy||!!upload} onClick={()=>{if(window.confirm("¿Eliminar este draft y sus archivos? Esta acción no se puede deshacer."))void action(async()=>{await saver.current?.flush();if(saver.current?.status!=="saved")throw new Error("Resuelve el conflicto antes de eliminar");const result=await api<{cleanupPending:boolean}>(`/api/drafts/${open.draft.id}`,"DELETE",{version:saver.current.version});saver.current.dispose();saver.current=null;setOpen(null);await listDrafts();if(result.cleanupPending)setError("Draft eliminado. Queda limpieza de archivos pendiente en el servidor.");});}}>Eliminar draft y media</button></section>
    </article>}</div>{error&&<p role="alert" className="notice">{error}</p>}
  </main>;
}
