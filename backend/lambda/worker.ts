import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const CHUNKS_BUCKET = process.env.CHUNKS_BUCKET!;
const WHISPER_BIN = process.env.WHISPER_BIN || "/opt/whisper/whisper-cli";
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || "/opt/whisper/model.bin";
const SAMPLE_RATE = 16000;

export async function handler(event: { chunkKey: string; offset: number; language?: string }) {
  const tmpId = randomUUID();
  const wavPath = `/tmp/${tmpId}.wav`;
  const outPrefix = `/tmp/${tmpId}`;
  const jsonPath = `${outPrefix}.json`;

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: CHUNKS_BUCKET, Key: event.chunkKey }));
    const buf = Buffer.from(await obj.Body!.transformToByteArray());
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

    await writeFile(wavPath, encodeWav(f32, SAMPLE_RATE));

    const args = [
      "-m", MODEL_PATH,
      "-f", wavPath,
      "-oj",
      "-of", outPrefix,
      "-l", event.language || "en",
      // --max-len 1 + --split-on-word emits one word per segment, each with its own
      // timestamps.from/to — word-level timing the client regroups into ≤N-word cues.
      "--max-len", "1",
      "--split-on-word",
    ];
    await run(WHISPER_BIN, args);

    const json = JSON.parse(await readFile(jsonPath, "utf-8"));
    const segs: any[] = json.transcription || [];
    let cues = segs
      .filter((c) => c.text?.trim())
      .map((c) => ({
        start: tsToSec(c.timestamps?.from) + event.offset,
        end: tsToSec(c.timestamps?.to) + event.offset,
        text: c.text.trim(),
      }));
    if (!cues.length && segs.length) {
      const text = segs.map((c) => c.text || "").join(" ").trim();
      if (text) cues = [{ start: event.offset, end: event.offset + 5, text }];
    }
    return { cues };
  } catch (e: any) {
    return { error: String(e?.message || e) };
  } finally {
    await Promise.all([
      unlink(wavPath).catch(() => {}),
      unlink(jsonPath).catch(() => {}),
    ]);
  }
}

function tsToSec(t: string | undefined): number {
  if (!t) return 0;
  const [hms, ms = "0"] = t.split(",");
  const parts = hms.split(":").map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0] || 0, parts[1] || 0];
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length;
  const byteSize = numSamples * 2;
  const buf = Buffer.alloc(44 + byteSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + byteSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(byteSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    p.on("error", (e) => reject(new Error("could not start whisper-cli: " + e.message)));
    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("whisper-cli failed (code " + code + "):\n" + stderr.slice(-600)));
      } else {
        resolve();
      }
    });
  });
}
