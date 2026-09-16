import { spawnSync } from "node:child_process";
spawnSync("docker", ["compose", "-f", "docker-compose.dev.yml", "down"], { stdio: "inherit" });
