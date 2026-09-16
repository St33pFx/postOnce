import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import sharp, { type OverlayOptions } from "sharp";
import { and, eq, or, lt } from "drizzle-orm";
import { media } from "../../db/media-schema";
import { mediaLimits, type CoverState, type MediaMetadata } from "./model";
import { MediaService } from "./service";
const execute = promisify(execFile);
export async function runTool(tool: "ffmpeg" | "ffprobe", args: string[], timeout = mediaLimits(process.env).timeout) {
  return execute(process.env[tool === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"] || tool, args,
    { timeout, maxBuffer: 1024 * 1024, windowsHide: true, encoding: "utf8", shell: false });
}
export async function inspectVideo(path: string): Promise<{ mime: string; metadata: MediaMetadata }> {
  const head = await readFilePrefix(path);
  // ISO-BMFF MP4 or QuickTime; reject 3GP/HEIF/AVIF and audio-only containers.
  const atom = head.subarray(4,8).toString("ascii");
  const brand = atom === "ftyp" ? head.subarray(8, 12).toString("ascii") : "qt  ";
  if ((atom !== "ftyp" && !["moov","mdat","wide","free"].includes(atom)) || !["isom","iso2","iso3","iso4","iso5","iso6","mp41","mp42","avc1","qt  ","M4V ","MSNV"].includes(brand)) throw new Error("Unsupported container");
  const { stdout } = await runTool("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "mov", "-show_entries",
    "format=format_name,duration:stream=codec_type,codec_name,width,height:stream_side_data=rotation", "-of", "json", path]);
  const parsed = JSON.parse(stdout);
  const video = parsed.streams?.find((s: { codec_type: string }) => s.codec_type === "video");
  const audio = parsed.streams?.find((s: { codec_type: string }) => s.codec_type === "audio");
  const duration = Number(parsed.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(video.width) || !Number.isInteger(video.height) ||
    video.width <= 0 || video.height <= 0 || video.width * video.height > mediaLimits(process.env).pixels) throw new Error("Invalid video");
  const rotation = video.side_data_list?.find((s: { rotation?: number }) => Number.isFinite(s.rotation))?.rotation ?? 0;
  const rotated = Math.abs(rotation) % 180 === 90;
  return { mime: brand === "qt  " ? "video/quicktime" : "video/mp4", metadata: {
    width: rotated ? video.height : video.width, height: rotated ? video.width : video.height, duration,
    container: brand === "qt  " ? "mov" : "mp4", videoCodec: String(video.codec_name).slice(0,64),
    audioCodec: audio ? String(audio.codec_name).slice(0,64) : undefined } };
}
async function readFilePrefix(path: string) {
  const { open } = await import("node:fs/promises");
  const file = await open(path, "r");
  try { const buffer = Buffer.alloc(32); await file.read(buffer, 0, 32, 0); return buffer; } finally { await file.close(); }
}
export async function inspectImage(path: string | Buffer) {
  const image = sharp(path, { limitInputPixels: mediaLimits(process.env).pixels, failOn: "warning", animated: false });
  const meta = await image.metadata();
  if (!["jpeg","png","webp"].includes(meta.format ?? "") || !meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new Error("Unsupported image");
  // Decode every pixel: metadata alone does not detect truncated/corrupt image data.
  await image.clone().stats();
  const swap = [5,6,7,8].includes(meta.orientation ?? 0);
  return { mime: `image/${meta.format}`, metadata: { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height } };
}
export async function extractFrame(path: string, output: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid frame");
  await runTool("ffmpeg", ["-nostdin", "-v", "error", "-threads", "1", "-protocol_whitelist", "file", "-format_whitelist", "mov",
    "-ss", String(seconds), "-i", path, "-frames:v", "1", "-an", "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease", "-threads", "1", "-y", output]);
  return readFile(output);
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c]!);
export async function renderCover(path: string | Buffer, state: CoverState) {
  const base = await sharp(path, { limitInputPixels: mediaLimits(process.env).pixels }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const { width = 1, height = 1 } = await sharp(base).metadata();
  if (!state.text) return base;
  const fontSize = Math.max(1, Math.round(width * state.size));
  // Pango escapes untrusted text; block fits within 90% of the image in both dimensions.
  const color = state.style === "dark" ? "#172b25" : "#ffffff";
  const text = await sharp({ text: { text: `<span foreground="${color}">${escape(state.text)}</span>`,
    font: `DejaVu Sans Bold ${fontSize}`, width: Math.max(1,Math.floor(width*.9)), align: "center", rgba: true } }).png().toBuffer();
  const block = await sharp(text).resize({ width: Math.max(1,Math.floor(width*.9)), height: Math.max(1,Math.floor(height*.9)), fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const { width: tw = 1, height: th = 1 } = await sharp(block).metadata();
  const left = Math.round(state.x * (width-tw)), top = Math.round(state.y * (height-th));
  const layers: OverlayOptions[] = [];
  if (state.style === "banner") layers.push({ input: { create: { width: tw, height: th, channels: 4, background: "#172b25" } }, left, top });
  layers.push({ input: block, left, top });
  return sharp(base).composite(layers).png().toBuffer();
}
export async function thumbnail(path: string | Buffer) { return sharp(path, { limitInputPixels: mediaLimits(process.env).pixels }).rotate().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp().toBuffer(); }

export async function processAsset(service: MediaService, userId: string, id: string) {
  const row = await service.get(userId, id);
  const operationId = randomUUID();
  const [claimed] = await service.db.update(media).set({ status: "processing", operationId, leaseUntil: new Date(Date.now()+service.limits.lease), error: null, updatedAt: new Date() })
    .where(and(eq(media.id, id), or(eq(media.status,"uploaded"), eq(media.status,"failed"),
      and(eq(media.status,"processing"), lt(media.leaseUntil,new Date()))))).returning();
  if (!claimed) return;
  const directory = await mkdtemp(join(tmpdir(), "postonce-media-"));
  const path = join(directory, "source.bin");
  const outputKey = row.recipe ? `${row.objectKey}/${operationId}` : row.objectKey;
  try {
    const source = row.recipe ? await service.get(userId, row.recipe.sourceId) : row;
    const expected = source.size;
    if (await service.storage.head(source.objectKey) !== expected) throw new Error("Invalid object size");
    const hash = createHash("sha256");
    let size = 0;
    await pipeline(await service.storage.read(source.objectKey), new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > expected) return callback(new Error("Size exceeded"));
      hash.update(chunk); callback(null, chunk);
    } }), createWriteStream(path, { flags: "wx" }), { signal: AbortSignal.timeout(service.limits.timeout) });
    if (size !== expected) throw new Error("Incomplete object");
    let checksum = hash.digest("hex");
    if (source.checksum && source.checksum !== checksum) throw new Error("Source checksum mismatch");
    let inspected: { mime: string; metadata: MediaMetadata };
    if (row.recipe) {
      let output: Buffer;
      if (row.kind === "extracted_frame") output = await extractFrame(path, join(directory,"frame.png"), row.recipe.seconds!);
      else if (row.kind === "rendered_cover") output = await renderCover(path,row.recipe.cover!);
      else output = await thumbnail(path);
      if (output.length > row.reservedBytes) throw new Error("Generated image too large");
      inspected = await inspectImage(output);
      size = output.length; checksum = createHash("sha256").update(output).digest("hex");
      await service.storage.put(outputKey, output, inspected.mime);
    } else {
      inspected = row.kind === "original_video" ? await inspectVideo(path) : await inspectImage(path);
      // Decode a frame to verify the video is actually readable; no transcoding.
      if (row.kind === "original_video") await extractFrame(path, join(directory,"probe.png"), 0);
    }
    const [saved] = await service.db.update(media).set({ status: "ready", objectKey: outputKey, size, reservedBytes: size, checksum,
      mime: inspected.mime, metadata: inspected.metadata, leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(media.id,id),eq(media.status,"processing"),eq(media.operationId,operationId))).returning();
    if (!saved) {
      if (row.recipe) await service.storage.remove(outputKey);
      const latest = await service.get(userId,id,true);
      if (["deleting","abandoned"].includes(latest.status)) {
        await service.db.update(media).set({ leaseUntil: null }).where(and(eq(media.id,id),eq(media.operationId,operationId)));
        await service.cleanup(userId,id);
      }
    }
  } catch {
    if (row.recipe) await service.storage.remove(outputKey).catch(()=>{});
    await service.db.update(media).set({ status: "failed", error: "Archivo ilegible, incompatible o procesamiento interrumpido. Reintenta o cancela el upload.",
      leaseUntil: null, updatedAt: new Date() }).where(and(eq(media.id,id),eq(media.status,"processing"),eq(media.operationId,operationId)));
  } finally {
    await service.db.update(media).set({leaseUntil:null}).where(and(eq(media.id,id),eq(media.operationId,operationId)));
    const latest=await service.get(userId,id,true).catch(()=>null);
    if(latest && ["deleting","abandoned"].includes(latest.status)) await service.cleanup(userId,id).catch(()=>{});
    await rm(directory, { recursive: true, force: true });
  }
}
