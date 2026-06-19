import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { spawn } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import { writeFile, unlink, stat } from "node:fs/promises";
import { pipeline as streamPipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET!;
const JOBS_TABLE = process.env.JOBS_TABLE!;

let ffmpegBinPromise: Promise<string> | null = null;
function ffmpegBin(): Promise<string> {
  return (ffmpegBinPromise ??= (async () => {
    const mod: any = await import("ffmpeg-static");
    return (mod && (mod.default || mod)) as string;
  })());
}

type BurnEvent = {
  jobId: string;
  srt: string;
  mode: "soft" | "hard";
  style?: {
    fontSize?: number;
    pos?: number;
    boxOpacity?: number;
    color?: string;
    weight?: number;
    videoWidth?: number;
  };
};

export async function handler(event: BurnEvent) {
  const { jobId, srt, mode, style = {} } = event;
  const sourceKey = `${jobId}.bin`;
  const inPath = `/tmp/${jobId}.in`;
  const srtPath = `/tmp/${jobId}.srt`;
  const outPath = `/tmp/${jobId}.mp4`;
  const outKey = `${jobId}-burned.mp4`;

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: UPLOADS_BUCKET, Key: sourceKey }));
    await streamPipeline(obj.Body as Readable, createWriteStream(inPath));
    await writeFile(srtPath, srt, "utf8");

    const args =
      mode === "soft"
        ? buildSoftArgs(inPath, srtPath, outPath)
        : await buildHardArgs(inPath, srtPath, outPath, style);

    await runFfmpeg(args);

    const size = (await stat(outPath)).size;
    await s3.send(new PutObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: outKey,
      Body: createReadStream(outPath),
      ContentType: "video/mp4",
      ContentLength: size,
    }));

    await setBurnStatus(jobId, "done", outKey);
    return { ok: true, outKey };
  } catch (e: any) {
    await setBurnStatus(jobId, "error", undefined, String(e?.message || e));
    return { error: String(e?.message || e) };
  } finally {
    await Promise.all([
      unlink(inPath).catch(() => {}),
      unlink(srtPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);
  }
}

function buildSoftArgs(inPath: string, srtPath: string, outPath: string): string[] {
  return [
    "-y",
    "-i", inPath,
    "-i", srtPath,
    "-map", "0", "-map", "1",
    "-c", "copy",
    "-c:s", "mov_text",
    "-metadata:s:s:0", "language=eng",
    "-disposition:s:0", "default",
    outPath,
  ];
}

async function buildHardArgs(
  inPath: string,
  srtPath: string,
  outPath: string,
  style: NonNullable<BurnEvent["style"]>,
): Promise<string[]> {
  const fontSize = Number(style.fontSize) || 4.2;
  const pos = Math.max(0, Math.min(100, Number(style.pos) || 5));
  const bold = Number(style.weight) >= 700 ? 1 : 0;
  const boxOpacity = Math.max(0, Math.min(100, Number(style.boxOpacity) || 0));
  const videoWidth = Math.max(64, Number(style.videoWidth) || 1280);
  const color = srtColorFromHex(style.color || "#f4c95d") || "&HFFFFFF";

  const probed = await probeDimensions(inPath);
  const videoHeight = probed?.height || Math.round((videoWidth * 9) / 16);
  const fsPx = Math.max(12, Math.round(((fontSize / 100) * videoWidth * 288) / videoHeight));
  const marginV = Math.round((pos / 100) * 288);

  const alpha = Math.round((1 - boxOpacity / 100) * 255);
  const alphaHex = alpha.toString(16).padStart(2, "0").toUpperCase();
  const backColour = `&H${alphaHex}000000`;

  const styleStr = [
    "FontName=DejaVu Sans",
    `FontSize=${fsPx}`,
    `PrimaryColour=${color}`,
    `Bold=${bold}`,
    "Alignment=2",
    `MarginV=${marginV}`,
    `BorderStyle=3,Outline=${Math.max(2, Math.round(fsPx * 0.15))},Shadow=0,BackColour=${backColour},OutlineColour=${backColour}`,
  ].join(",");

  const escPath = srtPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");

  return [
    "-y",
    "-i", inPath,
    "-vf", `subtitles='${escPath}':force_style='${styleStr}'`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-movflags", "+faststart",
    outPath,
  ];
}

function srtColorFromHex(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  return `&H${b}${g}${r}`.toUpperCase();
}

async function probeDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  const bin = await ffmpegBin();
  return new Promise((resolve) => {
    const ff = spawn(bin, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    ff.on("close", () => {
      const m = /Stream[^\n]*Video[^\n]*?,\s*(\d{2,5})x(\d{2,5})/.exec(stderr);
      resolve(m ? { width: +m[1], height: +m[2] } : null);
    });
    ff.on("error", () => resolve(null));
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  const bin = await ffmpegBin();
  return new Promise((resolve, reject) => {
    const ff = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 8000) err = err.slice(-8000);
    });
    ff.on("error", (e) => reject(new Error("could not start ffmpeg: " + e.message)));
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("ffmpeg failed:\n" + err.slice(-600))),
    );
  });
}

async function setBurnStatus(
  id: string,
  status: "burning" | "done" | "error",
  burnResultKey?: string,
  burnError?: string,
) {
  await ddb.send(new UpdateCommand({
    TableName: JOBS_TABLE,
    Key: { id },
    UpdateExpression: "set burnStatus=:s, burnResultKey=:k, burnError=:e",
    ExpressionAttributeValues: {
      ":s": status,
      ":k": burnResultKey ?? null,
      ":e": burnError ?? null,
    },
  }));
}
