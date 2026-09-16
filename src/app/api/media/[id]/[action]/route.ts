import { body, dispatchMedia, response, services } from "../../../../../modules/drafts/http";
import { DomainError } from "../../../../../modules/media/model";
type Context = { params: Promise<{id:string;action:string}> };
export const GET = (request:Request, context:Context) => response(async () => {
  const s = await services(request), {id,action} = await context.params;
  if (action === "url") return s.media().url(s.userId,id);
  if (action === "parts") return s.media().progress(s.userId,id);
  throw new DomainError(404,"Recurso no disponible");
});
export const POST = (request:Request, context:Context) => response(async () => {
  const s = await services(request), {id,action} = await context.params;
  if (action === "sign") { const data = await body(request); return s.media().sign(s.userId,id,data.number,data.checksum); }
  if (action === "ack") { const data = await body(request); await s.media().acknowledge(s.userId,id,data.number,data.etag); return {saved:true}; }
  if (action === "complete") return s.media().finish(s.userId,id);
  if (action === "process") { await s.media().get(s.userId,id); return dispatchMedia(s.userId,id); }
  if (action === "cancel") { await s.media().cancel(s.userId,id); return {cancelled:true}; }
  throw new DomainError(404,"Recurso no disponible");
});
