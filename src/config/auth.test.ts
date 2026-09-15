import { describe, expect, it } from "vitest";
import { authConfig } from "./auth";
const valid = { BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "s".repeat(32),
  GOOGLE_CLIENT_ID: "test-only", GOOGLE_CLIENT_SECRET: "test-only" };
describe("authentication configuration", () => {
  it("accepts local HTTP and requires production HTTPS", () => {
    expect(authConfig(valid).secure).toBe(false);
    expect(() => authConfig({ ...valid, NODE_ENV: "production" })).toThrow("Invalid BETTER_AUTH_URL");
    expect(authConfig({ ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://postonce.example" }).secure).toBe(true);
  });
  it("does not echo malformed secrets or permit untrusted URL components", () => {
    for (const url of ["https://user:secret@example.test", "https://example.test/path", "https://example.test?redirect=evil"]) {
      expect(() => authConfig({ ...valid, BETTER_AUTH_URL: url })).toThrow(/^Invalid BETTER_AUTH_URL$/);
    }
    expect(() => authConfig({ ...valid, BETTER_AUTH_SECRET: "secret" })).toThrow(/^Invalid BETTER_AUTH_SECRET$/);
  });
});
