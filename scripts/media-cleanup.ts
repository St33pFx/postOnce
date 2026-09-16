import "dotenv/config";
import { and, eq, lte, or } from "drizzle-orm";
import { createConnection } from "../src/db/connection";
import { media } from "../src/db/media-schema";
import { storageFromEnv } from "../src/modules/media/storage";
import { MediaService } from "../src/modules/media/service";
// Explicit maintenance command, not a scheduler or a publishing worker.
const {db,pool}=createConnection();const service=new MediaService(db,storageFromEnv());
try{
  const rows=await db.select().from(media).where(or(eq(media.status,"deleting"),eq(media.status,"abandoned"),
    and(eq(media.status,"uploading"),lte(media.uploadExpiresAt,new Date())),and(eq(media.status,"initiating"),lte(media.uploadExpiresAt,new Date()))));
  let pending=0;
  for(const row of rows){
    try{
      if(["uploading","initiating"].includes(row.status))await db.update(media).set({status:"abandoned",deleteAfter:new Date()}).where(and(eq(media.id,row.id),eq(media.status,row.status)));
      if(!await service.cleanup(row.userId,row.id))pending++;
    }catch{pending++;}
  }
  console.log(`Media cleanup: ${rows.length-pending} completed, ${pending} pending.`);
  if(pending)process.exitCode=1;
}finally{await pool.end();}
