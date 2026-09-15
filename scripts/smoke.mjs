import assert from "node:assert/strict";

const base = process.env.SMOKE_URL ?? "http://localhost:3000";
const expectedReadiness = Number(process.env.EXPECT_READY_STATUS ?? "503");
for (const [path, status] of [["/", 200], ["/login", 200], ["/api/health/live", 200], ["/api/health/ready", expectedReadiness]]) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, status, path);
  const body = await response.text();
  if (path === "/") assert.match(body, /No hay integraciones simuladas/);
  if (path.includes("health")) {
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(body, /postgres(ql)?:\/\//);
  }
  console.log(`${path}: ${response.status}`);
}

const account = await fetch(new URL("/account", base), { redirect: "manual", signal: AbortSignal.timeout(10000) });
assert.equal(account.status, 307);
assert.equal(new URL(account.headers.get("location"), base).pathname, "/login");
console.log("/account: unauthenticated redirect to /login");

const connections = await fetch(new URL("/api/connections", base), { signal: AbortSignal.timeout(10000) });
assert.equal(connections.status, Number(process.env.EXPECT_CONNECTIONS_STATUS ?? "503"));
assert.deepEqual(await connections.json(), { error: connections.status === 401 ? "Unauthorized" : "Service unavailable" });
console.log(`/api/connections: ${connections.status}, no private data`);
