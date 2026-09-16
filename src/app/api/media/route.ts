import { body, response, services } from "../../../modules/drafts/http";
import { coverState, DomainError } from "../../../modules/media/model";
export const POST = (request:Request) => response(async () => {
  const s = await services(request), data = await body(request);
  if (["extracted_frame","rendered_cover","thumbnail"].includes(data.kind)) {
    const cover = data.kind === "rendered_cover" ? coverState(data.cover) : null;
    if (data.kind === "rendered_cover" && (!cover || cover.baseId !== data.sourceId)) throw new DomainError(400,"Portada inválida");
    return s.media().derive(s.userId,data.draftId,data.kind,{sourceId:data.sourceId, seconds:data.seconds,cover:cover ?? undefined});
  }
  return s.media().start(s.userId,data.draftId,data.kind,data.size);
});
