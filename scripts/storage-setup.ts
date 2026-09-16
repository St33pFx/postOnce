import "./load-env";
import { CreateBucketCommand, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import { storageFromEnv } from "../src/modules/media/storage";
const storage=storageFromEnv();
const origin=new URL(process.env.BETTER_AUTH_URL!).origin;
try { await storage.client.send(new CreateBucketCommand({Bucket:storage.bucket})); }
catch(error){if(!["BucketAlreadyOwnedByYou","BucketAlreadyExists"].includes((error as Error).name))throw error;}
// Require support for a private bucket policy; never silently weaken access.
if(process.env.S3_ENFORCE_PUBLIC_ACCESS_BLOCK!=="false") await storage.client.send(new PutPublicAccessBlockCommand({Bucket:storage.bucket,
  PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}}));
await storage.client.send(new PutBucketCorsCommand({Bucket:storage.bucket,CORSConfiguration:{CORSRules:[{
  AllowedOrigins:[origin],AllowedMethods:["GET","HEAD","PUT"],AllowedHeaders:["content-type","x-amz-checksum-sha256"],ExposeHeaders:["ETag"],MaxAgeSeconds:120,
}]}}));
await storage.client.send(new PutBucketLifecycleConfigurationCommand({Bucket:storage.bucket,LifecycleConfiguration:{Rules:[{
  ID:"abort-abandoned-multipart",Status:"Enabled",Filter:{Prefix:"media/"},AbortIncompleteMultipartUpload:{DaysAfterInitiation:3},
}]}}));
console.log("Private storage, exact-origin CORS and incomplete-multipart lifecycle configured.");
storage.client.destroy();
