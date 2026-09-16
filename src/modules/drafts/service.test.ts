import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { media } from "../../db/media-schema";
import { DraftService, type DB } from "./service";
import { MediaService } from "../media/service";
import { mediaLimits } from "../media/model";
import type { ObjectStorage } from "../media/storage";
const pg=new PGlite();const embedded=drizzle(pg,{schema});const db=embedded as unknown as DB;
const drafts=new DraftService(db);
// Test-only storage seam; real S3 integration is exercised by test:media.
const storage={begin:vi.fn(async()=>"upload-test"),abort:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),signPart:vi.fn(async()=>"https://storage.test/signed")} as unknown as ObjectStorage;
const service=new MediaService(db,storage,{...mediaLimits(),quota:1000});
let alice:string,bob:string;
beforeAll(async()=>{await migrate(embedded,{migrationsFolder:"src/db/migrations"});const users=await embedded.insert(schema.postonceUsers).values([{},{}]).returning();alice=users[0].id;bob=users[1].id;});
afterAll(()=>pg.close());
describe("drafts and media ownership",()=>{
  it("creates multiple drafts and recovers only the owner's confirmed edits",async()=>{
    const a=await drafts.create(alice),b=await drafts.create(alice);await drafts.create(bob);
    const saved=await drafts.update(alice,a.id,1,{caption:"Cross-device",videoId:null,cover:null});expect(saved.version).toBe(2);
    expect((await new DraftService(db).get(alice,a.id)).caption).toBe("Cross-device");expect((await drafts.list(alice)).map(d=>d.id)).toEqual(expect.arrayContaining([a.id,b.id]));
    await expect(drafts.get(bob,a.id)).rejects.toThrow();await expect(drafts.update(bob,a.id,2,{caption:"attack",videoId:null,cover:null})).rejects.toThrow();
    await expect(drafts.remove(bob,a.id,2)).rejects.toThrow();await expect(drafts.update(alice,a.id,1,{caption:"stale",videoId:null,cover:null})).rejects.toThrow();
    expect((await drafts.get(alice,a.id)).caption).toBe("Cross-device");
  });
  it("reserves quota before uploads, isolates media and releases only after cleanup",async()=>{
    const draft=await drafts.create(alice);const asset=await service.start(alice,draft.id,"uploaded_image",600);
    await expect(service.start(alice,draft.id,"uploaded_image",500)).rejects.toThrow("Cuota");
    expect((await service.usage(alice)).used).toBe(600);await expect(service.get(bob,asset.id)).rejects.toThrow();await expect(service.url(alice,asset.id)).rejects.toThrow();
    await expect(service.sign(bob,asset.id,1,"A".repeat(43)+"=")).rejects.toThrow();
    await service.sign(alice,asset.id,1,"A".repeat(43)+"=");await expect(service.sign(alice,asset.id,1,"B".repeat(43)+"=")).rejects.toThrow("no coincide");
    await service.cancel(alice,asset.id);expect((await service.usage(alice)).used).toBe(0);
  });
  it("rejects cross-owner SQL bindings and unvalidated media references",async()=>{
    const draft=await drafts.create(alice);
    await expect(embedded.insert(media).values({userId:bob,draftId:draft.id,kind:"uploaded_image",objectKey:"test",status:"uploaded",size:1,reservedBytes:1,partSize:16})).rejects.toThrow();
    const asset=await service.start(alice,draft.id,"original_video",10);
    await expect(drafts.update(alice,draft.id,1,{caption:"",videoId:asset.id,cover:null})).rejects.toThrow();await service.cancel(alice,asset.id);
  });
  it("protects locked/stale deletion, hides deleted drafts, retains cleanup metadata",async()=>{
    const draft=await drafts.create(alice);const asset=await service.start(alice,draft.id,"uploaded_image",10);
    await expect(drafts.remove(alice,draft.id,2)).rejects.toThrow();await embedded.update(schema.drafts).set({lockedAt:new Date()}).where(eq(schema.drafts.id,draft.id));
    await expect(drafts.remove(alice,draft.id,1)).rejects.toThrow();await embedded.update(schema.drafts).set({lockedAt:null}).where(eq(schema.drafts.id,draft.id));
    await drafts.remove(alice,draft.id,1);await expect(drafts.get(alice,draft.id)).rejects.toThrow();await expect(service.get(alice,asset.id)).rejects.toThrow();
    expect((await service.get(alice,asset.id,true)).status).toBe("deleting");await service.cleanup(alice,asset.id);
  });
});
