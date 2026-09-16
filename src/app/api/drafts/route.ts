import { response, services } from "../../../modules/drafts/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => response(async () => { const s = await services(request); return s.drafts.list(s.userId); });
export const POST = (request: Request) => response(async () => { const s = await services(request); return s.drafts.create(s.userId); });
