import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Platform } from "../platforms/domain";
import type { Tokens } from "./vault";

export type OAuthGrant = { platform: Platform; remoteAccountId: string; displayName?: string; scopes: string[]; expiresAt?: Date; eligible: boolean; tokens: Tokens };
type Json = Record<string, unknown>;
export type OAuthTransport = typeof fetch;

const scopeMap: Record<Platform, string[]> = {
  instagram: ["instagram_business_basic", "instagram_business_content_publish"],
  tiktok: ["user.info.basic", "video.publish"],
  youtube: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
};
const cookiePrefix = "postonce-oauth-";
const enc = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const dec = (value: string) => Buffer.from(value, "base64url").toString("utf8");
function secret() { if (!process.env.BETTER_AUTH_SECRET) throw new Error("OAuth unavailable"); return process.env.BETTER_AUTH_SECRET; }
function parseJson(value: unknown): Json { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid OAuth response"); return value as Json; }
async function json(http: OAuthTransport, url: string, init: RequestInit) {
  const response = await http(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = parseJson(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error("OAuth provider rejected the request");
  return data;
}
function string(data: Json, key: string) { const value = data[key]; if (typeof value !== "string" || !value) throw new Error("Invalid OAuth response"); return value; }
function expires(data: Json) { return typeof data.expires_in === "number" ? new Date(Date.now() + data.expires_in * 1000) : undefined; }

export function oauthCookieName(platform: Platform) { return `${cookiePrefix}${platform}`; }
export function createOAuthState(platform: Platform, userId: string) {
  const state = enc(randomBytes(32)), verifier = enc(randomBytes(32));
  const payload = enc(JSON.stringify({ platform, userId, state, verifier, expiresAt: Date.now() + 10 * 60_000 }));
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { state, verifier, value: `${payload}.${signature}`, challenge: enc(createHash("sha256").update(verifier).digest()) };
}
export function consumeOAuthState(value: string | undefined, state: string, platform: Platform, userId: string) {
  if (!value) throw new Error("OAuth state missing");
  const [payload, signature, extra] = value.split(".");
  const expected = createHmac("sha256", secret()).update(payload ?? "").digest("base64url");
  if (extra || !payload || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("OAuth state invalid");
  const data = JSON.parse(dec(payload)) as { platform: Platform; userId: string; state: string; verifier: string; expiresAt: number };
  if (data.platform !== platform || data.userId !== userId || data.state !== state || data.expiresAt < Date.now() || !data.verifier) throw new Error("OAuth state invalid");
  return data.verifier;
}
export function scopes(platform: Platform) { return scopeMap[platform]; }

export function authorizeUrl(platform: Platform, redirectUri: string, state: string, challenge: string) {
  const clientId = platform === "instagram" ? process.env.INSTAGRAM_CLIENT_ID : platform === "tiktok" ? process.env.TIKTOK_CLIENT_KEY : process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) throw new Error("OAuth provider is not configured");
  const url = new URL(platform === "instagram" ? "https://www.instagram.com/oauth/authorize" : platform === "tiktok" ? "https://www.tiktok.com/v2/auth/authorize/" : "https://accounts.google.com/o/oauth2/v2/auth");
  const common = { response_type: "code", redirect_uri: redirectUri, state, scope: scopeMap[platform].join(platform === "tiktok" ? "," : " ") };
  if (platform === "instagram") { Object.assign(common, { client_id: clientId }); }
  if (platform === "tiktok") { Object.assign(common, { client_key: clientId, disable_auto_auth: "0", code_challenge: challenge, code_challenge_method: "S256" }); }
  if (platform === "youtube") { Object.assign(common, { client_id: clientId, access_type: "offline", prompt: "consent", include_granted_scopes: "true", code_challenge: challenge, code_challenge_method: "S256" }); }
  for (const [key, value] of Object.entries(common)) url.searchParams.set(key, value);
  return url;
}

export async function exchange(platform: Platform, code: string, verifier: string, redirectUri: string, http: OAuthTransport = fetch): Promise<OAuthGrant> {
  if (platform === "instagram") {
    const token = await json(http, "https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.INSTAGRAM_CLIENT_ID ?? "", client_secret: process.env.INSTAGRAM_CLIENT_SECRET ?? "", grant_type: "authorization_code", redirect_uri: redirectUri, code }) });
    const shortToken = string(token, "access_token"), id = String(token.user_id ?? "");
    if (!id) throw new Error("Instagram identity unavailable");
    const long = await json(http, `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(process.env.INSTAGRAM_CLIENT_SECRET ?? "")}&access_token=${encodeURIComponent(shortToken)}`, { method: "GET" });
    const accessToken = typeof long.access_token === "string" ? long.access_token : shortToken;
    const profile = await json(http, `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_VERSION ?? "v23.0"}/${encodeURIComponent(id)}?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`, { method: "GET" });
    return { platform, remoteAccountId: String(profile.user_id ?? id), displayName: typeof profile.username === "string" ? `@${profile.username}` : undefined, scopes: scopeMap.instagram, expiresAt: expires(long), eligible: true, tokens: { accessToken } };
  }
  if (platform === "tiktok") {
    const token = await json(http, "https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier }) });
    const accessToken = string(token, "access_token"), profile = await json(http, "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = parseJson(profile.data), user = parseJson(data.user), granted = typeof token.scope === "string" ? token.scope.split(",").filter(Boolean) : scopeMap.tiktok;
    return { platform, remoteAccountId: string(user, "open_id"), displayName: typeof user.display_name === "string" ? user.display_name : undefined, scopes: granted, expiresAt: expires(token), eligible: scopeMap.tiktok.every(scope => granted.includes(scope)), tokens: { accessToken, refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : undefined } };
  }
  const token = await json(http, "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID ?? "", client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "", code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier }) });
  const accessToken = string(token, "access_token"), channel = await json(http, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
  const items = Array.isArray(channel.items) ? channel.items : [], first = parseJson(items[0]), snippet = parseJson(first.snippet);
  return { platform, remoteAccountId: string(first, "id"), displayName: typeof snippet.title === "string" ? snippet.title : undefined, scopes: typeof token.scope === "string" ? token.scope.split(" ") : scopeMap.youtube, expiresAt: expires(token), eligible: true, tokens: { accessToken, refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : undefined } };
}

export async function refreshAccessToken(platform: Platform, refreshToken: string, http: OAuthTransport = fetch) {
  const body: Record<string, string> = platform === "tiktok" ? { client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: refreshToken } : { client_id: process.env.YOUTUBE_CLIENT_ID ?? "", client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: refreshToken };
  const data = await json(http, platform === "tiktok" ? "https://open.tiktokapis.com/v2/oauth/token/" : "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  return { accessToken: string(data, "access_token"), refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : refreshToken, expiresAt: expires(data) };
}
