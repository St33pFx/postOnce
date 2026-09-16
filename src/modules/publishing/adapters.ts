import type { Readable } from "node:stream";
import type { PlatformConfiguration } from "../platforms/contract";

export type PublishPlatform = "instagram" | "tiktok" | "youtube";
export type PublishOutcome = { status: "Publishing" | "Published" | "Failed" | "UnknownOutcome"; remoteId?: string; progress?: number; providerStatus?: string; errorCode?: string; errorMessage?: string };
export type RemoteState = Pick<PublishOutcome, "status" | "remoteId" | "progress" | "providerStatus" | "errorCode" | "errorMessage">;
export type PublishAsset = { size: number; mime: string; stream(): Promise<Readable>; url(): Promise<string> };
export type PublishInput = { token: string; remoteAccountId: string; caption: string; config: PlatformConfiguration; video: PublishAsset; cover?: PublishAsset };
export type PersistEvents = {
  creation(id: string, stage: string): Promise<void>;
  remote(id: string, stage: string): Promise<void>;
  stage(stage: string): Promise<void>;
};
export type ReconcileInput = PublishInput & { remoteCreationId: string | null; remoteId: string | null; stage?: string };
export interface PublishAdapter {
  readonly platform: PublishPlatform;
  publish(input: PublishInput, events: PersistEvents): Promise<PublishOutcome>;
  reconcile(input: ReconcileInput, events: PersistEvents): Promise<RemoteState>;
  secondary?(input: PublishInput & { remoteId: string; asset: PublishAsset }): Promise<{ remoteId: string }>;
}
export type PublishingTransport = typeof fetch;

export class ProviderError extends Error {
  constructor(public readonly code: string, message: string, public readonly definitive: boolean) { super(message); }
}

type Json = Record<string, unknown>;
function record(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError("invalid_provider_response", "Respuesta inválida del proveedor", false);
  return value as Json;
}
function requiredString(value: unknown) {
  if (typeof value !== "string" || !value) throw new ProviderError("invalid_provider_response", "Respuesta inválida del proveedor", false);
  return value;
}
async function providerJson(http: PublishingTransport, url: string, init: RequestInit, accepted = [200]) {
  let response: Response;
  try { response = await http(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) }); }
  catch { throw new ProviderError("provider_network_error", "No se pudo confirmar la respuesta del proveedor", false); }
  if (!accepted.includes(response.status)) {
    const definitive = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    throw new ProviderError(`provider_http_${response.status}`, definitive ? "El proveedor rechazó la publicación" : "No se pudo confirmar la respuesta del proveedor", definitive);
  }
  try { return { data: record(await response.json()), response }; }
  catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError("invalid_provider_response", "Respuesta inválida del proveedor", false); }
}
const auth = (token: string, contentType = "application/json") => ({ Authorization: `Bearer ${token}`, "Content-Type": contentType });

export class InstagramPublisher implements PublishAdapter {
  readonly platform = "instagram" as const;
  constructor(private readonly http: PublishingTransport = fetch, private readonly version = "v23.0") {}
  private root() {
    if (!/^v\d+\.\d+$/.test(this.version)) throw new ProviderError("configuration_error", "Versión de Instagram inválida", true);
    return `https://graph.facebook.com/${this.version}`;
  }
  private async state(input: ReconcileInput) {
    if (!input.remoteCreationId) return { status: "UnknownOutcome" as const, errorCode: "missing_remote_reference", errorMessage: "Instagram no devolvió una referencia reconciliable" };
    const url = `${this.root()}/${encodeURIComponent(input.remoteCreationId)}?fields=status_code,status`;
    const { data } = await providerJson(this.http, url, { headers: auth(input.token) });
    const status = requiredString(data.status_code);
    if (status === "PUBLISHED") return { status: "Published" as const, remoteId: input.remoteId ?? input.remoteCreationId, providerStatus: status };
    if (status === "ERROR" || status === "EXPIRED") return { status: "Failed" as const, providerStatus: status, errorCode: `instagram_${status.toLowerCase()}`, errorMessage: "Instagram no pudo procesar el Reel" };
    if (status !== "IN_PROGRESS" && status !== "FINISHED") return { status: "UnknownOutcome" as const, providerStatus: status, errorCode: "unknown_provider_status", errorMessage: "Estado de Instagram desconocido" };
    return { status: "Publishing" as const, providerStatus: status };
  }
  async publish(input: PublishInput, events: PersistEvents): Promise<PublishOutcome> {
    if (input.config.platform !== "instagram") throw new ProviderError("invalid_configuration", "Configuración de Instagram inválida", true);
    await events.stage("container-requested");
    const params = new URLSearchParams({ media_type: "REELS", video_url: await input.video.url(), caption: input.caption });
    if (input.config.shareToFeed !== undefined) params.set("share_to_feed", String(input.config.shareToFeed));
    if (input.cover) params.set("cover_url", await input.cover.url());
    const { data } = await providerJson(this.http, `${this.root()}/${encodeURIComponent(input.remoteAccountId)}/media`,
      { method: "POST", headers: auth(input.token, "application/x-www-form-urlencoded"), body: params });
    const creationId = requiredString(data.id);
    await events.creation(creationId, "container-created");
    return this.reconcile({ ...input, remoteCreationId: creationId, remoteId: null, stage: "container-created" }, events);
  }
  async reconcile(input: ReconcileInput, events: PersistEvents): Promise<RemoteState> {
    const state = await this.state(input);
    if (state.status === "Publishing" && state.providerStatus === "FINISHED" && input.stage === "publish-requested") {
      return { status: "UnknownOutcome", providerStatus: "FINISHED", errorCode: "instagram_publish_unconfirmed", errorMessage: "Instagram no confirmó si media_publish terminó" };
    }
    if (state.status !== "Publishing" || state.providerStatus !== "FINISHED" || input.stage !== "container-created") return state;
    await events.stage("publish-requested");
    const params = new URLSearchParams({ creation_id: input.remoteCreationId! });
    const { data } = await providerJson(this.http, `${this.root()}/${encodeURIComponent(input.remoteAccountId)}/media_publish`,
      { method: "POST", headers: auth(input.token, "application/x-www-form-urlencoded"), body: params });
    const remoteId = requiredString(data.id);
    await events.remote(remoteId, "published");
    return { status: "Published", remoteId, providerStatus: "PUBLISHED" };
  }
}

export class TikTokPublisher implements PublishAdapter {
  readonly platform = "tiktok" as const;
  constructor(private readonly http: PublishingTransport = fetch) {}
  private check(data: Json) {
    const error = record(data.error), code = requiredString(error.code);
    if (code !== "ok") throw new ProviderError(`tiktok_${code}`, "TikTok rechazó la publicación", true);
    return record(data.data);
  }
  async publish(input: PublishInput, events: PersistEvents): Promise<PublishOutcome> {
    if (input.config.platform !== "tiktok" || !input.config.privacy) throw new ProviderError("invalid_configuration", "Configuración de TikTok inválida", true);
    await events.stage("direct-post-requested");
    const body = { post_info: { title: input.caption, privacy_level: input.config.privacy,
      disable_comment: input.config.allowComments === false, disable_duet: input.config.allowDuet === false,
      disable_stitch: input.config.allowStitch === false, is_aigc: input.config.isAigc ?? false },
      source_info: { source: "PULL_FROM_URL", video_url: await input.video.url() } };
    const { data } = await providerJson(this.http, "https://open.tiktokapis.com/v2/post/publish/video/init/",
      { method: "POST", headers: auth(input.token), body: JSON.stringify(body) });
    const publishId = requiredString(this.check(data).publish_id);
    await events.creation(publishId, "post-initialized");
    return { status: "Publishing", providerStatus: "PROCESSING_DOWNLOAD" };
  }
  async reconcile(input: ReconcileInput): Promise<RemoteState> {
    if (!input.remoteCreationId) return { status: "UnknownOutcome", errorCode: "missing_remote_reference", errorMessage: "TikTok no devolvió un publish_id reconciliable" };
    const { data } = await providerJson(this.http, "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      { method: "POST", headers: auth(input.token), body: JSON.stringify({ publish_id: input.remoteCreationId }) });
    const state = this.check(data), status = requiredString(state.status);
    const ids = Array.isArray(state.publicaly_available_post_id) ? state.publicaly_available_post_id.filter(v => typeof v === "string") as string[] : [];
    if (status === "PUBLISH_COMPLETE") return { status: "Published", remoteId: ids[0] ?? input.remoteCreationId, providerStatus: status, progress: 100 };
    if (status === "FAILED") return { status: "Failed", providerStatus: status, errorCode: typeof state.fail_reason === "string" ? state.fail_reason : "tiktok_failed", errorMessage: "TikTok no pudo publicar el contenido" };
    if (["PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD", "SEND_TO_USER_INBOX"].includes(status)) {
      const uploaded = typeof state.uploaded_bytes === "number" && input.video.size > 0 ? Math.min(99, Math.floor(state.uploaded_bytes * 100 / input.video.size)) : undefined;
      return { status: "Publishing", providerStatus: status, progress: uploaded };
    }
    return { status: "UnknownOutcome", providerStatus: status, errorCode: "unknown_provider_status", errorMessage: "Estado de TikTok desconocido" };
  }
}

export class YouTubePublisher implements PublishAdapter {
  readonly platform = "youtube" as const;
  constructor(private readonly http: PublishingTransport = fetch) {}
  async publish(input: PublishInput, events: PersistEvents): Promise<PublishOutcome> {
    if (input.config.platform !== "youtube" || !input.config.privacy) throw new ProviderError("invalid_configuration", "Configuración de YouTube inválida", true);
    await events.stage("resumable-session-requested");
    const metadata = { snippet: { title: input.config.title, description: input.caption, categoryId: "22" }, status: {
      privacyStatus: input.config.privacy, selfDeclaredMadeForKids: input.config.madeForKids,
      containsSyntheticMedia: input.config.containsSyntheticMedia } };
    let init: Response;
    try { init = await this.http("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      { method: "POST", headers: { ...auth(input.token), "X-Upload-Content-Length": String(input.video.size), "X-Upload-Content-Type": input.video.mime },
        body: JSON.stringify(metadata), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) }); }
    catch { throw new ProviderError("provider_network_error", "No se pudo confirmar la sesión de YouTube", false); }
    if (!init.ok) throw new ProviderError(`provider_http_${init.status}`, "YouTube rechazó la publicación", init.status >= 400 && init.status < 500 && init.status !== 408 && init.status !== 429);
    const uploadUrl = init.headers.get("location");
    if (!uploadUrl) throw new ProviderError("invalid_provider_response", "YouTube no devolvió una sesión de upload", false);
    await events.stage("upload-requested");
    const stream = await input.video.stream();
    const { data } = await providerJson(this.http, uploadUrl, { method: "PUT", headers: { "Content-Type": input.video.mime, "Content-Length": String(input.video.size) }, body: stream as unknown as BodyInit, duplex: "half" } as RequestInit);
    const remoteId = requiredString(data.id);
    await events.remote(remoteId, "video-created");
    return { status: "Publishing", remoteId, providerStatus: "processing" };
  }
  async reconcile(input: ReconcileInput): Promise<RemoteState> {
    if (!input.remoteId) return { status: "UnknownOutcome", errorCode: "missing_remote_reference", errorMessage: "YouTube no devolvió un video ID reconciliable" };
    const { data } = await providerJson(this.http, `https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id=${encodeURIComponent(input.remoteId)}`,
      { headers: auth(input.token) });
    if (!Array.isArray(data.items) || !data.items.length) return { status: "UnknownOutcome", errorCode: "youtube_video_not_found", errorMessage: "YouTube no confirmó el video" };
    const video = record(data.items[0]), details = record(video.processingDetails), status = requiredString(details.processingStatus);
    if (status === "succeeded") return { status: "Published", remoteId: input.remoteId, providerStatus: status, progress: 100 };
    if (status === "failed" || status === "terminated") return { status: "Failed", remoteId: input.remoteId, providerStatus: status, errorCode: `youtube_${status}`, errorMessage: "YouTube no pudo procesar el video" };
    if (status === "processing") {
      const progress = record(details.processingProgress ?? {}), total = Number(progress.partsTotal), done = Number(progress.partsProcessed);
      return { status: "Publishing", remoteId: input.remoteId, providerStatus: status, progress: total > 0 && done >= 0 ? Math.min(99, Math.floor(done * 100 / total)) : undefined };
    }
    return { status: "UnknownOutcome", remoteId: input.remoteId, providerStatus: status, errorCode: "unknown_provider_status", errorMessage: "Estado de YouTube desconocido" };
  }
  async secondary(input: PublishInput & { remoteId: string; asset: PublishAsset }) {
    const stream = await input.asset.stream();
    const { data } = await providerJson(this.http, `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?uploadType=media&videoId=${encodeURIComponent(input.remoteId)}`,
      { method: "POST", headers: { Authorization: `Bearer ${input.token}`, "Content-Type": input.asset.mime, "Content-Length": String(input.asset.size) }, body: stream as unknown as BodyInit, duplex: "half" } as RequestInit);
    const item = Array.isArray(data.items) && data.items.length ? record(data.items[0]) : {};
    return { remoteId: typeof item.id === "string" ? item.id : input.remoteId };
  }
}

export function publishingAdapters(http: PublishingTransport = fetch, instagramVersion = process.env.INSTAGRAM_GRAPH_VERSION ?? "v23.0") {
  return { instagram: new InstagramPublisher(http, instagramVersion), tiktok: new TikTokPublisher(http), youtube: new YouTubePublisher(http) };
}
