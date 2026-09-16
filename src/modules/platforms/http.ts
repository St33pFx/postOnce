import type { Account, Platform } from "./contract";
import { InstagramClient, TikTokClient, YouTubeClient, type Transport } from "./clients";
export function createRefreshClient(http: Transport = fetch) {
  const instagram = new InstagramClient(http), tiktok = new TikTokClient(http), youtube = new YouTubeClient(http);
  return { async refresh(platform: Platform, token: string, expectedId: string): Promise<Account> {
    if (platform === "tiktok") {
      const a = await tiktok.refresh(token, expectedId);
      return { ...a, connected: true, eligible: true, dynamic: a };
    }
    const a = await (platform === "instagram" ? instagram : youtube).refresh(token, expectedId);
    return { ...a, connected: true, eligible: true };
  } };
}
export const realRefreshClient = createRefreshClient();
