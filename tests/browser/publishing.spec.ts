import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection } from "../../src/db/connection";
import { createAuth } from "../../src/modules/auth/factory";
import { authConfig } from "../../src/config/auth";
import { domainUser } from "../../src/modules/users/identity";
import { drafts } from "../../src/db/schema";
import { platformPublishAttempt, publishBatch, secondaryOperation } from "../../src/db/publishing-schema";

async function fixture(context:BrowserContext){
  const {db,pool}=createConnection();
  try{
    await migrate(db,{migrationsFolder:"src/db/migrations"});
    const auth=createAuth(db,authConfig(process.env)),internal=await auth.$context;
    const authUser=await internal.internalAdapter.createUser({name:"Publishing fixture",email:`${crypto.randomUUID()}@example.test`,emailVerified:true},{method:"oauth",oauth:{providerId:"google"}});
    const owner=await domainUser(db,authUser.id),session=await internal.internalAdapter.createSession(authUser.id);
    const signature=createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(session.token).digest("base64");
    await context.addCookies([{name:internal.authCookies.sessionToken.name,value:encodeURIComponent(`${session.token}.${signature}`),domain:"127.0.0.1",path:"/",httpOnly:true,secure:false,sameSite:"Lax"}]);
    const [draft]=await db.insert(drafts).values({userId:owner.id,caption:"Historial durable"}).returning();
    const [batch]=await db.insert(publishBatch).values({userId:owner.id,draftId:draft.id,draftVersion:1,status:"PublishedWithWarning",completedAt:new Date()}).returning();
    const attempts=await db.insert(platformPublishAttempt).values([
      {batchId:batch.id,platform:"instagram",status:"Published",remoteId:"ig-published",progress:100,completedAt:new Date()},
      {batchId:batch.id,platform:"tiktok",status:"Failed",errorCode:"tiktok_rejected",errorMessage:"TikTok rechazó el post",completedAt:new Date()},
      {batchId:batch.id,platform:"youtube",status:"PublishedWithWarning",remoteId:"youtube-video",progress:100,completedAt:new Date()},
    ]).returning();
    await db.insert(secondaryOperation).values({attemptId:attempts[2].id,kind:"youtube_thumbnail",status:"Failed",errorCode:"thumbnail_rejected",errorMessage:"YouTube rechazó el thumbnail",completedAt:new Date()});
    return draft;
  }finally{await pool.end();}
}

test("durable publishing history survives reload and exposes only individual retries",async({page,context})=>{
  const draft=await fixture(context);await page.goto("/drafts");await page.getByRole("button",{name:/Historial durable/}).click();
  await expect(page.getByText("Batch: Publicado con advertencia")).toBeVisible();
  await expect(page.getByLabel("Publicación instagram")).toContainText("Publicado");
  await expect(page.getByLabel("Publicación tiktok")).toContainText("Falló");
  await expect(page.getByLabel("Publicación youtube")).toContainText("Publicado con advertencia");
  await expect(page.getByRole("button",{name:"Retry tiktok"})).toBeVisible();await expect(page.getByRole("button",{name:"Retry thumbnail"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Retry All/i})).toHaveCount(0);
  await page.reload();await page.getByRole("button",{name:/Historial durable/}).click();await expect(page.getByText("Batch: Publicado con advertencia")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Retry tiktok"}).click();await expect(page.getByLabel("Publicación tiktok")).toContainText("Pendiente · intento 2");
  await expect(page.getByLabel("Publicación instagram")).toContainText("Referencia remota: ig-published");
  expect(draft.id).toBeTruthy();
});
