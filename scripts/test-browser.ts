import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { testStorage } from "./test-support";
import { bossFromEnv, prepareQueues } from "../src/infrastructure/jobs/publishing";
if(!process.env.TEST_DATABASE_URL)throw new Error("Disposable TEST_DATABASE_URL required");
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
process.env.DATABASE_SSL="disable";
const storage=await testStorage();
try{
  const tokenKey=randomBytes(32).toString("base64");
  const childEnv:NodeJS.ProcessEnv={...process.env,...storage.env,NODE_ENV:"development",DATABASE_URL:process.env.TEST_DATABASE_URL,DATABASE_SSL:"disable",
    POSTONCE_DEV_LOGIN:"1",BETTER_AUTH_URL:"http://127.0.0.1:3301",BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),GOOGLE_CLIENT_ID:"",GOOGLE_CLIENT_SECRET:"",
    TOKEN_ENCRYPTION_KEYS:JSON.stringify({k1:tokenKey}),TOKEN_ACTIVE_KEY_VERSION:"k1",POSTONCE_BROWSER_PROVIDER_STUB:"1",
    MEDIA_SERVICE_SECRET:randomBytes(32).toString("hex"),MEDIA_SERVICE_PORT:"4011",MEDIA_SERVICE_URL:"http://127.0.0.1:4011"};
  const preload=pathToFileURL(resolve("scripts/browser-provider-stub.mjs")).href;
  childEnv.NODE_OPTIONS=[childEnv.NODE_OPTIONS,"--import",preload].filter(Boolean).join(" ");
  const boss=bossFromEnv(childEnv,true);await boss.start();await prepareQueues(boss);await boss.stop({graceful:true});
  const child=spawn(process.execPath,["node_modules/@playwright/test/cli.js","test"],{stdio:"inherit",windowsHide:true,
    env:childEnv});
  process.exitCode=await new Promise<number>((resolve,reject)=>{child.on("exit",code=>resolve(code??1));child.on("error",reject);});
}finally{await storage.stop();}
