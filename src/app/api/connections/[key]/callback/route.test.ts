import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOAuthState } from "../../../../../modules/connections/oauth";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  exchange: vi.fn(),
  acceptGrant: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("../../../../../modules/auth/server", () => ({
  currentUser: mocks.currentUser,
  identityServices: () => ({ origin: "https://postonce.example", db: {} }),
}));
vi.mock("../../../../../modules/connections/oauth", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../../modules/connections/oauth")>(),
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
  let state: ReturnType<typeof createOAuthState>;
  const cookieJar = { get: vi.fn(), set: vi.fn() };
  const request = () => new Request(`https://localhost:8080/api/connections/youtube/callback?code=oauth-code&state=${state.state}`);
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-oauth-secret");
    state = createOAuthState("youtube", "user-1");
    cookieJar.get.mockReturnValue({ value: state.value });
    mocks.cookies.mockResolvedValue(cookieJar);
    mocks.currentUser.mockResolvedValue({ id: "user-1" });
    mocks.exchange.mockResolvedValue({ platform: "youtube", remoteAccountId: "channel-1", scopes: [], eligible: true, tokens: { accessToken: "access" } });
    mocks.acceptGrant.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("redirects a successful callback to the configured public origin", async () => {
    const response = await GET(request(), { params: Promise.resolve({ key: "youtube" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=connected");
    expect(mocks.exchange).toHaveBeenCalledWith("youtube", "oauth-code", state.verifier, "https://postonce.example/api/connections/youtube/callback");
    expect(cookieJar.set).toHaveBeenCalledWith("postonce-oauth-youtube", "", { maxAge: 0, path: "/api/connections/youtube" });
    expect(mocks.acceptGrant).toHaveBeenCalledWith("user-1", await mocks.exchange.mock.results[0].value);
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

  it.each(["access_token=do-not-log", "do-not-log", "https://provider.test/?code=do-not-log"])("redacts arbitrary provider errors: %s", async message => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.exchange.mockRejectedValue(new Error(message));
    const response = await GET(request(), { params: Promise.resolve({ key: "youtube" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=youtube-error");
    expect(error).toHaveBeenCalledWith("OAuth connection callback failed", { platform: "youtube", stage: "exchange", message: "OAuth callback failed" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("do-not-log");
    error.mockRestore();
  });

  it("rejects forged state before exchanging or persisting tokens", async () => {
    cookieJar.get.mockReturnValue({ value: `${state.value}x` });
    const response = await GET(request(), { params: Promise.resolve({ key: "youtube" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=youtube-error");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.acceptGrant).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("OAuth connection callback failed", { platform: "youtube", stage: "state", message: "OAuth state invalid" });
  });

  it("uses the public origin for an invalid platform callback", async () => {
    const response = await GET(new Request("http://localhost:8080/api/connections/nope/callback"), { params: Promise.resolve({ key: "nope" }) });
    expect(response.headers.get("location")).toBe("https://postonce.example/account?connection=error");
  });
});
