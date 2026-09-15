import { describe, expect, it } from "vitest";
import { databaseConfig } from "./env";

const url = "postgresql://user:secret@localhost:5432/postonce";
describe("database configuration", () => {
  it("requires an explicit URL", () => expect(() => databaseConfig({})).toThrow("Missing DATABASE_URL"));
  it.each(["bad-secret", "https://example.com/db", "postgresql://localhost/", `${url}?sslmode=no-verify`])(
    "rejects invalid configuration without echoing it", (value) => {
      expect(() => databaseConfig({ DATABASE_URL: value })).toThrow(/^Invalid DATABASE_URL$/);
    });
  it("defaults to local TLS disabled only outside production", () => {
    expect(databaseConfig({ DATABASE_URL: url }).ssl).toBe(false);
    expect(databaseConfig({ DATABASE_URL: url, NODE_ENV: "production" }).ssl).toEqual({ rejectUnauthorized: true });
  });
  it("rejects disabled production TLS and unknown modes", () => {
    for (const mode of ["disable", "require", "typo"]) {
      expect(() => databaseConfig({ DATABASE_URL: url, NODE_ENV: "production", DATABASE_SSL: mode }))
        .toThrow("Invalid DATABASE_SSL");
    }
  });
});
