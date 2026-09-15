import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/connections-schema.ts"],
  out: "./src/db/migrations",
  dialect: "postgresql",
});
