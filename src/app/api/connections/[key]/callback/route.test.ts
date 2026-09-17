import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  consumeOAuthState: vi.fn(),
  exchange: vi.fn(),
  acceptGrant: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("../../../../../modules/auth/server", () => ({
  currentUser: mocks.currentUser,
  identityServices: () => ({ origin: "https://postonce.example", db: {} }),
}));
vi.mock("../../../../../modules/connections/oauth", () => ({
  consumeOAuthState: mocks.consumeOAuthState,
  exchange: mocks.exchange,
  oauthCookieName: (platform: string) => `postonce-oauth-${platform}`,
}));
vi.mock("../../../../../modules/connections/service", () => ({
  ConnectionService: class { acceptGrant = mocks.acceptGrant; },
}));
vi.mock("../../../../../modules/connections/vault", () => ({ vaultFromEnv: () => ({}) }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { GET } from "./route";

describe("YouTube OAuth callback redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "signed-state" })), set: vi.fn() });
    mocks.currentUser.mockResolvedValue({ id: "user-1" });
    mocks.consumeOAuthState.mockReturnValue("verifier");
    mocks.exchange.mockResolvedValue({ platform: "youtube", remoteAccountId: "channel-1", scopes: [], eligible: true, tokens: { accessToken: "access" } });
    mocks.acceptGrant.mockResolvedValue(undefined);
  });

  it("redirects a successful callback to the configured public origin", async () => {
    const response = await GET(new Request("http://localhost:8080/api/connections/youtube/callback?code=oauth-code&state=oauth-state"), { params: Promise.resolve({ key: "youtube" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=connected");
    expect(mocks.exchange).toHaveBeenCalledWith("youtube", "oauth-code", "verifier", "https://postonce.example/api/connections/youtube/callback");
  });

  it("redirects callback errors to the configured public origin without logging secrets", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.currentUser.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost:8080/api/connections/youtube/callback?code=oauth-code&state=oauth-state"), { params: Promise.resolve({ key: "youtube" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=youtube-error");
    expect(JSON.stringify(error.mock.calls)).not.toContain("oauth-code");
    expect(JSON.stringify(error.mock.calls)).not.toContain("oauth-state");
    error.mockRestore();
  });

  it("redacts sensitive provider error messages in server logs", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.exchange.mockRejectedValue(new Error("access_token=do-not-log"));
    await GET(new Request("http://localhost:8080/api/connections/youtube/callback?code=oauth-code&state=oauth-state"), { params: Promise.resolve({ key: "youtube" }) });
    expect(JSON.stringify(error.mock.calls)).not.toContain("do-not-log");
    error.mockRestore();
  });

  it("uses the public origin for an invalid platform callback", async () => {
    const response = await GET(new Request("http://localhost:8080/api/connections/nope/callback"), { params: Promise.resolve({ key: "nope" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=error");
  });
});
