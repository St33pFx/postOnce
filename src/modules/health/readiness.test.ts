import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/live/route";
import { readiness } from "./readiness";

describe("health contracts", () => {
  it("liveness makes no database claim", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "web" });
  });
  it("reports readiness only after a successful probe", async () => {
    const response = await readiness(async () => {});
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("redacts errors and reports service unavailable", async () => {
    const response = await readiness(async () => { throw new Error("postgres://user:secret@private"); });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_ready", service: "web", database: "unavailable" });
  });
});
