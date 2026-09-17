export function mergeAssetUrls(current:Record<string,string>, fetched:Record<string,string>, validAssetIds:Set<string>, renewedAssetIds:Set<string> = new Set()) {
  const next = {...current};
  for (const [id,url] of Object.entries(fetched)) {
    if (!(id in next) || renewedAssetIds.has(id)) next[id] = url;
  }
  for (const id of Object.keys(next)) if (!validAssetIds.has(id)) delete next[id];
  return next;
}
