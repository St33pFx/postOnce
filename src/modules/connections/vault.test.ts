import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TokenVault, vaultFromEnv } from "./vault";

const binding = { userId: "alice", platform: "youtube", remoteAccountId: "channel-1" };
describe("platform token vault", () => {
  it("roundtrips with a random nonce and no plaintext", () => {
    const vault = new TokenVault({ k1: randomBytes(32) }, "k1");
    const tokens = { accessToken: "secret-access", refreshToken: "secret-refresh" };
    const encrypted = vault.encrypt(tokens, binding);
    expect(encrypted).not.toContain("secret");
    expect(vault.encrypt(tokens, binding)).not.toBe(encrypted);
    expect(vault.decrypt(encrypted, binding)).toEqual(tokens);
  });
  it("rejects wrong key, changed ciphertext, auth tag and identity", () => {
    const vault = new TokenVault({ k1: randomBytes(32) }, "k1");
    const encrypted = vault.encrypt({ accessToken: "secret" }, binding);
    expect(() => new TokenVault({ k1: randomBytes(32) }, "k1").decrypt(encrypted, binding)).toThrow("Token decryption failed");
    for (const index of [2, 3, 4]) {
      const parts = encrypted.split(".");
      const bytes = Buffer.from(parts[index], "base64"); bytes[0] ^= 1; parts[index] = bytes.toString("base64");
      expect(() => vault.decrypt(parts.join("."), binding)).toThrow("Token decryption failed");
    }
    for (const changed of [{ ...binding, userId: "bob" }, { ...binding, platform: "tiktok" }, { ...binding, remoteAccountId: "other" }]) {
      expect(() => vault.decrypt(encrypted, changed)).toThrow("Token decryption failed");
    }
  });
  it("supports key rotation while old versions remain configured", () => {
    const keys = { k1: randomBytes(32), k2: randomBytes(32) };
    const old = new TokenVault(keys, "k1").encrypt({ accessToken: "old" }, binding);
    const rotated = new TokenVault(keys, "k2");
    expect(rotated.decrypt(old, binding).accessToken).toBe("old");
    expect(rotated.encrypt({ accessToken: "new" }, binding)).toMatch(/^v1.k2\./);
  });
  it("rejects malformed configuration without echoing secrets", () => {
    expect(() => vaultFromEnv({ TOKEN_ENCRYPTION_KEYS: "bad-secret" })).toThrow(/^Invalid token key configuration$/);
  });
});
