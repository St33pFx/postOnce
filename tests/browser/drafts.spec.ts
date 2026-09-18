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
async function mobileDeleteDiagnostic(page:import("@playwright/test").Page,label:string){
  const result=await page.evaluate(()=>{
    const footer=document.querySelector(".editor-footer");
    const danger=document.querySelector(".danger-zone");
    const button=Array.from(document.querySelectorAll("button")).find(el=>el.textContent?.includes("Eliminar draft y media"));
    if(!(footer instanceof HTMLElement)||!(danger instanceof HTMLElement)||!(button instanceof HTMLElement))return{error:"required element missing",footerFound:!!footer,dangerFound:!!danger,buttonFound:!!button};
    function info(el:HTMLElement){
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      return{tag:el.tagName,className:el.className,rect:{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,width:rect.width,height:rect.height},style:{display:style.display,position:style.position,zIndex:style.zIndex,transform:style.transform,overflow:style.overflow,overflowX:style.overflowX,overflowY:style.overflowY,contain:style.contain,marginTop:style.marginTop,marginBottom:style.marginBottom,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,pointerEvents:style.pointerEvents}};
    }
    const footerRect=footer.getBoundingClientRect(),dangerRect=danger.getBoundingClientRect(),buttonRect=button.getBoundingClientRect(),center={x:buttonRect.left+buttonRect.width/2,y:buttonRect.top+buttonRect.height/2};
    const hit=document.elementFromPoint(center.x,center.y),hitPath=[] as Array<{tag:string,id:string,className:string,text:string}>;let current=hit;
    for(let i=0;current&&i<6;i++){hitPath.push({tag:current.tagName,id:current.id||"",className:current instanceof HTMLElement?current.className:"",text:current instanceof HTMLElement?current.textContent?.trim().slice(0,120)||"":""});current=current.parentElement;}
    return{viewport:{innerWidth:window.innerWidth,innerHeight:window.innerHeight,scrollX:window.scrollX,scrollY:window.scrollY,documentHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,devicePixelRatio:window.devicePixelRatio},footer:info(footer),danger:info(danger),button:info(button),center,hitPath,relations:{footerBottom:footerRect.bottom,dangerTop:dangerRect.top,dangerBottom:dangerRect.bottom,buttonTop:buttonRect.top,buttonBottom:buttonRect.bottom,footerOverlapsDanger:footerRect.bottom>dangerRect.top,footerOverlapsButton:footerRect.bottom>buttonRect.top&&footerRect.top<buttonRect.bottom,buttonInsideDanger:buttonRect.top>=dangerRect.top&&buttonRect.bottom<=dangerRect.bottom,buttonCenterInsideFooter:center.x>=footerRect.left&&center.x<=footerRect.right&&center.y>=footerRect.top&&center.y<=footerRect.bottom,buttonCenterInsideDanger:center.x>=dangerRect.left&&center.x<=dangerRect.right&&center.y>=dangerRect.top&&center.y<=dangerRect.bottom}};
  });
  console.log(`${label}=${JSON.stringify(result)}`);
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
  const deleteButton=page.getByRole("button",{name:"Eliminar draft y media"});
  await mobileDeleteDiagnostic(page,"POSTONCE_MOBILE_HIT_BEFORE_SCROLL");
  await deleteButton.scrollIntoViewIfNeeded();
  await mobileDeleteDiagnostic(page,"POSTONCE_MOBILE_HIT_AFTER_SCROLL");
  page.once("dialog",d=>d.accept());await deleteButton.click();await expect(page.getByLabel("Caption general")).not.toBeVisible();
});
test("REQ-CP-006: frame selector requires a valid video",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  await expect(page.getByRole("button",{name:"Elegir frame del video"})).not.toBeVisible();
});
test("REQ-CP-010: uploaded cover remains unchanged without an editor",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  const image=await sharp({create:{width:120,height:180,channels:3,background:"#c39964"}}).png().toBuffer();
  await page.getByLabel("Subir imagen").setInputFiles({name:"cover-no-video.png",mimeType:"image/png",buffer:image});
  await expect(page.getByText("Portada seleccionada")).toBeVisible({timeout:30_000});
  await expect(page.getByRole("button",{name:"Editar portada"})).toHaveCount(0);
  await expect(page.locator(".cover-thumb img")).toBeVisible({timeout:30_000});
  await expect(page.getByRole("status")).toHaveText("Guardado en el servidor");
});
test("REQ-PC-012: YouTube advanced declarations disclose progressively",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  await page.getByLabel("Seleccionar youtube").check();
  const youtube=page.locator(".destination-row").filter({has:page.getByLabel("Seleccionar youtube")});
  const toggle=youtube.getByRole("button",{name:/Más opciones|Menos opciones/});
  const kids=youtube.getByLabel("¿Es contenido para niños?");
  const synthetic=youtube.getByLabel("¿Contiene media sintética o alterada?");
  await expect(toggle).toHaveText("Más opciones");
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await expect(toggle).toHaveAttribute("aria-controls","advanced-youtube");
  await expect(kids).not.toBeVisible();
  await expect(synthetic).not.toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveText("Menos opciones");
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await expect(kids).toBeVisible();
  await expect(synthetic).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveText("Más opciones");
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await expect(kids).not.toBeVisible();
  await expect(synthetic).not.toBeVisible();
});
test("anonymous users cannot open drafts",async({page})=>{await page.goto("/drafts");await expect(page).toHaveURL(/\/login$/);});
test("platform selection and preflight show per-destination readiness",async({page,context})=>{
  await session(context);await page.goto("/drafts");await page.getByRole("button",{name:/Nueva publicación/}).click();
  await page.getByLabel("Seleccionar instagram").check();await page.getByLabel("Seleccionar tiktok").check();await page.getByLabel("Seleccionar youtube").check();
  const youtube=page.locator(".destination-row").filter({has:page.getByLabel("Seleccionar youtube")});
  await youtube.getByLabel("Título de YouTube").fill("Título específico");await youtube.getByLabel("Privacidad").selectOption("private");
  await page.getByRole("button",{name:"Comprobar estado"}).click();
  await expect(page.getByLabel("Resultado global")).toHaveText("Falta completar algunos datos");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

