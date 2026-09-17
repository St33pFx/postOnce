import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection } from "../../src/db/connection";
import { createAuth } from "../../src/modules/auth/factory";
import { authConfig } from "../../src/config/auth";
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { storageFromEnv } from "../../src/modules/media/storage";

async function session(context:BrowserContext){
  if(!process.env.TEST_DATABASE_URL||process.env.NODE_ENV!=="development")throw new Error("Test-only fixture configuration required");
  const {db,pool}=createConnection();
  try{
    await migrate(db,{migrationsFolder:"src/db/migrations"});
    const auth=createAuth(db,authConfig(process.env)),internal=await auth.$context;
    const user=await internal.internalAdapter.createUser({name:"Browser fixture",email:`${crypto.randomUUID()}@example.test`,emailVerified:true},{method:"oauth",oauth:{providerId:"google"}});
    const session=await internal.internalAdapter.createSession(user.id);
    const signature=createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(session.token).digest("base64");
    const cookie={name:internal.authCookies.sessionToken.name,value:encodeURIComponent(`${session.token}.${signature}`),domain:"127.0.0.1",path:"/",httpOnly:true,secure:false,sameSite:"Lax" as const};
    await context.addCookies([cookie]);return cookie;
  }finally{await pool.end();}
}
test.beforeAll(async()=>{
  const storage=storageFromEnv();await storage.client.send(new PutBucketCorsCommand({Bucket:storage.bucket,CORSConfiguration:{CORSRules:[{
    AllowedOrigins:["http://127.0.0.1:3301"],AllowedMethods:["GET","PUT","HEAD"],AllowedHeaders:["*"],ExposeHeaders:["ETag"],
  }]}}));storage.client.destroy();
});
test("draft autosave, recovery, conflicts and touch-compatible media editor",async({page,context,browser})=>{
  const cookie=await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  const caption=page.getByLabel("Caption general");await caption.fill("Trabajo confirmado entre dispositivos");await expect(page.getByRole("status")).toHaveText("Guardado en el servidor");
  await page.reload();await page.getByRole("button",{name:/Trabajo confirmado entre dispositivos/}).click();await expect(caption).toHaveValue("Trabajo confirmado entre dispositivos");
  const other=await browser.newContext();await other.addCookies([cookie]);const second=await other.newPage();await second.goto("/drafts");await second.getByRole("button",{name:/Trabajo confirmado entre dispositivos/}).click();
  await caption.fill("Primera edición");await expect(page.getByRole("status")).toHaveText("Guardado en el servidor");
  await second.getByLabel("Caption general").fill("Segunda edición en conflicto");await expect(second.getByRole("status")).toHaveText("Conflicto: existe otra versión");await expect(second.getByLabel("Caption general")).toHaveValue("Segunda edición en conflicto");await other.close();
  const image=await sharp({create:{width:120,height:180,channels:3,background:"#c39964"}}).png().toBuffer();
  await page.getByLabel("Subir imagen").setInputFiles({name:"cover.png",mimeType:"image/png",buffer:image});
  await expect(page.getByRole("button",{name:"Editar portada"})).toBeVisible({timeout:30_000});await page.getByRole("button",{name:"Editar portada"}).click();
  await page.getByLabel("Texto de portada").fill("Una portada");await page.getByLabel("Posición horizontal").fill("0.8");await page.getByRole("combobox",{name:"Estilo"}).selectOption("dark");
  await expect(page.getByRole("status")).toHaveText("Guardado en el servidor");await page.getByRole("button",{name:"Generar portada renderizada"}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/editor-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole("button",{name:"Eliminar texto"}).click();await expect(page.getByLabel("Texto de portada")).toHaveValue("");
  await expect(page.getByRole("status")).toHaveText("Guardado en el servidor");page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Eliminar draft y media"}).click();await expect(page.getByLabel("Caption general")).not.toBeVisible();
});
test("REQ-CP-006: frame selector requires a valid video",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  await expect(page.getByRole("button",{name:"Elegir frame del video"})).not.toBeVisible();
});
test("REQ-CP-007: portrait composed cover preview preserves aspect ratio",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  const image=await sharp({create:{width:120,height:180,channels:3,background:"#c39964"}}).png().toBuffer();
  await page.getByLabel("Subir imagen").setInputFiles({name:"cover-no-video.png",mimeType:"image/png",buffer:image});
  await expect(page.getByRole("button",{name:"Editar portada"})).toBeVisible({timeout:30_000});
  await expect(page.locator(".cover-thumb")).toHaveAttribute("style", /aspect-ratio: 120 / 180/);
  await page.getByRole("button",{name:"Editar portada"}).click();
  await expect(page.getByLabel("Texto de portada")).toBeVisible();
  await page.getByLabel("Texto de portada").fill("Portada sin video");
  await expect(page.locator(".cover-thumb .cover-text")).toHaveText("Portada sin video");
  await expect(page.getByRole("status")).toHaveText("Guardado en el servidor");
});
test("REQ-PC-012: YouTube advanced declarations disclose progressively",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  await page.getByLabel("Seleccionar youtube").check();
  await expect(page.locator(".required-declarations")).not.toBeVisible();
  await page.getByRole("button",{name:"Más opciones"}).click();
  await expect(page.locator(".required-declarations")).toBeVisible();
  await page.getByRole("button",{name:"Menos opciones"}).click();
  await expect(page.locator(".required-declarations")).not.toBeVisible();
});
test("anonymous users cannot open drafts",async({page})=>{await page.goto("/drafts");await expect(page).toHaveURL(/\/login$/);});
test("platform selection and preflight show per-destination readiness",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  await page.getByLabel("Seleccionar instagram").check();await page.getByLabel("Seleccionar tiktok").check();await page.getByLabel("Seleccionar youtube").check();
  await page.getByLabel("Título de YouTube").fill("Título específico");await page.getByLabel("Privacidad").selectOption("private");
  await page.getByRole("button",{name:"Comprobar estado"}).click();
  await expect(page.getByLabel("Resultado global")).toHaveText("Falta completar algunos datos");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

