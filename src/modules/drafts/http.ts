import "server-only";
import { currentUser, identityServices } from "../auth/server";
import { DraftService } from "./service";
import { MediaService } from "../media/service";
import { storageFromEnv } from "../media/storage";
import { DomainError } from "../media/model";
export async function services(request: Request) {
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== identityServices().origin) throw new DomainError(403,"Origen no permitido");
  const user = await currentUser(request.headers);
  if (!user) throw new DomainError(401,"Sesión requerida");
  const db = identityServices().db;
  return { userId: user.id, drafts: new DraftService(db), media: () => new MediaService(db,storageFromEnv()) };
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DomainError(400,"JSON requerido");
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError(400,"Solicitud vacía");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length;
      if (size > 64*1024) { await reader.cancel(); throw new DomainError(413,"Solicitud demasiado grande"); } chunks.push(next.value); }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result;
  } catch (error) { if (error instanceof DomainError) throw error; throw new DomainError(400,"Solicitud inválida"); }
}
export async function response(work: () => Promise<unknown>) {
  try { return Response.json(await work(),{ headers: { "Cache-Control":"no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof DomainError ? error.message : "Servicio no disponible" },
    { status: error instanceof DomainError ? error.status : 503, headers: { "Cache-Control":"no-store" } }); }
}
export async function dispatchMedia(userId: string, id: string) {
  const secret = process.env.MEDIA_SERVICE_SECRET;
  if (!secret || secret.length < 32) throw new DomainError(503,"Procesador de media no configurado");
  const url = new URL(process.env.MEDIA_SERVICE_URL ?? "http://127.0.0.1:4010");
  const result = await fetch(new URL("/process",url), { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${secret}` },
    body:JSON.stringify({userId,id}), signal:AbortSignal.timeout(5000) });
  if (!result.ok) throw new DomainError(503,"Procesador ocupado o no disponible. Reintenta en unos momentos.");
  return { accepted: true };
}
