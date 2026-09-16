export const platforms = ["instagram", "tiktok", "youtube"] as const;
export type Platform = typeof platforms[number];
export { validatePlatform, globalPreflight } from "./contract";
export type { PlatformAdapter, PlatformConfig, Preflight, Capability, Account } from "./contract";
