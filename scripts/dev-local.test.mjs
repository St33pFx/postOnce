import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ children: [], failure: -1 }));
vi.mock("dotenv", () => ({ config: vi.fn(() => ({ parsed: {} })) }));
vi.mock("node:child_process", () => ({ spawn: vi.fn((command, args, options) => {
  const child = new EventEmitter();
  child.connected = args.includes("node_modules/next/dist/bin/next");
  child.send = vi.fn(() => queueMicrotask(() => child.emit("exit", 0)));
  child.kill = vi.fn();
  fixtures.children.push({ command, args, options, child });
  if (!child.connected) queueMicrotask(() => child.emit("exit", fixtures.children.length - 1 === fixtures.failure ? 1 : 0));
  return child;
}) }));

afterEach(() => {
  fixtures.children = [];
  fixtures.failure = -1;
  process.exitCode = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

it("loads local env, waits for dependencies, migrates and sets up storage before keeping Next in the foreground", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  let exited = false;
  const running = import("./dev-local.mjs").then(() => { exited = true; });
  await vi.waitFor(() => expect(fixtures.children).toHaveLength(5));
  const { config } = await import("dotenv");
  expect(config).toHaveBeenCalledWith({ path: ".env.local", quiet: true });
  expect(fixtures.children[0].args).toContain("--wait");
  expect(fixtures.children.slice(1, 4).map(c => c.args.at(-1))).toEqual(["scripts/wait-storage.ts", "scripts/migrate.ts", "scripts/storage-setup.ts"]);
  expect(fixtures.children.slice(1).every(c => c.command === process.execPath)).toBe(true);
  expect(exited).toBe(false);
  const next = fixtures.children[4];
  expect(next.options.stdio).toEqual(["inherit", "inherit", "inherit", "ipc"]);
  process.emit("SIGINT");
  await running;
  expect(next.child.send).toHaveBeenCalledWith("postonce:shutdown");
  expect(next.child.kill).not.toHaveBeenCalled();
});

it("does not launch Next after a failed migration", async () => {
  vi.stubEnv("NODE_ENV", "test");
  fixtures.failure = 2;
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./dev-local.mjs");
  expect(fixtures.children).toHaveLength(3);
  expect(process.exitCode).toBe(1);
});
