import assert from "node:assert/strict";

const base = process.env.SMOKE_URL ?? "http://localhost:3000";
const expectedReadiness = Number(process.env.EXPECT_READY_STATUS ?? "503");
for (const [path, status] of [["/", 200], ["/api/health/live", 200], ["/api/health/ready", expectedReadiness]]) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, status, path);
  const body = await response.text();
  if (path === "/") assert.match(body, /no permite iniciar sesión/);
  if (path.includes("health")) {
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(body, /postgres(ql)?:\/\//);
  }
  console.log(`${path}: ${response.status}`);
}
