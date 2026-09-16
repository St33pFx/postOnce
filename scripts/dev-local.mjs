import { spawn } from "node:child_process";
import { config } from "dotenv";

const loaded = config({ path: ".env.local", quiet: true });
if (loaded.error) throw new Error("Copy .env.local.example to .env.local before running npm run dev:local.");
process.env.NODE_ENV = "development";
let child;
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // IPC invokes Next's cleanup on Windows instead of forcibly terminating it.
  if (child?.connected) child.send("postonce:shutdown");
  else child?.kill("SIGINT");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function run(command, args, ipc = false) {
  if (stopping) return;
  child = spawn(command, args, { env: process.env, stdio: ipc ? ["inherit", "inherit", "inherit", "ipc"] : "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  child = undefined;
  if (code !== 0 && !stopping) throw new Error(`${command} exited with code ${code}`);
}
try {
  await run("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "-d", "--wait", "--wait-timeout", "120"]);
  await run(process.execPath, ["--import", "tsx", "scripts/wait-storage.ts"]);
  await run(process.execPath, ["--import", "tsx", "scripts/migrate.ts"]);
  await run(process.execPath, ["--import", "tsx", "scripts/jobs-migrate.ts"]);
  await run(process.execPath, ["--import", "tsx", "scripts/storage-setup.ts"]);
  if (!stopping) console.log("PostOnce local: http://localhost:3000 — Ctrl+C to stop Next.");
  await run(process.execPath, ["--import", "./scripts/dev-signals.mjs", "node_modules/next/dist/bin/next", "dev", "--port", "3000"], true);
} catch (error) {
  console.error(error.code === "ENOENT" && error.path === "docker"
    ? "PostOnce local development requires Docker Desktop running with Linux containers. Docker was not found on PATH."
    : error.message);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}


