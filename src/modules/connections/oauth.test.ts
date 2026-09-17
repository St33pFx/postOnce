import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { authorizeUrl, consumeOAuthState, createOAuthState, exchange, scopes } from "./oauth";

describe("OAuth connections", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("binds state to the user and rejects tampering, replay context, and expiry", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-oauth-secret");
    const created = createOAuthState("youtube", "user-1");
    expect(created.challenge).toBe(createHash("sha256").update(created.verifier).digest("base64url"));
    expect(consumeOAuthState(created.value, created.state, "youtube", "user-1")).toBe(created.verifier);
    expect(() => consumeOAuthState(created.value, created.state, "youtube", "user-2")).toThrow("OAuth state invalid");
    expect(() => consumeOAuthState(`${created.value}x`, created.state, "youtube", "user-1")).toThrow("OAuth state invalid");
    expect(() => consumeOAuthState(created.value, "wrong-state", "youtube", "user-1")).toThrow("OAuth state invalid");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(() => consumeOAuthState(created.value, created.state, "youtube", "user-1")).toThrow("OAuth state invalid");
    vi.unstubAllEnvs();
  });

  it("builds provider authorization URLs with PKCE and least-privilege scopes", () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "youtube-client");
    const url = authorizeUrl("youtube", "https://postonce.example/api/connections/youtube/callback", "state", "challenge");
    expect(url.searchParams.get("client_id")).toBe("youtube-client");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("scope")).toBe(scopes("youtube").join(" "));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(scopes("youtube")).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ]);
    vi.unstubAllEnvs();
  });

  it("exchanges a YouTube code through injected HTTP and stores channel identity", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "secret");
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: scopes("youtube").join(" ") }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "channel-1", snippet: { title: "Channel" } }] }), { status: 200 }));
    const grant = await exchange("youtube", "code", "verifier", "https://postonce.example/callback", http);
    expect(grant.remoteAccountId).toBe("channel-1");
    expect(grant.displayName).toBe("Channel");
    expect(grant.tokens).toEqual({ accessToken: "access", refreshToken: "refresh" });
    expect(grant.scopes).toEqual(scopes("youtube"));
    const tokenRequest = http.mock.calls[0]?.[1];
    expect((tokenRequest?.body as URLSearchParams).get("code_verifier")).toBe("verifier");
    expect(http).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});
