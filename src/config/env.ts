export interface DatabaseConfig {
  url: string;
  ssl: false | { rejectUnauthorized: true };
}

/** Errors deliberately contain variable names only, never input values. */
export function databaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const value = env.DATABASE_URL;
  if (!value) throw new Error("Missing DATABASE_URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      url.pathname.length < 2 || url.hash || url.search) {
    // SSL options in URLs can override pg's verified TLS settings.
    throw new Error("Invalid DATABASE_URL");
  }
  const ssl = env.DATABASE_SSL ?? (env.NODE_ENV === "production" ? "verify-full" : "disable");
  if (!["disable", "verify-full"].includes(ssl) ||
      (env.NODE_ENV === "production" && ssl !== "verify-full")) {
    throw new Error("Invalid DATABASE_SSL");
  }
  return { url: value, ssl: ssl === "verify-full" ? { rejectUnauthorized: true } : false };
}
