/** External HTTP boundary. Production uses fetch; tests inject only this transport. */
export type Transport = typeof fetch;
export type RefreshCode = "token_missing" | "token_invalid" | "token_expired" | "insufficient_scopes" | "video.publish_missing" | "creator_info_unauthorized" | "creator_info_forbidden" | "creator_info_http_error" | "creator_info_invalid_payload" | "creator_info_network_error" | "account_unavailable" | "identity_changed" | "integration_unavailable" | "invalid_payload";
export class RefreshError extends Error {
  constructor(public readonly code: RefreshCode) { super(code); }
}
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RefreshError("invalid_payload");
  return value as Json;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new RefreshError("invalid_payload");
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string")) throw new RefreshError("invalid_payload");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new RefreshError("invalid_payload");
  return value;
}
async function json(http: Transport, url: string, token: string, method = "GET", creatorInfo = false): Promise<Json> {
  if (!token) throw new RefreshError("token_missing");
  try {
    const response = await http(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000), ...(method === "POST" ? { body: "{}" } : {}) });
    if (response.status === 401) throw new RefreshError(creatorInfo ? "creator_info_unauthorized" : "token_invalid");
    if (response.status === 403) throw new RefreshError(creatorInfo ? "creator_info_forbidden" : "insufficient_scopes");
    if (!response.ok) throw new RefreshError(creatorInfo ? "creator_info_http_error" : "integration_unavailable");
    try { return object(await response.json()); } catch (error) {
      if (error instanceof RefreshError) throw error;
      throw new RefreshError(creatorInfo ? "creator_info_invalid_payload" : "invalid_payload");
    }
  } catch (error) {
    if (error instanceof RefreshError) throw error;
    // Never echo request URLs, tokens or provider error bodies.
    throw new RefreshError(creatorInfo ? "creator_info_network_error" : "integration_unavailable");
  }
}
export type RefreshedAccount = { remoteAccountId: string; displayName: string; scopes: string[] };
export type CreatorAccount = RefreshedAccount & {
  privacyOptions: string[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxVideoPostDurationSec: number;
};
export class TikTokClient {
  constructor(private readonly http: Transport = fetch) {}
  async refresh(token: string, expectedId: string): Promise<CreatorAccount> {
    // Creator Info does not expose open_id; User Info proves token identity separately.
    const identity = await json(this.http, "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", token);
    this.check(identity);
    const user = object(object(identity.data).user);
    if (string(user.open_id) !== expectedId) throw new RefreshError("identity_changed");
    const response = await json(this.http, "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", token, "POST", true);
    this.check(response);
    const data = object(response.data), max = data.max_video_post_duration_sec;
    if (typeof max !== "number" || !Number.isInteger(max) || max <= 0) throw new RefreshError("invalid_payload");
    const privacyOptions = strings(data.privacy_level_options);
    if (!privacyOptions.length || privacyOptions.some(p => !["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"].includes(p))) throw new RefreshError("invalid_payload");
    return { remoteAccountId: expectedId, displayName: string(data.creator_nickname), scopes: ["user.info.basic", "video.publish"], privacyOptions,
      commentDisabled: boolean(data.comment_disabled), duetDisabled: boolean(data.duet_disabled), stitchDisabled: boolean(data.stitch_disabled), maxVideoPostDurationSec: max };
  }
  private check(response: Json) {
    const code = string(object(response.error).code);
    if (code === "ok") return;
    if (code === "access_token_invalid") throw new RefreshError("token_invalid");
    if (code === "scope_not_authorized") throw new RefreshError("creator_info_forbidden");
    throw new RefreshError("account_unavailable");
  }
}
/** Facebook Login flow: permissions of the user token, then the bound IG professional ID. */
export class InstagramClient {
  constructor(private readonly http: Transport = fetch, private readonly version = "v23.0") {}
  async refresh(token: string, expectedId: string): Promise<RefreshedAccount> {
    if (!/^v\d+\.\d+$/.test(this.version)) throw new RefreshError("integration_unavailable");
    const root = `https://graph.facebook.com/${this.version}`;
    const permissions = await json(this.http, `${root}/me/permissions`, token);
    if (!Array.isArray(permissions.data)) throw new RefreshError("invalid_payload");
    const scopes = permissions.data.map(object).filter(p => p.status === "granted").map(p => string(p.permission));
    if (!["instagram_basic", "instagram_content_publish"].every(s => scopes.includes(s))) throw new RefreshError("insufficient_scopes");
    const account = await json(this.http, `${root}/${encodeURIComponent(expectedId)}?fields=id,username,account_type`, token);
    if (string(account.id) !== expectedId) throw new RefreshError("identity_changed");
    if (!["BUSINESS", "MEDIA_CREATOR"].includes(string(account.account_type))) throw new RefreshError("account_unavailable");
    return { remoteAccountId: expectedId, displayName: string(account.username), scopes };
  }
}
export class YouTubeClient {
  constructor(private readonly http: Transport = fetch) {}
  async refresh(token: string, expectedId: string): Promise<RefreshedAccount> {
    const info = await json(this.http, "https://oauth2.googleapis.com/tokeninfo", token, "POST");
    if (typeof info.expires_in !== "number" && typeof info.expires_in !== "string") throw new RefreshError("invalid_payload");
    const expiry = Number(info.expires_in);
    if (!Number.isFinite(expiry)) throw new RefreshError("invalid_payload");
    if (expiry <= 0) throw new RefreshError("token_expired");
    const scopes = string(info.scope).split(" ");
    if (!scopes.includes("https://www.googleapis.com/auth/youtube.upload")) throw new RefreshError("insufficient_scopes");
    const data = await json(this.http, "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,status&mine=true", token);
    if (!Array.isArray(data.items)) throw new RefreshError("invalid_payload");
    const account = data.items.map(object).find(a => a.id === expectedId);
    if (!account) throw new RefreshError("identity_changed");
    return { remoteAccountId: expectedId, displayName: string(object(account.snippet).title), scopes };
  }
}
