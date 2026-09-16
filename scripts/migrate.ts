import "./load-env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection } from "../src/db/connection";

async function main() {
  const { db, pool } = createConnection();
  try {
    await migrate(db, { migrationsFolder: "src/db/migrations" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("Migration failed. Check database configuration and migration compatibility.");
  process.exitCode = 1;
});
