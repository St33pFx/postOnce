import "dotenv/config";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createConnection } from "../src/db/connection";
import { storageFromEnv } from "../src/modules/media/storage";
import { MediaService } from "../src/modules/media/service";
import { processAsset } from "../src/modules/media/processing";
import { uuid } from "../src/modules/media/model";
const secret = process.env.MEDIA_SERVICE_SECRET;
if (!secret || secret.length < 32) throw new Error("Invalid MEDIA_SERVICE_SECRET");
const { db } = createConnection();
const service = new MediaService(db, storageFromEnv());
let busy = false;
createServer(async (req,res) => {
  const token = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (token.length !== expected.length || !timingSafeEqual(token,expected)) { res.writeHead(403).end(); return; }
  if (req.method !== "POST" || req.url !== "/process") { res.writeHead(404).end(); return; }
  if (busy) { res.writeHead(503).end(); return; }
  busy = true;
  try {
    let body = "";
    for await (const part of req) { body += part; if (body.length > 1024) throw new Error(); }
    const { userId,id } = JSON.parse(body);
    if (!uuid(userId) || !uuid(id)) throw new Error();
    await service.get(userId,id);
    res.writeHead(202).end();
    void processAsset(service,userId,id).catch(() => console.error("Media operation failed")).finally(() => { busy = false; });
  } catch { busy = false; res.writeHead(400).end(); }
}).listen(Number(process.env.MEDIA_SERVICE_PORT ?? 4010), process.env.MEDIA_SERVICE_HOST ?? "127.0.0.1", () => console.log("Media service ready"));
