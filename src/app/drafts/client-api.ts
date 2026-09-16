export async function api<T = unknown>(path:string, method="GET", data?:unknown):Promise<T> {
  const response=await fetch(path,{method,headers:data===undefined?{}:{"Content-Type":"application/json"},body:data===undefined?undefined:JSON.stringify(data),cache:"no-store"});
  const result=await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error??"Error de conexión"),{status:response.status});
  return result;
}
export async function uploadFile(file:File, asset:{id:string;size:number;partSize:number}, onProgress:(bytes:number)=>void, signal:AbortSignal) {
  if (file.size!==asset.size) throw new Error("Selecciona el mismo archivo para continuar");
  const {parts}=await api<{parts:{number:number;etag:string;size:number}[]}>(`/api/media/${asset.id}/parts`);
  let uploaded=0;
  for (let offset=0,number=1;offset<file.size;offset+=asset.partSize,number++) {
    signal.throwIfAborted();
    const blob=file.slice(offset,Math.min(offset+asset.partSize,file.size));
    const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()));
    const checksum=btoa(String.fromCharCode(...digest));
    const {url}=await api<{url:string}>(`/api/media/${asset.id}/sign`,"POST",{number,checksum});
    const existing=parts.find(p=>p.number===number && p.size===blob.size);
    const etag=existing?.etag ?? await new Promise<string>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      const abort=()=>xhr.abort();
      signal.addEventListener("abort",abort,{once:true});
      xhr.open("PUT",url);
      xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(uploaded+e.loaded); };
      xhr.onload=()=>{ signal.removeEventListener("abort",abort); const tag=xhr.getResponseHeader("ETag");
        if(xhr.status>=200&&xhr.status<300&&tag) resolve(tag); else reject(new Error("Falló la parte del upload. Puedes reanudar.")); };
      xhr.onerror=()=>{signal.removeEventListener("abort",abort);reject(new Error("Conexión interrumpida. Puedes reanudar."));};
      xhr.onabort=()=>{signal.removeEventListener("abort",abort);reject(new Error("Upload pausado. Selecciona el mismo archivo para reanudar."));};
      if(signal.aborted) {reject(new Error("Upload pausado"));return;}
      xhr.send(blob);
    });
    await api(`/api/media/${asset.id}/ack`,"POST",{number,etag});
    uploaded+=blob.size; onProgress(uploaded);
  }
  await api(`/api/media/${asset.id}/complete`,"POST");
}
