export type CoverState = { baseId: string; text: string; x: number; y: number; size: number; style: "light" | "dark" | "banner" };
export type MediaMetadata = { width: number; height: number; duration?: number; container?: string; videoCodec?: string; audioCodec?: string };
export type Recipe = { sourceId: string; seconds?: number; cover?: CoverState };
export function coverNeedsRender(cover: CoverState | null | undefined) { return !!cover?.text; }
export function sameCoverState(a: CoverState | null | undefined, b: CoverState | null | undefined) { return !!a && !!b && a.baseId===b.baseId && a.text===b.text && a.x===b.x && a.y===b.y && a.size===b.size && a.style===b.style; }
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class DomainError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function coverState(value: unknown): CoverState | null {
  if (value === null) return null;
  const v = value as CoverState;
  if (!v || !uuid(v.baseId) || typeof v.text !== "string" || v.text.length > 300 ||
    ![v.x, v.y, v.size].every(Number.isFinite) || v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1 ||
    v.size < .02 || v.size > .15 || !["light", "dark", "banner"].includes(v.style)) throw new DomainError(400, "Portada inválida");
  return { baseId: v.baseId, text: v.text, x: v.x, y: v.y, size: v.size, style: v.style };
}
export function mediaLimits(env: Record<string, string | undefined> = {}) {
  const read = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid ${key}`);
    return n;
  };
  return { video: read("MEDIA_VIDEO_BYTES", 2_000_000_000), image: read("MEDIA_IMAGE_BYTES", 25_000_000),
    quota: read("MEDIA_QUOTA_BYTES", 10_000_000_000), part: 16 * 1024 * 1024,
    pixels: read("MEDIA_MAX_PIXELS", 80_000_000), timeout: read("MEDIA_PROCESS_TIMEOUT_MS", 120_000),
    lease: 10 * 60_000, signedSeconds: 120 };
}
export function uploadInput(kind: unknown, size: unknown, limits: ReturnType<typeof mediaLimits>) {
  if (!["original_video", "uploaded_image"].includes(String(kind)) || !Number.isSafeInteger(size) || Number(size) <= 0)
    throw new DomainError(400, "Upload inválido");
  if (Number(size) > (kind === "original_video" ? limits.video : limits.image)) throw new DomainError(413, "Archivo demasiado grande");
  return { kind: kind as "original_video" | "uploaded_image", size: Number(size) };
}
export function terminalVideoRetention(terminalAt: Date) { return new Date(terminalAt.getTime() + 24 * 60 * 60_000); }
