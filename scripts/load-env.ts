import { config } from "dotenv";

// Exported environment values (including CI credentials) retain precedence.
config({ path: [".env.local", ".env"], quiet: true });
