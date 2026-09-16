import { body, response, services } from "../../../../modules/drafts/http";
type Context = { params: Promise<{id:string}> };
export const GET = (request:Request, context:Context) => response(async () => {
  const s = await services(request), {id} = await context.params;
  const media=s.media();
  return { draft:await s.drafts.get(s.userId,id), assets:await media.list(s.userId,id), usage:await media.usage(s.userId), limits:{video:media.limits.video,image:media.limits.image} };
});
export const PATCH = (request:Request, context:Context) => response(async () => {
  const s = await services(request), {id} = await context.params, data = await body(request);
  return s.drafts.update(s.userId,id,data.version,data);
});
export const DELETE = (request:Request, context:Context) => response(async () => {
  const s = await services(request), {id} = await context.params, data = await body(request);
  const assets = await s.media().list(s.userId,id);
  await s.drafts.remove(s.userId,id,data.version);
  let cleanupPending = false;
  for (const asset of assets) { try { if (!await s.media().cleanup(s.userId,asset.id)) cleanupPending=true; } catch { cleanupPending = true; } }
  return { deleted:true,cleanupPending };
});
