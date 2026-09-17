import { describe, expect, it, vi } from "vitest";
import { api } from "./client-api";

describe("draft client api", () => {
  it("accepts an empty 204 response without parsing JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api("/api/connections/confirm", "POST", {})).resolves.toBeUndefined();
  });

  it("continues to parse JSON error responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "falló" }), { status: 400 })));
    await expect(api("/api/connections/confirm", "POST", {})).rejects.toThrow("falló");
  });
});
