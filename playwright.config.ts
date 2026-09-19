import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",timeout:90_000,workers:1,fullyParallel:false,
  use:{baseURL:"http://127.0.0.1:3301",trace:"retain-on-failure"},
  projects:[{name:"desktop",use:{...devices["Desktop Chrome"],browserName:"chromium"}},
    {name:"ipad",use:{...devices["iPad (gen 7)"],browserName:"webkit"}},
    {name:"iphone",use:{...devices["iPhone 13"],browserName:"webkit"}}],
  webServer:[{command:"npm run dev -- --hostname 127.0.0.1 --port 3301",url:"http://127.0.0.1:3301/api/health/live",reuseExistingServer:false,timeout:90_000},
    {command:"npm run media:serve",port:4011,reuseExistingServer:false,timeout:30_000}],
});
