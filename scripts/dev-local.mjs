import { spawnSync, spawn } from "node:child_process";
const docker = spawnSync("docker", ["--version"], { stdio: "ignore" });
if (docker.error || docker.status !== 0) { console.error("PostOnce local development requires Docker Desktop. Install/start Docker and run npm run dev:local again."); process.exit(1); }
const compose = ["compose", "-f", "docker-compose.dev.yml"];
if (spawnSync("docker", [...compose, "up", "-d"], { stdio: "inherit" }).status !== 0) process.exit(1);
process.env.NODE_ENV = "development";
process.env.DATABASE_URL ??= "postgresql://postonce:local_only@127.0.0.1:5432/postonce";
process.env.DATABASE_SSL ??= "disable";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "local-development-secret-change-me-32-chars";
process.env.POSTONCE_DEV_LOGIN ??= "1";
process.env.S3_ENDPOINT ??= "http://127.0.0.1:8333";
process.env.S3_BUCKET ??= "postonce-local";
process.env.S3_ACCESS_KEY ??= "local"; process.env.S3_SECRET_KEY ??= "local";
if (spawnSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit", env: process.env }).status !== 0) process.exit(1);
spawn("npx", ["next", "dev"], { stdio: "inherit", env: process.env });


