import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type TokenBinding = { userId: string; platform: string; remoteAccountId: string };
export type Tokens = { accessToken: string; refreshToken?: string };

/** Standard Node/OpenSSL AES-256-GCM; keys never persist in the database. */
export class TokenVault {
  constructor(private keys: Record<string, Buffer>, private activeVersion: string) {
    if (!keys[activeVersion] || Object.entries(keys).some(([v, k]) => !/^[a-zA-Z0-9_-]+$/.test(v) || k.length !== 32)) {
      throw new Error("Invalid token key configuration");
    }
  }
  private aad(binding: TokenBinding) {
    return Buffer.from(JSON.stringify(["postonce-platform-token-v1", binding.userId, binding.platform, binding.remoteAccountId]));
  }
  encrypt(tokens: Tokens, binding: TokenBinding): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys[this.activeVersion], iv);
    cipher.setAAD(this.aad(binding));
    const data = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
    return ["v1", this.activeVersion, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
  }
  decrypt(envelope: string, binding: TokenBinding): Tokens {
    try {
      const [format, version, iv, tag, data, extra] = envelope.split(".");
      if (format !== "v1" || extra || !this.keys[version]) throw new Error();
      const nonce = Buffer.from(iv, "base64"), authTag = Buffer.from(tag, "base64");
      if (nonce.length !== 12 || authTag.length !== 16) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.keys[version], nonce);
      decipher.setAAD(this.aad(binding));
      decipher.setAuthTag(authTag);
      const result = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"));
      if (typeof result.accessToken !== "string" || (result.refreshToken !== undefined && typeof result.refreshToken !== "string")) throw new Error();
      return result;
    } catch { throw new Error("Token decryption failed"); }
  }
}

export function vaultFromEnv(env: Record<string, string | undefined>) {
  try {
    const raw: Record<string, string> = JSON.parse(env.TOKEN_ENCRYPTION_KEYS ?? "");
    const keys = Object.fromEntries(Object.entries(raw).map(([v, key]) => {
      if (typeof key !== "string" || Buffer.from(key, "base64").toString("base64") !== key) throw new Error();
      return [v, Buffer.from(key, "base64")];
    }));
    return new TokenVault(keys, env.TOKEN_ACTIVE_KEY_VERSION ?? "");
  } catch { throw new Error("Invalid token key configuration"); }
}
