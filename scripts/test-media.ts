import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { media } from "../src/db/media-schema";
import { DraftService, type DB } from "../src/modules/drafts/service";
import { MediaService } from "../src/modules/media/service";
import { processAsset, inspectImage, inspectVideo, renderCover, runTool, extractFrame, thumbnail } from "../src/modules/media/processing";
import { testStorage } from "./test-support";

const directory=await mkdtemp(join(tmpdir(),"postonce-media-fixtures-"));
const server=await testStorage();const pg=new PGlite();const db=drizzle(pg,{schema});
try{
  await migrate(db,{migrationsFolder:"src/db/migrations"});
  const [alice,bob]=await db.insert(schema.postonceUsers).values([{},{}]).returning();
  const drafts=new DraftService(db as unknown as DB),service=new MediaService(db as unknown as DB,server.storage);
  const draft=await drafts.create(alice.id);
  const image=await sharp({create:{width:120,height:180,channels:3,background:"#88aa44"}}).png().toBuffer();
  for(const format of ["png","jpeg","webp"] as const){const bytes=await sharp(image).toFormat(format).toBuffer();assert.equal((await inspectImage(bytes)).mime,`image/${format}`);}
  await assert.rejects(inspectImage(Buffer.from("<svg><script/></svg>")));
  await assert.rejects(inspectImage(image.subarray(0,35)));
  const videoPath=join(directory,"sample.mp4");
  await runTool("ffmpeg",["-nostdin","-v","error","-f","lavfi","-i","color=c=red:s=120x180:d=1","-c:v","libx264","-pix_fmt","yuv420p","-threads","1","-y",videoPath]);
  const video=await readFile(videoPath);const info=await inspectVideo(videoPath);
  assert.equal(info.metadata.width,120);assert.equal(info.metadata.height,180);assert.equal(info.metadata.duration,1);
  const movPath=join(directory,"sample.mov");await runTool("ffmpeg",["-nostdin","-v","error","-i",videoPath,"-c","copy","-y",movPath]);assert.equal((await inspectVideo(movPath)).mime,"video/quicktime");
  const badPath=join(directory,"bad.mp4");await writeFile(badPath,"not a video");await assert.rejects(inspectVideo(badPath));
  const frame=await extractFrame(videoPath,join(directory,"frame.png"),.4);assert.equal((await inspectImage(frame)).metadata.height,180);
  const recipe={baseId:crypto.randomUUID(),text:"Hola <&> mundo",x:.8,y:.8,size:.1,style:"banner" as const};
  const cover=await renderCover(image,recipe);assert.deepEqual(cover,await renderCover(image,recipe));assert.notDeepEqual(cover,image);
  assert.equal((await inspectImage(await thumbnail(cover))).mime,"image/webp");
  async function upload(bytes:Buffer,kind:"uploaded_image"|"original_video"){
    const asset=await service.start(alice.id,draft.id,kind,bytes.length);
    await assert.rejects(service.url(alice.id,asset.id));
    const checksum=createHash("sha256").update(bytes).digest("base64");const {url}=await service.sign(alice.id,asset.id,1,checksum);
    assert.equal(new URL(url).searchParams.get("X-Amz-Expires"),"120");
    const response=await fetch(url,{method:"PUT",body:new Uint8Array(bytes)});assert.equal(response.status,200,await response.text());
    await service.acknowledge(alice.id,asset.id,1,response.headers.get("etag")!);
    assert.equal((await service.progress(alice.id,asset.id)).parts[0].size,bytes.length);
    await service.finish(alice.id,asset.id);await service.finish(alice.id,asset.id);await processAsset(service,alice.id,asset.id);
    return await service.get(alice.id,asset.id);
  }
  const uploaded=await upload(image,"uploaded_image");assert.equal(uploaded.status,"ready");assert.equal(uploaded.checksum,createHash("sha256").update(image).digest("hex"));
  await assert.rejects(service.url(bob.id,uploaded.id));
  const read=await service.url(alice.id,uploaded.id);assert.equal((await fetch(read.url)).status,200);
  const unsigned=new URL(read.url);unsigned.search="";assert.equal((await fetch(unsigned)).status,403);
  const tampered=new URL(read.url);tampered.pathname+="other";assert.equal((await fetch(tampered)).status,403);
  const uploadedVideo=await upload(video,"original_video");assert.equal(uploadedVideo.status,"ready");
  const corrupt=await upload(Buffer.from("not image data"),"uploaded_image");assert.equal(corrupt.status,"failed");await assert.rejects(service.url(alice.id,corrupt.id));await service.cancel(alice.id,corrupt.id);
  const selected=await drafts.update(alice.id,draft.id,1,{caption:"Kept",videoId:uploadedVideo.id,cover:null});
  const derived=await service.derive(alice.id,draft.id,"extracted_frame",{sourceId:uploadedVideo.id,seconds:.5});await processAsset(service,alice.id,derived.id);assert.equal((await service.get(alice.id,derived.id)).status,"ready");
  await drafts.update(alice.id,draft.id,selected.version,{caption:"Kept",videoId:uploadedVideo.id,cover:{...recipe,baseId:derived.id}});
  const rendered=await service.derive(alice.id,draft.id,"rendered_cover",{sourceId:derived.id,cover:{...recipe,baseId:derived.id}});await processAsset(service,alice.id,rendered.id);assert.equal((await service.get(alice.id,rendered.id)).status,"ready");
  // Recovery after processor crash: expired lease, immutable source and persisted recipe.
  const recovering=await service.derive(alice.id,draft.id,"thumbnail",{sourceId:uploaded.id});await db.update(media).set({status:"processing",leaseUntil:new Date(0)}).where(eq(media.id,recovering.id));
  await processAsset(service,alice.id,recovering.id);assert.equal((await service.get(alice.id,recovering.id)).status,"ready");
  // Real multipart upload with two small parts (6 MB total), restart using server state.
  const multipart=new MediaService(db as unknown as DB,server.storage,{...service.limits,part:5*1024*1024});
  const asset=await multipart.start(alice.id,draft.id,"uploaded_image",6*1024*1024);
  await assert.rejects(multipart.finish(alice.id,asset.id));
  for(const number of [1,2]){
    const bytes=Buffer.alloc((number===1?5:1)*1024*1024,number),checksum=createHash("sha256").update(bytes).digest("base64");
    const {url}=await multipart.sign(alice.id,asset.id,number,checksum);
    const response=await fetch(url,{method:"PUT",body:new Uint8Array(bytes)});assert.equal(response.status,200,await response.text());await multipart.acknowledge(alice.id,asset.id,number,response.headers.get("etag")!);
  }
  assert.equal((await multipart.progress(alice.id,asset.id)).parts.length,2);await multipart.finish(alice.id,asset.id);await multipart.cancel(alice.id,asset.id);
  const current=await drafts.get(alice.id,draft.id);await drafts.remove(alice.id,draft.id,current.version);
  for(const row of await db.select().from(media)){if(row.status!=="deleted")await service.cleanup(alice.id,row.id);}
  assert.equal((await service.usage(alice.id)).used,0);await assert.rejects(server.storage.head(uploaded.objectKey));
  console.log("Media integration passed: private real S3, signed URLs, multipart/resume, sizes, FFmpeg MP4/MOV metadata/frame, Sharp formats/corruption/thumbnail, reproducible cover, ownership, recovery and deletion.");
}finally{await pg.close();await server.stop();await rm(directory,{recursive:true,force:true});}
