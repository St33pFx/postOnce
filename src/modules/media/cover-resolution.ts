import type { CoverState, Recipe } from "./model";
import { coverNeedsRender, sameCoverState } from "./model";
export type CoverResolutionRow = { id:string; kind:string; status:string; recipe:Recipe|null };
export function resolvePublishableCover<T extends CoverResolutionRow>(rows:T[],cover:CoverState|null|undefined,requestedKind?:string) {
  if (!cover) return undefined;
  const base=rows.find(row=>row.id===cover.baseId&&row.status==="ready");
  if (!base || (requestedKind&&base.kind!==requestedKind)) return undefined;
  if (!coverNeedsRender(cover)) return base;
  return rows.find(row=>row.status==="ready"&&row.kind==="rendered_cover"&&row.recipe?.sourceId===cover.baseId&&sameCoverState(row.recipe.cover,cover));
}
