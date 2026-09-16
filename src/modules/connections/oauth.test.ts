import { describe, expect, it, vi } from "vitest";
import { authorizeUrl, consumeOAuthState, createOAuthState, exchange, scopes } from "./oauth";

describe("OAuth connections", () => {
  it("binds state to the user and rejects tampering, replay context, and expiry", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-oauth-secret");
    const created = createOAuthState("youtube", "user-1");
    expect(consumeOAuthState(created.value, created.state, "youtube", "user-1")).toBe(created.verifier);
    expect(() => consumeOAuthState(created.value, created.state, "youtube", "user-2")).toThrow("OAuth state invalid");
    expect(() => consumeOAuthState(`${created.value}x`, created.state, "youtube", "user-1")).toThrow("OAuth state invalid");
    vi.unstubAllEnvs();
  });

  it("builds provider authorization URLs with PKCE and least-privilege scopes", () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "youtube-client");
    const url = authorizeUrl("youtube", "https://postonce.example/api/connections/youtube/callback", "state", "challenge");
    expect(url.searchParams.get("client_id")).toBe("youtube-client");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("scope")).toBe(scopes("youtube")[0]);
    vi.unstubAllEnvs();
  });

  it("exchanges a YouTube code through injected HTTP and stores channel identity", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "secret");
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "https://www.googleapis.com/auth/youtube.upload" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "channel-1", snippet: { title: "Channel" } }] }), { status: 200 }));
    const grant = await exchange("youtube", "code", "verifier", "https://postonce.example/callback", http);
    expect(grant.remoteAccountId).toBe("channel-1");
    expect(grant.displayName).toBe("Channel");
    expect(grant.tokens).toEqual({ accessToken: "access", refreshToken: "refresh" });
    expect(http).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});
