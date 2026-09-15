import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseConfig } from "../config/env";
import * as schema from "./schema";

/** Server/CLI infrastructure only; browser imports use the guarded index boundary. */
export function createConnection(env: NodeJS.ProcessEnv = process.env) {
  const config = databaseConfig(env);
  const pool = new Pool({
    connectionString: config.url,
    ssl: config.ssl,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
    query_timeout: 4000,
  });
  // Do not log raw pg errors: they may contain hostnames, query data or secrets.
  pool.on("error", () => console.error("Database idle connection error"));
  return { db: drizzle(pool, { schema }), pool };
}
