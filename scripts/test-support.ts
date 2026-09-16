import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { S3Storage } from "../src/modules/media/storage";
export async function testStorage() {
  const directory=await mkdtemp(join(tmpdir(),"postonce-s3-test-"));
  const accessKeyId="test"+randomBytes(8).toString("hex"),secretAccessKey=randomBytes(24).toString("hex");
  const endpoint="http://127.0.0.1:18333",bucket="postonce-test";
  const processHandle=spawn(process.env.WEED_PATH??"weed",["mini",`-dir=${directory}`,"-ip=127.0.0.1","-ip.bind=127.0.0.1",
    "-master.port=19333","-volume.port=19340","-filer.port=18888","-s3.port=18333","-s3.port.iceberg=0","-s3.port.lance=0",
    "-admin.ui=false","-webdav=false","-master.telemetry=false","-volume.max=4","-master.volumeSizeLimitMB=32",`-bucket=${bucket}`],
    {windowsHide:true,stdio:["ignore","ignore","pipe"],env:{...process.env,AWS_ACCESS_KEY_ID:accessKeyId,AWS_SECRET_ACCESS_KEY:secretAccessKey}});
  let failure:Error|undefined;
  processHandle.on("error",e=>{failure=e;});
  let log="";processHandle.stderr.on("data",d=>{log=(log+d.toString()).slice(-3000);});
  const client=new S3Client({endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId,secretAccessKey},requestChecksumCalculation:"WHEN_REQUIRED",maxAttempts:1});
  const stop=async()=>{if(processHandle.exitCode===null){const exited=new Promise(r=>processHandle.once("exit",r));processHandle.kill();await exited;}client.destroy();await rm(directory,{recursive:true,force:true});};
  try {
    for(let i=0;i<120;i++){
      if(failure)throw failure;
      if(processHandle.exitCode!==null)throw new Error(`Storage exited: ${log}`);
      try{await client.send(new HeadBucketCommand({Bucket:bucket}));return {storage:new S3Storage(client,bucket),stop,env:{S3_ENDPOINT:endpoint,S3_REGION:"us-east-1",S3_BUCKET:bucket,S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey,S3_FORCE_PATH_STYLE:"true"}};}catch{ /* Wait for bucket initialization. */ }
      await new Promise(r=>setTimeout(r,250));
    }
    throw new Error(`Storage failed to start: ${log}`);
  }catch(error){await stop();throw error;}
}
