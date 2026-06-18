# Journal

## 2026-06-16 — First end-to-end test of the Lambda stack

Goal: verify the deployed CDK works end-to-end with a real video.
Input: `3. skaffold dev.mkv` (19.9 MB, ~70 s of audio).

### What worked

- Presigned-URL upload to S3 (`POST /api/transcribe` → `PUT <signedUrl>`).
- S3 ObjectCreated event auto-fires the orchestrator.
- API Lambda reads job status from DynamoDB.

### Bugs found, fixed in this session

1. **`segments` is a DynamoDB reserved word.**
   `UpdateExpression` in `setStatus` used a bare `segments=:n`. Every write rejected, orchestrator crashed three times via S3 retries before we noticed.
   Fix: aliased as `#n` in `ExpressionAttributeNames`. `backend/lambda/orchestrator.ts`.

2. **Worker crashed at init on arm64.**
   `onnxruntime::OnnxRuntimeException: Attempt to use DefaultLogger but none has been registered` → `Runtime.ExitError`. Uncatchable from JS (native abort during `void asr()` at module load).
   Fix: flipped worker (and orchestrator, for `ffmpeg-static`) to `x86_64`. CDK `architecture` + `Platform.LINUX_AMD64` on the image asset + base image switched to `nodejs:20-x86_64`. Doc had flagged arm64 as risk #1; risk materialized.

3. **Orchestrator silently swallowed worker crashes.**
   When the worker exited with `Runtime.ExitError`, the response payload was `{errorType, errorMessage}`, not our `{cues|error}` shape. `if (body.error) throw` was never true → `body.cues` undefined → job marked `done` with empty cues.
   Fix: check `r.FunctionError` from `InvokeCommand` before parsing the payload.

4. **`extractPcmFromS3` was a stub returning empty Float32Array.**
   Fix: download upload object to `/tmp/<jobId>.bin`, pipe through `ffmpeg-static` to f32le, read back as `Float32Array`. Same ffmpeg args as `AudioService.extractPcm16kMono`.

### Bug found, not yet fixed

5. **Worker OOMs at 3008 MB loading whisper-small.en q8.**
   All 3 segments ran in parallel (fan-out works), each spent 45 s before `Runtime.OutOfMemory` killed it at 3008/3008 MB.
   Tried to bump `memorySize` to 5120 → CloudFormation rolled back with `'MemorySize' value failed to satisfy constraint: Member must have value less than or equal to 3008`.
   Root cause: the AWS account is on new-account/sandbox limits (max Lambda memory 3008 MB, concurrent executions 10). The memory cap is enforced at the Lambda API and isn't in Service Quotas — only an AWS Support case can raise it.

### Next session, after the quota is granted

1. Bump worker `memorySize` to 5120 in `infra/lib/caption-studio-stack.ts`.
2. `cdk deploy CaptionStudio`.
3. Re-invoke the orchestrator with a synthetic S3 event for the already-uploaded `<jobId>.bin` (no need to re-upload):
   ```bash
   aws lambda invoke --function-name <OrchestratorFn> \
     --invocation-type Event \
     --payload "$(printf '{"Records":[{"s3":{"object":{"key":"%s.bin"}}}]}' "$JOB" | base64)" /tmp/orch.json
   ```
4. Poll `GET /api/jobs/<jobId>` until terminal; expect `status: done` with real cues.

## 2026-06-18 — End-to-end transcription working via whisper.cpp

AWS Support partially granted the quota request: concurrency raised from 10 → 100, but **memory denied** (still capped at 3008 MB). Decided not to keep waiting and switched inference stacks instead.

### Attempt 1 — `dtype: "q4"` in transformers.js (didn't work)

One-line change in `backend/lambda/worker.ts`. Init dropped from 5.7 s → 3.7 s (smaller weights), but peak memory still pegged 3008/3008 MB. Confirms it's ONNX runtime's arena allocator + activations that dominate, not weight size.

### Attempt 2 — replace transformers.js with whisper.cpp (worked)

Rewrote `backend/lambda/worker.ts` to spawn the `whisper-cli` binary instead of using `@huggingface/transformers`:
- Download f32 PCM chunk from S3
- Convert to int16 PCM, prepend WAV header, write to `/tmp/<uuid>.wav`
- Spawn `whisper-cli -m model.bin -f wav -oj -of <prefix>` with the language flag
- Read `<prefix>.json`, map `transcription[].timestamps` → cues with `event.offset` added

Rewrote `backend/docker/worker.Dockerfile` as multi-stage: AL2023 builder installs gcc/g++/cmake/git, clones whisper.cpp, builds with `-DBUILD_SHARED_LIBS=OFF`, downloads `small.en` fp16, quantizes to q8_0 with whisper.cpp's own `quantize` binary. Final stage copies only `whisper-cli` + `model.bin` and installs `libgomp`.

### Snags hit

1. **No prebuilt `small.en-q8_0` model.** whisper.cpp's `download-ggml-model.sh` only ships `small.en` (fp16), `small.en-q5_1`, and multilingual `small-q8_0`. Workaround: download fp16 and quantize at build time.
2. **`libgomp.so.1` not found at runtime.** `BUILD_SHARED_LIBS=OFF` static-links whisper.cpp's own libs but the binary still dynamically links to the system OpenMP runtime. Fix: `RUN dnf install -y libgomp` in the final stage.

### Result

- Worker peak memory: **956–1011 MB** (vs 3008 MB cap, ~2 GB headroom).
- Init duration: **730–750 ms** (vs 5.7 s with transformers.js — model is mmap-loaded).
- Per-segment compute: 99–130 s for 30 s of audio (~3× realtime, CPU).
- All 3 workers fanned out and ran in parallel.
- Transcription output is accurate.

### Known follow-up

Cue granularity is coarse — most cues span the full 30 s segment instead of being broken at sentence boundaries. Tunable later with `--max-len` or `--split-on-word` flags to `whisper-cli`. Data is correct; just chunky.

## 2026-06-18 (later) — Client wired to the Lambda + cue tuning

### Wired the client to the Lambda Function URL

- `backend/lambda/api.ts`: on `GET /api/jobs/<id>` with `status: "done"`, fetch result JSON from S3 and inline it as `result: { cues, srt, vtt }`. The client polls a single endpoint and gets the data when ready.
- `infra/lib/caption-studio-stack.ts`: CORS on the Uploads bucket (`PUT *`) so the browser can hit the presigned URL directly.
- `client/src/config/api.ts`: `BACKEND_URL` defaults to the deployed Lambda URL; overridable via `VITE_API_URL` for local backend runs.
- `client/src/api/transcribe.ts`: rewrote `startTranscribe` — POST JSON `{ model, language }`, receive `{ jobId, uploadUrl }`, then `PUT` the file to the presigned URL.
- `client/src/App.tsx`: re-enabled `replaceAll(result.cues)` after the commented-out path; dropped the obsolete `uploadVideoToS3`.
- Deleted `client/src/api/upload.ts`; added `client/src/vite-env.d.ts` for `import.meta.env` types.

### CORS gotcha that ate ~15 minutes

After deploy, the browser blocked `POST /api/transcribe` with "CORS policy" errors. The Lambda Function URL had `cors: { allowedOrigins: ["*"], allowedMethods: [HttpMethod.ALL] }` but **no `allowedHeaders`**. Because the client sends `content-type: application/json` (a non-simple header), the browser sends a preflight `OPTIONS` with `Access-Control-Request-Headers: content-type` — and the Lambda CORS response didn't list `content-type` in `Access-Control-Allow-Headers`, so preflight failed. Fix: add `allowedHeaders: ["*"]` to the Function URL CORS block.

### Cue granularity fix

The earlier whisper.cpp run produced one big cue per 120 s segment (the parallelism unit), which was useless as subtitles. Root cause: we were passing **`-nt`** (`--no-timestamps`) to `whisper-cli`. Despite the name, that flag suppresses whisper's natural per-utterance segmentation, not just the printed timestamps — the JSON `transcription[]` ends up with one entry covering the whole input. Fix in `backend/lambda/worker.ts`:

```diff
- "-nt",
+ "--max-len", "84",
+ "--split-on-word",
```

Result: 3–10 s cues, broken at word boundaries, capped at ~84 chars (two-line subtitle width).

### Sample

```
[ 0.00 →  8.76]  okay so in this video I'm gonna show how we can use scaffold in order to have
[ 8.76 → 17.52]  the dev mode the watch mode let's say of our code being shown directly in our
[17.52 → 24.16]  Kubernetes so the problem itself is that okay whenever we run the service and we
[24.16 → 27.52]  have it in our browser running whenever we want to make a change directly in the
```

### Minor lingering quality issues (not blockers)

1. A few sub-second fragment cues at 120 s parallel-segment boundaries (`[140.80 → 141.12] build`, `[145.91 → 146.40] we define`). The trailing word of a segment that ended mid-sentence. Could be fixed by bumping segment overlap from 2 s → 5–10 s in `makeSegments`, or merging tail cues <1 s into the next cue in `mergeCues`.
2. Client `model` selector is decorative — worker image only has `small.en` baked in; selecting "Other languages" still runs small.en.
3. `endpoints.burn` points to a route that doesn't exist on the Lambda API yet (per the design doc, burn-in is a future fourth Lambda).
4. `npm run build` has two pre-existing TS errors on `CaptionStyle.outline` unrelated to this work.

## 2026-06-18 (later still) — Client hosted on CloudFront, CORS locked

### What got added to the stack

- **`Client` S3 bucket** — private, `BlockPublicAccess.BLOCK_ALL`. Never served directly.
- **`ClientDistribution` (CloudFront)** — fronts the bucket via Origin Access Control (`origins.S3BucketOrigin.withOriginAccessControl`). HTTP redirects to HTTPS. SPA fallback: `403/404 → /index.html` so client-side routes work without manifest files.
- **`DeployClient` (`BucketDeployment`)** — uploads `client/dist/` and runs `/*` cache invalidation on every `cdk deploy`. Means the client is part of the same `cdk deploy` invocation as the backend — no separate sync step.
- **CORS lockdown.** Both the Lambda Function URL and the Uploads bucket now use `allowedOrigins: [https://<cf-domain>, http://localhost:5173]` instead of `*`. The CloudFront domain is referenced as a CDK Token so the same code works on stack recreation without re-editing the origin list.
- **`ClientUrl` CfnOutput** — surfaces the CloudFront URL in the deploy output alongside `ApiUrl`.

### Live URLs

- Client: https://da9wcmrbauw2e.cloudfront.net
- API:    https://5qxkyfbma5akubwmb2sfseanby0edjra.lambda-url.eu-central-1.on.aws

### Side fix

`npm run build` was blocked by two pre-existing TS errors on `CaptionStyle.outline`. Added `outline: number` to the type in `client/src/types/index.ts` — the field was already being read at runtime in `CaptionOverlay.tsx` and written in `defaults.ts`, just missing from the type. Behavior unchanged.

### CORS verification

- `Origin: https://da9wcmrbauw2e.cloudfront.net` → preflight echoes the origin in `Access-Control-Allow-Origin` ✅
- `Origin: http://localhost:5173` → echoes the origin ✅
- `Origin: https://evil.example.com` → 200 response but **no** `Access-Control-Allow-Origin` header — browser blocks the actual fetch ✅

### Deploy workflow from here on

```bash
cd client  && npm run build       # produces dist/
cd ../infra && npx cdk deploy CaptionStudio
```

The backend nest build (`cd backend && npm run build`) is still needed before deploy if backend changed. Could be folded into a top-level script later.

### CloudFront cost note

Deployment takes ~4 minutes because CloudFront propagates the distribution to edge locations on first create. Subsequent `cdk deploy`s that only change client assets are fast (BucketDeployment + invalidation, ~30 s).
