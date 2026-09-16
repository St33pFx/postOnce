import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { testStorage } from "./test-support";
if(!process.env.TEST_DATABASE_URL)throw new Error("Disposable TEST_DATABASE_URL required");
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
process.env.DATABASE_SSL="disable";
const storage=await testStorage();
try{
  const child=spawn(process.execPath,["node_modules/@playwright/test/cli.js","test"],{stdio:"inherit",windowsHide:true,
    env:{...process.env,...storage.env,NODE_ENV:"development",DATABASE_URL:process.env.TEST_DATABASE_URL,DATABASE_SSL:"disable",
      BETTER_AUTH_URL:"http://127.0.0.1:3301",BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),GOOGLE_CLIENT_ID:"e2e-only",GOOGLE_CLIENT_SECRET:"e2e-only",
      MEDIA_SERVICE_SECRET:randomBytes(32).toString("hex"),MEDIA_SERVICE_PORT:"4011",MEDIA_SERVICE_URL:"http://127.0.0.1:4011"}});
  process.exitCode=await new Promise<number>((resolve,reject)=>{child.on("exit",code=>resolve(code??1));child.on("error",reject);});
}finally{await storage.stop();}
