export function authConfig(env: Record<string, string | undefined>) {
  for (const name of ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET"]) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}`);
  }
  let url: URL;
  try { url = new URL(env.BETTER_AUTH_URL!); } catch { throw new Error("Invalid BETTER_AUTH_URL"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(env.NODE_ENV !== "production" &&
        url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Invalid BETTER_AUTH_URL");
  }
  if (env.BETTER_AUTH_SECRET!.length < 32) throw new Error("Invalid BETTER_AUTH_SECRET");
  const localDev = env.NODE_ENV === "development" && env.POSTONCE_DEV_LOGIN === "1" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!localDev && (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim())) throw new Error("Missing GOOGLE_CLIENT_ID");
  return { baseURL: url.origin, secret: env.BETTER_AUTH_SECRET!,
    clientId: env.GOOGLE_CLIENT_ID ?? "", clientSecret: env.GOOGLE_CLIENT_SECRET ?? "", secure: url.protocol === "https:" };
}
