import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import { authConfig } from "./auth";
import { storageFromEnv } from "../modules/media/storage";

describe("copyable local environment", () => {
  const example = parse(readFileSync(".env.local.example"));
  it("provides exactly the storage credential names consumed by the application", async () => {
    const storage = storageFromEnv({ ...example, NODE_ENV: "development" });
    try {
      const credentials = await storage.client.config.credentials();
      const config = JSON.parse(readFileSync("scripts/seaweedfs-dev.json", "utf8"));
      expect(credentials.accessKeyId).toBe(config.identities[0].credentials[0].accessKey);
      expect(credentials.secretAccessKey).toBe(config.identities[0].credentials[0].secretKey);
      expect(storage.client.config.forcePathStyle).toBe(true);
      expect(storage.bucket).toBe("postonce-local");
    } finally { storage.client.destroy(); }
  });
  it("requires no Google keys locally but cannot enable production dev authentication", () => {
    expect(authConfig({ ...example, NODE_ENV: "development" }).clientId).toBe("");
    expect(() => authConfig({ ...example, NODE_ENV: "production" })).toThrow();
    expect(() => authConfig({ ...example, NODE_ENV: "production", BETTER_AUTH_URL: "https://postonce.test" })).toThrow("Missing GOOGLE_CLIENT_ID");
  });
});
