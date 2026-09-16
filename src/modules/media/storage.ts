import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
export type Part = { number: number; size: number; etag: string };
export interface ObjectStorage {
  begin(key: string): Promise<string>;
  signPart(key: string, upload: string, number: number, size: number, checksum: string): Promise<string>;
  parts(key: string, upload: string): Promise<Part[]>;
  complete(key: string, upload: string, parts: Part[]): Promise<void>;
  abort(key: string, upload: string): Promise<void>;
  head(key: string): Promise<number>;
  read(key: string): Promise<Readable>;
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  remove(key: string): Promise<void>;
  signedRead(key: string, mime: string): Promise<string>;
}
export class S3Storage implements ObjectStorage {
  constructor(public client: S3Client, public bucket: string, private ttl = 120) {}
  async begin(key: string) {
    const result = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: "application/octet-stream" }));
    if (!result.UploadId) throw new Error("Storage unavailable");
    return result.UploadId;
  }
  signPart(key: string, upload: string, number: number, size: number) {
    return getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: upload,
      // The application stores the SHA-256 checksum for resumability. Do not add
      // ChecksumSHA256 here: R2's UploadPart API does not accept that request
      // parameter, and the browser upload intentionally sends no signed checksum header.
      PartNumber: number, ContentLength: size }), { expiresIn: this.ttl });
  }
  async parts(key: string, upload: string) {
    const out: Part[] = [];
    let marker: string | undefined;
    do {
      const result = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: upload, PartNumberMarker: marker }));
      for (const p of result.Parts ?? []) out.push({ number: p.PartNumber!, size: p.Size!, etag: p.ETag! });
      marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    } while (marker);
    return out;
  }
  async complete(key: string, upload: string, parts: Part[]) {
    await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: upload,
      MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.number, ETag: p.etag })) } }));
  }
  async abort(key: string, upload: string) {
    try { await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: upload })); }
    catch (error) { if ((error as { name: string }).name !== "NoSuchUpload") throw error; }
  }
  async head(key: string) { return (await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))).ContentLength!; }
  async read(key: string) { return (await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))).Body as Readable; }
  async put(key: string, bytes: Buffer, mime: string) { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mime })); }
  async remove(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
  signedRead(key: string, mime: string) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key,
    ResponseContentType: mime, ResponseContentDisposition: "inline", ResponseCacheControl: "private, no-store" }), { expiresIn: this.ttl }); }
}
export function storageFromEnv(env = process.env) {
  for (const key of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!env[key]) throw new Error(`Missing ${key}`);
  if (env.S3_ENDPOINT) {
    const url = new URL(env.S3_ENDPOINT);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" &&
      !(env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid S3_ENDPOINT");
  }
  return new S3Storage(new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true", requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! } }), env.S3_BUCKET!);
}
