import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), disconnect: vi.fn(), confirmBinding: vi.fn() }));
vi.mock("./server", () => ({ currentUser: mocks.currentUser,
  identityServices: () => ({ origin: "https://postonce.test", db: {} }) }));
vi.mock("../connections/vault", () => ({ vaultFromEnv: () => ({}) }));
vi.mock("../connections/service", () => ({ ConnectionService: class {
  disconnect = mocks.disconnect;
  confirmBinding = mocks.confirmBinding;
} }));
import { GET } from "../../app/api/connections/route";
import { DELETE } from "../../app/api/connections/[key]/route";
import { POST } from "../../app/api/connections/confirm/route";

describe("private HTTP resource boundaries", () => {
  it("rejects unauthenticated listing and writes", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await GET(new Request("https://postonce.test/api/connections"))).status).toBe(401);
    expect((await DELETE(new Request("https://postonce.test/api/connections/x", { method: "DELETE",
      headers: { origin: "https://postonce.test" } }), { params: Promise.resolve({ key: "x" }) })).status).toBe(401);
  });
  it("rejects mutation CSRF before accessing a session or connection", async () => {
    mocks.currentUser.mockClear(); mocks.disconnect.mockClear();
    const response = await DELETE(new Request("https://postonce.test/api/connections/x", { method: "DELETE",
      headers: { origin: "https://evil.test" } }), { params: Promise.resolve({ key: "x" }) });
    expect(response.status).toBe(403);
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
  it("takes owner only from session and redacts service errors", async () => {
    mocks.currentUser.mockResolvedValue({ id: "session-owner" });
    mocks.disconnect.mockRejectedValue(new Error("database token=secret-do-not-echo"));
    const id = crypto.randomUUID();
    const response = await DELETE(new Request(`https://postonce.test/api/connections/${id}?userId=attacker`, {
      method: "DELETE", headers: { origin: "https://postonce.test" },
    }), { params: Promise.resolve({ key: id }) });
    expect(mocks.disconnect).toHaveBeenCalledWith("session-owner", id);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("secret");
  });
  it("rejects stale confirmation without echoing sensitive errors", async () => {
    mocks.currentUser.mockResolvedValue({ id: "session-owner" });
    mocks.confirmBinding.mockRejectedValue(new Error("secret"));
    const response = await POST(new Request("https://postonce.test/api/connections/confirm", {
      method: "POST", headers: { origin: "https://postonce.test", "content-type": "application/json" },
      body: JSON.stringify({ draftId: crypto.randomUUID(), connectionId: crypto.randomUUID(), platform: "youtube", revision: 1 }),
    }));
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("secret");
  });
});
