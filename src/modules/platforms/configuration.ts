import { DomainError } from "../media/model";
import type { PlatformConfiguration } from "./contract";
export type ConfigIssue = { code: string; field: string; message: string };
export class ConfigurationError extends DomainError {
  readonly issues: ConfigIssue[];
  constructor(field: string, code = "invalid_configuration") {
    super(400, `Configuración inválida: ${field}`);
    this.issues = [{ code, field, message: this.message }];
  }
}
export function strictConfiguration(value: unknown): PlatformConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConfigurationError("configuration");
  const v = value as Record<string, unknown>;
  const p = v.platform;
  if (p !== "instagram" && p !== "tiktok" && p !== "youtube") throw new ConfigurationError("platform");
  const allowed = {
    instagram: ["platform", "enabled", "override", "cover", "shareToFeed"],
    tiktok: ["platform", "enabled", "override", "privacy", "allowComments", "allowDuet", "allowStitch", "cover", "isAigc"],
    youtube: ["platform", "enabled", "title", "descriptionOverride", "privacy", "madeForKids", "containsSyntheticMedia", "thumbnail"],
  }[p];
  for (const key of Object.keys(v)) if (!allowed.includes(key)) throw new ConfigurationError(key, "unknown_field");
  if (typeof v.enabled !== "boolean") throw new ConfigurationError("enabled");
  for (const key of ["shareToFeed", "allowComments", "allowDuet", "allowStitch", "isAigc", "madeForKids", "containsSyntheticMedia"]) {
    if (v[key] !== undefined && typeof v[key] !== "boolean") throw new ConfigurationError(key);
  }
  if (p === "tiktok" && v.cover !== undefined && v.cover !== "extracted_frame") throw new ConfigurationError("cover", "unsupported_cover");
  for (const key of ["override", "descriptionOverride", "title"]) {
    if (v[key] !== undefined && (typeof v[key] !== "string" || v[key].length > 20000)) throw new ConfigurationError(key);
  }
  const privacy = p === "youtube" ? ["public", "private", "unlisted"] : ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];
  if (v.privacy !== undefined && (typeof v.privacy !== "string" || !privacy.includes(v.privacy))) throw new ConfigurationError("privacy");
  for (const key of ["cover", "thumbnail"]) {
    const options = p === "tiktok" ? ["extracted_frame"] : ["uploaded_image", "extracted_frame", "rendered_cover"];
    if (v[key] !== undefined && (typeof v[key] !== "string" || !options.includes(v[key]))) throw new ConfigurationError(key, "unsupported_cover");
  }
  // Missing required content is representable as an empty draft, then NotReady.
  return { ...v, ...(p === "youtube" ? { title: v.title ?? "" } : {}) } as PlatformConfiguration;
}
export type PlatformConfigurations = Partial<{ [P in PlatformConfiguration["platform"]]: Extract<PlatformConfiguration, { platform: P }> }>;
export function parseConfigurations(value: unknown): PlatformConfigurations {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConfigurationError("platformConfig");
  const result: PlatformConfigurations = {};
  for (const [platform, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ConfigurationError(platform);
    const entry = raw as Record<string, unknown>;
    if (entry.platform !== undefined && entry.platform !== platform) throw new ConfigurationError("platform");
    const c = strictConfiguration({ ...entry, platform });
    switch (c.platform) { case "instagram": result.instagram = c; break; case "tiktok": result.tiktok = c; break; case "youtube": result.youtube = c; }
  }
  return result;
}
export function effectiveConfiguration(shared: string, config: PlatformConfiguration) {
  const override = config.platform === "youtube" ? config.descriptionOverride : config.override;
  return { config, shared, override, text: override ?? shared, inherited: override === undefined };
}
