# Lambda Migration Draft — CDK + whisper-small.en q8

Design draft for migrating the NestJS backend (currently a forked-worker pool) to
AWS Lambda via CDK, with one worker invocation per audio segment.

## Why this shape

- Per-segment fan-out → real elastic parallelism. Instead of 4 local workers, up to 50+ concurrent inferences per file.
- whisper-small.en q8 is the sweet spot: ~250 MB on disk, fits a container Lambda comfortably, 4–8 s cold start, ~2–4 s of compute per 30 s chunk at 3 GB memory.
- Pay-as-you-go: zero idle cost. Break-even vs. a 2-vCPU/4 GB Fargate task (~$50/mo) is around 30k files/month — under that, Lambda wins.

## Topology

```
Client ──PUT──▶  S3 Uploads  ──(S3 event)──▶  Orchestrator λ
                                                │
                                                │ 1. ffmpeg → PCM
                                                │ 2. makeSegments() → write each .f32 to S3 Chunks
                                                │ 3. Promise.all(segments.map(invoke Worker λ))
                                                │ 4. mergeCues → write .srt/.vtt to S3 Results
                                                │ 5. update Jobs table
                                                ▼
                                            DynamoDB Jobs ◀──poll── API λ ◀─── Client
                                                ▲
                                                │ writes progress
                                                │
                          fan-out invokes ──▶  Worker λ (×N, container, model baked in)
                                                │  downloads chunk from S3 Chunks
                                                │  runs whisper-small.en
                                                ▼
                                              cues[]  (returned via Invoke response)
```

Key choices and why:

- **S3 event triggers orchestrator** (not API → orchestrator sync). Keeps the API λ cheap and below the 6 MB request limit; client uploads directly via presigned URL.
- **Orchestrator invokes workers synchronously in parallel** (`Promise.all` of `lambda.invoke`). Mirrors the current `TranscriberPool.run()` dispatch exactly, just over the network. For ≤50 chunks this is the simplest thing that works. Step Functions Map is the upgrade path if needed.
- **DynamoDB for job state**, because API poll requests land on a different λ instance than the orchestrator. Drop-in for `JobsService`.
- **Two container images**: orchestrator (needs ffmpeg) and worker (needs the whisper model). Different images means worker cold-start isn't slowed by ffmpeg, and orchestrator memory stays low.

## Mapping from current code

| Current | Lambda equivalent |
|---|---|
| `TranscribeController.create()` upload | `api` Lambda — presigned S3 PUT |
| `TranscriptionService.run()` orchestration | `orchestrator` Lambda (triggered by S3 ObjectCreated) |
| `AudioService.extractPcm16kMono()` | inside orchestrator (needs ffmpeg in container) |
| `makeSegments(pcm)` | inside orchestrator — write each chunk to S3 |
| `TranscriberPool.run()` parallel fork | `Promise.all(segments.map(s => lambda.invoke(worker, ...)))` |
| `workers/whisper.worker.mjs` | `worker` Lambda (container image with model baked in) |
| `JobsService` status tracking | DynamoDB table |
| Final SRT/VTT result | written to S3, API returns presigned URL |

## Repo layout (additions)

```
backend/
  src/                          ← keep existing NestJS code for local dev
  lambda/                       ← new: lambda entrypoints
    api.ts                      ← presigned upload, job status
    orchestrator.ts             ← S3 event → fan-out → assemble
    worker.ts                   ← single-segment inference
  docker/
    orchestrator.Dockerfile
    worker.Dockerfile
infra/                          ← new: CDK app
  bin/
    caption-studio.ts           ← CDK entry
  lib/
    caption-studio-stack.ts     ← the stack
  cdk.json
  package.json
```

Keep `src/` so `npm run dev` still works locally with the fork-based pool. The `lambda/` handlers reuse `subtitles.util.ts`, `audio.service.ts` logic, and the worker body from `workers/whisper.worker.mjs` — just unwrapped from NestJS DI.

## `infra/lib/caption-studio-stack.ts`

```ts
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "node:path";

export class CaptionStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const uploads = new s3.Bucket(this, "Uploads", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const chunks = new s3.Bucket(this, "Chunks", {
      // chunks are throwaway — expire after a day
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const results = new s3.Bucket(this, "Results", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const jobs = new dynamodb.Table(this, "Jobs", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const backendRoot = path.resolve(__dirname, "../../backend");

    const worker = new lambda.DockerImageFunction(this, "Worker", {
      code: lambda.DockerImageCode.fromImageAsset(backendRoot, {
        file: "docker/worker.Dockerfile",
      }),
      memorySize: 3008,
      timeout: cdk.Duration.minutes(5),
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        WHISPER_MODEL: "Xenova/whisper-small.en",
        CHUNKS_BUCKET: chunks.bucketName,
      },
    });
    chunks.grantRead(worker);

    // Optional: keep one warm to avoid first-request cold start.
    new lambda.Alias(this, "WorkerLive", {
      aliasName: "live",
      version: worker.currentVersion,
      provisionedConcurrentExecutions: 1,
    });

    const orchestrator = new lambda.DockerImageFunction(this, "Orchestrator", {
      code: lambda.DockerImageCode.fromImageAsset(backendRoot, {
        file: "docker/orchestrator.Dockerfile",
      }),
      memorySize: 2048,
      timeout: cdk.Duration.minutes(10),
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOADS_BUCKET: uploads.bucketName,
        CHUNKS_BUCKET: chunks.bucketName,
        RESULTS_BUCKET: results.bucketName,
        JOBS_TABLE: jobs.tableName,
        WORKER_FN: worker.functionName,
      },
    });
    uploads.grantRead(orchestrator);
    chunks.grantWrite(orchestrator);
    results.grantWrite(orchestrator);
    jobs.grantWriteData(orchestrator);
    worker.grantInvoke(orchestrator);

    uploads.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(orchestrator),
    );

    const api = new lambda.Function(this, "Api", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/api.handler",
      code: lambda.Code.fromAsset(path.join(backendRoot, "dist")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOADS_BUCKET: uploads.bucketName,
        RESULTS_BUCKET: results.bucketName,
        JOBS_TABLE: jobs.tableName,
      },
    });
    uploads.grantPut(api);
    results.grantRead(api);
    jobs.grantReadData(api);

    const apiUrl = api.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: { allowedOrigins: ["*"], allowedMethods: [lambda.HttpMethod.ALL] },
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: apiUrl.url });
  }
}
```

`infra/bin/caption-studio.ts`:

```ts
#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CaptionStudioStack } from "../lib/caption-studio-stack";

const app = new cdk.App();
new CaptionStudioStack(app, "CaptionStudio", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```

Notes on the CDK surface:

- `DockerImageFunction` + `DockerImageCode.fromImageAsset()` is the only way to fit a 250 MB model — CDK builds the image locally and pushes to the per-account CDK ECR repo automatically (`cdk bootstrap` creates it).
- `worker.grantInvoke(orchestrator)` adds the `lambda:InvokeFunction` IAM statement; `xxx.grantRead/Write/...` for buckets and the DDB table do the same for those. Bucket/table names flow through as env vars instead of SST's `Resource.X.name` injection.
- If the account has trouble with `provisionedConcurrentExecutions: 1` on the alias, drop the alias entirely — first request just eats a one-time cold start.

## `lambda/api.ts` (presigned upload + status poll)

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const JOBS_TABLE = process.env.JOBS_TABLE!;

export async function handler(event: any) {
  const path = event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (method === "POST" && path === "/api/transcribe") {
    const { model = "Xenova/whisper-small.en", language } = JSON.parse(event.body || "{}");
    const jobId = randomUUID();
    const key = `${jobId}.bin`;
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: UPLOADS_BUCKET,
        Key: key,
        Metadata: { jobid: jobId, model, language: language || "" },
      }),
      { expiresIn: 900 },
    );
    return json({ jobId, uploadUrl });
  }

  if (method === "GET" && path.startsWith("/api/jobs/")) {
    const id = path.split("/").pop();
    const r = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { id } }));
    return json(r.Item ?? { status: "unknown" });
  }

  return { statusCode: 404, body: "not found" };
}

const json = (b: unknown) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(b),
});
```

The client uploads directly to S3 with the presigned URL, including `x-amz-meta-jobid` / `model` / `language` headers so the orchestrator knows what to do.

## `lambda/orchestrator.ts` (replaces `TranscriptionService.run`)

```ts
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { makeSegments, mergeCues, toSrt, toVtt, type Cue } from "../src/transcription/subtitles.util";

const lambda = new LambdaClient({});
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const CHUNKS_BUCKET = process.env.CHUNKS_BUCKET!;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET!;
const JOBS_TABLE = process.env.JOBS_TABLE!;
const WORKER_FN = process.env.WORKER_FN!;

export async function handler(event: any) {
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const head = await s3.send(new HeadObjectCommand({ Bucket: UPLOADS_BUCKET, Key: key }));
    const jobId = head.Metadata!.jobid;
    const language = head.Metadata!.language || undefined;

    try {
      await setStatus(jobId, "decoding", 0);
      const inputUrl = `s3://${UPLOADS_BUCKET}/${key}`;
      const pcm = await extractPcmFromS3(inputUrl);
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
            FunctionName: WORKER_FN,
            Payload: Buffer.from(JSON.stringify({
              chunkKey, offset: seg.start, language,
            })),
          }));
          const body = JSON.parse(Buffer.from(r.Payload!).toString());
          if (body.error) throw new Error(body.error);
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

function extractPcmFromS3(url: string): Promise<Float32Array> {
  // Reuse AudioService.extractPcm16kMono logic; either download to /tmp first
  // (Lambda has 10GB /tmp) or stream from `aws s3 cp - | ffmpeg`.
  return Promise.resolve(new Float32Array());
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
    UpdateExpression: "set #s=:s, progress=:p, segments=:n, resultKey=:r, #e=:e, expiresAt=:ttl",
    ExpressionAttributeNames: { "#s": "status", "#e": "error" },
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
```

Structure mirrors `TranscriptionService.run()` exactly — same phases, same `mergeCues`, same SRT/VTT output. Only the per-segment dispatch swaps `pool.run()` for `lambda.invoke()`.

## `lambda/worker.ts` (one segment, one invocation)

```ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = true;          // model is baked into the image
env.localModelPath = "/var/task/models";
env.cacheDir = "/tmp";

const s3 = new S3Client({});
const CHUNKS_BUCKET = process.env.CHUNKS_BUCKET!;

let asrPromise: ReturnType<typeof pipeline> | null = null;
function asr() {
  return (asrPromise ??= pipeline(
    "automatic-speech-recognition",
    process.env.WHISPER_MODEL!,
    { dtype: "q8" },
  ));
}
// Warm the model at module load so the first invocation pays init only.
void asr();

export async function handler(event: { chunkKey: string; offset: number; language?: string }) {
  try {
    const obj = await s3.send(new GetObjectCommand({
      Bucket: CHUNKS_BUCKET,
      Key: event.chunkKey,
    }));
    const buf = Buffer.from(await obj.Body!.transformToByteArray());
    const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

    const out: any = await (await asr())(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(event.language ? { language: event.language } : {}),
    });
    const raw = out?.chunks ?? [];
    let cues = raw
      .filter((c: any) => c.text?.trim())
      .map((c: any) => {
        const s = c.timestamp?.[0] ?? 0;
        const e = c.timestamp?.[1] ?? s + 2;
        return { start: s + event.offset, end: e + event.offset, text: c.text.trim() };
      });
    if (!cues.length && out?.text?.trim()) {
      cues = [{ start: event.offset, end: event.offset + 5, text: out.text.trim() }];
    }
    return { cues };
  } catch (e: any) {
    return { error: String(e?.message || e) };
  }
}
```

The body of `whisper.worker.mjs`, lifted out of the IPC `process.send` plumbing and into a request/response shape. Lambda runs module init *before* the first handler, so `void asr()` at module scope means warm invocations skip model load entirely.

## `docker/worker.Dockerfile`

```dockerfile
FROM public.ecr.aws/lambda/nodejs:20-arm64

# Pre-download the model so cold start doesn't hit huggingface.co
ENV HF_HOME=/var/task/models
RUN dnf install -y python3 && \
    npm install -g @huggingface/transformers@^3.5.1 && \
    node -e "const {pipeline,env}=require('@huggingface/transformers'); \
             env.cacheDir='/var/task/models'; \
             pipeline('automatic-speech-recognition','Xenova/whisper-small.en',{dtype:'q8'}) \
               .then(()=>console.log('model cached'))"

COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm ci --omit=dev

COPY dist/ ${LAMBDA_TASK_ROOT}/

CMD ["lambda/worker.handler"]
```

The model files (~250 MB) end up in the image layer. Lambda's container image cache means subsequent cold starts pull from a local cache, not S3.

## `docker/orchestrator.Dockerfile`

```dockerfile
FROM public.ecr.aws/lambda/nodejs:20-arm64
RUN dnf install -y tar xz && \
    curl -L https://www.osxexperts.net/ffmpeg7arm.zip ... # or use ffmpeg-static for arm64
COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm ci --omit=dev
COPY dist/ ${LAMBDA_TASK_ROOT}/
CMD ["lambda/orchestrator.handler"]
```

`ffmpeg-static` doesn't ship arm64 Linux binaries reliably; safer to grab a static ffmpeg build for arm64 manually, or switch this image to `x86_64`. The orchestrator doesn't need arm64 cost savings as much as the worker does (workers are where 90%+ of the GB-seconds get burned).

## Deploy workflow

```bash
# one-time per account/region
cd infra && npx cdk bootstrap

# build backend (TS → dist/ used by both Dockerfiles + the api zip)
cd ../backend && npm run build

# deploy
cd ../infra && npx cdk deploy
```

`cdk deploy` builds the Docker images locally, pushes to the CDK-managed ECR repo, and creates/updates the CloudFormation stack. The `ApiUrl` output is the function URL to point the client at.

## Verify before going further

1. **whisper-small.en q8 actually fits and runs on arm64 Lambda.** The transformers.js ONNX backend has arm64 native binaries, but worth confirming with a tiny smoke test before sinking time into the full build. If arm64 is rocky, fall back to x86_64 — costs ~25% more but isn't a blocker.
2. **Per-segment payload size.** Cues returned via `lambda:Invoke` response are small (text + timestamps), well under the 6 MB limit. PCM goes via S3, which is the right call.
3. **Concurrency limits.** Default account Lambda concurrency is 1000 — plenty for ≤50 chunks per file. If processing many files at once, set `reservedConcurrentExecutions` on the worker so a single big job can't starve the rest.

## Open questions / next decisions

- Does the orchestrator need to handle videos large enough that ffmpeg extraction approaches the 10-minute timeout? If yes, split extraction into its own step (chunked S3 multipart read).
- Does the client need real-time progress (WebSocket / SSE), or is polling DynamoDB every 1–2 s acceptable? Polling is simpler; current `JobsService` is already poll-based.
- Burn-in (`backend/src/burn/`) is not yet covered here. It would be a fourth Lambda triggered after `done`, reading the result JSON + original video, running ffmpeg, writing the burned MP4 to S3.
