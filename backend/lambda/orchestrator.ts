import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { pipeline as streamPipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { makeSegments, mergeCues, toSrt, toVtt, SAMPLE_RATE, type Cue } from "../src/transcription/subtitles.util";

const lambda = new LambdaClient({});
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const CHUNKS_BUCKET = process.env.CHUNKS_BUCKET!;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET!;
const JOBS_TABLE = process.env.JOBS_TABLE!;
const WORKER_EN_FN = process.env.WORKER_EN_FN!;
// small.en is English-only; non-English jobs need the multilingual base model.
const WORKER_BASE_FN = process.env.WORKER_BASE_FN!;

export async function handler(event: any) {
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const head = await s3.send(new HeadObjectCommand({ Bucket: UPLOADS_BUCKET, Key: key }));
    const jobId = head.Metadata!.jobid;
    const language = head.Metadata!.language || undefined;
    // English (or unspecified) → small.en; anything else → multilingual base model.
    const isEnglish = !language || language.toLowerCase() === "en";
    const workerFn = isEnglish ? WORKER_EN_FN : WORKER_BASE_FN;

    try {
      await setStatus(jobId, "decoding", 0);
      const pcm = await extractPcmFromS3(key, jobId);
      const segments = makeSegments(pcm);

      await setStatus(jobId, "transcribing", 0, segments.length);

      let done = 0;
      const perSegment = await Promise.all(
        segments.map(async (seg, idx) => {
          const chunkKey = `${jobId}/${idx}.f32`;
          await s3.send(new PutObjectCommand({
            Bucket: CHUNKS_BUCKET,
            Key: chunkKey,
            Body: Buffer.from(seg.pcm.buffer, seg.pcm.byteOffset, seg.pcm.byteLength),
          }));
          const r = await lambda.send(new InvokeCommand({
            FunctionName: workerFn,
            Payload: Buffer.from(JSON.stringify({
              chunkKey, offset: seg.start, language,
            })),
          }));
          const payloadText = Buffer.from(r.Payload!).toString();
          if (r.FunctionError) {
            throw new Error(`worker segment ${idx} crashed (${r.FunctionError}): ${payloadText}`);
          }
          const body = JSON.parse(payloadText);
          if (body.error) throw new Error(`worker segment ${idx}: ${body.error}`);
          done++;
          await setStatus(jobId, "transcribing", done / segments.length);
          return body.cues as Cue[];
        }),
      );

      const cues = mergeCues(perSegment);
      const resultKey = `${jobId}.json`;
      await s3.send(new PutObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: resultKey,
        Body: JSON.stringify({ cues, srt: toSrt(cues), vtt: toVtt(cues) }),
        ContentType: "application/json",
      }));
      await setStatus(jobId, "done", 1, segments.length, resultKey);
    } catch (e: any) {
      await setStatus(jobId, "error", 0, undefined, undefined, String(e?.message || e));
    }
  }
}

async function extractPcmFromS3(key: string, jobId: string): Promise<Float32Array> {
  const tmpPath = `/tmp/${jobId}.bin`;
  const obj = await s3.send(new GetObjectCommand({ Bucket: UPLOADS_BUCKET, Key: key }));
  await streamPipeline(obj.Body as Readable, createWriteStream(tmpPath));

  const ffmpegMod: any = await import("ffmpeg-static");
  const ffmpegBin: string = ffmpegMod.default || ffmpegMod;

  try {
    return await new Promise<Float32Array>((resolve, reject) => {
      const args = [
        "-i", tmpPath,
        "-vn",
        "-ac", "1",
        "-ar", String(SAMPLE_RATE),
        "-f", "f32le",
        "-acodec", "pcm_f32le",
        "pipe:1",
      ];
      const ff = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      let stderr = "";
      ff.stdout.on("data", (d: Buffer) => chunks.push(d));
      ff.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      ff.on("error", (e) => reject(new Error("could not start ffmpeg: " + e.message)));
      ff.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error("ffmpeg failed (code " + code + "):\n" + stderr.slice(-600)));
        }
        const buf = Buffer.concat(chunks);
        const usable = buf.length - (buf.length % 4);
        const view = new Float32Array(buf.buffer, buf.byteOffset, usable / 4);
        resolve(Float32Array.from(view));
      });
    });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

async function setStatus(
  id: string,
  status: string,
  progress: number,
  segments?: number,
  resultKey?: string,
  error?: string,
) {
  await ddb.send(new UpdateCommand({
    TableName: JOBS_TABLE,
    Key: { id },
    UpdateExpression: "set #s=:s, progress=:p, #n=:n, resultKey=:r, #e=:e, expiresAt=:ttl",
    ExpressionAttributeNames: { "#s": "status", "#e": "error", "#n": "segments" },
    ExpressionAttributeValues: {
      ":s": status,
      ":p": progress,
      ":n": segments ?? null,
      ":r": resultKey ?? null,
      ":e": error ?? null,
      ":ttl": Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    },
  }));
}
