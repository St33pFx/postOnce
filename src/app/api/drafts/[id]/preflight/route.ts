import { response, services } from "../../../../../modules/drafts/http";
import { preflight } from "../../../../../modules/platforms/preflight";
export const POST=(request:Request,{params}:{params:Promise<{id:string}>})=>response(async()=>{
 const s=await services(request),{id}=await params;
 return preflight(s.drafts.db,s.userId,id);
});
