export const platforms = ["instagram", "tiktok", "youtube"] as const;
export type Platform = typeof platforms[number];
// Concrete adapter contracts are specified during the integration spike.
// No adapter is registered and no remote capabilities are claimed in Phase 1.
